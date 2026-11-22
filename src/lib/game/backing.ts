// Pure shortfall and refund calculations for loan backing.

export type BackingResolution = {
  calledAmount: number;
  refundAmount: number;
};

// Splits a settled loan shortfall between the called pledge and its refund.
export function computeBackingResolution(
  loanAmount: number,
  repaidAmount: number,
  backedAmount: number,
): BackingResolution {
  const shortfall = Math.max(0, loanAmount - repaidAmount);
  const calledAmount = Math.min(shortfall, backedAmount);
  const refundAmount = backedAmount - calledAmount;
  return { calledAmount, refundAmount };
}
