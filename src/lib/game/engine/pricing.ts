// Pure pricing formulas and matching display breakdowns.
import {
  BOONS,
  BROKERS_FAVOR_PAYOUT_CAP,
  COMMODITIES,
  RESOURCES,
  WAGES,
  WORKER_TYPES,
} from "../constants";
import {
  isSilkProduct,
  unlockedPorts,
  voyageRecipe,
  productPriceRange,
} from "../pools";
import type { GameState, OrderCard, ResourceCard, Worker } from "../types";
import { hasModule, maintenanceSurcharge, shipUpgradeSurcharge } from "./core";
import { engineUpkeepTotal, hasEngine } from "../reagents";
import {
  EFFECT,
  REBALANCE,
  rebalanced,
  openHarbor,
  classicHarbor,
  harborTrading,
  harborArrival,
  type VoyageRules,
  voyageBaseWage,
  expanded,
  effectUses,
  forecastFor,
  isOceanMaterial,
  reagentRules,
} from "../expansion";

type PriceStep = { label: string; delta: number; effect?: string };
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
  cargo: Pick<
    OrderCard,
    "totalItems" | "resources" | "isMandate" | "isBrokerFavor" | "clearance"
  > &
    Partial<Pick<OrderCard, "buyer" | "demandPort">>,
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
  const ordinary = !cargo.isMandate && !cargo.isBrokerFavor && !cargo.clearance;
  if (boonDiscount > 0 && (!rebalanced(state) || ordinary)) {
    setCost(
      boonNameForModifierKey("transport_flat_discount"),
      Math.max(rebalanced(state) ? 0 : 5, cost - boonDiscount),
    );
  }
  if (hasModule(state, "bulk_hauler")) {
    setCost("Bulk Hauler Rigging module", Math.max(0, cost - totalItems));
  }
  if (hasModule(state, "overdrive_engine")) {
    setCost(
      "Overdrive Engine module",
      Math.max(0, cost - (harborTrading(state) ? 7 : 5)),
    );
  }

  const count = (predicate: (item: string) => boolean) =>
    cargo.resources.reduce(
      (sum, item) => sum + (predicate(item.type) ? (item.required ?? 0) : 0),
      0,
    );
  const rawSilk = count((item) => item === "Silk");
  const silkProducts = count(isSilkProduct);
  const freeSilk =
    hasModule(state, "silk_monopoly") || hasEngine(state, "silk_reel")
      ? rawSilk
      : 0;
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
    setCost(
      hasEngine(state, "silk_reel")
        ? "The Silk Reel"
        : "Silk Road Monopoly module",
      withSilkDiscount(freeSilk),
    );
  }
  if (windSilk > 0 && windFactor) {
    setCost(
      boonNameForModifierKey("transport_silk_discount"),
      withSilkDiscount(freeSilk + windSilk * windFactor),
    );
  }
  if (windSilk > 0 && state.modifierFlags.favor_silk_freight) {
    setCost(
      "Silk Winds rank 2",
      Math.max(0, cost - state.modifierFlags.favor_silk_freight),
    );
  }
  if (ordinary && state.modifierFlags.favor_freight_relief) {
    setCost(
      "Merchant's Charm rank 2",
      Math.max(0, cost - state.modifierFlags.favor_freight_relief),
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
  if (rebalanced(state) && ordinary) {
    if (hasModule(state, "cargo_net"))
      setCost("Cargo Net", Math.max(0, cost - REBALANCE.cargoNet));
    if (
      hasModule(state, "convoy_pennant") &&
      !effectUses(state, "convoy_pennant")
    )
      cost = applyDiscount(
        steps,
        cost,
        "Convoy Pennant",
        REBALANCE.convoyFreight,
        "convoy_pennant",
      );
  } else if (!rebalanced(state) && expanded(state) && ordinary) {
    const rawCount = new Set(
      cargo.resources
        .filter(({ type }) => type in COMMODITIES)
        .map(({ type }) => type),
    ).size;
    if (
      hasModule(state, "cargo_net") &&
      rawCount >= 2 &&
      !effectUses(state, "cargo_net")
    ) {
      cost = applyDiscount(
        steps,
        cost,
        "Cargo Net",
        EFFECT.cargoNet,
        "cargo_net",
      );
    }
    if (
      hasModule(state, "convoy_pennant") &&
      forecastFor(state) &&
      !effectUses(state, "convoy_pennant")
    ) {
      cost = applyDiscount(
        steps,
        cost,
        "Convoy Pennant",
        EFFECT.convoyPennant,
        "convoy_pennant",
      );
    }
  }
  if (
    classicHarbor(state) &&
    ordinary &&
    state.currentRound > 1 &&
    (cargo.buyer === "merchant" || cargo.buyer === "mixed") &&
    cargo.demandPort === harborArrival(state) &&
    cost > 0
  )
    setCost("Local delivery", Math.max(0, cost - 3));
  return { base, steps, final: cost };
}

export function recipeMaterialCost(
  product: string,
  version?: VoyageRules["version"],
): number {
  return Object.entries(voyageRecipe(product, version).materials).reduce(
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
  state: { rulesVersion?: number } = {},
) {
  const [min, max] = productPriceRange(product, state.rulesVersion);
  const price = Math.floor(materialCost * (1.4 + roll * 0.4));
  if (openHarbor(state)) return Math.round((min + max) * (0.43 + roll * 0.12));
  return rebalanced(state) && !classicHarbor(state)
    ? Math.max(price, Math.ceil((min + max) * 0.6))
    : Math.max(min, Math.min(price, max));
}

export function explainVAT(
  state: GameState,
  product: string,
  sellingPrice: number,
) {
  const recipe = voyageRecipe(product, state.rulesVersion);
  const matCost = recipeMaterialCost(product, state.rulesVersion);
  const workerCost = voyageBaseWage(
    WAGES[recipe.worker_type],
    state.rulesVersion,
  );
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

function calcIncomeTax(state: GameState, preTax: number): number {
  if (preTax <= 0) return 0;
  const rate = harborTrading(state)
    ? (state.modifierFlags.income_tax_override ?? 0.1)
    : state.modifierFlags.income_tax_override || 0.1;
  let tax = Math.floor(preTax * rate);
  if (hasModule(state, "smugglers_hold")) tax = Math.floor(tax * 1.2);
  if (hasModule(state, "tax_evasion")) tax = Math.floor(tax * 0.5);
  return tax;
}

export function incomeTaxDue(state: GameState) {
  // Engine upkeep is charged at settlement. The saved tax quote is taken in
  // the Shipyard before that charge, so project it into the taxable profit.
  // Once part of it has been paid, only the remaining upkeep is still missing
  // from the tracked costs.
  const projectedUpkeep = Math.max(
    0,
    engineUpkeepTotal(state) - (state.engineUpkeepCosts ?? 0),
  );
  return (
    state.roundIncomeTaxDue ??
    calcIncomeTax(
      state,
      state.roundRevenue - state.roundCosts - projectedUpkeep,
    )
  );
}

export function taxReserve(state: GameState) {
  return rebalanced(state) &&
    (state.phase === 4 ||
      state.phase === "module_draft" ||
      state.phase === "module_swap")
    ? Math.min(Math.max(0, state.money), incomeTaxDue(state))
    : 0;
}

export function quoteShipUpgrade(state: GameState) {
  const base = state.shipUpgradeCost[state.shipLevel] ?? 0;
  const surcharge = shipUpgradeSurcharge(state);
  const cost = base + surcharge;
  const taxReserved = taxReserve(state);
  return {
    base,
    surcharge,
    cost,
    taxReserved,
    available: state.money - taxReserved,
  };
}

function applyDiscount(
  steps: PriceStep[],
  cost: number,
  label: string,
  amount: number,
  effect?: string,
) {
  const savings = Math.min(cost, amount);
  if (savings > 0 || effect)
    steps.push({ label, delta: -savings, ...(effect ? { effect } : {}) });
  return cost - savings;
}

// Market card pricing and its interface breakdown.
export function explainCardPrice(
  state: GameState,
  card: Pick<ResourceCard, "totalCost" | "resources"> &
    Partial<Pick<ResourceCard, "port">>,
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
    cost = applyDiscount(
      steps,
      cost,
      `${boonNameForModifierKey("hemp_price_reduction")} (${state.modifierFlags.hemp_price_reduction} Gold less per Hemp)`,
      reduction,
    );
  }
  if (hasModule(state, "kiln_cellar")) {
    const reduction = card.resources.reduce(
      (sum, { type, quantity }) =>
        sum +
        (type === "Porcelain Clay" ||
        type === "Copper Ore" ||
        (harborTrading(state) && type === "Tin")
          ? (quantity ?? 0) * 2
          : 0),
      0,
    );
    cost = applyDiscount(
      steps,
      cost,
      "Kiln Cellar module, 2 Gold less per unit",
      reduction,
    );
  }
  if (hasModule(state, "foreign_quarter_pass")) {
    const reduction = card.resources.reduce(
      (sum, { type, quantity }) =>
        sum +
        (type === "Spices" ||
        type === "Pearls" ||
        (harborTrading(state) && type === "Sandalwood")
          ? (quantity ?? 0) * 3
          : 0),
      0,
    );
    cost = applyDiscount(
      steps,
      cost,
      "Foreign Quarter Pass module, 3 Gold less per unit",
      reduction,
    );
  }
  if (
    (hasModule(state, "smugglers_hold") ||
      hasEngine(state, "false_manifest")) &&
    cost > 0
  ) {
    const next = Math.floor(cost * 0.85);
    steps.push({
      label: hasModule(state, "smugglers_hold")
        ? "Smuggler's Hold module, 15% reduction"
        : "The False Manifest, 15% reduction",
      delta: next - cost,
    });
    cost = next;
  }

  if (rebalanced(state)) {
    const units = (matches: (item: string) => boolean) =>
      card.resources.reduce(
        (sum, { type, quantity }) =>
          sum + (matches(type) ? (quantity ?? 0) : 0),
        0,
      );
    const capped = (
      key: string,
      label: string,
      discount: number,
      limit: number,
    ) => {
      const available = Math.min(discount, limit - effectUses(state, key));
      if (available > 0)
        cost = applyDiscount(steps, cost, label, available, key);
    };
    if (state.modifierFlags.bamboo_fair)
      capped(
        "bamboo_fair",
        "Bamboo Fair",
        units((item) => item === "Bamboo") * REBALANCE.bambooUnit,
        REBALANCE.bambooCap,
      );
    if (state.modifierFlags.deep_market)
      capped(
        "deep_market",
        "Deep Market",
        units(isOceanMaterial) * REBALANCE.deepUnit,
        REBALANCE.deepCap,
      );
    if (hasModule(state, "merchant_scales") && card.port)
      capped(
        "merchant_scales",
        "Merchant Scales",
        units(
          (item) => COMMODITIES[item]?.ports.includes(card.port!) ?? false,
        ) * REBALANCE.scalesUnit,
        REBALANCE.scalesCap,
      );
  } else if (expanded(state)) {
    if (
      state.modifierFlags.bamboo_fair &&
      !effectUses(state, "bamboo_fair") &&
      card.resources.some(({ type }) => type === "Bamboo")
    ) {
      cost = applyDiscount(
        steps,
        cost,
        "Bamboo Fair",
        EFFECT.bambooFair,
        "bamboo_fair",
      );
    }
    if (
      state.modifierFlags.deep_market &&
      effectUses(state, "deep_market") < 2 &&
      card.resources.some(({ type }) => isOceanMaterial(type))
    ) {
      cost = applyDiscount(
        steps,
        cost,
        "Deep Market",
        EFFECT.deepMarket,
        "deep_market",
      );
    }
    if (
      card.port &&
      hasModule(state, "merchant_scales") &&
      !effectUses(state, "merchant_scales") &&
      card.resources.some(({ type }) =>
        COMMODITIES[type]?.ports.includes(card.port!),
      )
    ) {
      cost = applyDiscount(
        steps,
        cost,
        "Merchant Scales",
        EFFECT.merchantScales,
        "merchant_scales",
      );
    }
  }
  if (reagentRules(state) && cost < card.totalCost) {
    const units = card.resources.reduce(
      (sum, { quantity }) => sum + Math.max(1, quantity ?? 1),
      0,
    );
    const rail = Math.max(units, Math.ceil(card.totalCost * 0.4));
    if (cost < rail) {
      steps.push({
        label: "Discount rail, 60% cap and 1 Gold per unit",
        delta: rail - cost,
      });
      cost = rail;
    }
  }
  return { base: card.totalCost, steps, final: cost };
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

export function marketResourceAdjustment(state: GameState, item: string) {
  const pulse = state.harborPulse?.[item] ?? 0;
  if (!expanded(state)) return pulse;
  const forecast = forecastFor(state);
  if (harborTrading(state) && forecast?.item === item) {
    const delta = { market: -0.15, shortfall: 0.22, fleet: -0.08 };
    const change =
      forecast.kind in delta ? delta[forecast.kind as keyof typeof delta] : 0;
    return Math.max(-0.22, Math.min(0.25, pulse + change));
  }
  const change =
    forecast?.kind === "market" && forecast.item === item
      ? -(rebalanced(state) ? REBALANCE.marketDay : EFFECT.marketDay)
      : 0;
  return Math.max(-0.15, Math.min(0.15, pulse + change));
}

// Estimates a typical price range independently of a specific market card.
export function explainExpectedPrice(
  state: GameState,
  itemType: string,
): ExpectedPrice {
  const isResource = (RESOURCES as readonly string[]).includes(itemType);
  const resources = [{ type: itemType, quantity: 1 }];
  let lows: PriceBreakdown[];
  let highs: PriceBreakdown[];
  if (isResource) {
    const [min, max] = COMMODITIES[itemType].basePrice;
    const pulse = marketResourceAdjustment(state, itemType);
    const ports = unlockedPorts(
      state.difficulty,
      state.currentRound,
      state.rulesVersion,
    );
    lows = ports.map((port) =>
      explainCardPrice(state, {
        totalCost: portResourcePrice(itemType, min, port, pulse),
        resources,
        port,
      }),
    );
    highs = ports.map((port) =>
      explainCardPrice(state, {
        totalCost: portResourcePrice(itemType, max, port, pulse),
        resources,
        port,
      }),
    );
  } else {
    const materialCost = recipeMaterialCost(itemType, state.rulesVersion);
    lows = [
      explainCardPrice(state, {
        totalCost: productPurchasePrice(itemType, materialCost, 0, state),
        resources,
      }),
    ];
    highs = [
      explainCardPrice(state, {
        totalCost: productPurchasePrice(
          itemType,
          materialCost,
          1 - Number.EPSILON,
          state,
        ),
        resources,
      }),
    ];
  }
  return {
    min: Math.min(...lows.map((quote) => quote.final)),
    max: Math.max(...highs.map((quote) => quote.final)),
    isProduct: !isResource,
    modifiers: Array.from(
      new Set(lows.flatMap(({ steps }) => steps.map(({ label }) => label))),
    ),
  };
}

export function getWorkerWage(
  state: GameState,
  type: string,
  worker?: Pick<Worker, "hiredRound">,
): number {
  let wage = voyageBaseWage(WAGES[type], state.rulesVersion);
  if (
    worker?.hiredRound === state.currentRound &&
    state.modifierFlags.hire_discount
  ) {
    wage = Math.floor(wage * (1 - state.modifierFlags.hire_discount));
  }
  if (hasModule(state, "artisans_workshop")) wage = Math.floor(wage * 1.2);
  if (state.modifierFlags.engine_wage_surcharge)
    wage = Math.floor(wage * (1 + state.modifierFlags.engine_wage_surcharge));
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

export function quoteWages(state: GameState) {
  const base = WORKER_TYPES.reduce(
    (total, worker) => total + workerWagesFor(state, worker.id),
    0,
  );
  const recipes = new Set(state.producedRecipes ?? []);
  for (const crew of Object.values(state.workers)) {
    for (const worker of crew) if (worker.task) recipes.add(worker.task);
  }
  const relief =
    recipes.size > 0 ? (state.modifierFlags.favor_artisan_wage_relief ?? 0) : 0;
  const adjusted = Math.max(0, base - relief);
  const discount =
    expanded(state) &&
    hasModule(state, "wage_ledger") &&
    recipes.size >= (rebalanced(state) ? 1 : 2)
      ? Math.min(
          adjusted,
          rebalanced(state) ? REBALANCE.wageLedger : EFFECT.wageLedger,
        )
      : 0;
  return { base: adjusted, discount, due: adjusted - discount };
}

export function quoteDues(state: GameState) {
  const wages = quoteWages(state);
  const maintenance = state.fixedCost + maintenanceSurcharge(state);
  const upkeep = engineUpkeepTotal(state);
  const shadow = reagentRules(state) ? (state.shadowGold ?? 0) : 0;
  // Phase 3 collects wages and maintenance. Engine upkeep and shadow debt are
  // charged after the Shipyard, and an unpaid fee rests the Engine or stays on
  // the books instead of forcing bankruptcy.
  const phaseDue = wages.due + maintenance;
  return {
    wages,
    maintenance,
    upkeep,
    shadow,
    phaseDue,
    total: phaseDue + upkeep + shadow,
  };
}

// Explains what happens to Engine upkeep and shadow debt that cannot be paid.
// Phase 3 leaves them for the end of the round. Unpaid upkeep costs Reputation
// in the last two rounds, because a resting Engine cannot return in time.
export function laterBillConsequence(
  due: { upkeep: number; shadow: number },
  currentRound: number,
  maxRounds: number,
) {
  const both = due.upkeep > 0 && due.shadow > 0;
  if (currentRound >= maxRounds)
    return both
      ? "At the voyage close, unpaid upkeep and shadow debt cost Reputation and still add their Heat."
      : due.upkeep > 0
        ? "At the voyage close, unpaid upkeep costs Reputation and still adds 2 Heat."
        : "At the voyage close, unpaid shadow debt costs Reputation and still adds 1 Heat.";
  if (currentRound + 1 >= maxRounds)
    return both
      ? "With one round left, unpaid upkeep costs Reputation and still adds 2 Heat, and the Engine will not return. Unpaid shadow debt stays on the books, adds 1 Heat, and costs Reputation at the close if it remains unpaid."
      : due.upkeep > 0
        ? "With one round left, unpaid upkeep costs Reputation, adds 2 Heat, and the Engine will not return."
        : "Unpaid shadow debt stays on the books and adds 1 Heat. If it remains unpaid at the close, it costs Reputation.";
  return both
    ? "Unpaid upkeep rests an Engine for a round and adds 2 Heat. Unpaid shadow debt stays on the books and adds 1 Heat."
    : due.upkeep > 0
      ? "Unpaid upkeep rests an Engine for a round and adds 2 Heat."
      : "Unpaid shadow debt stays on the books and adds 1 Heat.";
}

// A saturating commission keeps Broker favor payouts below the configured cap.
export function brokersFavorCommission(reward: number): number {
  const net =
    BROKERS_FAVOR_PAYOUT_CAP *
    (1 - Math.exp(-reward / BROKERS_FAVOR_PAYOUT_CAP));
  return Math.max(0, reward - Math.floor(net));
}
