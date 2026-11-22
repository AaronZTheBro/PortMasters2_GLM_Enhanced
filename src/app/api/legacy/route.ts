// GET /api/legacy: the current user's persistent Captain's Legacy summary
// (Renown level and XP, lifetime voyages, Sea Master crowns, best score).
// This route is read only. Voyage conclusion and daily check in are the
// CaptainLegacy write paths.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/api-auth";
import {
  DEFAULT_LEGACY_SUMMARY,
  parseStatsByDifficulty,
  type CaptainLegacySummary,
} from "@/lib/game/legacy";
import { checkInStatus, utcDayKey } from "@/lib/game/checkin";

export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const legacy = await db.captainLegacy.findUnique({
    where: { userId: user.id },
  });
  const merits = await db.captainMerit.findMany({
    where: { userId: user.id },
    select: { meritId: true },
  });
  const summary: CaptainLegacySummary = legacy
    ? {
        renownLevel: legacy.renownLevel,
        renownXP: legacy.renownXP,
        voyagesCompleted: legacy.voyagesCompleted,
        seaMasterCrowns: legacy.seaMasterCrowns,
        bestScore: legacy.bestScore,
        meritIds: merits.map((m) => m.meritId),
        statsByDifficulty: parseStatsByDifficulty(legacy.statsByDifficulty),
      }
    : DEFAULT_LEGACY_SUMMARY;

  // Include Daily Check In state for the current captain only.
  const checkIn = checkInStatus(
    {
      checkInCount: legacy?.checkInCount ?? 0,
      lastCheckInDate: legacy?.lastCheckInDate ?? null,
    },
    utcDayKey(),
  );

  return NextResponse.json({ legacy: summary, checkIn });
}
