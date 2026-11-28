// Reagent rules: persistent Favors, the Bond Table, Patron Charters, and Heat.
// These helpers are pure so the engine, the interface, and the tests share one
// source of truth for a voyage that remembers what the captain did.
import { BOONS, COMMODITIES, RECIPES, type Boon } from "./constants";
import { CERAMICS } from "./harbor-catalog";
import { REAGENT_RULES } from "./rules-version";
import { voyageRandom } from "./voyage-rng";
import type { EngineState, GameState } from "./types";

type FavorTag = "Smuggling" | "Silk" | "Kiln" | "Ocean" | "Road" | "Court";

const FAVOR_TAGS: Record<string, readonly FavorTag[]> = {
  silk_wind: ["Silk", "Ocean"],
  favorable_tides: ["Ocean"],
  merchant_charm: ["Smuggling", "Road"],
  artisan_inspiration: ["Kiln", "Road"],
  tax_shelter: ["Court"],
  hemp_monopoly: ["Smuggling", "Road"],
  master_apprentice: ["Road", "Court"],
  farsight: ["Ocean", "Court"],
  kiln_and_forge_guild: ["Kiln"],
  frontier_tariff_relief: ["Court", "Road"],
  exotic_treasures: ["Ocean", "Court"],
  deep_sea_escort_pact: ["Ocean"],
  merchants_converge: ["Road", "Court"],
  buyers_festival: ["Court", "Road"],
  resourceful_crew: ["Kiln", "Road"],
  market_momentum: ["Road"],
  bamboo_fair: ["Road"],
  reliable_buyer: ["Road", "Court"],
  safe_anchorage: ["Ocean"],
  ceramic_commission: ["Kiln"],
  coastal_forecast: ["Ocean"],
  guild_turnover: ["Kiln", "Road"],
  deep_market: ["Ocean"],
  rare_cargo_charter: ["Ocean", "Court"],
  false_colors: ["Smuggling", "Ocean"],
};

export function tagsForFavor(id: string): readonly FavorTag[] {
  return FAVOR_TAGS[id] ?? ["Road"];
}

export function favorName(id: string): string {
  return BOONS.find((boon) => boon.id === id)?.name ?? id;
}

export function favorIcon(id: string): string {
  return BOONS.find((boon) => boon.id === id)?.icon ?? "✨";
}

// A Favor repeats its rule every round it stays on the Rack. The draft
// text comes from the round Boon pool, so the timing words need updating.
export function favorDescription(boon: Boon): string {
  if (boon.id === "master_apprentice")
    return "Artisans you hire earn half their base wage for their first settlement, before the Artisan's Workshop adjustment.";
  if (boon.id === "artisan_inspiration")
    return "The first assigned artisan in roster order produces one extra item each settlement.";
  // The harbor revision of these two Boons is tuned for one round. On the
  // Rack the base effect applies every round, so the revised numbers would
  // promise more than the Engine delivers.
  if (boon.id === "favorable_tides")
    return "Cuts up to 4 Gold from each ordinary order's freight each round, after the ship level discount.";
  if (boon.id === "tax_shelter")
    return "Sets the base Income Tax rate to 5 percent each round before module adjustments.";
  if (boon.id === "merchants_converge")
    return "Each round, replace one buyer, including a guild buyer, with a finished good commission and see its terms before buying.";
  return boon.desc.replace(/\bthis round\b/g, "each round");
}

function favorRank(marks = 0): 1 | 2 | 3 {
  if (marks >= 6) return 3;
  if (marks >= 3) return 2;
  return 1;
}

export function favorMarksFor(state: GameState, id: string): number {
  return state.favorMarks?.[id] ?? 0;
}

export function favorRankFor(state: GameState, id: string): 1 | 2 | 3 {
  return favorRank(favorMarksFor(state, id));
}

