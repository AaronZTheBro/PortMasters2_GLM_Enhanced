// GET /api/stats: live harborwide stats shown in Harbor Overview.
// Aggregates totals across every captain, room, and voyage the server
// knows about, plus a small recent activity slice. Read only and available to
// any authenticated captain.
import { NextResponse } from "next/server";
import { db, PUBLIC_USER_SELECT } from "@/lib/db";
import { getCurrentUser } from "@/lib/api-auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [
    totalCaptains,
    totalRooms,
    activeSailing,
    totalVoyages,
    totalCrowns,
    topRenown,
    recentRooms,
    activities,
  ] = await Promise.all([
    db.user.count(),
    db.room.count(),
    db.room.count({ where: { started: true } }),
    db.captainLegacy.aggregate({ _sum: { voyagesCompleted: true } }),
    db.captainLegacy.aggregate({ _sum: { seaMasterCrowns: true } }),
    db.captainLegacy.findMany({
      orderBy: { renownXP: "desc" },
      take: 5,
      select: {
        renownLevel: true,
        renownXP: true,
        voyagesCompleted: true,
        seaMasterCrowns: true,
        bestScore: true,
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            avatarHue: true,
          },
        },
      },
    }),
    db.room.findMany({
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        id: true,
        name: true,
        code: true,
        difficulty: true,
        started: true,
        createdAt: true,
        host: {
          select: {
            id: true,
            displayName: true,
            avatarHue: true,
          },
        },
        _count: { select: { members: true } },
      },
    }),
    // The 20 most recent harbor activities for the lobby feed. Includes the
    // actor's public user so the feed can show an avatar without a second
    // round trip per row.
    db.activity.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        type: true,
        detail: true,
        createdAt: true,
        user: { select: PUBLIC_USER_SELECT },
      },
    }),
  ]);

  return NextResponse.json({
    totals: {
      captains: totalCaptains,
      rooms: totalRooms,
      sailing: activeSailing,
      voyages: totalVoyages._sum.voyagesCompleted ?? 0,
      crowns: totalCrowns._sum.seaMasterCrowns ?? 0,
    },
    leaderboard: topRenown.map((row, i) => ({
      rank: i + 1,
      user: row.user,
      renownLevel: row.renownLevel,
      renownXP: row.renownXP,
      voyages: row.voyagesCompleted,
      crowns: row.seaMasterCrowns,
      bestScore: row.bestScore,
    })),
    recentRooms: recentRooms.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      difficulty: r.difficulty,
      started: r.started,
      createdAt: r.createdAt,
      host: r.host,
      memberCount: r._count.members,
    })),
    activities: activities.map((a) => ({
      id: a.id,
      type: a.type,
      detail: a.detail,
      createdAt: a.createdAt,
      user: a.user
        ? {
            id: a.user.id,
            username: a.user.username,
            displayName: a.user.displayName,
            avatarHue: a.user.avatarHue,
          }
        : null,
    })),
    generatedAt: new Date().toISOString(),
  });
}
