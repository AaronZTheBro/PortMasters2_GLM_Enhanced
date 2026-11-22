// Canonical game content and balance values.

import { difficultyConfig } from "./difficulty";
import {
  NEW_BOONS,
  NEW_MATERIALS,
  NEW_MODULES,
  NEW_PRODUCTS,
} from "./expansion";

const newGoods = { ...NEW_MATERIALS, ...NEW_PRODUCTS };
const addedIcons = Object.fromEntries(
  Object.entries(newGoods).map(([item, data]) => [item, data.icon]),
);
const addedColors = Object.fromEntries(
  Object.entries(newGoods).map(([item, data]) => [item, data.color]),
);

// Shared display name for interface copy and metadata.
export const APP_NAME = "PortMasters 2";

export const ICONS: Record<string, string> = {
  ...addedIcons,
  Gold: "💰",
  Hemp: "🧶",
  Silk: "👘",
  Tea: "🍵",
  "Linen Clothes": "👔",
  "Cotton Clothes": "👕",
  Brocade: "👗",
  Sachet: "🌸",
  "Porcelain Clay": "🧱",
  "Copper Ore": "⛏️",
  "Celadon Ware": "🫖",
  "Bronze Mirror": "🪞",
  Spices: "🌶️",
  Pearls: "🦪",
  "Foreign Balm": "🧴",
  "Pearl String": "📿",
};

export const COLORS: Record<string, string> = {
  ...addedColors,
  Gold: "#D4A017",
  Hemp: "#8B7355",
  Silk: "#DC143C",
  Tea: "#228B22",
  "Linen Clothes": "#D2691E",
  "Cotton Clothes": "#4169E1",
  Brocade: "#8B008B",
  Sachet: "#FF1493",
  "Porcelain Clay": "#8FA5B6",
  "Copper Ore": "#B87333",
  "Celadon Ware": "#6FA292",
  "Bronze Mirror": "#8C7853",
  Spices: "#C1440E",
  Pearls: "#9AA7B1",
  "Foreign Balm": "#C99B6E",
  "Pearl String": "#B9A0E0",
};

// Alternative colors separate goods by hue, lightness, and saturation.
export const COLORS_COLORBLIND_SAFE: Record<string, string> = {
  ...addedColors,
  Gold: "#E8A33D",
  Hemp: "#A67C52",
  Silk: "#CC79A7",
  Tea: "#009E73",
  "Linen Clothes": "#0072B2",
  "Cotton Clothes": "#56B4E9",
  Brocade: "#D55E00",
  Sachet: "#F0E442",
  "Porcelain Clay": "#7A93A6",
  "Copper Ore": "#B5651D",
  "Celadon Ware": "#4FA98C",
  "Bronze Mirror": "#7D6852",
  Spices: "#B33F1E",
  Pearls: "#A8B4BD",
  "Foreign Balm": "#C99B6E",
  "Pearl String": "#7B6FA6",
};

// Charters unlock higher content tiers during a voyage.
export const RESOURCES_TIER0 = ["Hemp", "Silk", "Tea"] as const;
export const RESOURCES_TIER1 = ["Porcelain Clay", "Copper Ore"] as const;
export const RESOURCES_TIER2 = ["Spices", "Pearls"] as const;
export const RESOURCES = [
  ...RESOURCES_TIER0,
  ...RESOURCES_TIER1,
  ...RESOURCES_TIER2,
  ...(Object.keys(NEW_MATERIALS) as Array<keyof typeof NEW_MATERIALS>),
] as const;

export const PRODUCTS_TIER0 = [
  "Linen Clothes",
  "Cotton Clothes",
  "Brocade",
  "Sachet",
] as const;
export const PRODUCTS_TIER1 = ["Bronze Mirror", "Celadon Ware"] as const;
export const PRODUCTS_TIER2 = ["Foreign Balm", "Pearl String"] as const;
export const PRODUCTS = [
  ...PRODUCTS_TIER0,
  ...PRODUCTS_TIER1,
  ...PRODUCTS_TIER2,
  ...(Object.keys(NEW_PRODUCTS) as Array<keyof typeof NEW_PRODUCTS>),
] as const;
// The cargo hold includes every catalogued good from voyage creation.
export const ITEMS = [...RESOURCES, ...PRODUCTS] as const;

