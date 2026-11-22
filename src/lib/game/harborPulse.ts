// Converts room purchase totals into bounded price adjustments for each good.
export const PULSE_CAP = 0.12;
export const PULSE_SENSITIVITY = 0.6;

export function computeHarborPulse(
  tally: Record<string, number> | undefined,
  expectedItems?: readonly string[],
): Record<string, number> {
  if (!tally) return {};
  const items = expectedItems ?? Object.keys(tally);
  const total = items.reduce((sum, k) => sum + (tally[k] ?? 0), 0);
  if (total <= 0 || items.length === 0) return {};
  const weight = expectedItems?.reduce(
    (sum, item) => sum + RESOURCE_WEIGHTS[item],
    0,
  );
  const out: Record<string, number> = {};
  for (const item of items) {
    const share = (tally[item] ?? 0) / total;
    const baseline = weight ? RESOURCE_WEIGHTS[item] / weight : 1 / 3;
    const nudge = (share - baseline) * PULSE_SENSITIVITY;
    out[item] = Math.max(-PULSE_CAP, Math.min(PULSE_CAP, nudge));
  }
  return out;
}
import { RESOURCE_WEIGHTS } from "./constants";
