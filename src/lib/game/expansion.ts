import type { Boon } from "./constants";
import { difficultyConfig, normalizeDifficulty } from "./difficulty";
import type { Difficulty } from "./difficulty";

import {
  EXPANDED_RULES,
  REBALANCED_RULES,
  OPEN_HARBOR_RULES,
  CLASSIC_HARBOR_RULES,
  revisedHarbor,
} from "./rules-version";
export {
  CLASSIC_RULES,
  EXPANDED_RULES,
  REBALANCED_RULES,
  OPEN_HARBOR_RULES,
  CLASSIC_HARBOR_RULES,
  REVISED_HARBOR_RULES,
  PRE_TUNING_HARBOR_RULES,
  TUNED_HARBOR_RULES,
  REAGENT_RULES,
  CURRENT_HARBOR_RULES,
  revisedHarbor,
  tunedHarbor,
  reagentRules,
} from "./rules-version";

export function openHarbor(state: { rulesVersion?: number }) {
  return state.rulesVersion === OPEN_HARBOR_RULES;
}

export function classicHarbor(state: { rulesVersion?: number }) {
  return (
    state.rulesVersion === CLASSIC_HARBOR_RULES ||
    revisedHarbor(state.rulesVersion)
  );
}

export function harborTrading(state: { rulesVersion?: number }) {
  return openHarbor(state) || classicHarbor(state);
}

export function harborArrival(state: {
  arrivals?: string[];
  currentRound: number;
}) {
  return state.arrivals?.[state.currentRound - 1] ?? "Quanzhou Port";
}

export const SPECIALTIES = {
  bamboo: { name: "Bamboo Weaving", goods: ["Bamboo", "Bamboo Mat"] },
  wax: {
    name: "Wax Workshop",
    goods: ["Beeswax", "Waxed Canvas", "Scented Candle"],
  },
  iron: { name: "Iron Foundry", goods: ["Iron Sand", "Inlaid Kettle"] },
  lacquer: {
    name: "Lacquer Guild",
    goods: ["Iron Sand", "River Lacquer", "Lacquered Jar", "Lacquered Mirror"],
  },
  incense: {
    name: "Incense Route",
    goods: ["Beeswax", "Frankincense", "Incense Oil"],
  },
  lapis: {
    name: "Lapis Route",
    goods: ["Lapis Lazuli", "Lapis Pendant", "Pearl and Lapis Strand"],
  },
} as const;
export type Specialty = keyof typeof SPECIALTIES;

export function specialtyChoices(
  difficulty: unknown,
): readonly (readonly Specialty[])[] {
  const waters = normalizeDifficulty(difficulty);
  const groups: Specialty[][] = [["bamboo", "wax"]];
  if (waters !== "fair_winds") groups.push(["iron", "lacquer"]);
  if (waters === "monsoon") groups.push(["incense", "lapis"]);
  return groups;
}

export function voyageSpecialties(
  difficulty: unknown,
  choices?: unknown,
): Specialty[] {
  return specialtyChoices(difficulty).map(
    (group, index) =>
      group.find((key) => Array.isArray(choices) && choices[index] === key) ??
      group[0],
  );
}

export function specialtyOpens(difficulty: unknown, index: number) {
  return index === 0
    ? 4
    : normalizeDifficulty(difficulty) === "open_waters"
      ? 5
      : index === 1
        ? 7
        : 11;
}

export function specialtyGoods(
  difficulty: unknown,
  round: number,
  choices?: readonly Specialty[],
) {
  return new Set<string>(
    voyageSpecialties(difficulty, choices).flatMap((key, index) =>
      round >= specialtyOpens(difficulty, index)
        ? [...SPECIALTIES[key].goods]
        : [],
    ),
  );
}

export const REBALANCE = {
  bambooUnit: 3,
  bambooCap: 15,
  reliableBuyer: 12,
  safeAnchorage: 25,
  anchorageEscort: 5,
  ceramicRate: 0.2,
  ceramicCap: 30,
  guildUses: 2,
  deepUnit: 3,
  deepCap: 24,
  rareRate: 0.2,
  rareCap: 35,
  cargoNet: 3,
  wageLedger: 6,
  scalesUnit: 2,
  scalesCap: 12,
  warehouse: 25,
  convoyFreight: 4,
  convoyReward: 6,
  shrouds: 0.2,
  oceanRate: 0.15,
  oceanCap: 20,
  lantern: 8,
  overdriveUpkeep: 4,
  marketDay: 0.15,
  heavySeas: 0.06,
  clearanceRate: 0.7,
} as const;

