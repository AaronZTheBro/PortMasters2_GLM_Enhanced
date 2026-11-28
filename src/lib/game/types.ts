// =====================================================================
// PortMasters 2: game state types
// =====================================================================
import type { MilestoneId } from "./milestones";
import {
  ITEMS,
  STARTING_STOCK,
  WORKER_TYPE_IDS,
  type Boon,
  type Module,
  type WorkerTypeId,
} from "./constants";
import {
  DEFAULT_DIFFICULTY,
  difficultyConfig,
  type Difficulty,
} from "./difficulty";

import {
  CLASSIC_RULES,
  REAGENT_RULES,
  openHarbor,
  type HarborForecast,
  type VoyageRules,
  type Specialty,
  voyageMaintenance,
  voyageStartingGold,
} from "./expansion";

export type Phase =
  | 0 // welcome
  | 1 // port purchase
  | 2 // trade orders
  | 3 // maintenance / settlement
  | 4 // shipyard
  | 5 // boon drafting
  | "barter"
  | "worker_mgmt"
  | "module_draft"
  | "module_swap"
  | "bankruptcy"
  | "endgame";

export type ResourceRef = {
  type: string;
  required?: number;
  quantity?: number;
  price?: number;
  materialCost?: number;
  materialDetails?: string;
};

export type ResourceCard = {
  id: number;
  port: string;
  resources: ResourceRef[];
  totalCost: number;
  isProductCard: boolean;
  featured?: boolean;
  workshopSupply?: boolean;
  paidGold?: number;
  staple?: boolean;
};

export type OrderCard = {
  id: number;
  demandPort: string;
  resources: ResourceRef[];
  reward: number;
  totalItems: number;
  isProductOrder: boolean;
  staple?: boolean;
  whisperIndex?: number;
  workshop?: boolean;
  buyer?:
    "merchant" | "commission" | "mixed" | "speculative" | "standing" | "rival";
  clearance?: boolean;
  settledGold?: number;
  // Set only on the extra order a captain conjures with Broker's Favor (see
  // callBrokersFavor in engine.ts). completeOrder reads it to take the
  // Broker's commission off this order's reward; every other order leaves it
  // undefined and is unaffected.
  isBrokerFavor?: boolean;
  // Set only on the Emperor's scheduled commission (see the mandate injection
  // in startPhase2 and MANDATE_TEMPLATES in ./difficulty). Purely a marker for
  // the trade board's styling; the order settles like any other, except that it
  // carries isProductOrder: false so no VAT is charged on an imperial levy.
  isMandate?: boolean;
};

export type IntelItem = {
  item: string;
  port: string;
  orderId?: number;
  quantity?: number;
  reward?: number;
  cargo?: ResourceRef[];
};

export type Worker = {
  task: string | null;
  producedCount: number;
  finishedAssignments?: number;
  isSkilled: boolean;
  hiredRound?: number;
};

// A permanent rule formed by fusing one Favor and one module on the Bond
// Table. The pair stops being a coupon and starts being a verb.
export type EngineState = {
  id: string;
  favorId: string;
  moduleId: string;
  rank: number;
  fusedRound: number;
  dormantUntilRound?: number;
};

// Client view of a loan. Borrower and lender keep mirrored entries;
// Socket.IO synchronizes them while the server persists the shared record
// used for repayment, backing, and redirects.
export type Loan = {
  id: string;
  counterpartyId: string;
  counterpartyName: string;
  amount: number;
  roundBorrowed: number;
};

