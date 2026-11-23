import type { ConvoyVenture, Prisma } from "../../generated/prisma";
import { db } from "../lib/db";
import {
  CONVOY_VENTURE_MAX_CONTRIBUTOR_SHARE,
  CONVOY_VENTURE_MAX_ROUNDS_AHEAD,
  CONVOY_VENTURE_MAX_TARGET,
  CONVOY_VENTURE_MIN_ROUNDS_AHEAD,
  CONVOY_VENTURE_MIN_TARGET,
  CONVOY_VENTURE_PAYOUT_MULTIPLIER,
} from "../lib/game/constants";
import { roundsFor } from "../lib/game/difficulty";
import {
  computeAcceptedContribution,
  computeVentureDeadlineBounds,
  computeSettlements,
  parseVentureContributions,
  ventureSettlementLine,
  ventureTotal,
  type VentureOutcome,
} from "../lib/game/convoy";
import {
  applyBarterEntries,
  type BarterLedger,
} from "../lib/game/barter-ledger";
import { taxReserve } from "../lib/game/engine/pricing";
import type { GameState } from "../lib/game/types";
import { appendBarterEntry, parseBarterLedger } from "./barter";

async function settle(
  tx: Prisma.TransactionClient,
  ledger: BarterLedger,
  venture: ConvoyVenture,
  outcome: VentureOutcome,
) {
  const settlements = computeSettlements(
    parseVentureContributions(venture.contributions),
    outcome,
  );
  await tx.convoyVenture.update({
    where: { id: venture.id },
    data: { status: outcome, resolvedAt: new Date() },
  });
  for (const { userId, amount } of settlements) {
    appendBarterEntry(
      ledger,
      userId,
      [{ item: "Gold", amount }],
      ventureSettlementLine(outcome, amount),
    );
  }
  return { ventureId: venture.id, outcome, settlements };
}

function persistLedger(
  tx: Prisma.TransactionClient,
  roomId: string,
  ledger: BarterLedger,
) {
  return tx.room.update({
    where: { id: roomId },
    data: { barterLedger: JSON.stringify(ledger) },
  });
}

export async function postConvoy(
  roomId: string,
  user: { id: string; displayName: string },
  targetGold: number,
  deadlineRound: number,
) {
  if (!Number.isSafeInteger(targetGold) || !Number.isSafeInteger(deadlineRound))
    return { error: "Enter whole numbers for the target and deadline." };
  if (
    targetGold < CONVOY_VENTURE_MIN_TARGET ||
    targetGold > CONVOY_VENTURE_MAX_TARGET
  )
    return {
      error: `Target must be between ${CONVOY_VENTURE_MIN_TARGET} and ${CONVOY_VENTURE_MAX_TARGET} Gold.`,
    };

  return db.$transaction(async (tx) => {
    const room = await tx.room.findUnique({
      where: { id: roomId },
      select: {
        voyageEpoch: true,
        currentRound: true,
        difficulty: true,
        started: true,
        voyageResult: true,
      },
    });
    if (!room?.started || room.voyageResult)
      return {
        error: "Start an active voyage before posting a Convoy Venture.",
      };
    const voyage = { roomId, voyageEpoch: room.voyageEpoch };
    const filled = await tx.convoyVenture.findFirst({
      where: { ...voyage, status: "filled" },
      select: { id: true },
    });
    if (filled)
      return {
        error:
          "This harbor has already filled a Convoy Venture in this voyage.",
      };
    const bounds = computeVentureDeadlineBounds(
      room.currentRound,
      roundsFor(room.difficulty),
      CONVOY_VENTURE_MIN_ROUNDS_AHEAD,
      CONVOY_VENTURE_MAX_ROUNDS_AHEAD,
    );
    if (!bounds)
      return {
        error:
          "There is no time left to open another Convoy Venture this voyage.",
      };
    if (deadlineRound < bounds.minRound || deadlineRound > bounds.maxRound)
      return {
        error: `Deadline must be between round ${bounds.minRound} and round ${bounds.maxRound}.`,
      };

    await tx.convoyVenture.create({
      data: {
        ...voyage,
        posterId: user.id,
        posterName: user.displayName,
        targetGold,
        deadlineRound,
        payoutMultiplier: CONVOY_VENTURE_PAYOUT_MULTIPLIER,
      },
    });
    return { epoch: room.voyageEpoch };
  });
}

