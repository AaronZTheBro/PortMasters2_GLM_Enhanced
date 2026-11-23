// Orchestrates voyage phases, checkpoints, settlement, and restarts.
import { formatReputation } from "../../utils";
import { APP_NAME, MERCHANT_RATINGS, type MerchantRating } from "../constants";
import { DEFAULT_DIFFICULTY, type Difficulty } from "../difficulty";
import { rebalanced, type VoyageRules } from "../expansion";
import { tallyPurchasesByResource } from "../harborPulse";
import {
  createInitialGameState,
  type GameContext,
  type GameState,
} from "../types";
import { settleOutstandingDebts } from "./aid";
import { needsStarterModule, selectBoon, startBoonDrafting } from "./boons";
import { completePhase1, startPhase1 } from "./market";
import { startPhase2 } from "./orders";
import { incomeTaxDue } from "./pricing";
import { payMaintenance, payWages, processProduction } from "./workers";

export function displayLedgerLine(line: string) {
  return line
    .replace(
      /^(📈 )?Profit before tax: [-−](\d+ Gold)/,
      "$1Loss before tax: $2",
    )
    .replace(/^(🏆 Final Reputation: )[-−](\d+)/, "$1$2 below zero")
    .replace(
      /^([ \t]*💰 Reward: \d+ Gold · ⚓ Freight: \d+ Gold = 📊 )?Net Proceeds: [-−](\d+ Gold)/,
      "$1Net Cost: $2",
    );
}

export function endRound(state: GameState, logs: string[]) {
  logs.push(`\n📊=== Round ${state.currentRound} Settlement ===`);
  logs.push(`💰 Revenue this round: ${state.roundRevenue} Gold`);
  const totalCost = state.roundCosts;
  logs.push(`💸 Total Cost this round: ${totalCost} Gold`);
  logs.push(`   🔧 Maintenance: ${state.maintenanceCosts} Gold`);
  logs.push(`   📦 Materials: ${state.materialCosts} Gold`);
  logs.push(`   👥 Wages: ${state.workerWages} Gold`);
  const preTax = state.roundRevenue - totalCost;
  logs.push(
    `📈 ${preTax < 0 ? "Loss" : "Profit"} before tax: ${Math.abs(preTax)} Gold`,
  );
  const due = incomeTaxDue(state);
  const tax = Math.min(due, Math.max(0, state.money));
  if (tax > 0) {
    state.money -= tax;
    state.incomeTaxPaid += tax;
    logs.push(`🏛️ Income Tax paid after modifiers: ${tax} Gold`);
  } else if (due === 0) logs.push("🏛️ No Income Tax due");
  if (tax < due)
    logs.push(
      `🏛️ Income Tax was limited by available Gold. Assessed ${due} Gold and collected ${tax} Gold.`,
    );
  state.roundIncomeTaxDue = undefined;
  if (state.roundVatPaid)
    logs.push(`🧾 VAT paid this round: ${state.roundVatPaid} Gold`);
  state.roundVatPaid = 0;

  state.modifierFlags = {};
  state.phase2DemandTags = [];
  state.revealedIntel = [];
  state.roundRevenue = 0;
  state.roundCosts = 0;
  state.maintenanceCosts = 0;
  state.materialCosts = 0;
  state.workerWages = 0;
  state.lastPurchaseTally = {
    round: state.currentRound,
    quantities: tallyPurchasesByResource(state),
  };
  state.currentRound++;
  if (state.currentRound > state.maxRounds) {
    settleOutstandingDebts(state, logs);
    endGame(state, logs);
    return;
  }
  logs.push(`\n🔄=== Preparing for Round ${state.currentRound} ===`);
  state.phase = 0;
  state.purchaseCount = 0;
  state.orderCount = 0;
  state.resourceCards = [];
  state.customerCards = [];
  state.purchasedCards = [];
  state.completedOrders = [];
  startBoonDrafting(state, logs);
}

function completePhase2(state: GameState, logs: string[]) {
  if (state.orderCount === 0) logs.push("⏭️ Trading skipped");
  else logs.push(`✅ Trading ended, completed ${state.orderCount} trades`);
  startPhase3(state, logs);
}

export function startPhase3(state: GameState, logs: string[]) {
  state.phase = 3;
  logs.push("\n👥=== Processing Worker Production ===");
  processProduction(state, logs);
}

// Pays wages and maintenance after the captain has had an opportunity for aid.
export function finishSettlement(state: GameState, logs: string[]) {
  logs.push("\n💰=== Paying Worker Wages ===");
  const wageResult = payWages(state, logs);
  if (wageResult === "bankruptcy") {
    state.insolvency = "wages";
    settleOutstandingDebts(state, logs);
    state.gameOver = true;
    state.phase = "bankruptcy";
    return;
  }
  logs.push(
    `\n🔧=== Round ${state.currentRound} · Phase 3: Ship Maintenance ===`,
  );
  const maintResult = payMaintenance(state, logs);
  if (maintResult === "bankruptcy") {
    state.insolvency = "maintenance";
    settleOutstandingDebts(state, logs);
    state.gameOver = true;
    state.phase = "bankruptcy";
    return;
  }
  startPhase4(state, logs);
}

