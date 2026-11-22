// Classifies reported Gold and Reputation against loose theoretical ceilings.
import {
  BROKERS_FAVOR_PAYOUT_CAP,
  PRODUCT_PRICES,
  WORD_ON_THE_DOCKS_REWARD,
} from "./constants";
import { DIFFICULTIES } from "./difficulty";

// Ceiling inputs derive from current balance data.
const DEAREST_PRODUCT = Math.max(
  ...Object.values(PRODUCT_PRICES).map(([, high]) => high),
);

// Product orders request no more than three units.
const MAX_ORDER_QUANTITY = 3;

// This safely exceeds every current reward multiplier combination.
const MODIFIER_STACK_CEILING = 2;

// Includes every charter expansion and a Tidewatch card.
const WIDEST_ORDER_BOARD =
  Math.max(
    ...Object.values(DIFFICULTIES).map(
      (d) => d.orderCardsBase + d.cardsPerTier.reduce((a, b) => a + b, 0),
    ),
  ) + 1;

// Covers a full premium order board plus both independent rewards.
export const MAX_PLAUSIBLE_GOLD_PER_ROUND =
  DEAREST_PRODUCT *
    MAX_ORDER_QUANTITY *
    MODIFIER_STACK_CEILING *
    WIDEST_ORDER_BOARD +
  BROKERS_FAVOR_PAYOUT_CAP +
  WORD_ON_THE_DOCKS_REWARD;

// Reputation cannot exceed the equivalent Gold ceiling.
export const MAX_PLAUSIBLE_SCORE_PER_ROUND = MAX_PLAUSIBLE_GOLD_PER_ROUND;

// Covers starting funds and one in flight round.
const STARTING_ALLOWANCE = 500;

// This intentionally catches only grossly impossible values.
export function plausibleCeiling(perRound: number, roundsElapsed: number) {
  const rounds = Math.max(1, Math.floor(roundsElapsed));
  return perRound * (rounds + 1) + STARTING_ALLOWANCE;
}

// Suspect values are logged; impossible values block persistent rewards.
const SUSPECT_FRACTION = 10;

export type IntegritySeverity = "ok" | "suspect" | "impossible";

// Readable fields are evaluated independently.
export type SaveSnapshot = { money?: number; score?: number };

// Returns null for nonobject payloads and omits unreadable fields.
export function snapshotFromSave(data: unknown): SaveSnapshot | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const snapshot: SaveSnapshot = {};
  if (typeof d.money === "number") snapshot.money = d.money;
  if (typeof d.score === "number") snapshot.score = d.score;
  return snapshot;
}

export type IntegrityFinding = {
  field: "money" | "score";
  value: number;
  // The suspect or impossible threshold that was crossed.
  threshold: number;
};

export type IntegrityVerdict = {
  plausible: boolean;
  severity: IntegritySeverity;
  findings: IntegrityFinding[];
};

// Uses the server round as an absolute bound. Negative values remain valid.
export function checkSave(
  snapshot: SaveSnapshot,
  roundsElapsed: number,
): IntegrityVerdict {
  const findings: IntegrityFinding[] = [];
  const checks: {
    field: "money" | "score";
    value: number | undefined;
    perRound: number;
  }[] = [
    {
      field: "money",
      value: snapshot.money,
      perRound: MAX_PLAUSIBLE_GOLD_PER_ROUND,
    },
    {
      field: "score",
      value: snapshot.score,
      perRound: MAX_PLAUSIBLE_SCORE_PER_ROUND,
    },
  ];
  let severity: IntegritySeverity = "ok";
  for (const c of checks) {
    // Missing fields are skipped instead of being treated as zero.
    if (c.value === undefined) continue;
    const ceiling = plausibleCeiling(c.perRound, roundsElapsed);
    const broken = !Number.isFinite(c.value);
    if (broken || c.value > ceiling) {
      severity = "impossible";
      findings.push({ field: c.field, value: c.value, threshold: ceiling });
    } else if (c.value > ceiling / SUSPECT_FRACTION) {
      if (severity === "ok") severity = "suspect";
      findings.push({
        field: c.field,
        value: c.value,
        threshold: Math.floor(ceiling / SUSPECT_FRACTION),
      });
    }
  }
  return { plausible: severity === "ok", severity, findings };
}

// Produces a compact value and threshold summary for logs and storage.
export function describeFindings(findings: IntegrityFinding[]): string {
  return findings
    .map((f) => `${f.field}=${f.value} exceeds ${f.threshold}`)
    .join("; ");
}
