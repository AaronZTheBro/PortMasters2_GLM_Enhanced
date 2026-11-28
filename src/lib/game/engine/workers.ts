// Manages artisan hiring, assignments, production, wages, and maintenance.
import {
  COMMODITIES,
  ICONS,
  WAGES,
  WORKER_TYPES,
  workerType,
  type WorkerTypeId,
} from "../constants";
import type { GameState, Worker } from "../types";
import {
  canProduce,
  unlockedProducts,
  unlockedWorkerTypes,
  voyageRecipe,
} from "../pools";
import { hasEngine } from "../reagents";
import { hasModule, maintenanceSurcharge } from "./core";
import { getHireCost, quoteDues, quoteWages, workerWagesFor } from "./pricing";
import {
  expanded,
  openHarbor,
  classicHarbor,
  harborTrading,
  effectUses,
  REBALANCE,
  rebalanced,
  spendEffect,
  voyageBaseWage,
  reagentRules,
} from "../expansion";

export function hireWorker(state: GameState, type: string, logs: string[]) {
  const def = workerType(type);
  if (!def) return;
  if (
    rebalanced(state) &&
    (state.phase !== "worker_mgmt" ||
      state.currentRound >= state.maxRounds ||
      !unlockedWorkerTypes(
        state.difficulty,
        state.currentRound,
        state.rulesVersion,
      ).some(({ id }) => id === def.id))
  )
    return;
  const list = state.workers[def.id];
  const wage = getHireCost(state, type);
  if (
    state.money <
    wage + (rebalanced(state) ? quoteDues(state).phaseDue : 0)
  ) {
    logs.push("❌ Insufficient funds to hire artisans!");
    return;
  }
  list.push({
    task: null,
    producedCount: 0,
    isSkilled: false,
    hiredRound: state.currentRound,
  });
  logs.push(`${def.icon} Hired a ${def.label}! Due this round: ${wage} Gold`);
}

export function fireWorker(
  state: GameState,
  type: string,
  idx: number,
  logs: string[],
) {
  const list = state.workers[type as WorkerTypeId];
  if (!list) return;
  const wage = voyageBaseWage(WAGES[type], state.rulesVersion);
  const label = workerType(type)?.label ?? type;
  if (idx < 0 || idx >= list.length) return;
  if (state.money < wage) {
    logs.push(`❌ Insufficient funds for ${label}'s severance: ${wage} Gold`);
    return;
  }
  state.money -= wage;
  if (harborTrading(state)) {
    state.roundCosts += wage;
    state.totalCosts += wage;
  }
  const worker = list.splice(idx, 1)[0];
  logs.push(`💔 Dismissed a ${label}. Severance: ${wage} Gold`);
  if (worker.task) logs.push(`  This worker was making: ${worker.task}`);
}

export function quoteRecipe(state: GameState, product: string) {
  const recipe = voyageRecipe(product, state.rulesVersion);
  const inputs = { ...recipe.materials };
  const recipeCap = state.modifierFlags.favor_recipe_cap ?? 2;
  const crew =
    harborTrading(state) &&
    !!state.modifierFlags.resourceful_crew &&
    (state.resourcefulRecipes?.length ?? 0) < recipeCap &&
    !state.resourcefulRecipes?.includes(product);
  const guild =
    expanded(state) &&
    !!state.modifierFlags.guild_turnover &&
    effectUses(state, "guild_turnover") <
      (rebalanced(state) ? REBALANCE.guildUses : 1) &&
    !!workerType(recipe.worker_type)?.tier;
  if (
    (!crew && !guild) ||
    Object.values(inputs).reduce((sum, amount) => sum + amount, 0) <= 1
  )
    return { inputs, saved: undefined, effect: undefined };
  const value = (item: string) =>
    COMMODITIES[item].basePrice[0] + COMMODITIES[item].basePrice[1];
  const saved = Object.keys(inputs).reduce((best, item) =>
    value(item) > value(best) ? item : best,
  );
  if (--inputs[saved] === 0) delete inputs[saved];
  return {
    inputs,
    saved,
    effect: crew ? ("resourceful_crew" as const) : ("guild_turnover" as const),
  };
}