export function startPhase4(state: GameState, logs: string[]) {
  state.phase = 4;
  if (rebalanced(state)) state.roundIncomeTaxDue = incomeTaxDue(state);
  logs.push(
    `\n🚢=== Round ${state.currentRound} · Phase 4: Shipyard & Modules ===`,
  );
}

function skipUpgrade(state: GameState, logs: string[]) {
  logs.push("⏭️ Skipped Shipyard Actions");
  endRound(state, logs);
}

// Resolves bankruptcy, debt default, or the highest matching rating.
export function merchantRatingForScore(score: number): MerchantRating {
  return (
    MERCHANT_RATINGS.find((r) => score >= r.minScore) ??
    MERCHANT_RATINGS[MERCHANT_RATINGS.length - 1]
  );
}

function endGame(state: GameState, logs: string[]) {
  state.gameOver = true;
  state.phase = "endgame";
  logs.push("\n" + "=".repeat(50));
  logs.push(`🎮 ${APP_NAME} · Game Over!`);
  logs.push(`💰 Final Funds: ${state.money} Gold`);
  logs.push(`🏆 Final Reputation: ${formatReputation(state.score)}`);
  logs.push(`🧾 Total Taxes Paid: ${state.vatPaid + state.incomeTaxPaid} Gold`);
  let rating: string;
  if (state.defaultedDebt) {
    state.insolvency ??= "debt";
    rating = "💥 Bankrupt: Defaulted on a Loan";
  } else {
    const r = merchantRatingForScore(state.score);
    rating = `${r.icon} ${r.label}`;
  }
  logs.push(`📈 Rank: ${rating}`);
  logs.push("=".repeat(50));
}

export function restartGame(
  state: GameState,
  logs: string[],
  startingGoldBonus: number = 0,
  renownLevel: number = 1,
  voyageEpoch: number = 0,
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
  rules?: VoyageRules,
) {
  const fresh = createInitialGameState(
    startingGoldBonus,
    renownLevel,
    voyageEpoch,
    difficulty,
    rules,
  );
  delete state.readyVote;
  delete state.pendingBoonId;
  delete state.barterCursor;
  delete state.processedLoanSettlements;
  Object.assign(state, fresh);
  logs.length = 0;
  showWelcome(state, logs);
}

export function showWelcome(state: GameState, logs: string[]) {
  state.phase = 0;
  logs.push("=".repeat(50));
  logs.push(`⚓ Welcome to ${APP_NAME}!`);
  logs.push("🚢 Sail across ports, build your business empire!");
  logs.push("👥 Hire artisans to craft valuable goods for higher profits!");
  logs.push("=".repeat(50));
}

export function canAdvancePhase(state: GameState) {
  if (state.gameOver) return false;
  if (state.phase === 3) return state.pirateAttackResolved;
  if (state.phase === 5) {
    return (
      !needsStarterModule(state) &&
      state.boonChoices.some((boon) => boon.id === state.pendingBoonId)
    );
  }
  return [1, 2, 4, "barter", "worker_mgmt"].includes(state.phase);
}

export function nextPhase(state: GameState, ctx: GameContext, logs: string[]) {
  if (!canAdvancePhase(state)) return;
  state.readyVote = undefined;
  if (state.phase === 5) {
    const boonId = state.pendingBoonId!;
    state.pendingBoonId = undefined;
    selectBoon(state, ctx, boonId, logs);
  } else if (state.phase === 1) completePhase1(state, logs);
  else if (state.phase === "barter") {
    logs.push("Bartering ended.");
    state.phase = "worker_mgmt";
  } else if (state.phase === "worker_mgmt") startPhase2(state, ctx, logs);
  else if (state.phase === 2) completePhase2(state, logs);
  else if (state.phase === 3) finishSettlement(state, logs);
  else if (state.phase === 4) skipUpgrade(state, logs);
}

export function snapToCheckpoint(
  state: GameState,
  ctx: GameContext,
  round: number,
  phaseStr: string,
  logs: string[],
): void {
  state.currentRound = round;
  switch (phaseStr) {
    case "5":
      startBoonDrafting(state, logs);
      return;
    case "1":
      startPhase1(state, ctx, logs);
      return;
    case "barter":
      state.phase = "barter";
      return;
    case "worker_mgmt":
      state.phase = "worker_mgmt";
      return;
    case "2":
      startPhase2(state, ctx, logs);
      return;
    case "3":
      startPhase3(state, logs);
      return;
    case "4":
      startPhase4(state, logs);
      return;
    default:
      return;
  }
}

// Returns the display label for a local or remote phase snapshot.
export function phaseLabel(state: {
  phase: GameState["phase"];
  currentRound: GameState["currentRound"];
}): string {
  switch (state.phase) {
    case 0:
      return "In Harbor";
    case 5:
      return "Drafting Boon";
    case 1:
      return `R${state.currentRound} · Buying`;
    case "barter":
      return `R${state.currentRound} · Bartering`;
    case "worker_mgmt":
      return `R${state.currentRound} · Crew`;
    case 2:
      return `R${state.currentRound} · Trading`;
    case 3:
      return `R${state.currentRound} · Settling`;
    case 4:
      return `R${state.currentRound} · Shipyard`;
    case "module_draft":
      return "Drafting Module";
    case "module_swap":
      return "Swapping Module";
    case "bankruptcy":
      return "Bankrupt";
    case "endgame":
      return "Voyage Complete";
    default:
      return "Sailing";
  }
}
