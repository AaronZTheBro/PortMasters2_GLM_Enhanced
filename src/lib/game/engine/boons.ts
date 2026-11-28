// Drafts round boons and voyage modules from the current content pool.
import { RECIPES, type Boon, type Module } from "../constants";
import {
  revisedHarbor,
  expanded,
  openHarbor,
  harborTrading,
  forecastFor,
  rebalanced,
  reagentRules,
  SPECIALTIES,
  specialtyOpens,
} from "../expansion";
import {
  addAttunement,
  engineUsesModule,
  favorDraftPool,
  favorDraftWeight,
  favorName,
  favorRankFor,
  favorSlots,
  favorSlotsUsed,
  moduleSlotsUsed,
  refreshFavorModifiers,
} from "../reagents";
import { CERAMICS } from "../harbor-catalog";
import { describeForecast } from "../forecast";
import { voyageRandom } from "../voyage-rng";
import {
  getHireCost,
  incomeTaxDue,
  quoteDues,
  quoteShipUpgrade,
} from "./pricing";
import {
  canProduce,
  isOceanCargo,
  unlockedBoons,
  unlockedModules,
  unlockedProducts,
  unlockedWorkerTypes,
  voyageRecipe,
} from "../pools";
import { weightedPick } from "../rng";
import type { GameContext, GameState } from "../types";
import { hasModule } from "./core";
import { quoteRecipe } from "./workers";
import { startPhase1 } from "./market";