// Rank two and rank three payoffs. A Favor without a specific line still
// holds its place on the Rack, and one with an Engine recipe can bond at
// rank two.
const FAVOR_RANK_TEXT: Record<string, readonly [string, string]> = {
  merchant_charm: [
    "Rank 2: ordinary orders save 1 Gold of freight.",
    "Rank 3: buying three different goods in one round pays a 6 Gold rebate.",
  ],
  silk_wind: [
    "Rank 2: each Silk order saves 1 more Gold of freight.",
    "Rank 3: each Silk order saves 2 Gold of freight.",
  ],
  favorable_tides: [
    "Rank 2: freight relief rises to 5 Gold.",
    "Rank 3: freight relief rises to 6 Gold.",
  ],
  hemp_monopoly: [
    "Rank 2: Hemp costs 3 Gold less per unit.",
    "Rank 3: the first Hemp lot each round pays a 4 Gold rebate.",
  ],
  safe_anchorage: [
    "Rank 2: protected Gold rises to 35.",
    "Rank 3: protected Gold rises to 45 and the escort saves another 5 Gold.",
  ],
  artisan_inspiration: [
    "Rank 2: the second artisan also adds one item.",
    "Rank 3: wages fall by 2 Gold each round while an artisan works.",
  ],
  resourceful_crew: [
    "Rank 2: the first three recipes can save an input.",
    "Rank 3: the first four recipes can save an input.",
  ],
  kiln_and_forge_guild: [
    "Rank 2: the bonus rises to 20 percent.",
    "Rank 3: the bonus rises to 25 percent.",
  ],
  exotic_treasures: [
    "Rank 2: the bonus rises to 20 percent.",
    "Rank 3: the bonus rises to 25 percent.",
  ],
  tax_shelter: [
    "Rank 2: the base rate falls to 3 percent.",
    "Rank 3: Income Tax is skipped.",
  ],
};

export function rankText(id: string, rank: 1 | 2 | 3): string {
  if (rank === 1) return "Rank 1: the base effect.";
  const text = FAVOR_RANK_TEXT[id];
  if (text) return text[rank - 2];
  if (!ENGINE_RECIPES.some((recipe) => recipe.favorId === id)) {
    return rank === 2
      ? "Rank 2: this Favor holds its place and keeps its effect."
      : "Rank 3: fully attuned.";
  }
  return rank === 2
    ? "Rank 2: this Favor is ready for a Bond."
    : "Rank 3: this Favor's Engine costs 2 Gold less each round.";
}

const RANK_MODIFIERS: Record<
  string,
  Partial<Record<2 | 3, Record<string, number>>>
> = {
  merchant_charm: {
    2: { favor_freight_relief: 1 },
    3: { favor_freight_relief: 1, favor_market_rebate: 6 },
  },
  silk_wind: {
    2: { favor_silk_freight: 1 },
    3: { favor_silk_freight: 2 },
  },
  favorable_tides: {
    2: { transport_flat_discount: 5 },
    3: { transport_flat_discount: 6 },
  },
  hemp_monopoly: {
    2: { hemp_price_reduction: 3 },
    3: { hemp_price_reduction: 3, favor_hemp_rebate: 4 },
  },
  safe_anchorage: {
    2: { safe_anchorage: 35 },
    3: { safe_anchorage: 45, favor_escort_relief: 5 },
  },
  artisan_inspiration: {
    2: { favor_artisan_second: 1 },
    3: { favor_artisan_second: 1, favor_artisan_wage_relief: 2 },
  },
  resourceful_crew: {
    2: { favor_recipe_cap: 3 },
    3: { favor_recipe_cap: 4 },
  },
  kiln_and_forge_guild: {
    2: { charter_order_bonus: 0.2 },
    3: { charter_order_bonus: 0.25 },
  },
  exotic_treasures: {
    2: { exotic_order_bonus: 0.2 },
    3: { exotic_order_bonus: 0.25 },
  },
  tax_shelter: {
    2: { income_tax_override: 0.03 },
    3: { income_tax_override: 0 },
  },
};

function favorModifiers(id: string, rank: 1 | 2 | 3) {
  const boon = BOONS.find((entry) => entry.id === id);
  const out: Record<string, number> = { ...(boon?.modifiers ?? {}) };
  if (rank >= 2) Object.assign(out, RANK_MODIFIERS[id]?.[2] ?? {});
  if (rank >= 3) Object.assign(out, RANK_MODIFIERS[id]?.[3] ?? {});
  return out;
}

type EngineRecipe = {
  id: string;
  name: string;
  icon: string;
  favorId: string;
  moduleId: string;
  tag: FavorTag;
  desc: string;
};

