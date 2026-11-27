// GET /api/game/state?roomId=...: load my saved game state for a room
// PUT /api/game/state: save my game state for a room
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/api-auth";
import { readVoyageRules } from "@/lib/game/forecast";
import {
  checkSave,
  describeFindings,
  snapshotFromSave,
} from "@/lib/game/integrity";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roomId = req.nextUrl.searchParams.get("roomId");
  if (!roomId) return NextResponse.json({ state: null });

  const [state, room] = await db.$transaction([
    db.gameState.findUnique({
      where: { userId_roomId: { userId: user.id, roomId } },
    }),
    db.room.findFirst({
      where: { id: roomId, members: { some: { userId: user.id } } },
      select: {
        currentRound: true,
        currentPhase: true,
        voyageEpoch: true,
        difficulty: true,
        rulesVersion: true,
        forecastPlan: true,
        phasePulse: true,
        tidewatchSurge: true,
        docksWinnerId: true,
      },
    }),
  ]);
  if (!room)
    return NextResponse.json({ error: "Harbor not found" }, { status: 404 });
  const difficulty = room.difficulty;
  const checkpoint = !state
    ? {
        currentRound: room.currentRound,
        currentPhase: room.currentPhase,
        voyageEpoch: room.voyageEpoch,
        harborPulse: JSON.parse(room.phasePulse),
      }
    : null;

  return NextResponse.json({
    state: state?.data ?? null,
    checkpoint,
    revision: state?.revision ?? null,
    difficulty,
    rules: readVoyageRules(room),
    tidewatchSurge: room.tidewatchSurge,
    docksWon: room.docksWinnerId === user.id,
  });
}

const SaveSchema = z.object({
  roomId: z.string().min(1),
  data: z.record(z.string(), z.any()),
  revision: z.number().int().nonnegative().nullable().optional(),
});

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { roomId, data, revision } = parsed.data;

  // Must be a member of the room to save state there.
  const member = await db.roomMember.findUnique({
    where: { userId_roomId: { userId: user.id, roomId } },
  });
  if (!member)
    return NextResponse.json(
      { error: "Not a member of that room" },
      { status: 403 },
    );

  const record = await db.$transaction(async (tx) => {
    const voyage = await tx.room.findUnique({
      where: { id: roomId },
      select: {
        currentRound: true,
        voyageEpoch: true,
        rulesVersion: true,
        forecastPlan: true,
      },
    });
    if (
      !voyage ||
      (typeof data.voyageEpoch === "number" &&
        data.voyageEpoch !== voyage.voyageEpoch)
    )
      return null;
    const rules = readVoyageRules(voyage);
    const json = JSON.stringify({
      ...data,
      rulesVersion: rules.version,
      forecasts: rules.forecasts,
      arrivals: rules.arrivals,
      specialties: rules.specialties,
    });
    const key = { userId: user.id, roomId };
    const previous = await tx.gameState.findUnique({
      where: { userId_roomId: key },
    });
    if (revision !== undefined && revision !== (previous?.revision ?? null))
      return null;
    const snapshot = snapshotFromSave(data);
    const verdict = checkSave(snapshot ?? {}, voyage.currentRound);
    const flag =
      verdict.plausible || previous?.integritySeverity === "impossible"
        ? {}
        : {
            integritySeverity: verdict.severity,
            integrityNote: describeFindings(verdict.findings),
          };
    if (!verdict.plausible) {
      console.warn(
        `[integrity] ${verdict.severity} save user=${user.id} room=${roomId} ${describeFindings(verdict.findings)}`,
      );
    }
    return tx.gameState.upsert({
      where: { userId_roomId: key },
      create: { ...key, data: json, ...flag },
      update: { data: json, revision: { increment: 1 }, ...flag },
    });
  });
  if (!record) {
    return NextResponse.json(
      { error: "A newer voyage save exists. Reload to resume it." },
      { status: 409 },
    );
  }
  return NextResponse.json({
    ok: true,
    updatedAt: record.updatedAt,
    revision: record.revision,
  });
}
