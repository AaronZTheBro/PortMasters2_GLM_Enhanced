import { expanded } from "./expansion";
import { createRng } from "./rng";
import type { GameState } from "./types";

export function voyageRandom(state: GameState, scope: string) {
  return expanded(state) && state.seatSeed
    ? createRng(
        `${state.seatSeed}:V${state.voyageEpoch}:R${state.currentRound}:${scope}`,
      )
    : Math.random;
}
