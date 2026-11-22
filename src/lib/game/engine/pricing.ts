// Pure pricing formulas and matching display breakdowns.
import {
  BOONS,
  BROKERS_FAVOR_PAYOUT_CAP,
  COMMODITIES,
  PRODUCT_PRICES,
  RECIPES,
  RESOURCES,
  WAGES,
} from "../constants";
import { isSilkProduct, unlockedPorts } from "../pools";
import type { GameState, OrderCard, ResourceCard, Worker } from "../types";
import { hasModule } from "./core";

type PriceStep = { label: string; delta: number };
export type PriceBreakdown = {
  base: number;
  steps: PriceStep[];
  final: number;
};

export type ExpectedPrice = {
  min: number;
  max: number;
  isProduct: boolean;
  modifiers: string[];
};

// Active boon modifiers identify their display source.
function boonNameForModifierKey(key: string): string {
  return BOONS.find((b) => key in b.modifiers)?.name ?? "Active boon";
}

// Transport.
export function explainTransportCost(
  state: GameState,
  cargo: Pick<OrderCard, "totalItems" | "resources">,
): PriceBreakdown {
  const { totalItems } = cargo;
  const base = totalItems * 2;
  const steps: PriceStep[] = [];
  let cost = base;
  const setCost = (label: string, next: number) => {
    steps.push({ label, delta: next - cost });
    cost = next;
  };

  const shipDiscount = state.shipLevel * 5;
  const boonDiscount = state.modifierFlags.transport_flat_discount ?? 0;
  if (cost < 5) setCost("Base freight minimum", 5);
  if (shipDiscount > 0) {
    setCost(
      `Ship Level ${state.shipLevel} discount`,
      Math.max(5, cost - shipDiscount),
    );
  }
  if (boonDiscount > 0) {
    setCost(
      boonNameForModifierKey("transport_flat_discount"),
      Math.max(5, cost - boonDiscount),
    );
  }
  if (hasModule(state, "bulk_hauler")) {
    setCost("Bulk Hauler Rigging module", Math.max(0, cost - totalItems));
  }
  if (hasModule(state, "overdrive_engine")) {
    setCost("Overdrive Engine module", Math.max(0, cost - 5));
  }

  const count = (predicate: (item: string) => boolean) =>
    cargo.resources.reduce(
      (sum, item) => sum + (predicate(item.type) ? (item.required ?? 0) : 0),
      0,
    );
  const rawSilk = count((item) => item === "Silk");
  const silkProducts = count(isSilkProduct);
  const freeSilk = hasModule(state, "silk_monopoly") ? rawSilk : 0;
  const windSilk = rawSilk - freeSilk + silkProducts;
  const windFactor = state.modifierFlags.transport_silk_discount;
  // Split the remaining freight by cargo quantity. Waived Silk is excluded
  // from the boon so the two discounts never apply to the same units.
  const freightBeforeSilk = cost;
  const withSilkDiscount = (discountedUnits: number) =>
    Math.floor(
      (freightBeforeSilk * (totalItems - discountedUnits)) / totalItems,
    );
  if (freeSilk > 0) {
    setCost("Silk Road Monopoly module", withSilkDiscount(freeSilk));
  }
  if (windSilk > 0 && windFactor) {
    setCost(
      boonNameForModifierKey("transport_silk_discount"),
      withSilkDiscount(freeSilk + windSilk * windFactor),
    );
  }
  if (hasModule(state, "fleet_of_treasures")) {
    const eligible = count(
      (item) => item === "Foreign Balm" || item === "Pearl String",
    );
    if (eligible > 0) {
      setCost("Fleet of Treasures module", Math.max(0, cost - eligible * 3));
    }
  }
  return { base, steps, final: cost };
}

export function recipeMaterialCost(product: string): number {
  return Object.entries(RECIPES[product].materials).reduce(
    (total, [item, amount]) => {
      const [min, max] = COMMODITIES[item].basePrice;
      return total + ((min + max) / 2) * amount;
    },
    0,
  );
}

export function productPurchasePrice(
  product: string,
  materialCost: number,
  roll: number,
) {
  const [min, max] = PRODUCT_PRICES[product];
  const price = Math.floor(materialCost * (1.4 + roll * 0.4));
  return Math.max(min, Math.min(price, max));
}

export function explainVAT(
  state: GameState,
  product: string,
  sellingPrice: number,
) {
  const recipe = RECIPES[product];
  const matCost = recipeMaterialCost(product);
  const workerCost = WAGES[recipe.worker_type];
  const margin = sellingPrice - matCost - workerCost;
  const base = Math.floor(Math.max(0, margin) * 0.05);
  let vat = base;
  const steps: PriceStep[] = [];
  if (vat > 0 && state.modifierFlags.vat_discount) {
    const next = Math.floor(vat * (1 - state.modifierFlags.vat_discount));
    steps.push({
      label: `${boonNameForModifierKey("vat_discount")} (${Math.round(state.modifierFlags.vat_discount * 100)}% reduction)`,
      delta: next - vat,
    });
    vat = next;
  }
  if (vat > 0 && hasModule(state, "tax_evasion")) {
    const next = Math.floor(vat * 0.5);
    steps.push({
      label: "Tax Evasion Ledger module, 50% tax reduction",
      delta: next - vat,
    });
    vat = next;
  }
  return {
    base,
    steps,
    final: vat,
    sellingPrice,
    matCost,
    workerCost,
    margin,
  };
}

