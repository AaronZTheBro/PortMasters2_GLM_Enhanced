import type { GameState } from "../types";

export function completeBarterPhase(state: GameState, logs: string[]) {
  logs.push("Bartering ended.");
  state.phase = "worker_mgmt";
}