export function assignTask(
  state: GameState,
  type: string,
  task: string,
  logs: string[],
) {
  const list = state.workers[type as WorkerTypeId];
  if (!list || !canProduce(type, task)) return;
  if (
    rebalanced(state) &&
    (state.phase !== "worker_mgmt" ||
      state.currentRound >= state.maxRounds ||
      !unlockedProducts(
        state.difficulty,
        state.currentRound,
        state.rulesVersion,
        state.specialties,
      ).includes(task))
  )
    return;
  const { inputs, saved, effect } = quoteRecipe(state, task);
  for (const worker of list) {
    if (worker.task === null) {
      let can = true;
      for (const [m, a] of Object.entries(inputs))
        if ((state.inventory[m] || 0) < a) {
          can = false;
          break;
        }
      if (!can) {
        // Reports every missing recipe material and quantity.
        const short = Object.entries(inputs)
          .map(([m, a]) => {
            const have = state.inventory[m] || 0;
            return `${ICONS[m]}${m} ${have}/${a}${have < a ? " ⚠️" : ""}`;
          })
          .join(" + ");
        logs.push(`❌ Material shortage to produce ${task}! (Have: ${short})`);
        return;
      }
      for (const [m, a] of Object.entries(inputs)) state.inventory[m] -= a;
      if (saved) {
        if (effect === "resourceful_crew") {
          state.resourcefulRecipes = [
            ...(state.resourcefulRecipes ?? []),
            task,
          ];
          logs.push(
            `${hasEngine(state, "workhouse") ? "The Workhouse" : "Resourceful Crew"} saved one ${saved} on ${task}.`,
          );
        } else {
          spendEffect(state, "guild_turnover");
          logs.push(`Guild Turnover saved one ${saved} on ${task}.`);
        }
      }
      worker.task = task;
      const matTxt = Object.entries(inputs)
        .map(([m, a]) => `${ICONS[m]}${m}×${a}`)
        .join(" + ");
      logs.push(`📋 Assigned: Produce ${ICONS[task]}${task} (Req: ${matTxt})`);
      return;
    }
  }
  logs.push("❌ All artisans are already assigned tasks!");
}

function craftOutput(
  state: GameState,
  worker: Worker,
  eligible: boolean,
  secondEligible = false,
) {
  const inspiration = eligible
    ? (state.modifierFlags.worker_bonus_production ?? 0)
    : 0;
  const workshop = eligible && hasModule(state, "artisans_workshop") ? 1 : 0;
  const second =
    secondEligible && state.modifierFlags.favor_artisan_second ? 1 : 0;
  const total = (worker.isSkilled ? 2 : 1) + inspiration + workshop + second;
  return { total, inspiration, workshop, second };
}

export function productionOutput(state: GameState, worker: Worker) {
  if (!rebalanced(state)) return craftOutput(state, worker, true);
  // Walk the same order as processProduction so the preview matches the
  // first and second assignment bonuses exactly.
  let assignmentIndex = 0;
  for (const { id } of WORKER_TYPES) {
    for (const assigned of state.workers[id] ?? []) {
      if (!assigned.task) continue;
      if (assigned === worker)
        return craftOutput(
          state,
          worker,
          assignmentIndex === 0,
          reagentRules(state) && assignmentIndex === 1,
        );
      assignmentIndex++;
    }
  }
  return craftOutput(state, worker, false);
}

