import { addOwnedAmount } from "./engine/core";
import type { GameState } from "./types";

export type BarterOffer = {
  id: string;
  fromUserId: string;
  fromName: string;
  offerItem: string;
  offerAmount: number;
  requestItem: string;
  requestAmount: number;
  targetUserId?: string;
  targetName?: string;
};

export type BarterEntry = {
  id: number;
  userId: string;
  changes: { item: string; amount: number }[];
  line: string;
};

export type BarterLedger = {
  offers: BarterOffer[];
  entries: BarterEntry[];
};

export type BarterUpdate = BarterLedger & {
  roomId: string;
  epoch: number;
  revision: number;
};

export function applyBarterEntries(
  game: GameState,
  entries: BarterEntry[],
  logs: string[],
) {
  for (const entry of entries) {
    if (entry.id <= (game.barterCursor ?? 0)) continue;
    for (const { item, amount } of entry.changes)
      addOwnedAmount(game, item, amount);
    logs.push(entry.line);
    game.barterCursor = entry.id;
  }
}