// Goods omitted here begin at zero.
export const STARTING_STOCK: Record<string, number> = {
  Hemp: 8,
  Silk: 5,
  Tea: 3,
};

// Barter accepts Gold and every tradable good.
export const BARTER_ITEMS = ["Gold", ...RESOURCES, ...PRODUCTS] as const;
export const PORTS_TIER0 = [
  "Quanzhou Port",
  "Guangzhou Port",
  "Ningbo Port",
  "Yangzhou Port",
  "Hangzhou Port",
] as const;
export const PORTS_TIER1 = ["Fuzhou Port", "Goryeo Port"] as const;
export const PORTS_TIER2 = ["Srivijaya Port", "Dashi Port"] as const;

export const RECIPES: Record<
  string,
  { materials: Record<string, number>; worker_type: string }
> = {
  ...Object.fromEntries(
    Object.entries(NEW_PRODUCTS).map(([name, recipe]) => [
      name,
      { materials: recipe.materials, worker_type: recipe.worker_type },
    ]),
  ),
  "Linen Clothes": { materials: { Hemp: 2 }, worker_type: "weaver" },
  "Cotton Clothes": {
    materials: { Hemp: 2, Silk: 1 },
    worker_type: "weaver",
  },
  Brocade: { materials: { Silk: 3 }, worker_type: "master" },
  Sachet: {
    materials: { Silk: 1, Tea: 2 },
    worker_type: "sachet_maker",
  },
  "Bronze Mirror": {
    materials: { "Copper Ore": 3 },
    worker_type: "coppersmith",
  },
  "Celadon Ware": {
    materials: { "Porcelain Clay": 3 },
    worker_type: "potter",
  },
  "Foreign Balm": {
    materials: { Spices: 2, Silk: 1 },
    worker_type: "perfumer",
  },
  "Pearl String": {
    materials: { Pearls: 2, Silk: 1 },
    worker_type: "jeweler",
  },
};

export const COMMODITIES: Record<
  string,
  { ports: string[]; basePrice: [number, number] }
> = {
  ...Object.fromEntries(
    Object.entries(NEW_MATERIALS).map(([name, good]) => [
      name,
      { ports: [...good.ports], basePrice: [...good.range] },
    ]),
  ),
  Hemp: { ports: ["Quanzhou Port", "Ningbo Port"], basePrice: [3, 6] },
  Silk: { ports: ["Hangzhou Port", "Yangzhou Port"], basePrice: [6, 10] },
  Tea: { ports: ["Guangzhou Port", "Quanzhou Port"], basePrice: [10, 14] },
  "Porcelain Clay": {
    ports: ["Quanzhou Port", "Fuzhou Port"],
    basePrice: [8, 12],
  },
  "Copper Ore": {
    ports: ["Guangzhou Port", "Goryeo Port"],
    basePrice: [10, 15],
  },
  Spices: { ports: ["Srivijaya Port", "Dashi Port"], basePrice: [14, 20] },
  Pearls: {
    ports: ["Guangzhou Port", "Srivijaya Port"],
    basePrice: [16, 24],
  },
};

export const PRODUCT_PRICES: Record<string, [number, number]> = {
  ...Object.fromEntries(
    Object.entries(NEW_PRODUCTS).map(([name, product]) => [
      name,
      [...product.price],
    ]),
  ),
  "Linen Clothes": [30, 42],
  "Cotton Clothes": [50, 65],
  Brocade: [70, 90],
  Sachet: [95, 120],
  "Bronze Mirror": [55, 72],
  "Celadon Ware": [78, 100],
  "Foreign Balm": [100, 130],
  "Pearl String": [125, 160],
};

// The market normalizes these weights across currently unlocked resources.
export const RESOURCE_WEIGHTS: Record<string, number> = {
  ...Object.fromEntries(
    Object.entries(NEW_MATERIALS).map(([name, good]) => [name, good.weight]),
  ),
  Hemp: 40,
  Silk: 35,
  Tea: 25,
  "Porcelain Clay": 14,
  "Copper Ore": 12,
  Spices: 8,
  Pearls: 6,
};

