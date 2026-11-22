// Shared ownership primitives used across engine subsystems.
import type { GameState } from "../types";

export function hasModule(state: GameState, id: string): boolean {
  return state.equippedModules.some((m) => m.id === id);
}

// Treats Gold and cargo through one ownership interface.
export function getOwnedAmount(state: GameState, item: string): number {
  return item === "Gold" ? state.money : state.inventory[item] || 0;
}

// Ownership mutation remains internal to engine subsystems.
export function addOwnedAmount(state: GameState, item: string, delta: number) {
  if (item === "Gold") state.money += delta;
  else state.inventory[item] = (state.inventory[item] || 0) + delta;
}