// Two owned pieces fuse into one permanent rule. A Bond adds no new
// purchase discount of its own. It changes what the cargo becomes or how the
// round is paid for, though a recipe such as the False Manifest keeps a
// discount from its source.
export const ENGINE_RECIPES: readonly EngineRecipe[] = [
  {
    id: "silk_reel",
    name: "The Silk Reel",
    icon: "🧵",
    favorId: "silk_wind",
    moduleId: "silk_monopoly",
    tag: "Silk",
    desc: "Raw Silk ships free. Every 3 raw Silk delivered on completed orders yields 1 Brocade at settlement, up to 2 each round. Production begins in the round after the Bond.",
  },
  {
    id: "false_manifest",
    name: "The False Manifest",
    icon: "🕯️",
    favorId: "merchant_charm",
    moduleId: "smugglers_hold",
    tag: "Smuggling",
    desc: "Port cargo lots cost 15 percent less. One lot each round can defer 20 percent of its price to settlement while no shadow debt is owed. Deferral does not open in the final round. A shadow audit may take up to 20 Gold.",
  },
  {
    id: "workhouse",
    name: "The Workhouse",
    icon: "🛠️",
    favorId: "resourceful_crew",
    moduleId: "artisans_workshop",
    tag: "Kiln",
    desc: "The first two assigned artisans each add one item, the first two recipes save one input, and wages rise 20 percent.",
  },
  {
    id: "storm_charter",
    name: "The Storm Charter",
    icon: "⛈️",
    favorId: "safe_anchorage",
    moduleId: "storm_dividend",
    tag: "Ocean",
    desc: "An escort and direct passage can coexist. The escort costs double, and Storm Dividend still arms.",
  },
  {
    id: "quiet_port",
    name: "The Quiet Port",
    icon: "🤫",
    favorId: "farsight",
    moduleId: "brokers_network",
    tag: "Court",
    desc: "Whispers cost 1 Gold and reveal two rumors. Farsight's free rumor is gone, and raid risk rises 4 percentage points.",
  },
  {
    id: "patrons_favor",
    name: "The Patron's Favor",
    icon: "🪭",
    favorId: "artisan_inspiration",
    moduleId: "silk_market_charter",
    tag: "Road",
    desc: "The first sale each round of a good your artisans made 3 or more of last round earns 15 percent more.",
  },
] as const;

export function engineRecipe(id: string) {
  return ENGINE_RECIPES.find((recipe) => recipe.id === id);
}

export function engineRecipeForPair(favorId: string, moduleId: string) {
  return ENGINE_RECIPES.find(
    (recipe) => recipe.favorId === favorId && recipe.moduleId === moduleId,
  );
}

export function actForRound(maxRounds: number, round: number): 1 | 2 | 3 {
  const first = Math.ceil(maxRounds / 3);
  const second = Math.ceil((maxRounds * 2) / 3);
  if (round <= first) return 1;
  if (round <= second) return 2;
  return 3;
}

export function favorSlots(state: GameState) {
  return actForRound(state.maxRounds, state.currentRound);
}

export function favorSlotsUsed(state: GameState) {
  return (state.favors?.length ?? 0) + (state.engines?.length ?? 0);
}

// A Rack held entirely by Engines leaves no Favor slot to fill or replace,
// so the draft has no legal choice and must pass.
export function favorDraftHasNoPick(state: GameState) {
  if (state.rulesVersion !== REAGENT_RULES || !state.charterId) return false;
  if ((state.boonChoices ?? []).length === 0) return true;
  if ((state.favors ?? []).length > 0) return false;
  return favorSlotsUsed(state) >= favorSlots(state);
}

export function moduleSlotsUsed(state: GameState) {
  return (state.equippedModules?.length ?? 0) + (state.engines?.length ?? 0);
}

export function canLockFavor(state: GameState, favorId?: string) {
  if (!state.charterId || !favorId) return false;
  if (!(state.boonChoices ?? []).some((boon) => boon.id === favorId))
    return false;
  if ((state.favors ?? []).includes(favorId)) return true;
  if (favorSlotsUsed(state) < favorSlots(state)) return true;
  const slot = state.pendingFavorSlot;
  return slot !== undefined && slot >= 0 && slot < (state.favors ?? []).length;
}

// A saved draft decision is legal when it holds a Favor the Rack can take or
// when the Rack has no legal choice and the draft must pass. The server reads
// the saved pendingBoonId to apply the same rule before accepting readiness.
export function readyDraftIsLegal(state: GameState) {
  return (
    canLockFavor(state, state.pendingBoonId) ||
    (!state.pendingBoonId && favorDraftHasNoPick(state))
  );
}

// Two Bonds are possible from Act II, so a long enough voyage can field a
// second Engine instead of opening the slot with only two rounds left.
export function engineSlots(state: GameState) {
  return actForRound(state.maxRounds, state.currentRound) >= 2 ? 2 : 1;
}

export function engineIsActive(state: GameState, engine: EngineState) {
  return (engine.dormantUntilRound ?? 0) <= state.currentRound;
}

export function hasEngine(state: GameState, id: string) {
  return (state.engines ?? []).some(
    (engine) => engine.id === id && engineIsActive(state, engine),
  );
}

export function engineUsesFavor(state: GameState, id: string) {
  return (state.engines ?? []).some((engine) => engine.favorId === id);
}

// A bonded Engine keeps its source module. The module cannot be drafted or
// installed again, so its printed rule never stacks on top of the Engine.
export function engineUsesModule(state: GameState, id: string) {
  return (state.engines ?? []).some((engine) => engine.moduleId === id);
}

