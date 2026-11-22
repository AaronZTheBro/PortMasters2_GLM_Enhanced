// Converts room purchase totals into bounded price adjustments for each good.
export const PULSE_CAP = 0.12;
export const PULSE_SENSITIVITY = 0.6;

export function computeHarborPulse(
  tally: Record<string, number> | undefined,
): Record<string, number> {
  if (!tally) return {};
  const items = Object.keys(tally);
  const total = items.reduce((sum, k) => sum + tally[k], 0);
  if (total <= 0 || items.length === 0) return {};
  const baseline = 1 / 3; // An even split across Hemp, Silk, and Tea.
  const out: Record<string, number> = {};
  for (const item of items) {
    const share = tally[item] / total;
    const nudge = (share - baseline) * PULSE_SENSITIVITY;
    out[item] = Math.max(-PULSE_CAP, Math.min(PULSE_CAP, nudge));
  }
  return out;
}
