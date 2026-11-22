// GET /api/legacy/[userId] returns a signed in captain's public Legacy summary.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/api-auth";
import {
  DEFAULT_LEGACY_SUMMARY,
  parseStatsByDifficulty,
  type CaptainLegacySummary,
} from "@/lib/game/legacy";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { userId } = await params;

  const other = await db.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!other)
    return NextResponse.json({ error: "Captain not found" }, { status: 404 });

  const legacy = await db.captainLegacy.findUnique({ where: { userId } });
  const merits = await db.captainMerit.findMany({
    where: { userId },
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

  return NextResponse.json({ legacy: summary });
}