export function engineUpkeepFor(engine: Pick<EngineState, "rank">) {
  return Math.max(2, 6 - Math.max(0, engine.rank - 2) * 2);
}

export function engineUpkeepTotal(state: GameState) {
  return (state.engines ?? [])
    .filter((engine) => engineIsActive(state, engine))
    .reduce((sum, engine) => sum + engineUpkeepFor(engine), 0);
}

const ENGINE_MODIFIERS: Record<string, Record<string, number>> = {
  workhouse: {
    resourceful_crew: 1,
    favor_recipe_cap: 2,
    worker_bonus_production: 1,
    favor_artisan_second: 1,
    engine_wage_surcharge: 0.2,
  },
};

// Rebuilds the round's modifier flags from the rack and the active Engines.
// Replacing a Favor replaces its effect. Nothing stacks by accident.
export function refreshFavorModifiers(state: GameState) {
  const next: Record<string, number> = {};
  for (const id of state.favors ?? []) {
    const rank = favorRankFor(state, id);
    Object.assign(next, favorModifiers(id, rank));
  }
  for (const engine of state.engines ?? []) {
    if (!engineIsActive(state, engine)) continue;
    Object.assign(next, ENGINE_MODIFIERS[engine.id] ?? {});
  }
  state.modifierFlags = next;
}

type CharterMetric =
  "raw_goods" | "silk_goods" | "ceramic_goods" | "best_round" | "orders";

export type Charter = {
  id: string;
  name: string;
  patron: string;
  icon: string;
  tag: FavorTag;
  desc: string;
  metric: CharterMetric;
  metricLabel: string;
  metricSingular: string;
  goals: readonly [number, number, number];
};

export function charterMetricLabel(charter: Charter, value: number) {
  return value === 1 ? charter.metricSingular : charter.metricLabel;
}

export const CHARTERS: readonly Charter[] = [
  {
    id: "salt_guild",
    name: "The Salt Guild",
    patron: "Mistress Yun",
    icon: "🧂",
    tag: "Smuggling",
    desc: "Move raw goods through the harbor. Every raw unit shipped on a completed order counts. The opening hold is a start, not the whole contract.",
    metric: "raw_goods",
    metricLabel: "raw goods sold",
    metricSingular: "raw good sold",
    goals: [12, 24, 36],
  },
  {
    id: "silk_court",
    name: "The Silk Court",
    patron: "Lady Wei",
    icon: "👘",
    tag: "Silk",
    desc: "Dress the court. Raw Silk and Silk goods on completed orders both count.",
    metric: "silk_goods",
    metricLabel: "Silk goods sold",
    metricSingular: "Silk good sold",
    goals: [3, 6, 10],
  },
  {
    id: "kiln_consortium",
    name: "The Kiln Consortium",
    patron: "Master Gao",
    icon: "🏺",
    tag: "Kiln",
    desc: "Supply the kilns. Celadon Ware, Lacquered Jar, and Salt Glazed Bowl on completed orders count, whether fired or traded. The first act is a warm up: it grants its mark with no fee, since Porcelain Clay arrives in the middle of the voyage. The first fired sale lands a round after the clay. The final gate expects a plus one output effect, a second potter, or a ceramic good traded from another captain.",
    metric: "ceramic_goods",
    metricLabel: "ceramic goods sold",
    metricSingular: "ceramic good sold",
    goals: [0, 1, 4],
  },
  {
    id: "tidewatch",
    name: "The Tidewatch",
    patron: "Harbor Master Ren",
    icon: "🌊",
    tag: "Ocean",
    desc: "Prove the harbor can fill its largest orders. One strong round of completed orders is enough. Port Exchange sales do not count.",
    metric: "best_round",
    metricLabel: "best round order revenue",
    metricSingular: "Gold of best round order revenue",
    goals: [70, 105, 140],
  },
  {
    id: "road_wardens",
    name: "The Road Wardens",
    patron: "Captain Bai",
    icon: "🛡️",
    tag: "Road",
    desc: "Keep the manifest moving. Every completed trade order counts.",
    metric: "orders",
    metricLabel: "completed orders",
    metricSingular: "completed order",
    goals: [6, 12, 18],
  },
] as const;

export function charterById(id?: string) {
  return CHARTERS.find((charter) => charter.id === id);
}

