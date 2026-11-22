// Applies local wallet changes for convoy ventures.
import type { GameState } from "../types";

// Escrows a contribution after the server accepts it.
export function contributeToVenture(
  state: GameState,
  amount: number,
  logs: string[],
) {
  if (amount <= 0) return;
  if (state.money < amount) {
    logs.push(
      `❌ Need ${amount} Gold to back that Convoy Venture, have ${state.money}`,
    );
    return;
  }
  state.money -= amount;
  logs.push(`⚓ Backed a Convoy Venture with ${amount} Gold`);
}

// Credits the settlement or refund sent for a resolved venture.
export function receiveVentureSettlement(
  state: GameState,
  amount: number,
  logs: string[],
  outcome: "filled" | "failed" | "destroyed",
) {
  state.money += amount;
  logs.push(
    outcome === "filled"
      ? `⚓ Convoy Venture filled! Your share: ${amount} Gold`
      : outcome === "failed"
        ? `⚓ Convoy Venture missed its deadline. Partial refund: ${amount} Gold`
        : `⚓ Convoy Venture cancelled: another venture in the harbor already claimed this voyage's one chance. Full refund: ${amount} Gold`,
  );
}