export type GameState = {
  milestones?: MilestoneId[];
  inventory: Record<string, number>;
  money: number;
  score: number;
  currentRound: number;
  maxRounds: number;
  // The room's difficulty tier (see src/lib/game/difficulty.ts), stamped onto
  // this state when the voyage is created and refreshed from the room on every
  // load, so the engine derives voyage length, market breadth, and raid odds
  // from one source shared by the room. Every captain in a room carries their
  // own copy of the same room value, which keeps their conclusion aligned.
  difficulty: Difficulty;
  rulesVersion?: number;
  seatSeed?: string;
  forecasts?: HarborForecast[];
  specialties?: Specialty[];
  arrivals?: string[];
  exchangeSales?: Record<string, number>;
  directPassageRound?: number;
  ceramicCollection?: string[];
  finishedSales?: string[];
  travelingCommissionRound?: number;
  resourcefulRecipes?: string[];
  effectUses?: Record<string, number>;
  emergencyLoanUsed?: boolean;
  producedRecipes?: string[];
  scoutedOrder?: OrderCard;
  scoutedOrders?: OrderCard[];
  plannedOrders?: OrderCard[];
  announcedBuyers?: { round: number; buyers: OrderCard[] };
  workshopContracts?: { round: number; item: string; quantity: number }[];
  // The room's voyage epoch (see Room.voyageEpoch in prisma/schema.prisma),
  // stamped onto this state when the voyage is created and folded into the
  // deterministic seed so a restart (which bumps the epoch) rerolls every
  // captain's market, orders, and Broker intel into a completely new voyage.
  voyageEpoch: number;
  totalRevenue: number;
  totalCosts: number;
  materialCosts: number;
  totalMaterialCosts?: number;
  totalWorkerWages?: number;
  totalMaintenanceCosts?: number;
  workerWages: number;
  maintenanceCosts: number;
  vatPaid: number;
  readyVote?: { round: number; phase: Phase };
  pendingBoonId?: string;
  barterCursor?: number;
  roundVatPaid?: number;
  processedLoanSettlements?: string[];
  incomeTaxPaid: number;
  roundIncomeTaxDue?: number;
  roundRevenue: number;
  roundCosts: number;
  engineUpkeepCosts?: number;
  // Every artisan the captain employs, keyed by type (see WORKER_TYPES in
  // ./constants). One record rather than a field per type, so new artisan
  // definitions need no new state field; the roster normalizer fills gaps.
  workers: Record<WorkerTypeId, Worker[]>;
  fixedCost: number;
  shipLevel: number;
  shipUpgradeCost: number[];
  phase: Phase;
  resourceCards: ResourceCard[];
  customerCards: OrderCard[];
  purchasedCards: number[];
  completedOrders: number[];
  purchaseCount: number;
  orderCount: number;
  // Reputation already earned this voyage from lending and backing, kept
  // so both can share one ceiling (see HELPER_REPUTATION_VOYAGE_CAP).
  helperReputationEarned: number;
  // Trade orders completed across the whole
  // voyage, never reset per round the way orderCount is, only by a fresh
  // voyage (createInitialGameState). completeOrder increments this alongside
  // orderCount; it's what the milestone race below actually watches.
  totalOrdersCompleted: number;
  // Set once, by completeOrder, the instant
  // totalOrdersCompleted crosses WORD_ON_THE_DOCKS_THRESHOLD, since the pure
  // engine has no way to call socket.emit itself. GameRoom.tsx relays it as
  // a docks:claim report and clears it, the same convention
  // _pendingDebtSettlements/_draftChoices/_newModule already use for an
  // engine function that needs the React layer to act on its behalf.
  _pendingDocksClaim?: { total: number };
  docksRewardClaimed?: boolean;
  gameOver: boolean;
  modifierFlags: Record<string, number>;
  lastBoonId: string | null;
  phase2DemandTags: string[];
  revealedIntel: IntelItem[];
  // Price adjustments and the last completed round's raw purchases.
  harborPulse: Record<string, number>;
  lastPurchaseTally?: { round: number; quantities: Record<string, number> };
  // Flips true once the whole
  // room's combined Reputation crosses TIDEWATCH_SURGE_THRESHOLD (see the
  // game:status handler in src/server/realtime.ts, which is where every
  // captain's Reputation is already visible). Read by startPhase1 to add one
  // extra card to this captain's board from the next round onward; never
  // flips back, and never touches maxRounds, difficulty, or which tier's
  // content is visible, all of which stay the host's own choice.
  tidewatchSurge: boolean;
  // The captain's persistent Renown level (see src/lib/game/legacy.ts),
  // copied onto the voyage state so the engine can gate skills locked by
  // Renown, like Broker's Favor, without reaching back into account data.
  // This value is personal to each captain, exactly like money, so it never
  // touches the shared room
  // seed. Refreshed from the captain's legacy on every load / restart.
  renownLevel: number;
  // Broker's Favor can be used once each voyage (unlocks at Renown Level 5, see
  // BROKERS_FAVOR_UNLOCK_LEVEL). Flipped true the moment it is used and reset
  // only by starting a fresh voyage (createInitialGameState / restartGame),
  // never in endRound, which is what keeps it to one use per game rather than
  // one per round.
  brokersFavorUsed: boolean;
  equippedModules: Module[];
  // Each round's boon and module draft pools, fixed once rolled (see
  // startBoonDrafting / startModuleDrafting in engine.ts) so reopening the
  // draft screen, backing out, or reloading the page never rolls them again.
  // The only way to get a new pool during a round is the corresponding swap
  // action below, each capped at one use per round.
  boonChoices: Boon[];
  boonSwapUsed: boolean;
  // Reagent rules replace the one round boon with a small rack of persistent
  // Favors. A Favor is stored by id, and favorMarks counts the rounds and
  // duplicates that attune it toward rank 2 and rank 3.
  favors?: string[];
  favorMarks?: Record<string, number>;
  // The slot a captain chose to replace when the rack is full. The value is
  // carried in the save so the ready vote does not need a second payload.
  pendingFavorSlot?: number;
  // A Patron Charter is picked once at the start of a Reagent voyage and
  // tracked across three acts.
  charterId?: string;
  charterMarks?: number;
  charterMisses?: number;
  charterActsSettled?: number;
  charterComplete?: boolean;
  engines?: EngineState[];
  // Heat makes success a target. It raises raid risk and can be bribed down.
  heat?: number;
  // The False Manifest engine defers part of a lot price to settlement.
  shadowGold?: number;
  goodsSold?: Record<string, number>;
  // Tidewatch reads the best single round of completed order revenue. Port
  // Exchange and clearance sales are left out, so only filling orders counts.
  bestRoundRevenue?: number;
  // The order revenue banked so far in the current round.
  roundOrderRevenue?: number;
  producedLastRound?: Record<string, number>;
  silkShippedThisRound?: number;
  _draftChoices?: Module[];
  moduleSwapUsed: boolean;
  _newModule?: Module;
  // Reset for each round and resolved before wages and maintenance.
  pirateAttackResolved: boolean;
  escortHired: boolean;
  // Set when a corrupt broker leaked this captain's position (Monsoon only,
  // see purchaseIntel). The rumor itself is always delivered and always true;
  // the leak only raises this round's raid chance, once, and is announced in
  // the log rather than hidden. Reset every round in startBoonDrafting.
  brokerTippedPirates: boolean;
  // Loans currently owed to other captains (debts) and by other captains
  // to this one (loansGiven). Settled voluntarily at any time, or forced
  // at the end of the configured final round (see settleOutstandingDebts).
  debts: Loan[];
  loansGiven: Loan[];
  // Set only by settleOutstandingDebts when repayment in the final round
  // cannot fully cover what was owed. Drives the
  // endgame screen's outcome instead of the normal merchant rank.
  defaultedDebt: boolean;
  insolvency?: "wages" | "maintenance" | "debt";
  // Transient: a signal for the React layer to relay over the aid:repay
  // socket event and then clear, since the pure engine functions that
  // populate it (settleOutstandingDebts) have no way to call socket.emit
  // themselves. Same convention as _draftChoices/_newModule above.
  _pendingDebtSettlements?: {
    lenderId: string;
    lenderName: string;
    amount: number;
    debtId: string;
  }[];
};