export function draftBoons(state: GameState, reroll = false): Boon[] {
  const { inventory, money, workers } = state;
  const hasArtisan = Object.values(workers).some((crew) => crew.length > 0);
  const weightFuncs: Record<string, () => number> = {
    silk_wind: () =>
      (inventory.Silk || 0) > 2 || workers.master?.length ? 2.5 : 0.8,
    favorable_tides: () => 1.5,
    resourceful_crew: () => (hasArtisan ? 3 : 1.3),
    buyers_festival: () => (inventory.Silk >= 2 ? 3 : 1),
    market_momentum: () =>
      Object.entries(inventory).some(
        ([item, amount]) => RECIPES[item] && amount > 0,
      )
        ? 3
        : 0.8,
    merchant_charm: () => (money > 40 ? 2.0 : 0.5),
    artisan_inspiration: () => (hasArtisan ? 3 : 0),
    emergency_loan: () => (money < 30 ? 4.0 : 0.2),
    tax_shelter: () => 1.5,
    hemp_monopoly: () =>
      (inventory.Hemp || 0) < 5 || workers.weaver?.length ? 2.0 : 1.0,
    master_apprentice: () => 1.5,
    // Tier one weights favor the conditions each boon rewards.
    farsight: () => (money < 40 ? 2.5 : 1.2),
    kiln_and_forge_guild: () =>
      (inventory["Copper Ore"] ?? 0) > 1 ||
      (inventory["Porcelain Clay"] ?? 0) > 1
        ? 2.8
        : 1.0,
    frontier_tariff_relief: () =>
      workers.sachet_maker?.length || workers.master?.length ? 3.0 : 0.8,
    // Tier two uses the same weighted selection contract.
    exotic_treasures: () =>
      (inventory.Spices ?? 0) > 1 || (inventory.Pearls ?? 0) > 1 ? 3.0 : 1.0,
    deep_sea_escort_pact: () => (money > 60 ? 1.8 : 3.2),
    merchants_converge: () => 1.6,
  };
  const usesExpandedRules = expanded(state);
  const updated = rebalanced(state);
  const harbor = harborTrading(state);
  const crewProducts = updated
    ? unlockedProducts(
        state.difficulty,
        state.currentRound,
        state.rulesVersion,
        state.specialties,
      ).filter((item) =>
        Object.entries(state.workers).some(
          ([type, crew]) => crew.length && canProduce(type, item),
        ),
      )
    : [];
  const affordableInputs = (inputs: Record<string, number>) =>
    Object.entries(inputs).every(([good, qty]) => state.inventory[good] >= qty);
  const hasCeramicCargo = () =>
    [...(harbor ? CERAMICS : ["Celadon Ware", "Lacquered Jar"])].some(
      (item) => state.inventory[item] > 0,
    );
  const compatible = (boon: Boon) => {
    if (!updated) return true;
    if (
      revisedHarbor(state.rulesVersion) &&
      ["resourceful_crew", "guild_turnover", "master_apprentice"].includes(
        boon.id,
      )
    ) {
      if (state.currentRound >= state.maxRounds) return false;
      const draft = { ...state, modifierFlags: boon.modifiers };
      const budget = state.money - quoteDues(draft).total;
      return unlockedWorkerTypes(
        state.difficulty,
        state.currentRound,
        state.rulesVersion,
      ).some(({ id, tier }) => {
        if (boon.id === "guild_turnover" && !tier) return false;
        return (
          (boon.id !== "master_apprentice" && state.workers[id].length > 0) ||
          getHireCost(draft, id) <= budget
        );
      });
    }
    if (harbor && boon.id === "resourceful_crew")
      return state.currentRound < state.maxRounds;
    if (harbor && boon.id === "guild_turnover")
      return (
        state.currentRound < state.maxRounds &&
        state.money >= quoteDues(state).total + 6
      );
    if (boon.id === "artisan_inspiration")
      return (
        state.currentRound < state.maxRounds &&
        crewProducts.some((item) =>
          affordableInputs(voyageRecipe(item, state.rulesVersion).materials),
        )
      );
    if (boon.id === "guild_turnover")
      return (
        state.currentRound < state.maxRounds &&
        crewProducts.some((item) => {
          const quote = quoteRecipe(
            { ...state, modifierFlags: boon.modifiers, effectUses: {} },
            item,
          );
          return quote.saved && affordableInputs(quote.inputs);
        })
      );
    if (boon.id === "ceramic_commission") return hasCeramicCargo();
    if (boon.id === "master_apprentice")
      return (
        state.currentRound < state.maxRounds &&
        state.money >= quoteDues(state).total + 8
      );
    return true;
  };
  const canRescue =
    !state.emergencyLoanUsed &&
    state.money < quoteDues(state).total + (harbor ? 8 : 0);
  const available: Array<[Boon, number]> = unlockedBoons(
    state.difficulty,
    state.currentRound,
    state.rulesVersion,
    state.specialties,
  )
    .filter(
      (boon) => !usesExpandedRules || boon.id !== "emergency_loan" || canRescue,
    )
    .filter(compatible)
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
            ...(!updated || harbor ? ["favorable_tides"] : []),
          ].includes(boon.id),
    );
    if (safe.length) take(weightedPick(random, safe));
    const focused = available.filter(([boon]) => {
      if (
        harbor &&
        ["resourceful_crew", "buyers_festival", "market_momentum"].includes(
          boon.id,
        )
      )
        return (weightFuncs[boon.id]?.() ?? 0) >= 3;
      if (
        hasArtisan &&
        [
          "artisan_inspiration",
          "guild_turnover",
          "frontier_tariff_relief",
        ].includes(boon.id)
      )
        return true;
      if (boon.id === "ceramic_commission") return hasCeramicCargo();
      if (boon.id === "rare_cargo_charter" && updated)
        return Object.entries(state.inventory).some(
          ([item, qty]) => qty > 0 && isOceanCargo(item, state.rulesVersion),
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

// The Reagent draft has no safe slot. Every card is a commitment, and a
// duplicate attunes a Favor the captain already owns.
export function draftFavors(state: GameState, reroll = false): Boon[] {
  const available = favorDraftPool(
    state,
    unlockedBoons(
      state.difficulty,
      state.currentRound,
      state.rulesVersion,
      state.specialties,
    ),
  ).map((boon) => [boon, favorDraftWeight(state, boon)] as [Boon, number]);
  const random = voyageRandom(state, reroll ? "favorReroll" : "favorDraft");
  const picks: Boon[] = [];
  while (picks.length < 3 && available.length) {
    const pick = weightedPick(random, available);
    picks.push(pick);
    available.splice(
      available.findIndex(([boon]) => boon.id === pick.id),
      1,
    );
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
  if (
    state.shipLevel >= 3 ||
    (rebalanced(state) && state.currentRound >= state.maxRounds)
  )
    return;
  const { cost, available, taxReserved } = quoteShipUpgrade(state);
  if (available < cost) {
    logs.push(
      taxReserved
        ? `❌ Need ${cost} Gold to upgrade after reserving ${taxReserved} Gold for Income Tax`
        : `❌ Need ${cost} Gold to upgrade the ship`,
    );
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
  state.scoutedOrders = undefined;
  state.plannedOrders = undefined;
  state.moduleSwapUsed = false;
  state._draftChoices = undefined;
  state._newModule = undefined;
  if (harborTrading(state)) {
    state.exchangeSales = {};
    state.finishedSales = [];
    state.resourcefulRecipes = [];
    if (
      (openHarbor(state) || reagentRules(state)) &&
      state.currentRound === 1 &&
      !state.equippedModules.length
    ) {
      state.shipLevel = Math.max(1, state.shipLevel);
      state._draftChoices = rollModuleChoices(state);
    }
  }
  if (reagentRules(state)) {
    state.silkShippedThisRound = 0;
    refreshFavorModifiers(state);
  }
  state.boonChoices = reagentRules(state)
    ? draftFavors(state)
    : draftBoons(state);
  state.pirateAttackResolved = false;
  state.escortHired = false;
  state.brokerTippedPirates = false;
  logs.push("\n🧭=== The Navigator's Compass ===");
  const forecast = forecastFor(state);
  if (forecast) {
    const { title, detail } = describeForecast(forecast, state);
    logs.push(`${title}: ${detail}`);
  }
  if (rebalanced(state))
    state.specialties?.forEach((key, index) => {
      if (specialtyOpens(state.difficulty, index) === state.currentRound)
        logs.push(
          `${SPECIALTIES[key].name} opens this round. Available cargo includes ${SPECIALTIES[key].goods.join(", ")}.`,
        );
    });
  if (reagentRules(state)) {
    logs.push(
      state.charterId
        ? "Choose a Favor. Favors stay on your Rack until you replace them. A duplicate attunes one you own."
        : "Choose a Patron Charter, then choose a Favor for your Rack.",
    );
  } else {
    logs.push("Choose a Boon for this round.");
  }
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
  state.boonChoices = reagentRules(state)
    ? draftFavors(state, true)
    : draftBoons(state, true);
  state.boonSwapUsed = true;
  logs.push(
    reagentRules(state)
      ? "🔄 Swapped Favor Choices for 10 Gold"
      : "🔄 Swapped Boon Choices for 10 Gold",
  );
}

export function selectFavor(
  state: GameState,
  ctx: GameContext,
  favorId: string,
  logs: string[],
) {
  const boon = state.boonChoices.find((b) => b.id === favorId);
  if (state.phase !== 5 || !boon || needsStarterModule(state)) return;
  if (!state.charterId) {
    logs.push("Choose a Patron Charter before locking a Favor.");
    return;
  }
  const owned = (state.favors ?? []).indexOf(favorId);
  if (owned >= 0) {
    const before = favorRankFor(state, favorId);
    addAttunement(state, favorId, 2);
    const after = favorRankFor(state, favorId);
    logs.push(
      after > before
        ? `✨ ${boon.icon} ${boon.name} attunes to rank ${after}.`
        : `✨ ${boon.icon} ${boon.name} gains two attunement marks.`,
    );
  } else {
    const used = favorSlotsUsed(state);
    const slots = favorSlots(state);
    if (used < slots) {
      state.favors = [...(state.favors ?? []), favorId];
      addAttunement(state, favorId, 1);
      logs.push(`🧭 Favor gained: ${boon.icon} ${boon.name}.`);
    } else {
      const slot = state.pendingFavorSlot;
      const replaces = (state.favors ?? [])[slot ?? -1];
      if (slot === undefined || !replaces) {
        logs.push("Your Favor Rack is full. Choose a Favor to replace.");
        return;
      }
      state.favors = (state.favors ?? []).map((id, index) =>
        index === slot ? favorId : id,
      );
      // Marks belong to a place on the Rack. A Favor that leaves starts over
      // if the draft offers it again.
      delete state.favorMarks?.[replaces];
      addAttunement(state, favorId, 1);
      logs.push(
        `🧭 ${favorName(replaces)} makes way. ${boon.icon} ${boon.name} joins the rack.`,
      );
    }
  }
  state.lastBoonId = favorId;
  refreshFavorModifiers(state);
  state.pendingFavorSlot = undefined;
  state.boonChoices = [];
  state._draftChoices = undefined;
  startPhase1(state, ctx, logs);
}

export function selectBoon(
  state: GameState,
  ctx: GameContext,
  boonId: string,
  logs: string[],
) {
  if (reagentRules(state)) {
    selectFavor(state, ctx, boonId, logs);
    return;
  }
  const boon = state.boonChoices.find((b) => b.id === boonId);
  if (state.phase !== 5 || !boon || needsStarterModule(state)) return;
  if (openHarbor(state) && state.currentRound === 1)
    state._draftChoices = undefined;
  logs.push(`🧭 Boon Locked In: ${boon.icon} ${boon.name}`);
  applyBoon(state, boon, logs);
  state.boonChoices = [];
  startPhase1(state, ctx, logs);
}

export function needsStarterModule(state: GameState) {
  return (
    (openHarbor(state) || reagentRules(state)) &&
    state.phase === 5 &&
    state.currentRound === 1 &&
    !state.equippedModules.length &&
    Boolean(state._draftChoices?.length)
  );
}

export function selectStarterModule(
  state: GameState,
  moduleId: string,
  logs: string[],
) {
  if (!needsStarterModule(state)) return;
  const choice = state._draftChoices?.find(({ id }) => id === moduleId);
  if (!choice) return;
  state.equippedModules.push(choice);
  state._draftChoices = undefined;
  logs.push(`Installed starting module ${choice.name}.`);
}

function rollModuleChoices(state: GameState, reroll = false): Module[] {
  const available = unlockedModules(
    state.difficulty,
    state.currentRound,
    state.rulesVersion,
    state.specialties,
  ).filter(({ id }) => {
    if (hasModule(state, id) || engineUsesModule(state, id)) return false;
    if (
      !revisedHarbor(state.rulesVersion) ||
      state.currentRound + 1 !== state.maxRounds
    )
      return true;
    if (id === "traveling_commission")
      return state.travelingCommissionRound === state.maxRounds;
    if (id === "collectors_seal")
      return Boolean(state.ceramicCollection?.length);
    if (id === "storm_dividend")
      return state.directPassageRound === state.currentRound;
    return !["artisans_workshop", "wage_ledger", "signal_lantern"].includes(id);
  });
  const picks: Module[] = [];
  const random = voyageRandom(state, reroll ? "moduleReroll" : "moduleDraft");
  if (harborTrading(state)) {
    const relevant = available.filter(
      ({ id }) =>
        (state.inventory.Silk >= 3 &&
          ["silk_monopoly", "silk_market_charter"].includes(id)) ||
        (state.inventory.Hemp >= 3 &&
          ["artisans_workshop", "wage_ledger", "open_hold"].includes(id)) ||
        (state.difficulty === "monsoon" &&
          ["storm_dividend", "storm_shrouds", "persian_dome_compass"].includes(
            id,
          )) ||
        (state.money < 60 &&
          ["cargo_net", "brokers_network", "merchant_scales"].includes(id)),
    );
    if (relevant.length) {
      const choice = weightedPick(
        random,
        relevant.map((module) => [module, 1]),
      );
      picks.push(choice);
      available.splice(available.indexOf(choice), 1);
    }
  } else if (rebalanced(state)) {
    const broad = available.filter(({ id }) =>
      [
        "cargo_net",
        "merchant_scales",
        "convoy_pennant",
        "smugglers_hold",
        "brokers_network",
        "bulk_hauler",
        "salvage_crane",
        "overdrive_engine",
      ].includes(id),
    );
    if (broad.length) {
      const choice = broad[Math.floor(random() * broad.length)];
      picks.push(choice);
      available.splice(available.indexOf(choice), 1);
    }
  }
  while (picks.length < 3 && available.length) {
    const idx = Math.floor(random() * available.length);
    picks.push(available.splice(idx, 1)[0]);
  }
  return picks;
}

// Reuses the existing module pool when the draft is reopened.
export function startModuleDrafting(state: GameState) {
  if (
    harborTrading(state) &&
    ((state.phase !== 4 && state.phase !== "module_swap") ||
      state._draftChoices?.length === 0)
  )
    return;
  if (
    rebalanced(state) &&
    (state.shipLevel === 0 || state.currentRound >= state.maxRounds)
  )
    return;
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
  logs.push("🔄 Redrew Module Choices");
}

export function handleModuleSelect(
  state: GameState,
  idx: number,
  logs: string[],
) {
  const choices = state._draftChoices ?? [];
  const mod = choices[idx];
  if (!mod || hasModule(state, mod.id) || engineUsesModule(state, mod.id))
    return;
  const used = reagentRules(state)
    ? moduleSlotsUsed(state)
    : state.equippedModules.length;
  if (used < state.shipLevel) {
    if (rebalanced(state)) state.roundIncomeTaxDue ??= incomeTaxDue(state);
    state.equippedModules.push(mod);
    logs.push(`✅ Installed ${mod.name}!`);
    state._draftChoices = harborTrading(state)
      ? []
      : choices.filter((m) => m.id !== mod.id);
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
  if (
    !mod ||
    !previous ||
    hasModule(state, mod.id) ||
    engineUsesModule(state, mod.id)
  )
    return;
  if (rebalanced(state)) state.roundIncomeTaxDue ??= incomeTaxDue(state);
  state.equippedModules[slotIdx] = mod;
  logs.push(`🔄 Swapped ${previous.name} for ${mod.name}!`);
  state._draftChoices = harborTrading(state)
    ? []
    : (state._draftChoices ?? []).filter((m) => m.id !== mod.id);
  state._newModule = undefined;
  state.phase = 4;
}
