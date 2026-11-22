// Applies local wallet changes for loan backing outcomes.
import { BACKING_REPUTATION_PER_GOLD } from "../constants";
import type { GameState } from "../types";
import { grantHelperReputation } from "./aid";

// Escrows the pledge amount accepted by the server.
export function pledgeBacking(
  state: GameState,
  amount: number,
  logs: string[],
) {
  if (amount <= 0) return;
  if (state.money < amount) {
    logs.push(`❌ Need ${amount} Gold to back that loan, have ${state.money}`);
    return;
  }
  state.money -= amount;
  logs.push(`🛡️ Pledged ${amount} Gold to back a fellow captain's loan`);
}

// Refunds unused backing and rewards a pledge that was not called.
export function receiveBackingOutcome(
  state: GameState,
  refundAmount: number,
  calledAmount: number,
  logs: string[],
) {
  if (refundAmount > 0) state.money += refundAmount;
  if (calledAmount <= 0) {
    const repGain = grantHelperReputation(
      state,
      Math.floor(refundAmount * BACKING_REPUTATION_PER_GOLD),
      logs,
    );
    logs.push(
      repGain > 0
        ? `🛡️ Your backing was never called on. Pledge returned in full: ${refundAmount} Gold. Reputation +${repGain} for the risk paying off.`
        : `🛡️ Your backing was never called on. Pledge returned in full: ${refundAmount} Gold.`,
    );
  } else if (refundAmount > 0) {
    logs.push(
      `🛡️ Your backing partially covered a captain's shortfall: ${calledAmount} Gold spent, ${refundAmount} Gold returned.`,
    );
  } else {
    logs.push(
      `🛡️ Your backing fully covered a captain's shortfall: all ${calledAmount} Gold pledged was spent helping the lender.`,
    );
  }
}

// Credits backing separately from the borrower's repayment.
export function receiveBackedCoverage(
  state: GameState,
  amount: number,
  backerName: string,
  borrowerName: string,
  logs: string[],
) {
  state.money += amount;
  logs.push(
    `🛡️ ${backerName} covered ${amount} Gold of ${borrowerName}'s shortfall as a backer.`,
  );
}
