// Canonical game content, balance values, and tutorial copy.

import {
  difficultyConfig,
  type Difficulty,
  type DifficultyConfig,
} from "./difficulty";

// Shared display name for interface copy and metadata.
export const APP_NAME = "PortMasters 2";

export const ICONS: Record<string, string> = {
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
  { materials: Record<string, number>; value: number; worker_type: string }
> = {
  "Linen Clothes": { materials: { Hemp: 2 }, value: 15, worker_type: "weaver" },
  "Cotton Clothes": {
    materials: { Hemp: 2, Silk: 1 },
    value: 35,
    worker_type: "weaver",
  },
  Brocade: { materials: { Silk: 3 }, value: 60, worker_type: "master" },
  Sachet: {
    materials: { Silk: 1, Tea: 2 },
    value: 80,
    worker_type: "sachet_maker",
  },
  "Bronze Mirror": {
    materials: { "Copper Ore": 3 },
    value: 45,
    worker_type: "coppersmith",
  },
  "Celadon Ware": {
    materials: { "Porcelain Clay": 3 },
    value: 65,
    worker_type: "potter",
  },
  "Foreign Balm": {
    materials: { Spices: 2, Silk: 1 },
    value: 85,
    worker_type: "perfumer",
  },
  "Pearl String": {
    materials: { Pearls: 2, Silk: 1 },
    value: 105,
    worker_type: "jeweler",
  },
};

export const COMMODITIES: Record<
  string,
  { ports: string[]; basePrice: [number, number] }
> = {
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
    desc: "Transport cost for Silk & Silk products is halved this round.",
    modifiers: { transport_silk_discount: 0.5 },
  },
  {
    id: "favorable_tides",
    name: "Favorable Tides",
    icon: "🌊",
    desc: "Base transport cost reduced by 4 Gold this round.",
    modifiers: { transport_flat_discount: 4 },
  },
  {
    id: "merchant_charm",
    name: "Merchant's Charm",
    icon: "✨",
    desc: "15% discount on all port purchases this round.",
    modifiers: { purchase_discount: 0.15 },
  },
  {
    id: "artisan_inspiration",
    name: "Artisan's Inspiration",
    icon: "🔨",
    desc: "All workers produce one extra item this round.",
    modifiers: { worker_bonus_production: 1 },
  },
  {
    id: "emergency_loan",
    name: "Emergency Loan",
    icon: "💰",
    desc: "Gain 40 Gold immediately. No strings attached.",
    modifiers: { instant_gold: 40 },
  },
  {
    id: "tax_shelter",
    name: "Tax Shelter",
    icon: "📜",
    desc: "Income tax rate reduced to 5% this round.",
    modifiers: { income_tax_override: 0.05 },
  },
  {
    id: "hemp_monopoly",
    name: "Hemp Monopoly",
    icon: "🧶",
    desc: "Hemp purchase prices reduced by 2 Gold per unit.",
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
    desc: "Reveals one Broker's rumor for free this round.",
    modifiers: { free_intel: 1 },
  },
  {
    id: "kiln_and_forge_guild",
    name: "Kiln and Forge Guild",
    icon: "🏮",
    desc: "Celadon Ware & Bronze Mirror orders pay 15% more this round.",
    modifiers: { charter_order_bonus: 0.15 },
  },
  {
    id: "frontier_tariff_relief",
    name: "Frontier Tariff Relief",
    icon: "🧾",
    desc: "VAT on finished goods is halved this round.",
    modifiers: { vat_discount: 0.5 },
  },
];

export const BOONS_TIER2: Boon[] = [
  {
    id: "exotic_treasures",
    name: "Exotic Treasures",
    icon: "💎",
    desc: "Foreign Balm & Pearl String orders pay 15% more this round.",
    modifiers: { exotic_order_bonus: 0.15 },
  },
  {
    id: "deep_sea_escort_pact",
    name: "Deep Sea Escort Pact",
    icon: "🛡️",
    desc: "Escort cost halved; pirate risk halved this round.",
    modifiers: { escort_discount: 0.5, pirate_risk_discount: 0.5 },
  },
  {
    id: "merchants_converge",
    name: "Merchants Converge",
    icon: "🛍️",
    desc: "One extra trade order appears this round's board.",
    modifiers: { extra_order: 1 },
  },
];