// The hold every voyage starts with: a key for every catalogued good,
// carrying the founding stock where there is any and zero otherwise.
export function initialInventory(): Record<string, number> {
  const inv: Record<string, number> = {};
  for (const item of ITEMS) inv[item] = STARTING_STOCK[item] ?? 0;
  return inv;
}

// Normalizes a hold read from a save. Every catalogued good gets a finite
// numeric value; unknown finite entries are preserved for compatibility.
export function normalizeInventory(raw: unknown): Record<string, number> {
  const src = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const item of ITEMS) {
    const v = src[item];
    out[item] = typeof v === "number" && Number.isFinite(v) ? v : 0;
  }
  for (const [key, v] of Object.entries(src)) {
    if (key in out) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
  }
  return out;
}

export function emptyWorkerRoster(): Record<WorkerTypeId, Worker[]> {
  return Object.fromEntries(
    WORKER_TYPE_IDS.map((id) => [id, [] as Worker[]]),
  ) as unknown as Record<WorkerTypeId, Worker[]>;
}

// Accepts whatever a save actually holds and returns a complete roster: any
// artisan type the save predates comes back empty rather than undefined, and
// saves without a roster are read from the three separate legacy arrays.
// Deliberately tolerant, since this runs on every load and a malformed roster
// should cost a captain their artisans, not their whole voyage.
export function normalizeWorkerRoster(
  raw: unknown,
  legacy?: {
    weavers?: Worker[];
    masterWeavers?: Worker[];
    sachetMakers?: Worker[];
  },
): Record<WorkerTypeId, Worker[]> {
  const roster = emptyWorkerRoster();
  const src = (raw ?? {}) as Partial<Record<string, Worker[]>>;
  for (const id of WORKER_TYPE_IDS) {
    if (Array.isArray(src[id])) roster[id] = src[id] as Worker[];
  }
  if (legacy) {
    if (!Array.isArray(src.weaver) && Array.isArray(legacy.weavers))
      roster.weaver = legacy.weavers;
    if (!Array.isArray(src.master) && Array.isArray(legacy.masterWeavers))
      roster.master = legacy.masterWeavers;
    if (!Array.isArray(src.sachet_maker) && Array.isArray(legacy.sachetMakers))
      roster.sachet_maker = legacy.sachetMakers;
  }
  return roster;
}