export function charterProgress(state: GameState) {
  const charter = charterById(state.charterId);
  if (!charter) return 0;
  const sold = state.goodsSold ?? {};
  switch (charter.metric) {
    case "raw_goods":
      return Object.entries(sold).reduce(
        (sum, [item, count]) => sum + (item in COMMODITIES ? count : 0),
        0,
      );
    case "silk_goods":
      return Object.entries(sold).reduce(
        (sum, [item, count]) =>
          sum +
          (item === "Silk" || Boolean(RECIPES[item]?.materials.Silk)
            ? count
            : 0),
        0,
      );
    case "ceramic_goods":
      return Object.entries(sold).reduce(
        (sum, [item, count]) => sum + (CERAMICS.has(item) ? count : 0),
        0,
      );
    case "best_round":
      return state.bestRoundRevenue ?? 0;
    case "orders":
      return state.totalOrdersCompleted;
    default:
      return 0;
  }
}

export function charterGoalForAct(state: GameState, act: 1 | 2 | 3) {
  const charter = charterById(state.charterId);
  return charter?.goals[act - 1] ?? 0;
}

export function selectCharter(state: GameState, id: string, logs: string[]) {
  if (state.rulesVersion !== REAGENT_RULES || state.charterId) return;
  const charter = charterById(id);
  if (!charter) return;
  state.charterId = charter.id;
  logs.push(
    charter.goals[0] === 0
      ? `📜 Patron Charter: ${charter.name}. The first act is a warm up. ${charter.patron} asks for ${charter.goals[1]} ${charterMetricLabel(charter, charter.goals[1])} by the second act gate.`
      : `📜 Patron Charter: ${charter.name}. ${charter.patron} asks for ${charter.goals[0]} ${charterMetricLabel(charter, charter.goals[0])} by the first act gate.`,
  );
}

export function charterGateRound(maxRounds: number, act: 1 | 2 | 3) {
  if (act === 1) return Math.ceil(maxRounds / 3);
  if (act === 2) return Math.ceil((maxRounds * 2) / 3);
  return maxRounds;
}

export function settleCharterAct(state: GameState, logs: string[]) {
  if (state.rulesVersion !== REAGENT_RULES || !state.charterId) return;
  const act = actForRound(state.maxRounds, state.currentRound);
  if ((state.charterActsSettled ?? 0) >= act) return;
  if (state.currentRound < charterGateRound(state.maxRounds, act)) return;
  state.charterActsSettled = act;
  const charter = charterById(state.charterId);
  if (!charter) return;
  const goal = charter.goals[act - 1];
  const progress = charterProgress(state);
  if (progress >= goal) {
    state.charterMarks = (state.charterMarks ?? 0) + 1;
    if (goal === 0) {
      // The Kiln warm up. The mark is granted so the charter can still
      // complete, but a free gate should not pay Gold or add Heat.
      logs.push(
        `📜 ${charter.name} act ${act} is a warm up. The patron grants the mark and asks no fee.`,
      );
    } else {
      state.money += 15 + act * 5;
      state.score += 6;
      state.heat = Math.min(10, (state.heat ?? 0) + 1);
      logs.push(
        `📜 ${charter.name} act ${act} met: ${progress} of ${goal} ${charterMetricLabel(charter, goal)}. The patron pays ${15 + act * 5} Gold and 6 Reputation. Heat rises.`,
      );
    }
  } else {
    state.charterMisses = (state.charterMisses ?? 0) + 1;
    const lost = Math.max(0, Math.min(state.score, 4));
    state.score -= lost;
    logs.push(
      lost > 0
        ? `📜 ${charter.name} act ${act} missed: ${progress} of ${goal} ${charterMetricLabel(charter, goal)}. The patron withholds the fee. Reputation falls by ${lost}.`
        : `📜 ${charter.name} act ${act} missed: ${progress} of ${goal} ${charterMetricLabel(charter, goal)}. The patron withholds the fee. There is no Reputation left to take.`,
    );
  }
  if (act === 3 && (state.charterMarks ?? 0) >= 3 && !state.charterComplete) {
    state.charterComplete = true;
    state.money += 40;
    state.score += 60;
    logs.push(
      `📜 ${charter.name} is complete. The patron adds 40 Gold and 60 Reputation.`,
    );
  }
}

export function heatRisk(state: GameState) {
  return (state.heat ?? 0) * 0.01;
}

export function bribeHeat(state: GameState, logs: string[], reserved = 0) {
  if (![4, "module_draft", "module_swap"].includes(state.phase)) return;
  if (state.currentRound >= state.maxRounds) {
    logs.push(
      "No later raid can be helped. Bribes are closed for the final round.",
    );
    return;
  }
  if ((state.heat ?? 0) <= 0) {
    logs.push("No Heat to settle.");
    return;
  }
  const cost = 10;
  const available = state.money - Math.max(0, reserved);
  if (available < cost) {
    logs.push(
      state.money >= cost
        ? `Need ${cost} Gold beyond the Income Tax reserve to settle one point of Heat.`
        : `Need ${cost} Gold to settle one point of Heat.`,
    );
    return;
  }
  state.money -= cost;
  state.heat = Math.max(0, (state.heat ?? 0) - 1);
  logs.push(`The harbormaster looks away. Heat falls to ${state.heat}.`);
}

