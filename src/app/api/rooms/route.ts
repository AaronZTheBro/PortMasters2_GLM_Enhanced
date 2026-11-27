// GET /api/rooms: list public rooms (with member counts)
// POST /api/rooms: create a room
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, PUBLIC_USER_SELECT } from "@/lib/db";
import { getCurrentUser, generateRoomCode, publicUser } from "@/lib/api-auth";
import { normalizeRoomName } from "@/lib/utils";
import { normalizeDifficulty } from "@/lib/game/difficulty";
import { recordActivity } from "@/lib/activity";
import { CURRENT_HARBOR_RULES } from "@/lib/game/expansion";

export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rooms = await db.room.findMany({
    where: { isPublic: true },
    include: {
      members: {
        include: {
          user: {
            select: PUBLIC_USER_SELECT,
          },
        },
      },
      host: {
        select: PUBLIC_USER_SELECT,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    rooms: rooms.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      isPublic: r.isPublic,
      started: r.started,
      difficulty: r.difficulty,
      createdAt: r.createdAt,
      host: publicUser(r.host),
      memberCount: r.members.length,
      members: r.members.map((m) => ({
        ...publicUser(m.user),
        joinedAt: m.joinedAt,
      })),
    })),
  });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(40),
  isPublic: z.boolean().optional().default(true),
  // Optional for compatibility; normalizeDifficulty coerces unknown values to
  // the default tier.
  difficulty: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { name, isPublic } = parsed.data;
  const difficulty = normalizeDifficulty(parsed.data.difficulty);

  // Create the room and seat the host as its first member.
  const room = await db.room.create({
    data: {
      code: generateRoomCode(),
      name: normalizeRoomName(name),
      hostId: user.id,
      isPublic,
      difficulty,
      rulesVersion: CURRENT_HARBOR_RULES,
      members: { create: [{ userId: user.id }] },
    },
    include: {
      members: {
        include: {
          user: {
            select: PUBLIC_USER_SELECT,
          },
        },
      },
      host: {
        select: PUBLIC_USER_SELECT,
      },
    },
  });

  await recordActivity({
    userId: user.id,
    type: "room_create",
    detail: room.name,
    roomId: room.id,
  });

  return NextResponse.json({
    room: {
      id: room.id,
      code: room.code,
      name: room.name,
      isPublic: room.isPublic,
      started: room.started,
      difficulty: room.difficulty,
      createdAt: room.createdAt,
      host: publicUser(room.host),
      memberCount: room.members.length,
      members: room.members.map((m) => ({
        ...publicUser(m.user),
        joinedAt: m.joinedAt,
      })),
    },
  });
}