export const BOONS: Boon[] = [...BOONS_TIER0, ...BOONS_TIER1, ...BOONS_TIER2];

export type Module = { id: string; name: string; icon: string; desc: string };

export const MODULES_TIER0: Module[] = [
  {
    id: "smugglers_hold",
    name: "Smuggler's Hold",
    icon: "🏴‍☠️",
    desc: "Purchases cost 15% less. Income Tax costs 20% more.",
  },
  {
    id: "bulk_hauler",
    name: "Bulk Hauler Rigging",
    icon: "🏗️",
    desc: "Transport costs 1 Gold less per item. Ship upgrades cost 15 Gold more.",
  },
  {
    id: "artisans_workshop",
    name: "Artisan's Workshop",
    icon: "🛠️",
    desc: "Workers produce one extra item. Wages cost 20% more.",
  },
  {
    id: "tax_evasion",
    name: "Tax Evasion Ledger",
    icon: "📕",
    desc: "Income Tax & VAT halved. 15% chance of an audit after each order. The audit takes up to 20 Gold from available funds.",
  },
  {
    id: "silk_monopoly",
    name: "Silk Road Monopoly",
    icon: "👘",
    desc: "Raw Silk ships free. Orders for products made with Silk pay 20% more.",
  },
  {
    id: "brokers_network",
    name: "Broker's Network",
    icon: "🕵️",
    desc: "A purchase costs 2 Gold and reveals up to 2 rumors.",
  },
  {
    id: "salvage_crane",
    name: "Salvage Crane",
    icon: "♻️",
    desc: "30% chance to refund transport cost on order complete.",
  },
  {
    id: "overdrive_engine",
    name: "Overdrive Engine",
    icon: "⚙️",
    desc: "Transport costs 5 Gold less. Maintenance costs 10 Gold more.",
  },
];

// Tier one modules require the first charter.
export const MODULES_TIER1: Module[] = [
  {
    id: "bureau_token",
    name: "Maritime Bureau Token",
    icon: "🎫",
    desc: "Charter goods (Porcelain Clay, Copper Ore and their products) pay 10% more on orders.",
  },
  {
    id: "kiln_cellar",
    name: "Kiln Cellar",
    icon: "🔥",
    desc: "Porcelain Clay and Copper Ore cost 2 Gold less per unit.",
  },
  {
    id: "ocean_relay",
    name: "Ocean Interpreter",
    icon: "📡",
    desc: "Broker's Whisper reveals 1 extra rumor at no extra cost.",
  },
];

export const MODULES_TIER2: Module[] = [
  {
    id: "foreign_quarter_pass",
    name: "Foreign Quarter Pass",
    icon: "🪪",
    desc: "Spices and Pearls cost 3 Gold less per unit.",
  },
  {
    id: "persian_dome_compass",
    name: "Persian Dome Compass",
    icon: "🧿",
    desc: "Pirate raid risk reduced by 30%.",
  },
  {
    id: "fleet_of_treasures",
    name: "Fleet of Treasures",
    icon: "⛵",
    desc: "Freight on Foreign Balm & Pearl String orders is 3 Gold cheaper per unit.",
  },
];

export const MODULES: Module[] = [
  ...MODULES_TIER0,
  ...MODULES_TIER1,
  ...MODULES_TIER2,
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
function raidCopy(cfg: DifficultyConfig): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const [first, second] = cfg.pirateChance;
  return second === undefined || second === first
    ? `a ${pct(first)} chance`
    : `a ${pct(first)} chance that rises to ${pct(second)} past the midpoint`;
}

function escortPct(cfg: DifficultyConfig): string {
  return `${Math.round(cfg.escortCostRate * 100)}%`;
}

function mandateRounds(cfg: DifficultyConfig): number[] {
  return Object.keys(cfg.mandates)
    .map(Number)
    .sort((a, b) => a - b);
}

