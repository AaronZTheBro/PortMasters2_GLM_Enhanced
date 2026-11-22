// Manages artisan hiring, assignments, production, wages, and maintenance.
import {
  COMMODITIES,
  ICONS,
  RECIPES,
  WAGES,
  WORKER_TYPES,
  workerType,
  type WorkerTypeId,
} from "../constants";
import type { GameState, Worker } from "../types";
import { canProduce } from "../pools";
import { hasModule, maintenanceSurcharge } from "./core";
import { getHireCost, quoteWages, workerWagesFor } from "./pricing";
import { expanded, effectUses, spendEffect } from "../expansion";

export function hireWorker(state: GameState, type: string, logs: string[]) {
  const def = workerType(type);
  if (!def) return;
  const list = state.workers[def.id];
  const wage = getHireCost(state, type);
  if (state.money < wage) {
    logs.push("❌ Insufficient funds to hire workers!");
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
  const wage = WAGES[type];
  const label = workerType(type)?.label ?? type;
  if (idx < 0 || idx >= list.length) return;
  if (state.money < wage) {
    logs.push(`❌ Insufficient funds for ${label}'s severance: ${wage} Gold`);
    return;
  }
  state.money -= wage;
  const worker = list.splice(idx, 1)[0];
  logs.push(`💔 Dismissed a ${label}. Severance: ${wage} Gold`);
  if (worker.task) logs.push(`  This worker was making: ${worker.task}`);
}

export function quoteRecipe(state: GameState, product: string) {
  const recipe = RECIPES[product];
  const inputs = { ...recipe.materials };
  if (
    !expanded(state) ||
    !state.modifierFlags.guild_turnover ||
    effectUses(state, "guild_turnover") ||
    !workerType(recipe.worker_type)?.tier ||
    Object.values(inputs).reduce((sum, amount) => sum + amount, 0) <= 1
  ) {
    return { inputs, saved: undefined };
  }
  const value = (item: string) =>
    COMMODITIES[item].basePrice[0] + COMMODITIES[item].basePrice[1];
  const saved = Object.keys(inputs).reduce((best, item) =>
    value(item) > value(best) ? item : best,
  );
  if (--inputs[saved] === 0) delete inputs[saved];
  return { inputs, saved };
}

export function assignTask(
  state: GameState,
  type: string,
  task: string,
  logs: string[],
) {
  const list = state.workers[type as WorkerTypeId];
  if (!list || !canProduce(type, task)) return;
  const { inputs, saved } = quoteRecipe(state, task);
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
        spendEffect(state, "guild_turnover");
        logs.push(`Guild Turnover saved one ${saved} on ${task}.`);
      }
      worker.task = task;
      const matTxt = Object.entries(inputs)
        .map(([m, a]) => `${ICONS[m]}${m}×${a}`)
        .join(" + ");
      logs.push(`📋 Assigned: Produce ${ICONS[task]}${task} (Req: ${matTxt})`);
      return;
    }
  }
  logs.push("❌ All workers are already assigned tasks!");
}

export function productionOutput(state: GameState, worker: Worker) {
  const inspiration = state.modifierFlags.worker_bonus_production ?? 0;
  const workshop = hasModule(state, "artisans_workshop") ? 1 : 0;
  const total = (worker.isSkilled ? 2 : 1) + inspiration + workshop;
  return { total, inspiration, workshop };
}

export function processProduction(state: GameState, logs: string[]) {
  const finished = new Set(state.producedRecipes ?? []);
  for (const type of WORKER_TYPES) {
    const name = type.label;
    for (const w of state.workers[type.id] ?? []) {
      if (w.task) {
        finished.add(w.task);
        const { total, inspiration, workshop } = productionOutput(state, w);
        state.inventory[w.task] = (state.inventory[w.task] || 0) + total;
        w.producedCount = (w.producedCount || 0) + total;
        const bonuses = [];
        if (inspiration) bonuses.push(`Artisan's Inspiration +${inspiration}`);
        if (workshop) bonuses.push(`Artisan's Workshop +${workshop}`);
        const details = bonuses.length ? ` (${bonuses.join(", ")})` : "";
        const title = w.isSkilled ? `Skilled ${name}` : name;
        logs.push(
          `✅ ${title} finished ${total}× ${ICONS[w.task]}${w.task}!${details}`,
        );
        if (w.producedCount >= 2 && !w.isSkilled) {
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
  if (total === 0) return true;
  if (state.money >= total) {
    state.money -= total;
    state.workerWages += total;
    state.totalWorkerWages = (state.totalWorkerWages ?? 0) + total;
    state.roundCosts += total;
    state.totalCosts += total;
    for (const b of bills) {
      logs.push(`💰 Paid wages for ${b.count} ${b.plural}: ${b.due} Gold`);
    }
    if (discount > 0)
      logs.push(`Wage Ledger saved ${discount} Gold on payroll.`);
    return true;
  }
  logs.push(
    `⚠️ Insufficient funds! Needed: ${total} Gold, Have: ${state.money} Gold`,
  );
  logs.push("💥 Could not pay wages, workers strike...");
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
