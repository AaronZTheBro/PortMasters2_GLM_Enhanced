import { RESOURCE_WEIGHTS } from "./constants";
import type { GameState } from "./types";

// Totals raw material purchases for the next room price pulse.
export function tallyPurchasesByResource(
  state: Pick<GameState, "purchasedCards" | "resourceCards">,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of new Set(state.purchasedCards)) {
    const card = state.resourceCards.find((c) => c.id === id);
    if (!card || card.isProductCard) continue;
    for (const r of card.resources) {
      if (
        !Object.hasOwn(RESOURCE_WEIGHTS, r.type) ||
        !Number.isSafeInteger(r.quantity) ||
        r.quantity! <= 0
      )
        continue;
      out[r.type] = (out[r.type] ?? 0) + r.quantity!;
    }
  }
  return out;
}

export function savedPurchaseTotals(
  saves: readonly string[],
  epoch: number,
  round: number,
) {
  const total: Record<string, number> = {};
  for (const raw of saves) {
    let state: Partial<GameState> | null;
    try {
      state = JSON.parse(raw) as Partial<GameState> | null;
    } catch {
      continue;
    }
    if (!state || (state.voyageEpoch ?? 0) !== epoch) continue;
    const receipt = state.lastPurchaseTally;
    const quantities =
      receipt?.round === round
        ? (receipt.quantities ?? {})
        : state.currentRound === round &&
            Array.isArray(state.resourceCards) &&
            Array.isArray(state.purchasedCards)
          ? tallyPurchasesByResource({
              resourceCards: state.resourceCards,
              purchasedCards: state.purchasedCards,
            })
          : {};
    for (const [item, amount] of Object.entries(quantities)) {
      if (
        Object.hasOwn(RESOURCE_WEIGHTS, item) &&
        Number.isSafeInteger(amount) &&
        amount > 0
      )
        total[item] = (total[item] ?? 0) + amount;
    }
  }
  return total;
}

// Converts room purchase totals into bounded price adjustments for each good.
export const PULSE_CAP = 0.12;
export const PULSE_SENSITIVITY = 0.6;

export function computeHarborPulse(
  tally: Record<string, number> | undefined,
  expectedItems?: readonly string[],
): Record<string, number> {
  if (!tally) return {};
  const items = expectedItems ?? Object.keys(tally);
  const total = items.reduce((sum, k) => sum + (tally[k] ?? 0), 0);
  if (total <= 0 || items.length === 0) return {};
  const weight = expectedItems?.reduce(
    (sum, item) => sum + RESOURCE_WEIGHTS[item],
    0,
  );
  const out: Record<string, number> = {};
  for (const item of items) {
    const share = (tally[item] ?? 0) / total;
    const baseline = weight ? RESOURCE_WEIGHTS[item] / weight : 1 / 3;
    const nudge = (share - baseline) * PULSE_SENSITIVITY;
    out[item] = Math.max(-PULSE_CAP, Math.min(PULSE_CAP, nudge));
  }
  return out;
}