export type GameContext = {
  roomSeed?: string;
  // Deterministic seed identity combines the room and user ids.
  // The game session hook uses this identity. Combined with the voyage epoch on
  // GameState, this gives every captain their own market, orders, and Broker
  // intel, reproducible on reload but different from every other captain and
  // rerolled whenever the host restarts the voyage.
  seedBase: string;
};

// startingGoldBonus comes from persistent Renown. renownLevel defaults to 1,
// with Broker's Favor locked. voyageEpoch defaults to the room's first voyage,
// and difficulty defaults to DEFAULT_DIFFICULTY. Callers pass room and account
// values when available so seeding, round limits, starting Gold, and maintenance
// match the active voyage.
export function createInitialGameState(
  startingGoldBonus: number = 0,
  renownLevel: number = 1,
  voyageEpoch: number = 0,
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
  rules: VoyageRules = { version: CLASSIC_RULES, forecasts: [] },
): GameState {
  const cfg = difficultyConfig(difficulty);
  return {
    milestones: undefined,
    inventory: initialInventory(),
    money: voyageStartingGold(difficulty, rules.version) + startingGoldBonus,
    difficulty,
    rulesVersion: rules.version,
    seatSeed: undefined,
    forecasts: rules.forecasts,
    specialties: rules.specialties,
    arrivals: rules.arrivals,
    exchangeSales: undefined,
    directPassageRound: undefined,
    ceramicCollection: undefined,
    finishedSales: undefined,
    travelingCommissionRound: undefined,
    resourcefulRecipes: undefined,
    effectUses: {},
    emergencyLoanUsed: false,
    producedRecipes: [],
    scoutedOrder: undefined,
    scoutedOrders: undefined,
    plannedOrders: undefined,
    announcedBuyers: undefined,
    workshopContracts: undefined,
    renownLevel,
    brokersFavorUsed: false,
    voyageEpoch,
    score: 0,
    currentRound: 1,
    maxRounds: cfg.rounds,
    totalRevenue: 0,
    totalCosts: 0,
    materialCosts: 0,
    totalMaterialCosts: 0,
    totalWorkerWages: 0,
    totalMaintenanceCosts: 0,
    workerWages: 0,
    maintenanceCosts: 0,
    vatPaid: 0,
    roundVatPaid: 0,
    incomeTaxPaid: 0,
    roundIncomeTaxDue: undefined,
    roundRevenue: 0,
    roundCosts: 0,
    workers: emptyWorkerRoster(),
    fixedCost: voyageMaintenance(difficulty, rules.version),
    shipLevel:
      openHarbor({ rulesVersion: rules.version }) ||
      rules.version === REAGENT_RULES
        ? 1
        : 0,
    shipUpgradeCost: [15, 25, 40],
    phase: 0,
    resourceCards: [],
    customerCards: [],
    purchasedCards: [],
    completedOrders: [],
    purchaseCount: 0,
    orderCount: 0,
    helperReputationEarned: 0,
    totalOrdersCompleted: 0,
    gameOver: false,
    modifierFlags: {},
    lastBoonId: null,
    phase2DemandTags: [],
    revealedIntel: [],
    harborPulse: {},
    lastPurchaseTally: undefined,
    tidewatchSurge: false,
    equippedModules: [],
    boonChoices: [],
    boonSwapUsed: false,
    favors: [],
    favorMarks: {},
    pendingFavorSlot: undefined,
    charterId: undefined,
    charterMarks: 0,
    charterMisses: 0,
    charterActsSettled: 0,
    charterComplete: false,
    engines: [],
    heat: 0,
    shadowGold: 0,
    goodsSold: {},
    bestRoundRevenue: 0,
    roundOrderRevenue: 0,
    producedLastRound: {},
    silkShippedThisRound: 0,
    moduleSwapUsed: false,
    pirateAttackResolved: false,
    escortHired: false,
    brokerTippedPirates: false,
    debts: [],
    loansGiven: [],
    defaultedDebt: false,
    insolvency: undefined,
    // Explicitly undefined, not simply omitted: restartGame resets a voyage
    // via Object.assign(state, fresh), which only overwrites keys fresh
    // actually has. An omitted key isn't one of those, so a transient
    // signal left set from the voyage just abandoned (mid module draft,
    // say) would otherwise survive the restart untouched and misread by
    // the new voyage (startModuleDrafting treats a defined
    // _draftChoices as "already rolled" and skips rolling a fresh pool).
    _pendingDocksClaim: undefined,
    docksRewardClaimed: false,
    _draftChoices: undefined,
    _newModule: undefined,
    _pendingDebtSettlements: undefined,
  };
}
