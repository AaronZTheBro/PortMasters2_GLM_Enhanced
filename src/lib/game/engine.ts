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
  brokersFavorCommission,
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
  applyHarborPulse,
  applyTidewatchSurge,
  completePhase1,
  poolsFor,
  purchaseCard,
  startPhase1,
  tallyPurchasesByResource,
  type MarketPools,
} from "./engine/market";

// Trade orders.
export {
  callBrokersFavor,
  claimWordOnTheDocksReward,
  completeOrder,
  purchaseIntel,
  startPhase2,
} from "./engine/orders";

export { completeBarterPhase } from "./engine/barter";

// Artisans.
export {
  assignTask,
  fireWorker,
  hireWorker,
  payMaintenance,
  payWages,
  processProduction,
} from "./engine/workers";

// Boons and ship modules.
export {
  applyBoon,
  draftBoons,
  finalizeModuleSwap,
  handleModuleSelect,
  selectBoon,
  startBoonDrafting,
  startModuleDrafting,
  swapBoonChoices,
  swapModuleChoices,
  upgradeShip,
} from "./engine/boons";

// Pirates and escorts.
export { hireEscort, resolvePirateAttack } from "./engine/pirates";

// Loans, backing, and convoy ventures.
export {
  clearRedirectedLoan,
  grantLoan,
  receiveLoan,
  receiveRepayment,
  repayLoan,
  settleOutstandingDebts,
} from "./engine/aid";
export {
  pledgeBacking,
  receiveBackedCoverage,
  receiveBackingOutcome,
} from "./engine/backingState";
export {
  contributeToVenture,
  receiveVentureSettlement,
} from "./engine/convoyState";

// Voyage lifecycle and phase orchestration.
export {
  completePhase2,
  endGame,
  endRound,
  finishSettlement,
  merchantRatingForScore,
  nextPhase,
  phaseLabel,
  restartGame,
  showWelcome,
  skipUpgrade,
  snapToCheckpoint,
  startPhase3,
} from "./engine/lifecycle";