// Worker definitions drive availability, labels, and wages.
export type WorkerTypeId =
  | "weaver"
  | "master"
  | "sachet_maker"
  | "coppersmith"
  | "potter"
  | "perfumer"
  | "jeweler";

export type WorkerType = {
  id: WorkerTypeId;
  label: string;
  plural: string;
  icon: string;
  wage: number;
  tier: number;
};

export const WORKER_TYPES: WorkerType[] = [
  {
    id: "weaver",
    label: "Weaver",
    plural: "Weavers",
    icon: "👩‍🔧",
    wage: 8,
    tier: 0,
  },
  {
    id: "master",
    label: "Master Weaver",
    plural: "Masters",
    icon: "👩‍🎨",
    wage: 12,
    tier: 0,
  },
  {
    id: "sachet_maker",
    label: "Sachet Maker",
    plural: "Makers",
    icon: "🌸",
    wage: 20,
    tier: 0,
  },
  {
    id: "coppersmith",
    label: "Coppersmith",
    plural: "Coppersmiths",
    icon: "🪞",
    wage: 12,
    tier: 1,
  },
  {
    id: "potter",
    label: "Potter",
    plural: "Potters",
    icon: "🫖",
    wage: 14,
    tier: 1,
  },
  {
    id: "perfumer",
    label: "Perfumer",
    plural: "Perfumers",
    icon: "🧴",
    wage: 18,
    tier: 2,
  },
  {
    id: "jeweler",
    label: "Jeweler",
    plural: "Jewelers",
    icon: "📿",
    wage: 24,
    tier: 2,
  },
];

export const WORKER_TYPE_IDS: WorkerTypeId[] = WORKER_TYPES.map((w) => w.id);

export function workerType(id: string): WorkerType | undefined {
  return WORKER_TYPES.find((w) => w.id === id);
}

export const WAGES: Record<string, number> = Object.fromEntries(
  WORKER_TYPES.map((w) => [w.id, w.wage]),
);

// Lending Reputation scales with the amount transferred.
export const AID_REPUTATION_PER_GOLD = 1 / 5;

// A voyage cap prevents repeated lending and backing from farming Reputation.
const HELPER_REPUTATION_BASE = 48;
const HELPER_REPUTATION_PER_ROUND = 6;

export function helperReputationCapFor(difficulty: unknown): number {
  return (
    HELPER_REPUTATION_BASE +
    HELPER_REPUTATION_PER_ROUND * difficultyConfig(difficulty).rounds
  );
}

export type Boon = {
  id: string;
  name: string;
  icon: string;
  desc: string;
  modifiers: Record<string, number>;
};

export const BOONS_TIER0: Boon[] = [
  {
    id: "silk_wind",
    name: "Silk Winds",
    icon: "🌬️",
    desc: "Halves the share of freight for raw Silk and goods made with Silk this round.",
    modifiers: { transport_silk_discount: 0.5 },
  },
  {
    id: "favorable_tides",
    name: "Favorable Tides",
    icon: "🌊",
    desc: "Reduces freight by up to 4 Gold before module discounts this round. A 5 Gold minimum applies at this step.",
    modifiers: { transport_flat_discount: 4 },
  },
  {
    id: "merchant_charm",
    name: "Merchant's Charm",
    icon: "✨",
    desc: "Reduces each port cargo lot price by 15% before module discounts this round.",
    modifiers: { purchase_discount: 0.15 },
  },
  {
    id: "artisan_inspiration",
    name: "Artisan's Inspiration",
    icon: "🔨",
    desc: "Each assigned artisan produces one extra item at settlement this round.",
    modifiers: { worker_bonus_production: 1 },
  },
  {
    id: "emergency_loan",
    name: "Emergency Loan",
    icon: "💰",
    desc: "Gain 40 Gold immediately. No repayment is required.",
    modifiers: { instant_gold: 40 },
  },
  {
    id: "tax_shelter",
    name: "Tax Shelter",
    icon: "📜",
    desc: "Sets the base Income Tax rate to 5% this round before module adjustments.",
    modifiers: { income_tax_override: 0.05 },
  },
  {
    id: "hemp_monopoly",
    name: "Hemp Monopoly",
    icon: "🧶",
    desc: "Reduces port cargo lot prices by 2 Gold per unit of Hemp this round, to a minimum of zero.",
    modifiers: { hemp_price_reduction: 2 },
  },
  {
    id: "master_apprentice",
    name: "Master's Apprentice",
    icon: "🎓",
    desc: "Workers hired this round earn half their base wage for their first settlement.",
    modifiers: { hire_discount: 0.5 },
  },
];

