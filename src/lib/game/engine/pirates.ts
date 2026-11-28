// Resolves the mutually exclusive pirate roll and escort choice each round.
import {
  difficultyConfig,
  escortRateFor,
  pirateChanceFor,
} from "../difficulty";
import type { GameState } from "../types";
import { hasModule } from "./core";
import {
  EFFECT,
  raidTerms,
  REBALANCE,
  expanded,
  forecastFor,
  rebalanced,
  harborTrading,
  reagentRules,
  voyageRaidAdjustment,
} from "../expansion";
import { voyageRandom } from "../voyage-rng";
import { hasEngine, heatRisk } from "../reagents";
import { quoteDues } from "./pricing";

// Rolls personal raid risk before settlement costs are charged.
export function quotePirateWaters(state: GameState) {
  // The saved voyage rules set raid severity and the reserve for bills.
  const base = pirateChanceFor(
    state.difficulty,
    state.currentRound,
    state.maxRounds,
  );
  // A broker leak adds its configured risk once.
  const usesExpandedRules = expanded(state);
  const funds = Math.max(0, state.money);
  const leak =
    state.brokerTippedPirates &&
    !(usesExpandedRules && state.modifierFlags.false_colors)
      ? difficultyConfig(state.difficulty).brokerCorruptionRisk
      : 0;
  const updated = rebalanced(state);
  const weather =
    forecastFor(state)?.kind === "seas"
      ? updated
        ? REBALANCE.heavySeas
        : EFFECT.heavySeas
      : 0;
  const harborAdjustment = voyageRaidAdjustment(
    state.rulesVersion,
    state.difficulty,
  );
  // Heat and Quiet Port are allowed to carry risk past the old half ceiling
  // under Reagent rules, up to three quarters.
  const riskCap = reagentRules(state) ? 0.75 : usesExpandedRules ? 0.5 : 1;
  let chance = Math.min(
    riskCap,
    base +
      leak +
      weather +
      harborAdjustment +
      heatRisk(state) +
      (hasEngine(state, "quiet_port") ? 0.04 : 0),
  );
  if (state.modifierFlags.pirate_risk_discount)
    chance *= 1 - state.modifierFlags.pirate_risk_discount;
  if (hasModule(state, "persian_dome_compass")) chance *= 0.7;

  const terms = raidTerms(state.difficulty, state);
  const reservedBills = usesExpandedRules
    ? Math.min(funds, Math.floor(quoteDues(state).total * terms.reserveRate))
    : 0;
  const anchorageFlag = state.modifierFlags.safe_anchorage ?? 0;
  const anchorageProtection = anchorageFlag
    ? anchorageFlag > 1
      ? anchorageFlag
      : updated
        ? REBALANCE.safeAnchorage
        : EFFECT.safeAnchorage
    : 0;
  const protection = usesExpandedRules
    ? anchorageProtection +
      (hasModule(state, "bonded_warehouse")
        ? updated
          ? REBALANCE.warehouse
          : EFFECT.bondedWarehouse
        : 0)
    : 0;
  const reserve = Math.min(funds, reservedBills + protection);
  const exposed = funds - reserve;
  const severity = usesExpandedRules
    ? Math.max(
        0,
        terms.lossRate -
          (hasModule(state, "storm_shrouds")
            ? updated
              ? REBALANCE.shrouds
              : EFFECT.stormShrouds
            : 0),
      )
    : 1;
  const raidLoss = Math.floor(exposed * severity + Number.EPSILON);
  const escortBase = Math.floor(
    (funds - reservedBills) *
      escortRateFor(state.difficulty) *
      (1 -
        (state.modifierFlags.escort_discount ??
          (updated && state.modifierFlags.false_colors ? 0.5 : 0))),
  );
  const anchorageSavings =
    updated && state.modifierFlags.safe_anchorage
      ? Math.min(REBALANCE.anchorageEscort, escortBase)
      : 0;
  const lanternSavings =
    usesExpandedRules && hasModule(state, "storm_lantern")
      ? Math.min(
          escortBase - anchorageSavings,
          updated ? REBALANCE.lantern : EFFECT.stormLantern,
        )
      : 0;
  const stormCharter = hasEngine(state, "storm_charter");
  const stormSurcharge = stormCharter ? escortBase : 0;
  const favorRelief = state.modifierFlags.favor_escort_relief ?? 0;
  const escortCost = Math.max(
    0,
    escortBase +
      stormSurcharge -
      anchorageSavings -
      lanternSavings -
      favorRelief,
  );
  return {
    chance,
    escortCost,
    leak,
    weather,
    reserve,
    reservedBills,
    exposed,
    raidLoss,
    lanternSavings,
    anchorageSavings,
  };
}

export function resolvePirateAttack(state: GameState, logs: string[]) {
  if (state.pirateAttackResolved) return;
  state.pirateAttackResolved = true;
  if (harborTrading(state)) {
    state.directPassageRound = state.currentRound;
    if (
      hasModule(state, "storm_dividend") &&
      state.currentRound < state.maxRounds
    )
      logs.push(
        "Storm Dividend is ready for next round's first ordinary order.",
      );
  }
  const { chance, raidLoss: lost, reserve } = quotePirateWaters(state);
  if (voyageRandom(state, "pirateRaid")() < chance) {
    state.money -= lost;
    logs.push(
      expanded(state)
        ? `🏴‍☠️ Pirates took ${lost} Gold. Protected Gold: ${reserve}.`
        : `🏴‍☠️ Pirates raided your hold! Lost all ${lost} Gold.`,
    );
  } else {
    logs.push("🌊 Clear seas. No pirates sighted this round.");
  }
}

// Buys safety for a share of current Gold before the raid resolves.
export function hireEscort(state: GameState, logs: string[]) {
  if (state.pirateAttackResolved) {
    logs.push("❌ Too late, this round's waters are already resolved");
    return;
  }
  const {
    escortCost: cost,
    lanternSavings,
    anchorageSavings,
  } = quotePirateWaters(state);
  state.money -= cost;
  if (anchorageSavings > 0)
    logs.push(`Safe Anchorage saved ${anchorageSavings} Gold on the escort.`);
  if (lanternSavings > 0)
    logs.push(`Storm Lantern saved ${lanternSavings} Gold on the escort.`);
  state.escortHired = true;
  state.pirateAttackResolved = true;
  if (hasEngine(state, "storm_charter") && harborTrading(state)) {
    state.directPassageRound = state.currentRound;
    if (state.currentRound < state.maxRounds)
      logs.push(
        "⛈️ The Storm Charter sails with the escort. Storm Dividend arms for next round.",
      );
  }
  logs.push(
    `🛡️ Hired an escort for ${cost} Gold. Safe passage guaranteed this round.`,
  );
}
