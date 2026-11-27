export const CLASSIC_RULES = 1;
export const EXPANDED_RULES = 2;
export const REBALANCED_RULES = 3;
export const OPEN_HARBOR_RULES = 4;
export const CLASSIC_HARBOR_RULES = 5;
export const REVISED_HARBOR_RULES = 6;
export const CURRENT_HARBOR_RULES = 7;

export function revisedHarbor(version?: number) {
  return version === REVISED_HARBOR_RULES || version === CURRENT_HARBOR_RULES;
}