export function calcIncomeTax(state: GameState, preTax: number): number {
  if (preTax <= 0) return 0;
  const rate = state.modifierFlags.income_tax_override || 0.1;
  let tax = Math.floor(preTax * rate);
  if (hasModule(state, "smugglers_hold")) tax = Math.floor(tax * 1.2);
  if (hasModule(state, "tax_evasion")) tax = Math.floor(tax * 0.5);
  return tax;
}

// Market card pricing and its interface breakdown.
export function explainCardPrice(
  state: GameState,
  card: Pick<ResourceCard, "totalCost" | "resources">,
): PriceBreakdown {
  const steps: PriceStep[] = [];
  let cost = card.totalCost;

  if (state.modifierFlags.purchase_discount) {
    const next = Math.floor(cost * (1 - state.modifierFlags.purchase_discount));
    steps.push({
      label: `${boonNameForModifierKey("purchase_discount")} (${Math.round(state.modifierFlags.purchase_discount * 100)}% reduction)`,
      delta: next - cost,
    });
    cost = next;
  }
  if (state.modifierFlags.hemp_price_reduction) {
    const reduction = card.resources.reduce(
      (sum, r) =>
        r.type === "Hemp"
          ? sum + r.quantity! * state.modifierFlags.hemp_price_reduction
          : sum,
      0,
    );
    if (reduction > 0) {
      steps.push({
        label: `${boonNameForModifierKey("hemp_price_reduction")} (${state.modifierFlags.hemp_price_reduction} Gold less per Hemp)`,
        delta: -reduction,
      });
      cost -= reduction;
    }
  }
  if (hasModule(state, "kiln_cellar")) {
    const reduction = card.resources.reduce(
      (sum, r) =>
        r.type === "Porcelain Clay" || r.type === "Copper Ore"
          ? sum + (r.quantity ?? 0) * 2
          : sum,
      0,
    );
    if (reduction > 0) {
      steps.push({
        label: "Kiln Cellar module, 2 Gold less per unit",
        delta: -reduction,
      });
      cost -= reduction;
    }
  }
  if (hasModule(state, "foreign_quarter_pass")) {
    const reduction = card.resources.reduce(
      (sum, r) =>
        r.type === "Spices" || r.type === "Pearls"
          ? sum + (r.quantity ?? 0) * 3
          : sum,
      0,
    );
    if (reduction > 0) {
      steps.push({
        label: "Foreign Quarter Pass module, 3 Gold less per unit",
        delta: -reduction,
      });
      cost -= reduction;
    }
  }
  if (hasModule(state, "smugglers_hold")) {
    const next = Math.floor(cost * 0.85);
    steps.push({
      label: "Smuggler's Hold module, 15% reduction",
      delta: next - cost,
    });
    cost = next;
  }

  const final = Math.max(0, cost);
  if (final !== cost)
    steps.push({ label: "Floor at 0 Gold", delta: final - cost });
  return { base: card.totalCost, steps, final };
}

export function getCardFinalCost(state: GameState, card: ResourceCard): number {
  return explainCardPrice(state, card).final;
}

export function portResourcePrice(
  item: string,
  base: number,
  port: string,
  pulse: number,
) {
  const listed = COMMODITIES[item].ports.includes(port) ? base - 1 : base + 1;
  return pulse ? Math.max(1, Math.round(listed * (1 + pulse))) : listed;
}

// Estimates a typical price range independently of a specific market card.
export function explainExpectedPrice(
  state: GameState,
  itemType: string,
): ExpectedPrice {
  const isResource = (RESOURCES as readonly string[]).includes(itemType);
  let min: number;
  let max: number;
  if (isResource) {
    const [baseMin, baseMax] = COMMODITIES[itemType].basePrice;
    const ports = unlockedPorts(state.difficulty, state.currentRound);
    const pulse = state.harborPulse?.[itemType] ?? 0;
    min = Math.min(
      ...ports.map((port) => portResourcePrice(itemType, baseMin, port, pulse)),
    );
    max = Math.max(
      ...ports.map((port) => portResourcePrice(itemType, baseMax, port, pulse)),
    );
  } else {
    const materialCost = recipeMaterialCost(itemType);
    min = productPurchasePrice(itemType, materialCost, 0);
    max = productPurchasePrice(itemType, materialCost, 1 - Number.EPSILON);
  }
  const resources = [{ type: itemType, quantity: 1 }];
  const low = explainCardPrice(state, { totalCost: min, resources });
  const high = explainCardPrice(state, { totalCost: max, resources });

  return {
    min: low.final,
    max: high.final,
    isProduct: !isResource,
    modifiers: low.steps.map((step) => step.label),
  };
}

export function getWorkerWage(
  state: GameState,
  type: string,
  worker?: Pick<Worker, "hiredRound">,
): number {
  let wage = WAGES[type];
  if (
    worker?.hiredRound === state.currentRound &&
    state.modifierFlags.hire_discount
  ) {
    wage = Math.floor(wage * (1 - state.modifierFlags.hire_discount));
  }
  if (hasModule(state, "artisans_workshop")) wage = Math.floor(wage * 1.2);
  return wage;
}

export function getHireCost(state: GameState, type: string): number {
  return getWorkerWage(state, type, { hiredRound: state.currentRound });
}

export function workerWagesFor(
  state: GameState,
  type: keyof GameState["workers"],
): number {
  return (state.workers[type] ?? []).reduce(
    (total, worker) => total + getWorkerWage(state, type, worker),
    0,
  );
}

// A saturating commission keeps Broker favor payouts below the configured cap.
export function brokersFavorCommission(reward: number): number {
  const net =
    BROKERS_FAVOR_PAYOUT_CAP *
    (1 - Math.exp(-reward / BROKERS_FAVOR_PAYOUT_CAP));
  return Math.max(0, reward - Math.floor(net));
}
