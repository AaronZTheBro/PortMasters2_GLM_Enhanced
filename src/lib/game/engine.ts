// Public game engine exports.

// addOwnedAmount remains internal to engine subsystems.
export {
  getOwnedAmount,
  hasModule,
  maintenanceSurcharge,
  shipUpgradeSurcharge,
  whisperCost,
} from "./engine/core";

// Pricing, taxes, and wages.
export {
  explainCardPrice,
  explainExpectedPrice,
  explainTransportCost,
  getCardFinalCost,
  getHireCost,
  getWorkerWage,
  workerWagesFor,
  quoteDues,
  quoteWages,
  type ExpectedPrice,
  type PriceBreakdown,
} from "./engine/pricing";

// Port market.
export {
  applyTidewatchSurge,
  purchaseCard,
  startPhase1,
} from "./engine/market";

// Trade orders.
export {
  callBrokersFavor,
  claimWordOnTheDocksReward,
  completeOrder,
  purchaseIntel,
} from "./engine/orders";

// Artisans.
export {
  assignTask,
  fireWorker,
  hireWorker,
  payMaintenance,
  payWages,
} from "./engine/workers";

// Boons and ship modules.
export {
  draftBoons,
  finalizeModuleSwap,
  handleModuleSelect,
  selectBoon,
  selectFavor,
  startBoonDrafting,
  startModuleDrafting,
  swapBoonChoices,
  swapModuleChoices,
  upgradeShip,
} from "./engine/boons";

// Reagent rules: Favors, Charters, Bonded Engines, and Heat.
export {
  bribeHeat,
  charterById,
  charterProgress,
  engineRecipe,
  favorRankFor,
  fuseEngine,
  heatRisk,
  selectCharter,
} from "./reagents";

// Pirates and escorts.
export { hireEscort, resolvePirateAttack } from "./engine/pirates";

// Loans, backing, and convoy ventures.
export {
  clearRedirectedLoan,
  grantLoan,
  receiveLoan,
  receiveRepayment,
  repayLoan,
} from "./engine/aid";
export {
  pledgeBacking,
  receiveBackedCoverage,
  receiveBackingOutcome,
} from "./engine/backingState";
// Voyage lifecycle and phase orchestration.
export {
  merchantRatingForScore,
  phaseLabel,
  restartGame,
  showWelcome,
  snapToCheckpoint,
} from "./engine/lifecycle";