// A light weight table for the persistent draft. It favors pieces the
// captain can already use, then falls back to a flat draw.
function favorWeight(state: GameState, boon: Boon): number {
  const hasArtisan = Object.values(state.workers).some(
    (crew) => crew.length > 0,
  );
  const weights: Record<string, number> = {
    silk_wind: (state.inventory.Silk ?? 0) > 2 ? 2.4 : 1,
    favorable_tides: 1.4,
    merchant_charm: state.money > 40 ? 2 : 1.2,
    artisan_inspiration: hasArtisan ? 2.2 : 0.8,
    tax_shelter: state.money > 80 ? 1.2 : 0.9,
    hemp_monopoly: 1.2,
    master_apprentice: 1,
    farsight: 1.1,
    kiln_and_forge_guild:
      (state.inventory["Celadon Ware"] ?? 0) > 0 ||
      (state.inventory["Copper Ore"] ?? 0) > 0
        ? 2
        : 1,
    frontier_tariff_relief: 1.1,
    exotic_treasures:
      (state.inventory["Foreign Balm"] ?? 0) > 0 ||
      (state.inventory["Pearl String"] ?? 0) > 0
        ? 2
        : 1,
    deep_sea_escort_pact: state.money > 60 ? 1.6 : 1,
    merchants_converge: 1.2,
    buyers_festival: (state.inventory.Silk ?? 0) >= 2 ? 2 : 1,
    resourceful_crew: hasArtisan ? 2.3 : 1,
    market_momentum: 1.1,
    safe_anchorage: 1.4,
    reliable_buyer: 1.2,
    bamboo_fair: 1,
    ceramic_commission: 1,
    coastal_forecast: 1.1,
    guild_turnover: hasArtisan ? 1.7 : 1,
    deep_market: 1.1,
    rare_cargo_charter: 1.1,
    false_colors: 0.8,
  };
  return weights[boon.id] ?? 1;
}

// The draft still needs to offer duplicates often enough that Attunement is
// a plan, not a lottery. Owned Favors below rank 3 draw with extra weight.
// A Favor earns a reason to take a duplicate only when it has a written rank
// payoff or can bond into an Engine. The rest still attune from settlement
// marks, but a duplicate would spend a draft pick for no new rule.
function favorHasRankPayoff(id: string) {
  return (
    Boolean(FAVOR_RANK_TEXT[id]) ||
    ENGINE_RECIPES.some((recipe) => recipe.favorId === id)
  );
}

export function favorDraftWeight(state: GameState, boon: Boon) {
  const base = favorWeight(state, boon);
  const owned = (state.favors ?? []).includes(boon.id);
  return owned && favorRankFor(state, boon.id) < 3 ? base * 2.4 : base;
}

// Hiring and assignments are closed in the final round, so Favors that need
// either action have nothing to act on.
const FINAL_ROUND_DEAD_FAVORS = new Set([
  "artisan_inspiration",
  "master_apprentice",
  "guild_turnover",
  "resourceful_crew",
]);

export function favorDraftPool(state: GameState, pool: Boon[]) {
  return pool.filter((boon) => {
    if (boon.id === "emergency_loan") return false;
    if ("instant_gold" in boon.modifiers) return false;
    if (
      state.currentRound >= state.maxRounds &&
      FINAL_ROUND_DEAD_FAVORS.has(boon.id)
    )
      return false;
    if (engineUsesFavor(state, boon.id)) return false;
    if (!(state.favors ?? []).includes(boon.id)) return true;
    return favorHasRankPayoff(boon.id) && favorRankFor(state, boon.id) < 3;
  });
}