export function rebalanced(state: { rulesVersion?: number }) {
  return state.rulesVersion === REBALANCED_RULES || harborTrading(state);
}

export const NEW_MATERIALS = {
  Bamboo: {
    tier: 0,
    round: 3,
    range: [3, 6],
    ports: ["Ningbo Port", "Hangzhou Port"],
    weight: 13,
    icon: "🎋",
    color: "#64804B",
  },
  Beeswax: {
    tier: 0,
    round: 5,
    range: [5, 8],
    ports: ["Yangzhou Port", "Quanzhou Port"],
    weight: 12,
    icon: "🍯",
    color: "#A97531",
  },
  "Iron Sand": {
    tier: 1,
    round: 0,
    range: [8, 12],
    ports: ["Goryeo Port", "Ningbo Port"],
    weight: 10,
    icon: "⚒️",
    color: "#606A79",
  },
  "River Lacquer": {
    tier: 1,
    round: 1,
    range: [10, 14],
    ports: ["Fuzhou Port", "Hangzhou Port"],
    weight: 10,
    icon: "🏺",
    color: "#9B5140",
  },
  Frankincense: {
    tier: 2,
    round: 0,
    range: [13, 18],
    ports: ["Dashi Port", "Srivijaya Port"],
    weight: 8,
    icon: "🌿",
    color: "#94754E",
  },
  "Lapis Lazuli": {
    tier: 2,
    round: 1,
    range: [16, 22],
    ports: ["Dashi Port", "Guangzhou Port"],
    weight: 7,
    icon: "💠",
    color: "#4267BB",
  },
} as const;

export const NEW_PRODUCTS = {
  "Bamboo Mat": {
    materials: { Bamboo: 2, Hemp: 1 },
    worker_type: "weaver",
    price: [27, 34],
    icon: "🧺",
    color: "#64804B",
  },
  "Waxed Canvas": {
    materials: { Hemp: 2, Beeswax: 1 },
    worker_type: "weaver",
    price: [31, 42],
    icon: "🪡",
    color: "#9A6A43",
  },
  "Scented Candle": {
    materials: { Beeswax: 1, Tea: 1 },
    worker_type: "sachet_maker",
    price: [46, 60],
    icon: "🕯️",
    color: "#B47E2C",
  },
  "Inlaid Kettle": {
    materials: { "Iron Sand": 2, "Copper Ore": 1 },
    worker_type: "coppersmith",
    price: [58, 73],
    icon: "🫖",
    color: "#536F7C",
  },
  "Lacquered Jar": {
    materials: { "Porcelain Clay": 2, "River Lacquer": 1 },
    worker_type: "potter",
    price: [61, 77],
    icon: "🏺",
    color: "#AE5747",
  },
  "Lacquered Mirror": {
    materials: { "Copper Ore": 1, "Iron Sand": 1, "River Lacquer": 1 },
    worker_type: "coppersmith",
    price: [62, 80],
    icon: "🪞",
    color: "#7F625E",
  },
  "Incense Oil": {
    materials: { Frankincense: 2, Beeswax: 1 },
    worker_type: "perfumer",
    price: [70, 88],
    icon: "🧴",
    color: "#977040",
  },
  "Lapis Pendant": {
    materials: { "Lapis Lazuli": 2, "Copper Ore": 1 },
    worker_type: "jeweler",
    price: [85, 108],
    icon: "💎",
    color: "#4267BB",
  },
  "Pearl and Lapis Strand": {
    materials: { Pearls: 1, "Lapis Lazuli": 1, Silk: 1 },
    worker_type: "jeweler",
    price: [85, 110],
    icon: "📿",
    color: "#697AB9",
  },
} as const;

export const EFFECT = {
  bambooFair: 3,
  reliableBuyer: 4,
  safeAnchorage: 8,
  ceramicCommission: 8,
  deepMarket: 2,
  rareCargoCharter: 10,
  cargoNet: 4,
  wageLedger: 4,
  merchantScales: 3,
  bondedWarehouse: 5,
  convoyPennant: 6,
  extraUpkeep: 2,
  stormShrouds: 0.1,
  oceanExchangeLedger: 8,
  stormLantern: 3,
  heavySeas: 0.04,
  marketDay: 0.08,
} as const;

