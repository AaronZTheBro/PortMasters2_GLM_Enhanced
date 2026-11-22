// Central difficulty configuration and pure selectors for room rules.

export type Difficulty = "fair_winds" | "open_waters" | "monsoon";

export const DEFAULT_DIFFICULTY: Difficulty = "fair_winds";

export interface DifficultyConfig {
  key: Difficulty;
  // Shared display metadata.
  name: string;
  badge: string;
  icon: string;
  tagline: string;
  summary: string;

  // Voyage economy.
  rounds: number;
  startingGold: number;
  maintenance: number;

  // Market breadth and charter schedule.
  purchaseCardsBase: number;
  orderCardsBase: number;
  tierUnlock: Record<number, number>;
  cardsPerTier: readonly number[];

  // Raid risk before and after the voyage midpoint.
  pirateChance: readonly [number] | readonly [number, number];
  // Escort fee as a share of current Gold.
  escortCostRate: number;

  // Broker leak probability and added raid risk.
  brokerCorruption: boolean;
  brokerCorruptionChance: number;
  brokerCorruptionRisk: number;

  // Maps rounds to mandate template indexes.
  mandates: Record<number, number>;

  // Scales Reputation converted to Renown XP.
  renownXpMultiplier: number;
}

// Production tuning for supported room difficulties.
export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  fair_winds: {
    key: "fair_winds",
    name: "Fair Winds",
    badge: "Fair Winds",
    icon: "🌤️",
    tagline: "A gentle passage for new captains.",
    summary:
      "Eight rounds on the founding trade. A short, legible voyage with room to learn the rhythm before the money runs tight.",
    rounds: 8,
    startingGold: 100,
    maintenance: 15,
    purchaseCardsBase: 6,
    orderCardsBase: 6,
    tierUnlock: {},
    cardsPerTier: [],
    pirateChance: [0.2],
    escortCostRate: 0.1,
    brokerCorruption: false,
    brokerCorruptionChance: 0,
    brokerCorruptionRisk: 0,
    mandates: {},
    renownXpMultiplier: 1.0,
  },
  open_waters: {
    key: "open_waters",
    name: "Open Waters",
    badge: "Open Waters",
    icon: "🌊",
    tagline: "The full trade opens as the harbor grows busy.",
    summary:
      "Twelve rounds. The charter opens twice and the market swells from six cards to ten, with pirates that begin to bite past the midpoint.",
    rounds: 12,
    startingGold: 100,
    maintenance: 18,
    purchaseCardsBase: 6,
    orderCardsBase: 6,
    tierUnlock: { 1: 4, 2: 8 },
    cardsPerTier: [2, 2],
    pirateChance: [0.22, 0.3],
    escortCostRate: 0.12,
    brokerCorruption: false,
    brokerCorruptionChance: 0,
    brokerCorruptionRisk: 0,
    mandates: { 4: 0, 8: 1, 12: 2 },
    renownXpMultiplier: 1.25,
  },
  monsoon: {
    key: "monsoon",
    name: "Monsoon Season",
    badge: "Monsoon",
    icon: "⛈️",
    tagline: "A long, adversarial haul for seasoned captains.",
    summary:
      "Sixteen rounds, back loaded and unforgiving. The market swells to eleven cards, the largest imperial mandates fall late, and a corrupt broker may leak your position to the pirates.",
    rounds: 16,
    startingGold: 90,
    maintenance: 22,
    purchaseCardsBase: 6,
    orderCardsBase: 6,
    tierUnlock: { 1: 6, 2: 11 },
    cardsPerTier: [2, 3],
    pirateChance: [0.28, 0.38],
    escortCostRate: 0.15,
    brokerCorruption: true,
    brokerCorruptionChance: 0.3,
    brokerCorruptionRisk: 0.08,
    mandates: { 6: 1, 12: 2, 16: 2 },
    renownXpMultiplier: 1.6,
  },
};

// Orders difficulties from calmest to hardest.
export const DIFFICULTY_ORDER: readonly Difficulty[] = [
  "fair_winds",
  "open_waters",
  "monsoon",
];

