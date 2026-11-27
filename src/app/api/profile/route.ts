// GET /api/profile returns the signed in captain account, progression,
// activities, room memberships, and Merit details for the profile dialog.
import { NextResponse } from "next/server";
import { db, PUBLIC_USER_SELECT } from "@/lib/db";
import { getCurrentUser } from "@/lib/api-auth";
import {
  DEFAULT_LEGACY_SUMMARY,
  parseStatsByDifficulty,
  renownProgress,
  renownTitleForLevel,
  type CaptainLegacySummary,
} from "@/lib/game/legacy";
import { checkInStatus, utcDayKey } from "@/lib/game/checkin";
import { meritById, meritProgress } from "@/lib/game/merits";
import { difficultyConfig, type Difficulty } from "@/lib/game/difficulty";

export async function GET() {
  const authed = await getCurrentUser();
  if (!authed)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch the account creation date while all profile reads run in parallel.
  const [userRow, legacy, meritRows, activities, memberRooms] =
    await Promise.all([
      db.user.findUnique({
        where: { id: authed.id },
        select: { createdAt: true },
      }),
      db.captainLegacy.findUnique({ where: { userId: authed.id } }),
      db.captainMerit.findMany({
        where: { userId: authed.id },
        orderBy: { earnedAt: "desc" },
      }),
      db.activity.findMany({
        where: { userId: authed.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          roomId: true,
          type: true,
          detail: true,
          createdAt: true,
        },
      }),
      db.roomMember.findMany({
        where: { userId: authed.id },
        orderBy: { joinedAt: "desc" },
        take: 5,
        select: {
          joinedAt: true,
          room: {
            select: {
              id: true,
              name: true,
              code: true,
              difficulty: true,
              started: true,
              createdAt: true,
              host: { select: PUBLIC_USER_SELECT },
            },
          },
        },
      }),
    ]);

  const user = {
    id: authed.id,
    username: authed.username,
    displayName: authed.displayName,
    avatarHue: authed.avatarHue,
    createdAt: userRow?.createdAt ?? new Date().toISOString(),
  };

  const summary: CaptainLegacySummary = legacy
    ? {
        renownLevel: legacy.renownLevel,
        renownXP: legacy.renownXP,
        voyagesCompleted: legacy.voyagesCompleted,
        seaMasterCrowns: legacy.seaMasterCrowns,
        bestScore: legacy.bestScore,
        meritIds: meritRows.map((m) => m.meritId),
        statsByDifficulty: parseStatsByDifficulty(legacy.statsByDifficulty),
      }
    : DEFAULT_LEGACY_SUMMARY;

  const progress = renownProgress(summary.renownXP);
  const title = renownTitleForLevel(progress.level);

  // Resolve stored Merit ids against the catalogue and omit unknown entries.
  // The client maps each retained id to its icon.
  const merits = meritRows
    .map((row) => {
      const def = meritById(row.meritId);
      if (!def) return null;
      return {
        id: row.meritId,
        name: def.name,
        desc: def.desc,
        earnedAt: row.earnedAt,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  // Compute progress only for locked Merits measurable from the summary.
  const lockedMerits = meritProgress({
    voyagesCompleted: summary.voyagesCompleted,
    seaMasterCrowns: summary.seaMasterCrowns,
    bestScore: summary.bestScore,
    renownLevel: summary.renownLevel,
    consecutiveSolventVoyages: legacy?.consecutiveSolventVoyages ?? 0,
    earnedIds: new Set(meritRows.map((m) => m.meritId)),
  });

  // Include tiers with recorded results and attach their display metadata.
  const difficulties = Object.entries(summary.statsByDifficulty)
    .filter(([, stats]) => stats.crowns > 0 || stats.bestScore > 0)
    .map(([key, stats]) => {
      const cfg = difficultyConfig(key as Difficulty);
      return {
        key,
        name: cfg.name,
        icon: cfg.icon,
        crowns: stats.crowns,
        bestScore: stats.bestScore,
      };
    });

  const checkIn = checkInStatus(
    {
      checkInCount: legacy?.checkInCount ?? 0,
      lastCheckInDate: legacy?.lastCheckInDate ?? null,
    },
    utcDayKey(),
  );

  return NextResponse.json({
    user,
    legacy: summary,
    renown: {
      level: progress.level,
      title,
      xpIntoLevel: progress.xpIntoLevel,
      xpForNextLevel: progress.xpForNextLevel,
      xpTotal: summary.renownXP,
    },
    merits,
    lockedMerits,
    difficulties,
    activities: activities.map((a) => ({
      id: a.id,
      roomId: a.roomId,
      type: a.type,
      detail: a.detail,
      createdAt: a.createdAt,
    })),
    rooms: memberRooms.map((m) => ({
      id: m.room.id,
      name: m.room.name,
      code: m.room.code,
      difficulty: m.room.difficulty,
      started: m.room.started,
      createdAt: m.room.createdAt,
      joinedAt: m.joinedAt,
      host: m.room.host,
    })),
    checkIn,
    generatedAt: new Date().toISOString(),
  });
}