// Tier one boons require the first charter.
export const BOONS_TIER1: Boon[] = [
  {
    id: "farsight",
    name: "Farsight",
    icon: "🔮",
    desc: "Reveals one free rumor from the Broker's Rumor Board this round without risking a leak.",
    modifiers: { free_intel: 1 },
  },
  {
    id: "kiln_and_forge_guild",
    name: "Kiln and Forge Guild",
    icon: "🏮",
    desc: "Adds 15% to the share of an order reward for Celadon Ware and Bronze Mirror this round, after VAT. Imperial Mandates keep their fixed reward.",
    modifiers: { charter_order_bonus: 0.15 },
  },
  {
    id: "frontier_tariff_relief",
    name: "Frontier Tariff Relief",
    icon: "🧾",
    desc: "Halves VAT on finished good sales this round.",
    modifiers: { vat_discount: 0.5 },
  },
];

export const BOONS_TIER2: Boon[] = [
  {
    id: "exotic_treasures",
    name: "Exotic Treasures",
    icon: "💎",
    desc: "Adds 15% to the share of an order reward for Foreign Balm and Pearl String this round, after VAT. Imperial Mandates keep their fixed reward.",
    modifiers: { exotic_order_bonus: 0.15 },
  },
  {
    id: "deep_sea_escort_pact",
    name: "Deep Sea Escort Pact",
    icon: "🛡️",
    desc: "Halves the escort fee and raid chance this round, including any added risk from a Broker leak.",
    modifiers: { escort_discount: 0.5, pirate_risk_discount: 0.5 },
  },
  {
    id: "merchants_converge",
    name: "Merchants Converge",
    icon: "🛍️",
    desc: "Adds one trade order to your board this round.",
    modifiers: { extra_order: 1 },
  },
];

export const BOONS: Boon[] = [
  ...BOONS_TIER0,
  ...BOONS_TIER1,
  ...BOONS_TIER2,
  ...NEW_BOONS,
];

export type Module = { id: string; name: string; icon: string; desc: string };

export const MODULES_TIER0: Module[] = [
  {
    id: "smugglers_hold",
    name: "Smuggler's Hold",
    icon: "🏴‍☠️",
    desc: "Port cargo lots cost 15% less after other discounts. The calculated Income Tax increases by 20% before any Tax Evasion Ledger reduction.",
  },
  {
    id: "bulk_hauler",
    name: "Bulk Hauler Rigging",
    icon: "🏗️",
    desc: "Freight costs 1 Gold less per cargo unit, to a minimum of zero. Ship upgrades cost 15 Gold more.",
  },
  {
    id: "artisans_workshop",
    name: "Artisan's Workshop",
    icon: "🛠️",
    desc: "Each assigned artisan produces one extra item at settlement. Wages cost 20% more after any apprenticeship discount.",
  },
  {
    id: "tax_evasion",
    name: "Tax Evasion Ledger",
    icon: "📕",
    desc: "Halves Income Tax and VAT after other adjustments. Each completed order has a 15% audit chance. An audit takes up to 20 Gold from available funds.",
  },
  {
    id: "silk_monopoly",
    name: "Silk Road Monopoly",
    icon: "👘",
    desc: "Raw Silk ships free. Adds 20% to the reward share for goods made with Silk after VAT. Imperial Mandates keep their fixed reward.",
  },
  {
    id: "brokers_network",
    name: "Broker's Network",
    icon: "🕵️",
    desc: "A paid Broker purchase costs 2 Gold and reveals up to two rumors. Ocean Interpreter can add one more.",
  },
  {
    id: "salvage_crane",
    name: "Salvage Crane",
    icon: "♻️",
    desc: "Each completed order with a freight charge has a 30% chance to refund the full charge.",
  },
  {
    id: "overdrive_engine",
    name: "Overdrive Engine",
    icon: "⚙️",
    desc: "Freight costs up to 5 Gold less. Ship maintenance costs 10 Gold more each round.",
  },
];

