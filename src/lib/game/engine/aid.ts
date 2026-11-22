// Applies local wallet and ledger changes for server approved loans.
import { AID_REPUTATION_PER_GOLD, helperReputationCapFor } from "../constants";
import type { GameState } from "../types";

// Credits borrowed Gold and records the debt.
export function receiveLoan(
  state: GameState,
  loan: { id: string; fromUserId: string; fromName: string; amount: number },
  logs: string[],
) {
  state.money += loan.amount;
  state.debts.push({
    id: loan.id,
    counterpartyId: loan.fromUserId,
    counterpartyName: loan.fromName,
    amount: loan.amount,
    roundBorrowed: state.currentRound,
  });
  logs.push(
    `🆘 ${loan.fromName} lent you ${loan.amount} Gold. Repay it before the voyage ends, or it's deducted automatically.`,
  );
}

// Applies the shared lending and backing Reputation cap.
export function grantHelperReputation(
  state: GameState,
  rawGain: number,
  logs: string[],
): number {
  const cap = helperReputationCapFor(state.difficulty);
  const headroom = Math.max(0, cap - state.helperReputationEarned);
  const granted = Math.min(Math.max(1, rawGain), headroom);
  if (granted <= 0) {
    logs.push(
      `🤝 No Reputation this time: you have already earned this voyage's full ${cap} for helping other captains.`,
    );
    return 0;
  }
  state.score += granted;
  state.helperReputationEarned += granted;
  return granted;
}

export function grantLoan(
  state: GameState,
  loan: {
    id: string;
    borrowerId: string;
    borrowerName: string;
    amount: number;
  },
  logs: string[],
) {
  state.money -= loan.amount;
  state.loansGiven.push({
    id: loan.id,
    counterpartyId: loan.borrowerId,
    counterpartyName: loan.borrowerName,
    amount: loan.amount,
    roundBorrowed: state.currentRound,
  });
  const repGain = grantHelperReputation(
    state,
    Math.floor(loan.amount * AID_REPUTATION_PER_GOLD),
    logs,
  );
  if (repGain > 0) {
    logs.push(
      `🤝 Lent ${loan.borrowerName} ${loan.amount} Gold. Reputation +${repGain} for helping a fellow captain.`,
    );
  } else {
    logs.push(`🤝 Lent ${loan.borrowerName} ${loan.amount} Gold.`);
  }
}

// Applies a voluntary repayment and returns the transferred amount.
export function repayLoan(state: GameState, debtId: string, logs: string[]) {
  const debt = state.debts.find((d) => d.id === debtId);
  if (!debt) return;
  if (state.money < debt.amount) {
    logs.push(
      `❌ Need ${debt.amount} Gold to repay ${debt.counterpartyName}, have ${state.money}`,
    );
    return;
  }
  state.money -= debt.amount;
  state.debts = state.debts.filter((d) => d.id !== debtId);
  state._pendingDebtSettlements = [
    ...(state._pendingDebtSettlements ?? []),
    {
      lenderId: debt.counterpartyId,
      lenderName: debt.counterpartyName,
      amount: debt.amount,
      debtId,
    },
  ];
  logs.push(
    `💰 Repayment queued for ${debt.counterpartyName}: ${debt.amount} Gold`,
  );
}

// Credits the lender and closes fully repaid loans.
export function receiveRepayment(
  state: GameState,
  debtId: string,
  amount: number,
  fromName: string,
  logs: string[],
) {
  state.loansGiven = state.loansGiven.filter((l) => l.id !== debtId);
  state.money += amount;
  logs.push(`💰 ${fromName} repaid you ${amount} Gold`);
}

// Removes a redirected loan from the original lender without moving Gold.
export function clearRedirectedLoan(
  state: GameState,
  debtId: string,
  redirectedToName: string,
  logs: string[],
) {
  state.loansGiven = state.loansGiven.filter((l) => l.id !== debtId);
  logs.push(`🤝 Your bequest was paid out to ${redirectedToName}`);
}

// Settles final round debts from available Gold and records any default.
export function settleOutstandingDebts(state: GameState, logs: string[]) {
  if (!state.debts.length) return;
  logs.push("\n📋=== Settling Outstanding Loans ===");
  const settlements: {
    lenderId: string;
    lenderName: string;
    amount: number;
    debtId: string;
  }[] = [];
  for (const debt of state.debts) {
    const paid = Math.min(Math.max(0, state.money), debt.amount);
    state.money -= paid;
    // Zero value settlements still close the loan and resolve its pledge.
    settlements.push({
      lenderId: debt.counterpartyId,
      lenderName: debt.counterpartyName,
      amount: paid,
      debtId: debt.id,
    });
    if (paid < debt.amount) {
      state.defaultedDebt = true;
      logs.push(
        `⚠️ Could not fully repay ${debt.counterpartyName}: paid ${paid} of ${debt.amount} Gold owed`,
      );
    } else {
      logs.push(
        `💰 Settled outstanding loan to ${debt.counterpartyName}: ${paid} Gold`,
      );
    }
  }
  state.debts = [];
  state._pendingDebtSettlements = [
    ...(state._pendingDebtSettlements ?? []),
    ...settlements,
  ];
}