export const NEW_BOONS: ReadonlyArray<Boon & { tier: number }> = [
  {
    id: "bamboo_fair",
    name: "Bamboo Fair",
    icon: "🎋",
    desc: `Save up to ${EFFECT.bambooFair} Gold on the first Bamboo lot bought this round.`,
    modifiers: { bamboo_fair: 1 },
    tier: 0,
  },
  {
    id: "reliable_buyer",
    name: "Reliable Buyer",
    icon: "🤝",
    desc: `Your staple contract pays ${EFFECT.reliableBuyer} extra Gold this round.`,
    modifiers: { reliable_buyer: 1 },
    tier: 0,
  },
  {
    id: "safe_anchorage",
    name: "Safe Anchorage",
    icon: "⚓",
    desc: `Protect up to ${EFFECT.safeAnchorage} extra Gold from a raid when sailing without an escort.`,
    modifiers: { safe_anchorage: 1 },
    tier: 0,
  },
  {
    id: "ceramic_commission",
    name: "Ceramic Commission",
    icon: "🏺",
    desc: `Earn ${EFFECT.ceramicCommission} extra Gold on the first ordinary order containing Celadon Ware or Lacquered Jar.`,
    modifiers: { ceramic_commission: 1 },
    tier: 1,
  },
  {
    id: "coastal_forecast",
    name: "Coastal Forecast",
    icon: "🗺️",
    desc: "See one ordinary order's exact cargo and destination before buying this round.",
    modifiers: { coastal_forecast: 1 },
    tier: 1,
  },
  {
    id: "guild_turnover",
    name: "Guild Turnover",
    icon: "⚒️",
    desc: "The first charter recipe you assign this round uses one fewer unit of its most expensive raw material. At least one total input is still required.",
    modifiers: { guild_turnover: 1 },
    tier: 1,
  },
  {
    id: "deep_market",
    name: "Deep Market",
    icon: "🌊",
    desc: `Save up to ${EFFECT.deepMarket} Gold on each of the first two lots you buy containing Frankincense or Lapis Lazuli.`,
    modifiers: { deep_market: 1 },
    tier: 2,
  },
  {
    id: "rare_cargo_charter",
    name: "Rare Cargo Charter",
    icon: "📜",
    desc: `Earn ${EFFECT.rareCargoCharter} extra Gold on the first ordinary order containing at least two Frankincense or two Lapis Lazuli.`,
    modifiers: { rare_cargo_charter: 1 },
    tier: 2,
  },
  {
    id: "false_colors",
    name: "False Colors",
    icon: "🚩",
    desc: "Cancel the added raid chance from a Broker leak this round.",
    modifiers: { false_colors: 1 },
    tier: 2,
  },
];

export const NEW_MODULES = [
  {
    id: "cargo_net",
    name: "Cargo Net",
    icon: "🪢",
    desc: `Save up to ${EFFECT.cargoNet} Gold in freight on the first ordinary order with two distinct raw goods each round.`,
    tier: 0,
  },
  {
    id: "wage_ledger",
    name: "Wage Ledger",
    icon: "📒",
    desc: `Save up to ${EFFECT.wageLedger} Gold in wages when artisans finish two different recipes in the same round.`,
    tier: 0,
  },
  {
    id: "signal_lantern",
    name: "Signal Lantern",
    icon: "🏮",
    desc: "See next round's featured demand during Artisan Management.",
    tier: 0,
  },
  {
    id: "merchant_scales",
    name: "Merchant Scales",
    icon: "⚖️",
    desc: `Save up to ${EFFECT.merchantScales} Gold on the first lot you buy containing a specialty of that port each round.`,
    tier: 1,
  },
  {
    id: "bonded_warehouse",
    name: "Bonded Warehouse",
    icon: "🔐",
    desc: `Protect up to ${EFFECT.bondedWarehouse} extra Gold when sailing without an escort.`,
    tier: 1,
  },
  {
    id: "convoy_pennant",
    name: "Convoy Pennant",
    icon: "🚩",
    desc: `During a forecast event, save up to ${EFFECT.convoyPennant} Gold in freight on the first ordinary order. Maintenance costs ${EFFECT.extraUpkeep} Gold more each round.`,
    tier: 1,
  },
  {
    id: "storm_shrouds",
    name: "Storm Shrouds",
    icon: "🪢",
    desc: `Reduce direct raid loss severity by ten percentage points. Maintenance costs ${EFFECT.extraUpkeep} Gold more each round.`,
    tier: 2,
  },
  {
    id: "ocean_exchange_ledger",
    name: "Ocean Exchange Ledger",
    icon: "📘",
    desc: `Earn ${EFFECT.oceanExchangeLedger} extra Gold on the first ordinary order with Frankincense or Lapis Lazuli each round.`,
    tier: 2,
  },
  {
    id: "storm_lantern",
    name: "Storm Lantern",
    icon: "💡",
    desc: `Save up to ${EFFECT.stormLantern} Gold on the round's escort.`,
    tier: 2,
  },
] as const;