// Mandate templates are indexed by each difficulty schedule.
export interface MandateTemplate {
  size: "small" | "medium" | "large";
  port: string;
  resources: { type: string; required: number }[];
  reward: number;
}

// Fixed mandates keep commissions identical without changing seeded draws.
export const MANDATE_TEMPLATES: readonly MandateTemplate[] = [
  {
    size: "small",
    port: "Quanzhou Port",
    resources: [
      { type: "Silk", required: 4 },
      { type: "Tea", required: 3 },
    ],
    reward: 135,
  },
  {
    size: "medium",
    port: "Yangzhou Port",
    resources: [
      { type: "Brocade", required: 2 },
      { type: "Sachet", required: 1 },
    ],
    reward: 260,
  },
  {
    size: "large",
    port: "Hangzhou Port",
    resources: [
      { type: "Cotton Clothes", required: 2 },
      { type: "Brocade", required: 2 },
      { type: "Sachet", required: 2 },
    ],
    reward: 420,
  },
];

// Unknown values fall back to the default difficulty.
export function normalizeDifficulty(value: unknown): Difficulty {
  return value === "fair_winds" ||
    value === "open_waters" ||
    value === "monsoon"
    ? value
    : DEFAULT_DIFFICULTY;
}

export function difficultyConfig(value: unknown): DifficultyConfig {
  return DIFFICULTIES[normalizeDifficulty(value)];
}

export function roundsFor(value: unknown): number {
  return difficultyConfig(value).rounds;
}
export function escortRateFor(value: unknown): number {
  return difficultyConfig(value).escortCostRate;
}

export function renownMultiplierFor(value: unknown): number {
  return difficultyConfig(value).renownXpMultiplier;
}

// Returns the highest content tier available on the given round.
export function unlockedTierFor(value: unknown, roundNo: number): number {
  const cfg = difficultyConfig(value);
  let highest = 0;
  for (const [tierStr, openRound] of Object.entries(cfg.tierUnlock)) {
    if (roundNo >= openRound) highest = Math.max(highest, Number(tierStr));
  }
  return highest;
}

// Combines every content tier available on the given round.
export function unlockedPool<T>(
  tiers: readonly (readonly T[])[],
  value: unknown,
  roundNo: number,
): T[] {
  const tier = unlockedTierFor(value, roundNo);
  const out: T[] = [];
  for (let i = 0; i <= tier; i++) out.push(...(tiers[i] ?? []));
  return out;
}

export function marketCountsFor(
  value: unknown,
  roundNo: number,
): { purchase: number; order: number } {
  const cfg = difficultyConfig(value);
  const tier = unlockedTierFor(value, roundNo);
  let extra = 0;
  for (let i = 0; i < tier; i++) extra += cfg.cardsPerTier[i] ?? 0;
  return {
    purchase: cfg.purchaseCardsBase + extra,
    order: cfg.orderCardsBase + extra,
  };
}

// Returns the content tier opening on this exact round.
export function charterTierOpeningOn(
  value: unknown,
  roundNo: number,
): number | undefined {
  for (const [tierStr, openRound] of Object.entries(
    difficultyConfig(value).tierUnlock,
  )) {
    if (roundNo === openRound) return Number(tierStr);
  }
  return undefined;
}

export function charterOpensOn(value: unknown, roundNo: number): boolean {
  return charterTierOpeningOn(value, roundNo) !== undefined;
}

// Selects the raid probability before or after the voyage midpoint.
export function pirateChanceFor(
  value: unknown,
  roundNo: number,
  maxRounds: number,
): number {
  const curve = difficultyConfig(value).pirateChance;
  const secondHalf = curve.length === 2 ? curve[1] : curve[0];
  return roundNo <= Math.floor(maxRounds / 2) ? curve[0] : secondHalf;
}

// Returns the scheduled mandate index when one exists.
export function mandateIndexFor(
  value: unknown,
  roundNo: number,
): number | undefined {
  return difficultyConfig(value).mandates[roundNo];
}
