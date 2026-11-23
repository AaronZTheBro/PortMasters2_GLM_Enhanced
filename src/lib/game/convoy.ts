// Pure contribution, settlement, and deadline rules for convoy ventures.
import {
  CONVOY_VENTURE_FAILURE_REFUND_RATE,
  CONVOY_VENTURE_PAYOUT_MULTIPLIER,
} from "./constants";

export type VentureContribution = { name: string; amount: number };
export type VentureContributions = Record<string, VentureContribution>;
export type VentureOutcome = "filled" | "failed" | "destroyed";
export type VentureSettlement = {
  userId: string;
  name: string;
  amount: number;
};

// Treats malformed persisted contributions as an empty map.
export function parseVentureContributions(raw: string): VentureContributions {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const out: VentureContributions = {};
    for (const [userId, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!value || typeof value !== "object") continue;
      const v = value as { name?: unknown; amount?: unknown };
      if (typeof v.name !== "string" || typeof v.amount !== "number") continue;
      out[userId] = { name: v.name, amount: v.amount };
    }
    return out;
  } catch {
    return {};
  }
}

export function ventureTotal(contributions: VentureContributions): number {
  return Object.values(contributions).reduce((sum, c) => sum + c.amount, 0);
}

// Caps a contribution by the target remainder and the captain's total share.
export function computeAcceptedContribution(
  currentTotal: number,
  targetGold: number,
  requestedAmount: number,
  contributorAlreadyContributed: number,
  maxContributorShare: number,
): number {
  const remainingInTarget = targetGold - currentTotal;
  if (remainingInTarget <= 0) return 0;
  const maxPerContributor = Math.ceil(targetGold * maxContributorShare);
  const remainingForContributor =
    maxPerContributor - contributorAlreadyContributed;
  if (remainingForContributor <= 0) return 0;
  return Math.min(requestedAmount, remainingInTarget, remainingForContributor);
}

// Filled ventures pay a premium, failed ventures refund partially, and
// cancelled ventures refund in full.
export function settlementRateFor(outcome: VentureOutcome): number {
  if (outcome === "filled") return CONVOY_VENTURE_PAYOUT_MULTIPLIER;
  if (outcome === "failed") return CONVOY_VENTURE_FAILURE_REFUND_RATE;
  return 1;
}

export function computeSettlements(
  contributions: VentureContributions,
  outcome: VentureOutcome,
): VentureSettlement[] {
  const rate = settlementRateFor(outcome);
  return Object.entries(contributions).map(([userId, c]) => ({
    userId,
    name: c.name,
    amount: Math.round(c.amount * rate),
  }));
}

// Leaves at least one playable round after the latest valid deadline.
export function computeVentureDeadlineBounds(
  currentRound: number,
  voyageRounds: number,
  minRoundsAhead: number,
  maxRoundsAhead: number,
): { minRound: number; maxRound: number } | null {
  const minRound = currentRound + minRoundsAhead;
  const maxRound = Math.min(currentRound + maxRoundsAhead, voyageRounds - 1);
  if (minRound > maxRound) return null;
  return { minRound, maxRound };
}

// Keeps outcome announcements beside the settlement rules they describe.
export function ventureAnnouncementFor(outcome: VentureOutcome): string {
  if (outcome === "filled") {
    return `⚓ A Convoy Venture filled! Every contributor is paid their share, multiplied by ${CONVOY_VENTURE_PAYOUT_MULTIPLIER}. This harbor's one Convoy Venture chance for this voyage has now been used.`;
  }
  if (outcome === "failed") {
    return `⚓ A Convoy Venture missed its deadline. Every contributor gets back a partial refund.`;
  }
  return `⚓ A Convoy Venture was cancelled: another venture in the harbor already claimed this voyage's one chance. Every contributor gets back their full stake.`;
}

export function ventureSettlementLine(outcome: VentureOutcome, amount: number) {
  switch (outcome) {
    case "filled":
      return `⚓ Convoy Venture filled! Your share: ${amount} Gold`;
    case "failed":
      return `⚓ Convoy Venture missed its deadline. Partial refund: ${amount} Gold`;
    case "destroyed":
      return `⚓ Convoy Venture cancelled: another venture filled first. Full refund: ${amount} Gold`;
  }
}
