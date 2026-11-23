import type { Boon, Module } from "./constants";

export const HARBOR_MATERIALS = {
  Indigo: {
    range: [7, 11],
    ports: ["Ningbo Port", "Fuzhou Port"],
    weight: 12,
    icon: "🟦",
    color: "#595DA8",
  },
  Sandalwood: {
    range: [11, 16],
    ports: ["Srivijaya Port", "Guangzhou Port"],
    weight: 9,
    icon: "🪵",
    color: "#A06B40",
  },
  Tin: {
    range: [8, 13],
    ports: ["Goryeo Port", "Dashi Port"],
    weight: 10,
    icon: "⚙️",
    color: "#7887A2",
  },
  "Sea Salt": {
    range: [3, 6],
    ports: ["Quanzhou Port", "Fuzhou Port"],
    weight: 14,
    icon: "🧂",
    color: "#8C9FAD",
  },
} as const;

export const HARBOR_PRODUCTS = {
  "Indigo Sailcloth": {
    materials: { Hemp: 2, Indigo: 2, Beeswax: 1 },
    worker_type: "weaver",
    price: [53, 72],
    icon: "🟪",
    color: "#576AB5",
  },
  "Sandalwood Censer": {
    materials: { Sandalwood: 1, Frankincense: 1, Tin: 1 },
    worker_type: "coppersmith",
    price: [81, 106],
    icon: "🪔",
    color: "#A87949",
  },
  "Salt Glazed Bowl": {
    materials: { "Porcelain Clay": 2, "Sea Salt": 2, "River Lacquer": 1 },
    worker_type: "potter",
    price: [77, 98],
    icon: "🥣",
    color: "#65858F",
  },
  "Tinbound Tea Chest": {
    materials: { Bamboo: 2, Tin: 1, Tea: 1 },
    worker_type: "coppersmith",
    price: [60, 79],
    icon: "🗃️",
    color: "#7C805D",
  },
} as const;

export const HARBOR_BOONS: Boon[] = [
  {
    id: "buyers_festival",
    name: "Buyer's Festival",
    icon: "🏮",
    desc: "Earn 20% more on the Silk and textile share of ordinary orders after VAT. Adds up to 18 Gold this round.",
    modifiers: { buyers_festival: 1 },
  },
  {
    id: "resourceful_crew",
    name: "Resourceful Crew",
    icon: "🧰",
    desc: "Save one unit of the most expensive input on your first two different recipes assigned this round. Each recipe still needs one input.",
    modifiers: { resourceful_crew: 1 },
  },
  {
    id: "market_momentum",
    name: "Market Momentum",
    icon: "🌊",
    desc: "After an ordinary raw sale, earn 20% more on the next ordinary finished good order this round after VAT.",
    modifiers: { market_momentum: 1 },
  },
];

export const HARBOR_MODULES: Module[] = [
  {
    id: "silk_market_charter",
    name: "Silk Market Charter",
    icon: "📜",
    desc: "Earn 25% more on the Silk share of ordinary orders after VAT, including raw Silk and goods made with Silk.",
  },
  {
    id: "traveling_commission",
    name: "Traveling Commission",
    icon: "📯",
    desc: "Sell two distinct finished goods to ordinary buyers in one round. The first ordinary finished good order next round pays 15% more after VAT.",
  },
  {
    id: "open_hold",
    name: "Open Hold",
    icon: "📦",
    desc: "Your first ordinary mixed raw order each round pays 5 extra Gold per distinct material, up to 15 Gold.",
  },
  {
    id: "storm_dividend",
    name: "Storm Dividend",
    icon: "⛈️",
    desc: "If you took direct passage last round, your first ordinary order pays 25% more after VAT, even if you were raided.",
  },
  {
    id: "collectors_seal",
    name: "Collector's Seal",
    icon: "🔖",
    desc: "Your first ordinary ceramic sale each round earns 5 Gold per distinct ceramic you previously sold while this module was equipped, up to 15 Gold.",
  },
];

export const CERAMICS = new Set([
  "Celadon Ware",
  "Lacquered Jar",
  "Salt Glazed Bowl",
]);
export const TEXTILES = new Set([
  "Silk",
  "Linen Clothes",
  "Cotton Clothes",
  "Brocade",
  "Bamboo Mat",
  "Waxed Canvas",
  "Indigo Sailcloth",
]);