// Tier one modules require the first charter.
export const MODULES_TIER1: Module[] = [
  {
    id: "bureau_token",
    name: "Maritime Bureau Token",
    icon: "🎫",
    desc: "Adds 10% to the reward share for Porcelain Clay, Copper Ore, Celadon Ware, and Bronze Mirror after VAT. Imperial Mandates keep their fixed reward.",
  },
  {
    id: "kiln_cellar",
    name: "Kiln Cellar",
    icon: "🔥",
    desc: "Port cargo lots cost 2 Gold less per unit of Porcelain Clay or Copper Ore, to a minimum of zero.",
  },
  {
    id: "ocean_relay",
    name: "Ocean Interpreter",
    icon: "📡",
    desc: "Each paid Broker purchase reveals one extra rumor when available at no extra cost.",
  },
];

export const MODULES_TIER2: Module[] = [
  {
    id: "foreign_quarter_pass",
    name: "Foreign Quarter Pass",
    icon: "🪪",
    desc: "Port cargo lots cost 3 Gold less per unit of Spices or Pearls, to a minimum of zero.",
  },
  {
    id: "persian_dome_compass",
    name: "Persian Dome Compass",
    icon: "🧿",
    desc: "Reduces the final pirate raid chance by 30% after any Broker leak and Deep Sea Escort Pact.",
  },
  {
    id: "fleet_of_treasures",
    name: "Fleet of Treasures",
    icon: "⛵",
    desc: "Reduces freight by 3 Gold for each unit of Foreign Balm or Pearl String after other freight reductions, to a minimum of zero.",
  },
];

export const MODULES: Module[] = [
  ...MODULES_TIER0,
  ...MODULES_TIER1,
  ...MODULES_TIER2,
  ...NEW_MODULES,
];

// Ratings are ordered from highest threshold to the catch all floor.
export type MerchantRating = { minScore: number; icon: string; label: string };
export const MERCHANT_RATINGS: MerchantRating[] = [
  { minScore: 300, icon: "👑", label: "King of Silk Road" },
  { minScore: 200, icon: "🏆", label: "Maritime Tycoon" },
  { minScore: 100, icon: "⭐", label: "Successful Merchant" },
  { minScore: 50, icon: "👍", label: "Qualified Trader" },
  { minScore: 0, icon: "🌊", label: "Novice Merchant" },
];

// Broker's Favor unlocks once and uses a capped net payout curve.
export const BROKERS_FAVOR_UNLOCK_LEVEL = 5;
export const BROKERS_FAVOR_PAYOUT_CAP = 200;

// The first captain to reach this voyage total wins the room reward.
export const WORD_ON_THE_DOCKS_THRESHOLD = 5;
export const WORD_ON_THE_DOCKS_REWARD = 25;
export const WORD_ON_THE_DOCKS_LEDGER_ENTRY = `📣 Word on the Docks: you were first to complete ${WORD_ON_THE_DOCKS_THRESHOLD} trade orders this voyage! +${WORD_ON_THE_DOCKS_REWARD} Gold`;

// Combined room Reputation unlocks one extra market card for the voyage.
export const TIDEWATCH_SURGE_THRESHOLD = 500;

// Convoy venture limits and settlement rates.
export const CONVOY_VENTURE_MIN_TARGET = 150;
export const CONVOY_VENTURE_MAX_TARGET = 2000;
export const CONVOY_VENTURE_MIN_ROUNDS_AHEAD = 1;
export const CONVOY_VENTURE_MAX_ROUNDS_AHEAD = 6;
export const CONVOY_VENTURE_PAYOUT_MULTIPLIER = 1.5;
export const CONVOY_VENTURE_FAILURE_REFUND_RATE = 0.5;
// A captain cannot fill a venture without another contributor.
export const CONVOY_VENTURE_MAX_CONTRIBUTOR_SHARE = 0.5;

// Successful backing earns half the lending Reputation rate.
export const BACKING_REPUTATION_PER_GOLD = AID_REPUTATION_PER_GOLD / 2;

// Tutorial values derive from the selected difficulty.