export function processProduction(state: GameState, logs: string[]) {
  const finished = new Set(state.producedRecipes ?? []);
  const producedLastRound: Record<string, number> = {};
  if (reagentRules(state)) state.producedLastRound = producedLastRound;
  let assignmentIndex = 0;
  for (const type of WORKER_TYPES) {
    const name = type.label;
    for (const w of state.workers[type.id] ?? []) {
      if (w.task) {
        finished.add(w.task);
        const { total, inspiration, workshop, second } = craftOutput(
          state,
          w,
          assignmentIndex === 0 || !rebalanced(state),
          reagentRules(state) && assignmentIndex === 1,
        );
        assignmentIndex++;
        state.inventory[w.task] = (state.inventory[w.task] || 0) + total;
        if (reagentRules(state))
          producedLastRound[w.task] = (producedLastRound[w.task] ?? 0) + total;
        w.producedCount = (w.producedCount || 0) + total;
        if (harborTrading(state))
          w.finishedAssignments = (w.finishedAssignments ?? 0) + 1;
        const bonuses = [];
        const workhouse = hasEngine(state, "workhouse");
        if (inspiration)
          bonuses.push(
            `${workhouse ? "The Workhouse" : "Artisan's Inspiration"} +${inspiration}`,
          );
        if (workshop) bonuses.push(`Artisan's Workshop +${workshop}`);
        if (second)
          bonuses.push(
            `${workhouse ? "The Workhouse" : "Attuned Inspiration"} +${second}`,
          );
        const details = bonuses.length ? ` (${bonuses.join(", ")})` : "";
        const title = w.isSkilled ? `Skilled ${name}` : name;
        logs.push(
          `✅ ${title} finished ${total}× ${ICONS[w.task]}${w.task}!${details}`,
        );
        const promoted = classicHarbor(state)
          ? (w.finishedAssignments ?? 0) >= 3
          : openHarbor(state)
            ? (w.finishedAssignments ?? 0) >= 4
            : w.producedCount >= 2;
        if (promoted && !w.isSkilled) {
          w.isSkilled = true;
          logs.push(
            `⭐ ${name} Promotion! Base output is now 2 items per round!`,
          );
        }
        w.task = null;
      }
    }
  }
  state.producedRecipes = Array.from(finished);
}

export function payWages(
  state: GameState,
  logs: string[],
): true | "bankruptcy" {
  // Pays every worker type through the shared roster definition.
  const bills = WORKER_TYPES.map((w) => {
    const count = (state.workers[w.id] ?? []).length;
    return { count, plural: w.plural, due: workerWagesFor(state, w.id) };
  }).filter((b) => b.due > 0);
  const { due: total, discount } = quoteWages(state);
  if (total === 0) {
    if (discount > 0)
      logs.push(`Wage Ledger saved ${discount} Gold on payroll.`);
    return true;
  }
  if (state.money >= total) {
    state.money -= total;
    state.workerWages += total;
    state.totalWorkerWages = (state.totalWorkerWages ?? 0) + total;
    state.roundCosts += total;
    state.totalCosts += total;
    for (const b of bills) {
      logs.push(
        `💰 ${discount > 0 ? "Wages before Wage Ledger" : "Paid wages"} for ${b.count} ${b.plural}: ${b.due} Gold`,
      );
    }
    if (discount > 0) {
      logs.push(`Wage Ledger saved ${discount} Gold on payroll.`);
      logs.push(`💰 Paid wages after Wage Ledger: ${total} Gold`);
    }
    return true;
  }
  logs.push(
    `⚠️ Insufficient funds! Needed: ${total} Gold, Have: ${state.money} Gold`,
  );
  logs.push("💥 Could not pay wages, artisans strike...");
  logs.push("💥 Reputation collapsed, forced bankruptcy!");
  return "bankruptcy";
}

export function payMaintenance(
  state: GameState,
  logs: string[],
): true | "bankruptcy" {
  const cost = state.fixedCost + maintenanceSurcharge(state);
  if (state.money >= cost) {
    state.money -= cost;
    state.maintenanceCosts += cost;
    state.totalMaintenanceCosts = (state.totalMaintenanceCosts ?? 0) + cost;
    state.roundCosts += cost;
    state.totalCosts += cost;
    logs.push(`💸 Paid Ship Maintenance Fee: ${cost} Gold`);
    return true;
  }
  if (state.money > 0) {
    const paid = state.money;
    state.money = 0;
    state.maintenanceCosts += paid;
    state.totalMaintenanceCosts = (state.totalMaintenanceCosts ?? 0) + paid;
    state.roundCosts += paid;
    state.totalCosts += paid;
    logs.push(`⚠️ Forced payment of ${paid} Gold (Needed ${cost} Gold)`);
    logs.push("⚠️ Funds depleted! Cannot continue sailing...");
    return "bankruptcy";
  }
  return "bankruptcy";
}