export function tutorialSteps(
  difficulty: Difficulty,
): { title: string; content: string }[] {
  const cfg = difficultyConfig(difficulty);
  const mandates = mandateRounds(cfg);
  const maxTier = Object.keys(cfg.tierUnlock).reduce(
    (highest, tier) => Math.max(highest, Number(tier)),
    0,
  );
  const resourceTiers: readonly (readonly string[])[] = [
    RESOURCES_TIER0,
    RESOURCES_TIER1,
    RESOURCES_TIER2,
  ];
  const productTiers: readonly (readonly string[])[] = [
    PRODUCTS_TIER0,
    PRODUCTS_TIER1,
    PRODUCTS_TIER2,
  ];
  const availableResources = resourceTiers
    .slice(0, maxTier + 1)
    .flatMap((tier) => [...tier]);
  const availableProducts = productTiers
    .slice(0, maxTier + 1)
    .flatMap((tier) => [...tier]);
  const availableWorkers = WORKER_TYPES.filter(
    (worker) => worker.tier <= maxTier,
  );
  const workerWages = availableWorkers.map((worker) => worker.wage);
  const minimumWage = Math.min(...workerWages);
  const maximumWage = Math.max(...workerWages);
  const charterResources = availableResources.slice(RESOURCES_TIER0.length);
  const marketCopy = charterResources.length
    ? `The market begins with Hemp, Silk, and Tea. Later charters add ${charterResources.join(", ")}.`
    : "The market remains on the founding trade: Hemp, Silk, and Tea.";
  const workerCopy = availableWorkers
    .map((worker) => `${worker.label} (${worker.wage}g)`)
    .join(", ");
  return [
    {
      title: "⚓ Welcome aboard",
      content: `<p>${APP_NAME} puts you on the ancient Silk Road for a voyage of ${cfg.rounds} rounds with limited Gold and a harbor full of rival captains.</p>
<p>These waters are <strong>${cfg.name}</strong>: ${cfg.tagline}</p>
<p>The rules are easy to pick up, but money is tight early on and a string of bad calls compounds quickly. This guide covers the full round flow and the decisions that most often sink a first voyage.</p>
<p style="color:var(--muted-foreground);font-size:13px">Two minutes to read. Saves a lot of frustrated restarts.</p>`,
    },
    {
      title: "🏆 What you're playing for",
      content: `<p>After round ${cfg.rounds}, the solvent captain with the highest Reputation is crowned <strong>Sea Master</strong>. Reputation comes mainly from profitable trade orders.</p>
<p>Reaching zero Gold does not end the voyage by itself. Bankruptcy happens when settlement arrives and, even after seeking aid, you cannot cover wages or maintenance.</p>
<p>These waters start you with <strong>${cfg.startingGold} Gold</strong> before any Renown bonus. That is enough to get moving, but not enough to ignore the next settlement.</p>`,
    },
    {
      title: "🔄 How each round works",
      content: `<p>Each of the ${cfg.rounds} rounds follows the same synchronized sequence:</p>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0">
  <div style="background:#F3E8FF;color:#17212a;border-radius:6px;padding:10px;border-left:3px solid #8B5CF6"><strong>Draft</strong><br><span style="font-size:12px;color:#444">Choose a Boon for this round</span></div>
  <div style="background:#E8F5E9;color:#17212a;border-radius:6px;padding:10px;border-left:3px solid #4CAF50"><strong>1️⃣ Buy</strong><br><span style="font-size:12px;color:#444">Stock up at port markets</span></div>
  <div style="background:#FFF8E1;color:#17212a;border-radius:6px;padding:10px;border-left:3px solid #FFA000"><strong>🤝 Barter</strong><br><span style="font-size:12px;color:#444">Swap goods with other captains</span></div>
  <div style="background:#F0FDFA;color:#17212a;border-radius:6px;padding:10px;border-left:3px solid #0D9488"><strong>Artisans</strong><br><span style="font-size:12px;color:#444">Hire workers and assign production</span></div>
  <div style="background:#E3F2FD;color:#17212a;border-radius:6px;padding:10px;border-left:3px solid #2196F3"><strong>2️⃣ Trade</strong><br><span style="font-size:12px;color:#444">Sell to waiting buyers</span></div>
  <div style="background:#FFF3CD;color:#17212a;border-radius:6px;padding:10px;border-left:3px solid #FFC107"><strong>3️⃣ Settle</strong><br><span style="font-size:12px;color:#444">Production lands, pirates resolve, then bills come due</span></div>
  <div style="background:#FCE4EC;color:#17212a;border-radius:6px;padding:10px;border-left:3px solid #E91E63"><strong>4️⃣ Upgrade</strong><br><span style="font-size:12px;color:#444">Improve your ship</span></div>
</div>
<p style="font-size:12px;color:var(--muted-foreground);margin:4px 0 0">The room advances only after every active captain is ready. In the game room, <kbd style="background:#eee;color:#17212a;border:1px solid #ccc;padding:1px 6px;border-radius:3px">Ctrl+N</kbd> performs the current Next Phase action.</p>`,
    },
    {
      title: "🏪 Phase 1: Buying",
      content: `<p>${marketCopy} Prices and card selection change each round. Buy now, barter if you need to, then sell in Phase 2. That is the core loop.</p>
<p>One thing worth knowing about: the <strong>Broker</strong>. Pay a small fee for a demand rumor and a specific trade order is <em>guaranteed</em> to appear when Phase 2 opens. Useful when you have stocked a particular good and want to make sure a buyer shows up.</p>
<div style="background:#FFF8DC;color:#17212a;border:1px solid #FFA000;border-radius:6px;padding:9px;font-size:13px;margin-top:10px;line-height:1.5">
  💡 Early on, raw materials are easier to manage because they can be sold in the same round. Finished goods need materials, an artisan, and one production cycle.
</div>`,
    },
    {
      title: "🤝 Bartering",
      content: `<p>Right after buying, there's a short window where captains can trade directly with each other instead of through the market. Post an offer, like Hemp you don't need for Silk you do, and any other captain in the harbor can take it with one click.</p>
<p>It is the easiest way to recover from a bad draw. All Tea and no Silk, with a Sachet order already on the board? Someone else in the harbor has probably drawn the opposite problem.</p>
<div style="background:#FFF8DC;color:#17212a;border:1px solid #FFA000;border-radius:6px;padding:9px;font-size:13px;margin-top:10px;line-height:1.5">
  A few ground rules: you can't offer an item for itself, both amounts have to be whole numbers of at least one, and you can never offer more than you currently have. The moment you post an offer, that amount is set aside until someone takes it or you cancel it.
</div>
<p style="font-size:13px;color:var(--foreground);margin-top:8px">Nobody has to barter. If nothing on the board interests you, or nobody is offering anything, just move on to the next phase.</p>`,
    },
    {
      title: "📋 Phase 2: Filling orders",
      content: `<p>Trade orders appear and you match your cargo to them. Each one shows the goods needed, the reward, and the shipping fee. Your take is whatever is left after fees and tax.</p>
<p>You can fill as many orders as your cargo allows in a single phase.</p>
<div style="background:#E3F2FD;color:#17212a;border:1px solid #2196F3;border-radius:6px;padding:9px;font-size:13px;margin-top:10px;line-height:1.5">
  📌 <strong>Finished goods</strong> available during this voyage include ${availableProducts.join(", ")}. They usually command larger rewards, but their recipes consume materials and production completes after the order phase.
</div>
${mandates.length ? `<p style="font-size:13px;margin-top:10px">📜 On round${mandates.length === 1 ? "" : "s"} ${mandates.join(", ")} the Emperor commissions a <strong>mandate</strong>: one large order at a fixed reward, and the only order exempt from VAT. Plan your inventory and bartering around it.</p>` : ""}`,
    },
    {
      title: "⚠️ The artisan trap",
      content: `<p>Artisans turn raw materials into valuable finished goods and collect wages at each Phase 3. That part is simple. What catches most new players is this:</p>
<div style="background:#C62828;color:#fff;border-radius:6px;padding:12px;margin:12px 0;text-align:center;font-size:14px;font-weight:bold;line-height:1.7">
  Assign a task this round.<br>Production lands at settlement, after this round's order phase.
</div>
<p style="font-size:13px;color:var(--foreground);line-height:1.6">Artisans available during this voyage are ${workerCopy}. Every hired artisan charges wages <strong>each round</strong>, even when idle. Hire only when you can cover payroll alongside maintenance.</p>`,
    },
    {
      title: "🏴‍☠️ Pirates at Phase 3",
      content: `<p>After production and before the bills come due each round, there is ${raidCopy(cfg)} that pirates find your ship and take every Gold coin you are carrying.</p>
<p>You get one choice before that roll happens: hire an escort for ${escortPct(cfg)} of your current Gold and sail through guaranteed safe, or set sail anyway and keep the Gold if the pirates don't show.</p>
${cfg.brokerCorruption ? `<p>In these waters a broker can be corrupt. The rumor you buy is still true and still arrives, always, but a corrupt one also leaks your position to the pirates. The log says so plainly when it happens, and the odds you see already include it.</p>` : ""}
<div style="background:#FFF8DC;color:#17212a;border:1px solid #FFA000;border-radius:6px;padding:9px;font-size:13px;margin-top:10px;line-height:1.5">
  💡 The escort costs a share of whatever you're carrying that round, so it's cheapest exactly when you have the least to protect. Often worth it once your funds are already thin.
</div>`,
    },
    {
      title: "💸 Phase 3: Settlement",
      content: `<p>Once the pirates are dealt with, two bills come due:</p>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0">
  <div style="background:#E3F2FD;color:#17212a;border-radius:6px;padding:10px;text-align:center">
    <div style="font-size:22px;margin-bottom:4px">🔧</div>
    <strong>Ship Maintenance</strong><br>
    <span style="font-size:12px;color:#444">${cfg.maintenance} Gold per round before modifiers</span>
  </div>
  <div style="background:#FCE4EC;color:#17212a;border-radius:6px;padding:10px;text-align:center">
    <div style="font-size:22px;margin-bottom:4px">👥</div>
    <strong>Artisan Wages</strong><br>
    <span style="font-size:12px;color:#444">${minimumWage} to ${maximumWage} Gold per artisan per round</span>
  </div>
</div>
<p style="font-size:13px;color:var(--foreground)">The <strong>Due</strong> total in Status and the Dues tab show exactly what is owed. Check them before spending anything.</p>
<p style="font-size:13px;color:var(--foreground)">Coming up short isn't the end on its own. Right there on the settlement screen, you can ask another captain in the harbor for a loan, and they can send it to you on the spot if they've got the Gold to spare. Just repay it before the voyage's last round ends, or it comes out of your funds automatically and goes straight to them.</p>`,
    },
    {
      title: "🚢 You are ready",
      content: `<p>Keep these points in mind as you play:</p>
<ul style="padding-left:18px;line-height:2.1;font-size:14px">
  <li>Start with raw material orders. Fast money, no complications.</li>
  <li>Keep a reserve above the exact wages and maintenance shown in Status and Dues.</li>
  <li>Hire artisans only when you can cover their wages for more than the current round.</li>
  <li>Phase 4 ship upgrades compound quickly. Do not skip them.</li>
  <li>Caught short by pirates or a bad round? Ask the harbor for a loan before you assume the voyage is over.</li>
  <li>An eligible finished voyage banks final Reputation as Renown XP, win or lose. Check your Captain's Legacy from the Lobby.</li>
  <li><kbd style="background:#eee;color:#17212a;border:1px solid #ccc;padding:1px 6px;border-radius:3px">Ctrl+S</kbd> saves, <kbd style="background:#eee;color:#17212a;border:1px solid #ccc;padding:1px 6px;border-radius:3px">Ctrl/Cmd+K</kbd> opens Quick Actions, and <kbd style="background:#eee;color:#17212a;border:1px solid #ccc;padding:1px 6px;border-radius:3px">F1</kbd> opens the full guide.</li>
</ul>
<div style="background:#E8F5E9;color:#17212a;border:2px solid #4CAF50;border-radius:8px;padding:12px;text-align:center;margin-top:14px">
  <strong style="font-size:15px">Good winds and good margins, Captain. ⚓</strong>
</div>`,
    },
  ];
}
