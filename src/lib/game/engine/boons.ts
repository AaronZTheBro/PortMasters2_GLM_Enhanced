// Drafts round boons and voyage modules from the current content pool.
import { RECIPES, type Boon, type Module } from "../constants";
import { expanded, forecastFor } from "../expansion";
import { describeForecast } from "../forecast";
import { voyageRandom } from "../voyage-rng";
import { quoteDues } from "./pricing";
import { unlockedBoons, unlockedModules } from "../pools";
import { weightedPick } from "../rng";
import type { GameContext, GameState } from "../types";
import { hasModule, shipUpgradeSurcharge } from "./core";
import { startPhase1 } from "./market";

export function draftBoons(state: GameState, reroll = false): Boon[] {
  const gs = {
    money: state.money,
    inventory: state.inventory,
    weavers: state.workers.weaver ?? [],
    master_weavers: state.workers.master ?? [],
    sachet_makers: state.workers.sachet_maker ?? [],
  };
  const weightFuncs: Record<string, () => number> = {
    silk_wind: () =>
      (gs.inventory["Silk"] || 0) > 2 || gs.master_weavers.length > 0
        ? 2.5
        : 0.8,
    favorable_tides: () => 1.5,
    merchant_charm: () => (gs.money > 40 ? 2.0 : 0.5),
    artisan_inspiration: () =>
      Object.values(state.workers).some((crew) => crew.length > 0) ? 3.0 : 0.0,
    emergency_loan: () => (gs.money < 30 ? 4.0 : 0.2),
    tax_shelter: () => 1.5,
    hemp_monopoly: () =>
      (gs.inventory["Hemp"] || 0) < 5 || gs.weavers.length > 0 ? 2.0 : 1.0,
    master_apprentice: () => 1.5,
    // Tier one weights favor the conditions each boon rewards.
    farsight: () => (gs.money < 40 ? 2.5 : 1.2),
    kiln_and_forge_guild: () =>
      (gs.inventory["Copper Ore"] ?? 0) > 1 ||
      (gs.inventory["Porcelain Clay"] ?? 0) > 1
        ? 2.8
        : 1.0,
    frontier_tariff_relief: () =>
      gs.sachet_makers.length > 0 || gs.master_weavers.length > 0 ? 3.0 : 0.8,
    // Tier two uses the same weighted selection contract.
    exotic_treasures: () =>
      (gs.inventory["Spices"] ?? 0) > 1 || (gs.inventory["Pearls"] ?? 0) > 1
        ? 3.0
        : 1.0,
    deep_sea_escort_pact: () => (gs.money > 60 ? 1.8 : 3.2),
    merchants_converge: () => 1.6,
  };
  const usesExpandedRules = expanded(state);
  const canRescue =
    !state.emergencyLoanUsed && state.money < quoteDues(state).total;
  const available: Array<[Boon, number]> = unlockedBoons(
    state.difficulty,
    state.currentRound,
    state.rulesVersion,
  )
    .filter(
      (boon) => !usesExpandedRules || boon.id !== "emergency_loan" || canRescue,
    )
    .map((boon) => [boon, weightFuncs[boon.id]?.() ?? 1])
    .filter(
      (entry): entry is [Boon, number] =>
        typeof entry[1] === "number" && entry[1] > 0,
    );
  const random = voyageRandom(state, reroll ? "boonReroll" : "boonDraft");
  const picks: Boon[] = [];
  const take = (candidate: Boon) => {
    picks.push(candidate);
    available.splice(
      available.findIndex(([boon]) => boon.id === candidate.id),
      1,
    );
  };
  if (usesExpandedRules) {
    const safe = available.filter(([boon]) =>
      canRescue
        ? boon.id === "emergency_loan"
        : [
            "reliable_buyer",
            "merchant_charm",
            "safe_anchorage",
            "favorable_tides",
          ].includes(boon.id),
    );
    if (safe.length) take(weightedPick(random, safe));
    const hasRecipe = Object.values(state.workers).some(
      (crew) => crew.length > 0,
    );
    const focused = available.filter(([boon]) => {
      if (
        hasRecipe &&
        [
          "artisan_inspiration",
          "guild_turnover",
          "frontier_tariff_relief",
        ].includes(boon.id)
      )
        return true;
      if (boon.id === "ceramic_commission")
        return ["Celadon Ware", "Lacquered Jar"].some(
          (item) => state.inventory[item] > 0,
        );
      if (boon.id === "rare_cargo_charter")
        return ["Frankincense", "Lapis Lazuli"].some(
          (item) => state.inventory[item] >= 2,
        );
      if (boon.id === "silk_wind")
        return (
          state.inventory.Silk > 0 ||
          Object.keys(RECIPES).some(
            (item) => RECIPES[item].materials.Silk && state.inventory[item] > 0,
          )
        );
      return false;
    });
    if (focused.length) take(weightedPick(random, focused));
  }
  while (picks.length < 3 && available.length) {
    take(weightedPick(random, available));
  }
  return picks;
}

