// POST /api/rooms/[id]/join joins a room by id.
import { NextRequest, NextResponse } from "next/server";
import { db, PUBLIC_USER_SELECT } from "@/lib/db";
import { getCurrentUser, publicUser } from "@/lib/api-auth";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const room = await db.room.findUnique({
    where: { id },
    include: {
      members: true,
      host: {
        select: PUBLIC_USER_SELECT,
      },
    },
  });
  if (!room)
    return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const alreadyMember = room.members.some((m) => m.userId === user.id);
  // Lock new seats after departure while allowing existing members to return.
  if (!alreadyMember && room.started) {
    return NextResponse.json(
      {
        error:
          "This voyage has already set sail. Ask the host to open a new room.",
      },
      { status: 403 },
    );
  }

  // Restore or create the captain's seat.
  await db.roomMember.upsert({
    where: { userId_roomId: { userId: user.id, roomId: room.id } },
    create: { userId: user.id, roomId: room.id },
    update: {},
  });

  const members = await db.roomMember.findMany({
    where: { roomId: room.id },
    include: {
      user: {
        select: PUBLIC_USER_SELECT,
      },
    },
  });

  return NextResponse.json({
    room: {
      id: room.id,
      code: room.code,
      name: room.name,
      isPublic: room.isPublic,
      createdAt: room.createdAt,
      started: room.started,
      difficulty: room.difficulty,
      host: publicUser(room.host),
      memberCount: members.length,
      members: members.map((m) => ({
        ...publicUser(m.user),
        joinedAt: m.joinedAt,
      })),
    },
  });
}
