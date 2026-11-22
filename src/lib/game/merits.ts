// Permanent account merits and their pure qualification rules.
import { MERCHANT_RATINGS } from "./constants";
import { RENOWN_TITLES } from "./legacy";
import { DIFFICULTIES, type Difficulty } from "./difficulty";

const topRating = MERCHANT_RATINGS[0];
const topTitle = RENOWN_TITLES[RENOWN_TITLES.length - 1];
const openWaters = DIFFICULTIES.open_waters;
const monsoon = DIFFICULTIES.monsoon;

// Monsoon endurance uses a lower threshold than the top merchant rating.
const EYE_OF_THE_STORM_REPUTATION = 200;

export type MeritId =
  | "first_voyage"
  | "first_crown"
  | "king_of_silk_road"
  | "renown_legend"
  | "iron_hull"
  | "century_club"
  | "open_water_captain"
  | "storm_sovereign"
  | "eye_of_the_storm";

// Icons remain in the interface layer so this definition stays framework free.
export type MeritDef = { id: MeritId; name: string; desc: string };

// Merit thresholds derive from the canonical rating and title ladders.
export const MERITS: MeritDef[] = [
  {
    id: "first_voyage",
    name: "First Landfall",
    desc: "Complete your first voyage.",
  },
  {
    id: "first_crown",
    name: "Sea Master",
    desc: "Get crowned Sea Master for the first time.",
  },
  {
    id: "king_of_silk_road",
    name: topRating.label,
    desc: `End a single voyage with ${topRating.minScore}+ Reputation.`,
  },
  {
    id: "renown_legend",
    name: topTitle.title,
    desc: `Reach Renown Level ${topTitle.minLevel}.`,
  },
  {
    id: "iron_hull",
    name: "Iron Hull",
    desc: "Complete three voyages in a row without going bankrupt.",
  },
  { id: "century_club", name: "Century Club", desc: "Complete ten voyages." },
  // These merits require a specific difficulty.
  {
    id: "open_water_captain",
    name: "Open Water Captain",
    desc: `Finish an ${openWaters.name} voyage without going bankrupt.`,
  },
  {
    id: "storm_sovereign",
    name: "Storm Sovereign",
    desc: `Get crowned Sea Master on a ${monsoon.name} voyage.`,
  },
  {
    id: "eye_of_the_storm",
    name: "Eye of the Storm",
    desc: `Finish a ${monsoon.name} voyage with ${EYE_OF_THE_STORM_REPUTATION}+ Reputation.`,
  },
];

export function meritById(id: string): MeritDef | undefined {
  return MERITS.find((m) => m.id === id);
}

// Progress is included only when account statistics provide a useful measure.
export type MeritProgress = {
  id: MeritId;
  name: string;
  desc: string;
  current: number;
  target: number;
  unit: string;
};

export function meritProgress(input: {
  voyagesCompleted: number;
  seaMasterCrowns: number;
  bestScore: number;
  renownLevel: number;
  consecutiveSolventVoyages: number;
  earnedIds: ReadonlySet<string>;
}): MeritProgress[] {
  const out: MeritProgress[] = [];
  const has = (id: MeritId) => input.earnedIds.has(id);

  if (!has("first_voyage")) {
    out.push({
      id: "first_voyage",
      name: "First Landfall",
      desc: "Complete your first voyage.",
      current: Math.min(input.voyagesCompleted, 1),
      target: 1,
      unit: "voyage",
    });
  }
  if (!has("first_crown")) {
    out.push({
      id: "first_crown",
      name: "Sea Master",
      desc: "Get crowned Sea Master for the first time.",
      current: Math.min(input.seaMasterCrowns, 1),
      target: 1,
      unit: "crown",
    });
  }
  if (!has("king_of_silk_road")) {
    out.push({
      id: "king_of_silk_road",
      name: topRating.label,
      desc: `End a single voyage with ${topRating.minScore}+ Reputation.`,
      current: Math.min(input.bestScore, topRating.minScore),
      target: topRating.minScore,
      unit: "rep",
    });
  }
  if (!has("renown_legend")) {
    out.push({
      id: "renown_legend",
      name: topTitle.title,
      desc: `Reach Renown Level ${topTitle.minLevel}.`,
      current: Math.min(input.renownLevel, topTitle.minLevel),
      target: topTitle.minLevel,
      unit: "level",
    });
  }
  if (!has("iron_hull")) {
    out.push({
      id: "iron_hull",
      name: "Iron Hull",
      desc: "Complete three voyages in a row without going bankrupt.",
      current: Math.min(input.consecutiveSolventVoyages, IRON_HULL_STREAK),
      target: IRON_HULL_STREAK,
      unit: "streak",
    });
  }
  if (!has("century_club")) {
    out.push({
      id: "century_club",
      name: "Century Club",
      desc: "Complete ten voyages.",
      current: Math.min(input.voyagesCompleted, CENTURY_CLUB_VOYAGES),
      target: CENTURY_CLUB_VOYAGES,
      unit: "voyages",
    });
  }
  // Difficulty merits remain unmeasured when account history is insufficient.
  return out;
}

// Values prefixed with new include the voyage currently being evaluated.
export type MeritEvalInput = {
  newVoyagesCompleted: number;
  crowned: boolean;
  priorSeaMasterCrowns: number;
  reputation: number;
  newRenownLevel: number;
  consecutiveSolventVoyages: number;
  // Voyage outcome used by difficulty specific merits.
  difficulty: Difficulty;
  bankrupt: boolean;
};

const IRON_HULL_STREAK = 3;
const CENTURY_CLUB_VOYAGES = 10;

// Returns all currently qualified merits so the caller can compute additions.
export function qualifyingMerits(input: MeritEvalInput): MeritId[] {
  const earned: MeritId[] = [];
  if (input.newVoyagesCompleted >= 1) earned.push("first_voyage");
  if (input.crowned || input.priorSeaMasterCrowns > 0)
    earned.push("first_crown");
  if (input.reputation >= topRating.minScore) earned.push("king_of_silk_road");
  if (input.newRenownLevel >= topTitle.minLevel) earned.push("renown_legend");
  if (input.consecutiveSolventVoyages >= IRON_HULL_STREAK)
    earned.push("iron_hull");
  if (input.newVoyagesCompleted >= CENTURY_CLUB_VOYAGES)
    earned.push("century_club");
  // Difficulty merits are evaluated from the voyage that just ended.
  if (input.difficulty === "open_waters" && !input.bankrupt)
    earned.push("open_water_captain");
  if (input.difficulty === "monsoon" && input.crowned)
    earned.push("storm_sovereign");
  if (
    input.difficulty === "monsoon" &&
    input.reputation >= EYE_OF_THE_STORM_REPUTATION
  )
    earned.push("eye_of_the_storm");
  return earned;
}