export function applyBoon(state: GameState, boon: Boon, logs: string[]) {
  state.lastBoonId = boon.id;
  state.modifierFlags = { ...boon.modifiers };
  if (boon.modifiers.instant_gold) {
    if (expanded(state) && boon.id === "emergency_loan")
      state.emergencyLoanUsed = true;
    state.money += boon.modifiers.instant_gold;
    logs.push(`💰 Boon applied: Gained ${boon.modifiers.instant_gold} Gold!`);
  }
}

export function upgradeShip(state: GameState, logs: string[]) {
  if (state.shipLevel >= 3) return;
  const cost =
    state.shipUpgradeCost[state.shipLevel] + shipUpgradeSurcharge(state);
  if (state.money < cost) {
    logs.push(`❌ Need ${cost} Gold to upgrade the ship`);
    return;
  }
  state.money -= cost;
  state.shipLevel++;
  logs.push(
    `🎉 Ship Upgraded to Level ${state.shipLevel}! +1 Module Slot, +5 Discount`,
  );
}

export function startBoonDrafting(state: GameState, logs: string[]) {
  state.phase = 5;
  state.boonSwapUsed = false;
  state.effectUses = {};
  state.producedRecipes = [];
  state.scoutedOrder = undefined;
  state.moduleSwapUsed = false;
  state._draftChoices = undefined;
  state._newModule = undefined;
  state.boonChoices = draftBoons(state);
  state.pirateAttackResolved = false;
  state.escortHired = false;
  state.brokerTippedPirates = false;
  logs.push("\n🧭=== The Navigator's Compass ===");
  const forecast = forecastFor(state);
  if (forecast) {
    const { title, detail } = describeForecast(forecast);
    logs.push(`${title}: ${detail}`);
  }
  logs.push("Choose a Boon for this round.");
}

// Rerolls the boon pool once per round for 10 Gold.
export function swapBoonChoices(state: GameState, logs: string[]) {
  if (state.boonSwapUsed) {
    logs.push("❌ You've already swapped your boon choices this round");
    return;
  }
  if (state.money < 10) {
    logs.push("❌ Need 10 Gold to swap boon choices");
    return;
  }
  state.money -= 10;
  state.boonChoices = draftBoons(state, true);
  state.boonSwapUsed = true;
  logs.push("🔄 Swapped Boon Choices for 10 Gold");
}

export function selectBoon(
  state: GameState,
  ctx: GameContext,
  boonId: string,
  logs: string[],
) {
  const boon = state.boonChoices.find((b) => b.id === boonId);
  if (state.phase !== 5 || !boon) return;
  logs.push(`🧭 Boon Locked In: ${boon.icon} ${boon.name}`);
  applyBoon(state, boon, logs);
  state.boonChoices = [];
  startPhase1(state, ctx, logs);
}

function rollModuleChoices(state: GameState, reroll = false): Module[] {
  const available = unlockedModules(
    state.difficulty,
    state.currentRound,
    state.rulesVersion,
  ).filter((m) => !hasModule(state, m.id));
  const picks: Module[] = [];
  const random = voyageRandom(state, reroll ? "moduleReroll" : "moduleDraft");
  while (picks.length < 3 && available.length) {
    const idx = Math.floor(random() * available.length);
    picks.push(available.splice(idx, 1)[0]);
  }
  return picks;
}

// Reuses the existing module pool when the draft is reopened.
export function startModuleDrafting(state: GameState) {
  state._newModule = undefined;
  if (state._draftChoices === undefined) {
    state._draftChoices = rollModuleChoices(state);
  }
  state.phase = "module_draft";
}

// Rerolls the module pool once per round at no cost.
export function swapModuleChoices(state: GameState, logs: string[]) {
  if (state.moduleSwapUsed) {
    logs.push("❌ You've already swapped your module choices this round");
    return;
  }
  if (!state._draftChoices?.length) {
    logs.push("❌ Nothing to swap, draft your modules first");
    return;
  }
  state._draftChoices = rollModuleChoices(state, true);
  state.moduleSwapUsed = true;
  logs.push("🔄 Swapped Module Choices for a fresh batch");
}

export function handleModuleSelect(
  state: GameState,
  idx: number,
  logs: string[],
) {
  const choices = state._draftChoices ?? [];
  const mod = choices[idx];
  if (!mod || hasModule(state, mod.id)) return;
  if (state.equippedModules.length < state.shipLevel) {
    state.equippedModules.push(mod);
    logs.push(`✅ Installed ${mod.name}!`);
    state._draftChoices = choices.filter((m) => m.id !== mod.id);
    state.phase = 4;
  } else {
    state._newModule = mod;
    state.phase = "module_swap";
  }
}

// Finalizes a pending module swap after the captain frees a slot.
export function finalizeModuleSwap(
  state: GameState,
  slotIdx: number,
  logs: string[],
) {
  const mod = state._newModule;
  const previous = state.equippedModules[slotIdx];
  if (!mod || !previous || hasModule(state, mod.id)) return;
  state.equippedModules[slotIdx] = mod;
  logs.push(`🔄 Swapped ${previous.name} for ${mod.name}!`);
  state._draftChoices = (state._draftChoices ?? []).filter(
    (m) => m.id !== mod.id,
  );
  state._newModule = undefined;
  state.phase = 4;
}
