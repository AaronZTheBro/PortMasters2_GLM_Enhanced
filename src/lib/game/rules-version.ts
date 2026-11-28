export const CLASSIC_RULES = 1;
export const EXPANDED_RULES = 2;
export const REBALANCED_RULES = 3;
export const OPEN_HARBOR_RULES = 4;
export const CLASSIC_HARBOR_RULES = 5;
export const REVISED_HARBOR_RULES = 6;
export const PRE_TUNING_HARBOR_RULES = 7;
export const TUNED_HARBOR_RULES = 8;
export const REAGENT_RULES = 9;
export const CURRENT_HARBOR_RULES = REAGENT_RULES;

export function revisedHarbor(version?: number) {
  return (
    version === REVISED_HARBOR_RULES ||
    version === PRE_TUNING_HARBOR_RULES ||
    version === TUNED_HARBOR_RULES ||
    version === REAGENT_RULES
  );
}

export function tunedHarbor(version?: number) {
  return version === TUNED_HARBOR_RULES || version === REAGENT_RULES;
}

export function reagentRules(state: { rulesVersion?: number }) {
  return state.rulesVersion === REAGENT_RULES;
}