export type HarborForecast = {
  round: number;
  kind:
    "market" | "guild" | "seas" | "fleet" | "shortfall" | "festival" | "rival";
  item?: string;
};
export type VoyageRules = {
  version: number;
  forecasts: HarborForecast[];
  specialties?: Specialty[];
  arrivals?: string[];
};

export const FORECAST_WINDOWS: Record<Difficulty, readonly number[]> = {
  fair_winds: [3, 6],
  open_waters: [3, 6, 9, 11],
  monsoon: [3, 5, 8, 10, 13, 15],
};

export const RAID_TERMS: Record<
  Difficulty,
  { reserveRate: number; lossRate: number }
> = {
  fair_winds: { reserveRate: 1, lossRate: 0.45 },
  open_waters: { reserveRate: 0.5, lossRate: 0.55 },
  monsoon: { reserveRate: 0, lossRate: 0.65 },
};

export function expanded(state: { rulesVersion?: number }): boolean {
  return state.rulesVersion === EXPANDED_RULES || rebalanced(state);
}

export function forecastFor(
  state: {
    rulesVersion?: number;
    forecasts?: HarborForecast[];
    currentRound: number;
  },
  round = state.currentRound,
) {
  return expanded(state)
    ? state.forecasts?.find((entry) => entry.round === round)
    : undefined;
}

export function effectUses(
  state: { effectUses?: Record<string, number> },
  key: string,
) {
  return state.effectUses?.[key] ?? 0;
}

export function spendEffect(
  state: { effectUses?: Record<string, number> },
  key: string,
  amount = 1,
) {
  state.effectUses ??= {};
  state.effectUses[key] = effectUses(state, key) + amount;
}

export function isOceanMaterial(item: string) {
  return item === "Frankincense" || item === "Lapis Lazuli";
}

export function voyageMaintenance(difficulty: unknown, rulesVersion?: number) {
  const cfg = difficultyConfig(difficulty);
  const adjustment =
    rulesVersion === REBALANCED_RULES
      ? { fair_winds: 0, open_waters: 2, monsoon: 7 }[cfg.key]
      : 0;
  return (
    cfg.maintenance +
    (rulesVersion === OPEN_HARBOR_RULES
      ? { fair_winds: -2, open_waters: -2, monsoon: -2 }[cfg.key]
      : adjustment)
  );
}

export function voyageBaseWage(wage: number, rulesVersion?: number) {
  return rulesVersion === OPEN_HARBOR_RULES
    ? Math.max(3, Math.floor(wage * 0.85))
    : wage;
}

export function voyageRaidAdjustment(
  rulesVersion: number | undefined,
  difficulty: Difficulty,
) {
  return rulesVersion === OPEN_HARBOR_RULES && difficulty === "fair_winds"
    ? -0.04
    : 0;
}

export function voyageStartingGold(difficulty: unknown, rulesVersion?: number) {
  const cfg = difficultyConfig(difficulty);
  return rulesVersion === OPEN_HARBOR_RULES
    ? { fair_winds: 110, open_waters: 105, monsoon: 100 }[cfg.key]
    : cfg.startingGold;
}

export function raidTerms(
  difficulty: Difficulty,
  state: { rulesVersion?: number },
) {
  const terms = RAID_TERMS[difficulty];
  if (classicHarbor(state))
    return {
      reserveRate: 1,
      lossRate: { fair_winds: 0.35, open_waters: 0.43, monsoon: 0.55 }[
        difficulty
      ],
    };
  if (openHarbor(state))
    return {
      reserveRate: { fair_winds: 1, open_waters: 0.75, monsoon: 0.7 }[
        difficulty
      ],
      lossRate: { fair_winds: 0.3, open_waters: 0.42, monsoon: 0.52 }[
        difficulty
      ],
    };
  return rebalanced(state) && difficulty === "monsoon"
    ? { ...terms, reserveRate: 0.35 }
    : terms;
}
