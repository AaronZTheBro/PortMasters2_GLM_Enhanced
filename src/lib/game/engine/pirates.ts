// Resolves the mutually exclusive pirate roll and escort choice each round.
import {
  difficultyConfig,
  escortRateFor,
  pirateChanceFor,
} from "../difficulty";
import type { GameState } from "../types";
import { hasModule } from "./core";

// Rolls personal raid risk before settlement costs are charged.
export function quotePirateWaters(state: GameState) {
  // Difficulty controls the raid chance while severity remains total loss.
  const base = pirateChanceFor(
    state.difficulty,
    state.currentRound,
    state.maxRounds,
  );
  // A broker leak adds its configured risk once.
  const leak = state.brokerTippedPirates
    ? difficultyConfig(state.difficulty).brokerCorruptionRisk
    : 0;
  let chance = Math.min(1, base + leak);
  if (state.modifierFlags.pirate_risk_discount)
    chance *= 1 - state.modifierFlags.pirate_risk_discount;
  if (hasModule(state, "persian_dome_compass")) chance *= 0.7;
  const rate = escortRateFor(state.difficulty);
  const escortCost = Math.floor(
    Math.max(0, state.money) *
      rate *
      (1 - (state.modifierFlags.escort_discount ?? 0)),
  );
  return { chance, escortCost, leak };
}

export function resolvePirateAttack(state: GameState, logs: string[]) {
  if (state.pirateAttackResolved) return;
  state.pirateAttackResolved = true;
  if (Math.random() < quotePirateWaters(state).chance) {
    const lost = Math.max(0, state.money);
    state.money -= lost;
    logs.push(`🏴‍☠️ Pirates raided your hold! Lost all ${lost} Gold.`);
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
  const { escortCost: cost } = quotePirateWaters(state);
  state.money -= cost;
  state.escortHired = true;
  state.pirateAttackResolved = true;
  logs.push(
    `🛡️ Hired an escort for ${cost} Gold. Safe passage guaranteed this round.`,
  );
}
