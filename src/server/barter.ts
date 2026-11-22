import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma";
import { db } from "../lib/db";
import {
  applyBarterEntries,
  type BarterEntry,
  type BarterLedger,
  type BarterOffer,
} from "../lib/game/barter-ledger";
import { BARTER_ITEMS } from "../lib/game/constants";
import { getOwnedAmount } from "../lib/game/engine/core";
import type { GameState } from "../lib/game/types";

type Post = {
  kind: "post";
  offerItem?: string;
  offerAmount?: number;
  requestItem?: string;
  requestAmount?: number;
  targetUserId?: string;
};
export type BarterAction =
  Post | { kind: "accept" | "cancel"; offerId?: string };

function parseLedger(raw: string): BarterLedger {
  const value = JSON.parse(raw) as Partial<BarterLedger>;
  return { offers: value.offers ?? [], entries: value.entries ?? [] };
}

export async function readBarter(roomId: string) {
  const room = await db.room.findUnique({
    where: { id: roomId },
    select: { barterLedger: true, voyageEpoch: true },
  });
  if (!room) return null;
  return { epoch: room.voyageEpoch, ...parseLedger(room.barterLedger) };
}

function append(
  ledger: BarterLedger,
  userId: string,
  changes: BarterEntry["changes"],
  line: string,
) {
  ledger.entries.push({ id: ledger.entries.length + 1, userId, changes, line });
}

function refund(ledger: BarterLedger, offer: BarterOffer) {
  append(
    ledger,
    offer.fromUserId,
    [{ item: offer.offerItem, amount: offer.offerAmount }],
    `↩️ Returned ${offer.offerAmount} ${offer.offerItem} from an unmatched barter offer`,
  );
  ledger.offers = ledger.offers.filter(({ id }) => id !== offer.id);
}

export async function closeBarter(roomId: string, userId?: string) {
  return db.$transaction(async (tx) => {
    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!room) return;
    const ledger = parseLedger(room.barterLedger);
    for (const offer of ledger.offers) {
      if (
        !userId ||
        offer.fromUserId === userId ||
        offer.targetUserId === userId
      )
        refund(ledger, offer);
    }
    await tx.room.update({
      where: { id: roomId },
      data: {
        barterLedger: JSON.stringify(ledger),
        ...(userId ? {} : { phaseReleased: true }),
      },
    });
  });
}

async function owns(
  tx: Prisma.TransactionClient,
  ledger: BarterLedger,
  room: { id: string; currentRound: number; voyageEpoch: number },
  userId: string,
  item: string,
  amount: number,
) {
  const record = await tx.gameState.findUnique({
    where: { userId_roomId: { userId, roomId: room.id } },
  });
  if (!record) return false;
  const state = JSON.parse(record.data) as GameState;
  if (
    state.phase !== "barter" ||
    state.currentRound !== room.currentRound ||
    (state.voyageEpoch ?? 0) !== room.voyageEpoch
  )
    return false;
  applyBarterEntries(
    state,
    ledger.entries.filter((entry) => entry.userId === userId),
    [],
  );
  return getOwnedAmount(state, item) >= amount;
}

function validItem(item: string | undefined): item is string {
  return (BARTER_ITEMS as readonly string[]).includes(item ?? "");
}

function validAmount(amount: number | undefined): amount is number {
  return Number.isSafeInteger(amount) && amount! > 0;
}

export async function modifyBarter(
  roomId: string,
  user: { id: string; displayName: string },
  action: BarterAction,
) {
  return db.$transaction(async (tx) => {
    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (room?.currentPhase !== "barter" || room.phaseReleased)
      return "Bartering is closed.";
    const membership = await tx.roomMember.findUnique({
      where: { userId_roomId: { userId: user.id, roomId } },
    });
    if (!membership) return "You are no longer in this harbor.";

    const ledger = parseLedger(room.barterLedger);
    if (action.kind === "post") {
      const {
        offerItem,
        offerAmount,
        requestItem,
        requestAmount,
        targetUserId,
      } = action;
      if (
        !validItem(offerItem) ||
        !validItem(requestItem) ||
        offerItem === requestItem ||
        !validAmount(offerAmount) ||
        !validAmount(requestAmount)
      )
        return "Invalid barter offer.";
      let targetName: string | undefined;
      if (targetUserId) {
        if (targetUserId === user.id)
          return "Choose another captain for a direct offer.";
        const target = await tx.roomMember.findUnique({
          where: { userId_roomId: { userId: targetUserId, roomId } },
          include: { user: { select: { displayName: true } } },
        });
        if (!target) return "That captain is no longer in this harbor.";
        targetName = target.user.displayName;
      }
      if (!(await owns(tx, ledger, room, user.id, offerItem, offerAmount))) {
        return `You do not have enough ${offerItem} for that offer.`;
      }
      const offer = {
        id: randomUUID(),
        fromUserId: user.id,
        fromName: user.displayName,
        offerItem,
        offerAmount,
        requestItem,
        requestAmount,
        targetUserId,
        targetName,
      };
      ledger.offers.push(offer);
      append(
        ledger,
        user.id,
        [{ item: offerItem, amount: -offerAmount }],
        `🤝 Offered ${offerAmount} ${offerItem} for ${requestAmount} ${requestItem}`,
      );
    } else {
      const offer = ledger.offers.find(({ id }) => id === action.offerId);
      if (!offer) return "That offer is no longer available.";
      if (action.kind === "cancel") {
        if (offer.fromUserId !== user.id)
          return "Only the posting captain can withdraw that offer.";
        refund(ledger, offer);
      } else {
        if (
          offer.fromUserId === user.id ||
          (offer.targetUserId && offer.targetUserId !== user.id)
        ) {
          return "This offer is unavailable to you.";
        }
        const poster = await tx.roomMember.findUnique({
          where: { userId_roomId: { userId: offer.fromUserId, roomId } },
        });
        if (!poster) return "The posting captain is no longer in this harbor.";
        if (
          !(await owns(
            tx,
            ledger,
            room,
            user.id,
            offer.requestItem,
            offer.requestAmount,
          ))
        ) {
          return `You do not have enough ${offer.requestItem} for that trade.`;
        }
        append(
          ledger,
          user.id,
          [
            { item: offer.requestItem, amount: -offer.requestAmount },
            { item: offer.offerItem, amount: offer.offerAmount },
          ],
          `🤝 Traded ${offer.requestAmount} ${offer.requestItem} for ${offer.offerAmount} ${offer.offerItem}`,
        );
        append(
          ledger,
          offer.fromUserId,
          [{ item: offer.requestItem, amount: offer.requestAmount }],
          `🤝 Barter accepted. Received ${offer.requestAmount} ${offer.requestItem}`,
        );
        ledger.offers = ledger.offers.filter(({ id }) => id !== offer.id);
      }
    }
    await tx.room.update({
      where: { id: roomId },
      data: { barterLedger: JSON.stringify(ledger) },
    });
    return null;
  });
}
