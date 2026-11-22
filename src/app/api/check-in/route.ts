// Claims today's Daily Check In reward.
// One claim per UTC day advances the 7 day cycle and grants Renown XP.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/api-auth";
import {
  DEFAULT_LEGACY_SUMMARY,
  levelForRenownXP,
  parseStatsByDifficulty,
  type CaptainLegacySummary,
} from "@/lib/game/legacy";
import {
  applyCheckIn,
  checkInStatus,
  utcDayKey,
  type CheckInState,
} from "@/lib/game/checkin";
import { recordActivity } from "@/lib/activity";

type LegacyRow = {
  renownLevel: number;
  renownXP: number;
  voyagesCompleted: number;
  seaMasterCrowns: number;
  bestScore: number;
  statsByDifficulty: string;
  checkInCount: number;
  lastCheckInDate: string | null;
};

// Reuse the caller's Merit ids because a check in does not change them.
function toSummary(
  row: LegacyRow | null,
  meritIds: string[],
): CaptainLegacySummary {
  if (!row) return DEFAULT_LEGACY_SUMMARY;
  return {
    renownLevel: row.renownLevel,
    renownXP: row.renownXP,
    voyagesCompleted: row.voyagesCompleted,
    seaMasterCrowns: row.seaMasterCrowns,
    bestScore: row.bestScore,
    meritIds,
    statsByDifficulty: parseStatsByDifficulty(row.statsByDifficulty),
  };
}

function stateOf(row: LegacyRow | null): CheckInState {
  return {
    checkInCount: row?.checkInCount ?? 0,
    lastCheckInDate: row?.lastCheckInDate ?? null,
  };
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = utcDayKey();
  const prior = (await db.captainLegacy.findUnique({
    where: { userId: user.id },
  })) as LegacyRow | null;
  const meritRows = await db.captainMerit.findMany({
    where: { userId: user.id },
    select: { meritId: true },
  });
  const meritIds = meritRows.map((m) => m.meritId);

  const result = applyCheckIn(stateOf(prior), today);
  if (!result) {
    // Return current state when today's reward is already claimed.
    return NextResponse.json({
      claimed: false,
      legacy: toSummary(prior, meritIds),
      checkIn: checkInStatus(stateOf(prior), today),
    });
  }

  const newXP = (prior?.renownXP ?? 0) + result.xp;
  const newLevel = levelForRenownXP(newXP);
  const priorLevel = prior?.renownLevel ?? 1;

  // Guard the update so concurrent requests can grant today's reward once.
  // Match null explicitly because SQL inequality does not match NULL.
  const guarded = await db.captainLegacy.updateMany({
    where: {
      userId: user.id,
      OR: [{ lastCheckInDate: null }, { NOT: { lastCheckInDate: today } }],
    },
    data: {
      renownXP: newXP,
      renownLevel: newLevel,
      checkInCount: result.next.checkInCount,
      lastCheckInDate: result.next.lastCheckInDate,
    },
  });

  if (guarded.count === 0) {
    if (!prior) {
      // Create the account's first legacy row.
      try {
        await db.captainLegacy.create({
          data: {
            userId: user.id,
            renownXP: newXP,
            renownLevel: newLevel,
            checkInCount: result.next.checkInCount,
            lastCheckInDate: result.next.lastCheckInDate,
          },
        });
        await recordActivity({
          userId: user.id,
          type: "check_in",
          detail: `Day ${result.day} (+${result.xp} XP)`,
        });
        return NextResponse.json({
          claimed: true,
          day: result.day,
          xpGained: result.xp,
          leveledUp: newLevel > priorLevel,
          legacy: {
            ...DEFAULT_LEGACY_SUMMARY,
            renownXP: newXP,
            renownLevel: newLevel,
          },
          checkIn: checkInStatus(result.next, today),
        });
      } catch {
        // Another request created the row first. Return the latest state below.
      }
    }
    const fresh = (await db.captainLegacy.findUnique({
      where: { userId: user.id },
    })) as LegacyRow | null;
    return NextResponse.json({
      claimed: false,
      legacy: toSummary(fresh, meritIds),
      checkIn: checkInStatus(stateOf(fresh), today),
    });
  }

  await recordActivity({
    userId: user.id,
    type: "check_in",
    detail: `Day ${result.day} (+${result.xp} XP)`,
  });

  return NextResponse.json({
    claimed: true,
    day: result.day,
    xpGained: result.xp,
    leveledUp: newLevel > priorLevel,
    legacy: {
      ...toSummary(prior, meritIds),
      renownXP: newXP,
      renownLevel: newLevel,
    },
    checkIn: checkInStatus(result.next, today),
  });
}