export function fuseEngine(
  state: GameState,
  recipeId: string,
  logs: string[],
  reserved = 0,
) {
  if (
    state.rulesVersion !== REAGENT_RULES ||
    ![4, "module_draft", "module_swap"].includes(state.phase)
  )
    return;
  if (state.currentRound >= state.maxRounds) {
    logs.push("The Bond Table is closed for the final round.");
    return;
  }
  const recipe = engineRecipe(recipeId);
  if (!recipe) return;
  if ((state.engines?.length ?? 0) >= engineSlots(state)) {
    logs.push("The Bond Table is full for this act.");
    return;
  }
  const favorIndex = (state.favors ?? []).indexOf(recipe.favorId);
  const moduleIndex = state.equippedModules.findIndex(
    (module) => module.id === recipe.moduleId,
  );
  if (favorIndex < 0 || moduleIndex < 0) {
    logs.push("Both pieces must be owned before they can be bonded.");
    return;
  }
  const rank = favorRankFor(state, recipe.favorId);
  if (rank < 2) {
    logs.push("Attune this Favor to rank 2 before bonding it.");
    return;
  }
  if ((state.engines ?? []).some((engine) => engine.id === recipe.id)) return;
  const fee = 12;
  const available = state.money - Math.max(0, reserved);
  if (available < fee) {
    logs.push(
      state.money >= fee
        ? `Need ${fee} Gold beyond the Income Tax reserve for the Bond Table fee.`
        : `Need ${fee} Gold for the Bond Table fee.`,
    );
    return;
  }
  state.money -= fee;
  state.favors = (state.favors ?? []).filter((id) => id !== recipe.favorId);
  state.equippedModules = state.equippedModules.filter(
    (module) => module.id !== recipe.moduleId,
  );
  // The rank is held by the Engine now. The consumed Favor would start at
  // rank 1 if it ever returned to the Rack.
  delete state.favorMarks?.[recipe.favorId];
  const engine: EngineState = {
    id: recipe.id,
    favorId: recipe.favorId,
    moduleId: recipe.moduleId,
    rank,
    fusedRound: state.currentRound,
  };
  state.engines = [...(state.engines ?? []), engine];
  state.heat = Math.min(10, (state.heat ?? 0) + 1);
  refreshFavorModifiers(state);
  logs.push(
    `⚙️ ${recipe.name} is bonded. ${recipe.desc} Upkeep is ${engineUpkeepFor(engine)} Gold each round. Heat rises.`,
  );
}

export function settleEngines(state: GameState, logs: string[]) {
  if (state.rulesVersion !== REAGENT_RULES) return;
  // The engine worked all round. Capture which rules were active before any
  // unpaid upkeep puts an engine to rest, so its settlement effect still
  // applies for the round that just ended.
  const activeAtSettlement = new Set(
    (state.engines ?? [])
      .filter((engine) => engineIsActive(state, engine))
      .map((engine) => engine.id),
  );
  for (const engine of state.engines ?? []) {
    if (!engineIsActive(state, engine)) continue;
    const upkeep = engineUpkeepFor(engine);
    if (state.money >= upkeep) {
      state.money -= upkeep;
      state.roundCosts += upkeep;
      state.totalCosts += upkeep;
      state.engineUpkeepCosts = (state.engineUpkeepCosts ?? 0) + upkeep;
      logs.push(`⚙️ ${engineName(engine.id)} upkeep: ${upkeep} Gold.`);
    } else {
      // The unpaid settlement is followed by one full dormant round and two
      // Heat, so skipping upkeep is a real cost rather than a cheap way to
      // run the Engine every other round. In the last two rounds the rest
      // would reach past the voyage close, so the unpaid fee costs Reputation
      // instead.
      engine.dormantUntilRound = state.currentRound + 2;
      state.heat = Math.min(10, (state.heat ?? 0) + 2);
      // A rest that reaches past the final round cannot be made good later.
      // The penultimate round is the last chance to charge the fee, so an
      // unpaid Engine there costs Reputation just as it does at the close.
      if (state.currentRound + 1 >= state.maxRounds) {
        const lost = Math.max(0, Math.min(state.score, upkeep));
        state.score -= lost;
        const when =
          state.currentRound >= state.maxRounds
            ? "at the voyage close"
            : "with one round left, too late for the Engine to return";
        logs.push(
          lost > 0
            ? `⚙️ ${engineName(engine.id)} upkeep goes unpaid ${when}. Reputation falls by ${lost}.`
            : `⚙️ ${engineName(engine.id)} upkeep goes unpaid ${when}. There is no Reputation left to take.`,
        );
      } else {
        logs.push(
          `⚙️ ${engineName(engine.id)} falls dormant. Its rule rests next round and Heat rises by 2.`,
        );
      }
    }
  }
  const reel = (state.engines ?? []).find(
    (engine) =>
      engine.id === "silk_reel" &&
      activeAtSettlement.has(engine.id) &&
      (engine.fusedRound ?? 0) < state.currentRound,
  );
  if (reel) {
    const silk = state.silkShippedThisRound ?? 0;
    const brocade = Math.min(2, Math.floor(silk / 3));
    if (brocade > 0) {
      state.inventory.Brocade = (state.inventory.Brocade ?? 0) + brocade;
      logs.push(
        `🧵 The Silk Reel turns ${silk} raw Silk into ${brocade} Brocade.`,
      );
    }
  }
  settleShadow(state, logs);
  state.silkShippedThisRound = 0;
}

