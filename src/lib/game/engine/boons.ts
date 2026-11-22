// Drafts round boons and voyage modules from the current content pool.
import { BOONS, type Boon, type Module } from "../constants";
import { unlockedBoons, unlockedModules } from "../pools";
import { weightedPick } from "../rng";
import type { GameContext, GameState } from "../types";
import { startPhase1 } from "./market";

export function draftBoons(state: GameState): Boon[] {
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
  const available = unlockedBoons(state.difficulty, state.currentRound)
    .map((b) => [b, weightFuncs[b.id]()] as [Boon, number])
    .filter(([, w]) => w > 0);
  const picks: Boon[] = [];
  const pool = [...available];
  for (let i = 0; i < 3; i++) {
    if (!pool.length) break;
    const chosen = weightedPick(Math.random, pool);
    picks.push(chosen);
    pool.splice(
      pool.findIndex((x) => x[0].id === chosen.id),
      1,
    );
  }
  return picks;
}

export function applyBoon(state: GameState, boon: Boon, logs: string[]) {
  state.modifierFlags = boon.modifiers;
  if (boon.modifiers.instant_gold) {
    state.money += boon.modifiers.instant_gold;
    logs.push(`💰 Boon applied: Gained ${boon.modifiers.instant_gold} Gold!`);
  }
}

export function upgradeShip(state: GameState, logs: string[]) {
  if (state.shipLevel >= 3) return;
  const cost =
    state.shipUpgradeCost[state.shipLevel] + state.shipUpgradePenalty;
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

export function equipModule(
  state: GameState,
  mod: Module,
  swapIdx: number | null,
  logs: string[],
) {
  if (swapIdx !== null) {
    const old = state.equippedModules[swapIdx];
    if (old.id === "bulk_hauler") state.shipUpgradePenalty -= 15;
    if (old.id === "overdrive_engine") state.maintenancePenalty -= 10;
    if (old.id === "brokers_network") state.intelCost = 5;
    state.equippedModules[swapIdx] = mod;
    logs.push(`🔄 Swapped ${old.name} for ${mod.name}!`);
  } else {
    if (state.equippedModules.length < state.shipLevel) {
      state.equippedModules.push(mod);
      logs.push(`✅ Installed ${mod.name}!`);
    } else {
      logs.push("❌ No empty slots! Must swap.");
      return;
    }
  }
  if (mod.id === "bulk_hauler") state.shipUpgradePenalty += 15;
  if (mod.id === "overdrive_engine") state.maintenancePenalty += 10;
  if (mod.id === "brokers_network") state.intelCost = 2;
}

export function startBoonDrafting(state: GameState, logs: string[]) {
  state.phase = 5;
  state.boonSwapUsed = false;
  state.moduleSwapUsed = false;
  state._draftChoices = undefined;
  state.boonChoices = draftBoons(state);
  state.pirateAttackResolved = false;
  state.escortHired = false;
  state.brokerTippedPirates = false;
  logs.push("\n🧭=== The Navigator's Compass ===");
  logs.push("Choose a Boon to bend the rules of the upcoming voyage...");
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
  state.boonChoices = draftBoons(state);
  state.boonSwapUsed = true;
  logs.push("🔄 Swapped Boon Choices for 10 Gold");
}

export function selectBoon(
  state: GameState,
  ctx: GameContext,
  boonId: string,
  logs: string[],
) {
  const boon = BOONS.find((b) => b.id === boonId);
  if (!boon) return;
  logs.push(`🧭 Boon Locked In: ${boon.icon} ${boon.name}`);
  applyBoon(state, boon, logs);
  state.boonChoices = [];
  startPhase1(state, ctx, logs);
}

function rollModuleChoices(state: GameState): Module[] {
  const MODULES = unlockedModules(state.difficulty, state.currentRound);
  const available = MODULES.filter(
    (m) => !state.equippedModules.some((eq) => eq.id === m.id),
  );
  const pool = available.length >= 3 ? available : MODULES;
  const picks: Module[] = [];
  const copy = [...pool];
  for (let i = 0; i < 3; i++) {
    if (!copy.length) break;
    const idx = Math.floor(Math.random() * copy.length);
    picks.push(copy.splice(idx, 1)[0]);
  }
  return picks;
}

// Reuses the existing module pool when the draft is reopened.
export function startModuleDrafting(state: GameState) {
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
  state._draftChoices = rollModuleChoices(state);
  state.moduleSwapUsed = true;
  logs.push("🔄 Swapped Module Choices for a fresh batch");
}

export function handleModuleSelect(
  state: GameState,
  idx: number,
  logs: string[],
) {
  const mod = state._draftChoices?.[idx];
  if (!mod) return;
  if (state.equippedModules.length < state.shipLevel) {
    equipModule(state, mod, null, logs);
    // Installed modules leave the pool immediately.
    state._draftChoices = state._draftChoices!.filter((m) => m.id !== mod.id);
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
  if (!mod) return;
  equipModule(state, mod, slotIdx, logs);
  state._draftChoices = (state._draftChoices ?? []).filter(
    (m) => m.id !== mod.id,
  );
  state._newModule = undefined;
  state.phase = 4;
}

// Initializes a joining captain at the room's current checkpoint.