export async function contributeToConvoy(
  roomId: string,
  user: { id: string; displayName: string },
  ventureId: string,
  amount: number,
) {
  return db.$transaction(async (tx) => {
    const room = await tx.room.findUnique({
      where: { id: roomId },
      select: {
        started: true,
        voyageEpoch: true,
        currentRound: true,
        barterLedger: true,
      },
    });
    if (!room?.started)
      return { error: "Start the voyage before backing a convoy." };
    const voyage = { roomId, voyageEpoch: room.voyageEpoch };
    const venture = await tx.convoyVenture.findFirst({
      where: { ...voyage, id: ventureId, status: "open" },
    });
    if (!venture) return { error: "That venture is no longer open." };
    const filled = await tx.convoyVenture.findFirst({
      where: { ...voyage, status: "filled" },
      select: { id: true },
    });
    if (filled)
      return {
        error:
          "This harbor has already filled a Convoy Venture in this voyage.",
      };
    if (room.currentRound > venture.deadlineRound)
      return { error: "That venture's deadline has already passed." };
    const member = await tx.roomMember.findUnique({
      where: { userId_roomId: { userId: user.id, roomId } },
      select: { userId: true },
    });
    if (!member) return { error: "You are no longer in this harbor." };
    const record = await tx.gameState.findUnique({
      where: { userId_roomId: { userId: user.id, roomId } },
      select: { data: true },
    });
    const game = record && (JSON.parse(record.data) as GameState);
    if (
      !game ||
      (game.voyageEpoch ?? 0) !== room.voyageEpoch ||
      game.gameOver ||
      game.phase === 0
    )
      return { error: "This captain has no active voyage save." };
    if (game.readyVote)
      return { error: "Cancel your ready vote before backing a convoy." };

    const ledger = parseBarterLedger(room.barterLedger);
    applyBarterEntries(
      game,
      ledger.entries.filter(({ userId }) => userId === user.id),
      [],
    );
    const contributions = parseVentureContributions(venture.contributions);
    const current = contributions[user.id]?.amount ?? 0;
    const total = ventureTotal(contributions);
    const accepted = computeAcceptedContribution(
      total,
      venture.targetGold,
      amount,
      current,
      CONVOY_VENTURE_MAX_CONTRIBUTOR_SHARE,
    );
    if (accepted <= 0)
      return {
        error: "This convoy has reached your share limit or is already full.",
      };
    const available = game.money - taxReserve(game);
    if (available < accepted)
      return {
        error: `Need ${accepted} spendable Gold to back this convoy. You have ${available}.`,
      };

    appendBarterEntry(
      ledger,
      user.id,
      [{ item: "Gold", amount: -accepted }],
      `⚓ Backed a Convoy Venture with ${accepted} Gold`,
    );
    contributions[user.id] = {
      name: user.displayName,
      amount: current + accepted,
    };
    const updated = await tx.convoyVenture.update({
      where: { id: venture.id },
      data: { contributions: JSON.stringify(contributions) },
    });
    const outcomes = [];
    if (total + accepted >= venture.targetGold) {
      outcomes.push(await settle(tx, ledger, updated, "filled"));
      const others = await tx.convoyVenture.findMany({
        where: { ...voyage, status: "open" },
      });
      for (const other of others)
        outcomes.push(await settle(tx, ledger, other, "destroyed"));
    }
    await persistLedger(tx, roomId, ledger);
    return { epoch: room.voyageEpoch, outcomes };
  });
}

export async function settleExpiredConvoys(
  roomId: string,
  voyageEpoch: number,
  currentRound: number,
  forceAll: boolean,
) {
  return db.$transaction(async (tx) => {
    const open = await tx.convoyVenture.findMany({
      where: {
        roomId,
        voyageEpoch,
        status: "open",
        ...(forceAll ? {} : { deadlineRound: { lt: currentRound } }),
      },
    });
    if (!open.length) return [];
    const room = await tx.room.findUnique({
      where: { id: roomId, voyageEpoch },
      select: { barterLedger: true },
    });
    if (!room) return [];
    const ledger = parseBarterLedger(room.barterLedger);
    const outcomes = [];
    for (const venture of open)
      outcomes.push(await settle(tx, ledger, venture, "failed"));
    await persistLedger(tx, roomId, ledger);
    return outcomes;
  });
}