function settleShadow(state: GameState, logs: string[]) {
  const owed = state.shadowGold ?? 0;
  if (owed <= 0) return;
  const paid = Math.min(owed, state.money);
  state.money -= paid;
  // The purchase already carried the full cost when it was made. Paying the
  // deferred balance now moves cash and clears the liability, not the expense.
  if (paid < owed) {
    state.heat = Math.min(10, (state.heat ?? 0) + 1);
    logs.push(
      `🕯️ The False Manifest came due for ${owed} Gold. Only ${paid} Gold was on hand. The rest stays on the books and Heat rises.`,
    );
    if (state.currentRound >= state.maxRounds) {
      // No later audit can collect the balance, so the counting house writes
      // the shortfall against the captain's name instead.
      const lost = Math.max(0, Math.min(state.score, owed - paid));
      state.score -= lost;
      logs.push(
        lost > 0
          ? `🕯️ The unpaid balance costs ${lost} Reputation at the voyage close.`
          : "🕯️ The unpaid balance is noted at the voyage close. There is no Reputation left to take.",
      );
    }
  } else {
    logs.push(`🕯️ The False Manifest settled ${paid} Gold.`);
  }
  // Deferral is a timing tool, not a discount. An unpaid balance stays owed
  // and is collected before new purchases can defer again.
  state.shadowGold = owed - paid;
  if (
    hasEngine(state, "false_manifest") &&
    voyageRandom(state, "shadowAudit")() < 0.15
  ) {
    const fine = Math.min(20, Math.max(0, state.money));
    state.money -= fine;
    logs.push(`🚨 A shadow audit takes ${fine} Gold.`);
  }
}

export function settleFavorMarks(state: GameState) {
  if (state.rulesVersion !== REAGENT_RULES) return;
  for (const id of state.favors ?? []) addAttunement(state, id, 1);
}

export function addAttunement(state: GameState, id: string, amount: number) {
  state.favorMarks = state.favorMarks ?? {};
  state.favorMarks[id] = Math.min(6, (state.favorMarks[id] ?? 0) + amount);
}

// A saved voyage can outlive a catalog change or arrive from a tampered save.
// Repair the Rack before any rule reads it, so an unknown Charter cannot
// silently skip act gates and an unknown Engine cannot hold a slot.
export function repairSavedRack(state: GameState) {
  if (
    state.charterId &&
    !CHARTERS.some((charter) => charter.id === state.charterId)
  )
    state.charterId = undefined;
  const known = new Set(BOONS.map((boon) => boon.id));
  state.favors = Array.from(
    new Set((state.favors ?? []).filter((id) => known.has(id))),
  );
  const marks: Record<string, number> = {};
  for (const [id, value] of Object.entries(state.favorMarks ?? {})) {
    if (!known.has(id) || !Number.isFinite(value)) continue;
    marks[id] = Math.max(0, Math.min(6, Math.floor(value)));
  }
  state.favorMarks = marks;
  const seen = new Set<string>();
  state.engines = (state.engines ?? []).flatMap((engine) => {
    const recipe = ENGINE_RECIPES.find(({ id }) => id === engine?.id);
    if (!recipe || seen.has(recipe.id)) return [];
    seen.add(recipe.id);
    return [
      {
        ...engine,
        id: recipe.id,
        favorId: recipe.favorId,
        moduleId: recipe.moduleId,
        rank: engine.rank >= 3 ? 3 : 2,
        fusedRound: Number.isFinite(engine.fusedRound)
          ? engine.fusedRound
          : state.currentRound,
        dormantUntilRound: Number.isFinite(engine.dormantUntilRound)
          ? engine.dormantUntilRound
          : undefined,
      },
    ];
  });
  // An Engine holds both of its source pieces. Drop a stale copy from an
  // older save so the printed Favor and module rules cannot stack on top of
  // the Engine.
  const heldFavors = new Set(
    (state.engines ?? []).map((engine) => engine.favorId),
  );
  state.favors = state.favors.filter((id) => !heldFavors.has(id));
  for (const id of heldFavors) delete marks[id];
  state.favorMarks = marks;
  const heldModules = new Set(
    (state.engines ?? []).map((engine) => engine.moduleId),
  );
  state.equippedModules = (state.equippedModules ?? []).filter(
    (module) => !heldModules.has(module?.id),
  );
}

export function heatLabel(heat = 0) {
  if (heat <= 0) return "Clear";
  if (heat <= 2) return "Watched";
  if (heat <= 5) return "Marked";
  if (heat <= 8) return "Hunted";
  return "Admiral's List";
}

export function engineName(id: string) {
  return (
    ENGINE_RECIPES.find((recipe) => recipe.id === id)?.name ??
    id.replace(/_/g, " ")
  );
}
