// Persistent account progression shared by client and server code.

// Renown levels use triangular XP growth in increments of 100.
const RENOWN_XP_UNIT = 100;

export function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  const steps = level - 1;
  return (RENOWN_XP_UNIT * steps * (steps + 1)) / 2;
}

export function levelForRenownXP(xp: number): number {
  let level = 1;
  while (xp >= xpRequiredForLevel(level + 1)) level++;
  return level;
}

export type RenownProgress = {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
};

export function renownProgress(xp: number): RenownProgress {
  const level = levelForRenownXP(xp);
  const floor = xpRequiredForLevel(level);
  const ceiling = xpRequiredForLevel(level + 1);
  return { level, xpIntoLevel: xp - floor, xpForNextLevel: ceiling - floor };
}

export type RenownTitle = { minLevel: number; title: string };

export const RENOWN_TITLES: RenownTitle[] = [
  { minLevel: 1, title: "Deckhand" },
  { minLevel: 3, title: "Able Seaman" },
  { minLevel: 5, title: "Trade Officer" },
  { minLevel: 8, title: "Harbor Captain" },
  { minLevel: 12, title: "Fleet Commodore" },
  { minLevel: 16, title: "Silk Road Legend" },
  { minLevel: 21, title: "Silk Road Sovereign" },
];

export function renownTitleForLevel(level: number): string {
  let title = RENOWN_TITLES[0].title;
  for (const t of RENOWN_TITLES) {
    if (level >= t.minLevel) title = t.title;
  }
  return title;
}

// Renown grants a capped starting Gold bonus without changing seeded draws.
const RENOWN_GOLD_PER_LEVEL = 3;
const RENOWN_GOLD_CAP = 60;

export function renownStartingGoldBonus(level: number): number {
  return Math.min(
    RENOWN_GOLD_CAP,
    Math.max(0, level - 1) * RENOWN_GOLD_PER_LEVEL,
  );
}

// Per difficulty records tolerate historical difficulty keys.
export type DifficultyStats = { crowns: number; bestScore: number };
export type StatsByDifficulty = Record<string, DifficultyStats>;

// Treats missing or malformed persisted statistics as an empty record.
export function parseStatsByDifficulty(
  raw: string | null | undefined,
): StatsByDifficulty {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const out: StatsByDifficulty = {};
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!value || typeof value !== "object") continue;
      const v = value as { crowns?: unknown; bestScore?: unknown };
      out[key] = {
        crowns:
          typeof v.crowns === "number" && Number.isFinite(v.crowns)
            ? v.crowns
            : 0,
        bestScore:
          typeof v.bestScore === "number" && Number.isFinite(v.bestScore)
            ? v.bestScore
            : 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}

// Returns updated statistics without mutating the existing record.
export function recordVoyageInStats(
  stats: StatsByDifficulty,
  difficulty: string,
  voyage: { crowned: boolean; reputation: number },
): StatsByDifficulty {
  const prior = stats[difficulty] ?? { crowns: 0, bestScore: 0 };
  return {
    ...stats,
    [difficulty]: {
      crowns: prior.crowns + (voyage.crowned ? 1 : 0),
      bestScore: Math.max(prior.bestScore, voyage.reputation),
    },
  };
}

// Shared legacy summary returned by account and voyage APIs.
export type CaptainLegacySummary = {
  renownLevel: number;
  renownXP: number;
  voyagesCompleted: number;
  seaMasterCrowns: number;
  bestScore: number;
  meritIds: string[];
  statsByDifficulty: StatsByDifficulty;
};

export const DEFAULT_LEGACY_SUMMARY: CaptainLegacySummary = {
  renownLevel: 1,
  renownXP: 0,
  voyagesCompleted: 0,
  seaMasterCrowns: 0,
  bestScore: 0,
  meritIds: [],
  statsByDifficulty: {},
};
