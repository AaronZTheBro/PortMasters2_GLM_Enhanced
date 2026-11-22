// GET /api/rooms/active restores the captain's most recent durable room seat.
// Room detail and chat remain the responsibility of GET /api/rooms/[id].
import { NextResponse } from "next/server";
import { db, PUBLIC_USER_SELECT } from "@/lib/db";
import { getCurrentUser, publicUser } from "@/lib/api-auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Prefer the most recently joined seat when several memberships exist.
  const membership = await db.roomMember.findFirst({
    where: { userId: user.id },
    orderBy: { joinedAt: "desc" },
    select: { roomId: true },
  });
  if (!membership) return NextResponse.json({ room: null });

  const room = await db.room.findUnique({
    where: { id: membership.roomId },
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
  // Treat a missing related room as no active seat.
  if (!room) return NextResponse.json({ room: null });

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
      isMember: true,
    },
  });
}
