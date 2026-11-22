import { quoteRecipe } from "./workers";
// Seeded market draws depend only on captain, room, voyage, and unlocked
// pools so reloads reproduce the same board. Phase 2 shares these generators.
import { COMMODITIES, ICONS, RESOURCE_WEIGHTS } from "../constants";
import { brokerWhisperCapacity, revealBrokerWhisper } from "../broker-whispers";
import { describeForecast } from "../forecast";
import { expanded, forecastFor, rebalanced, spendEffect } from "../expansion";
import { charterOpensOn, marketCountsFor } from "../difficulty";
import {
  unlockedPorts,
  unlockedProducts,
  unlockedResources,
  voyageRecipe,
  productPriceRange,
} from "../pools";
import { createRng, pick, randInt, weightedPick, type Rng } from "../rng";
import type {
  GameContext,
  GameState,
  IntelItem,
  OrderCard,
  ResourceCard,
} from "../types";
import { addOwnedAmount } from "./core";
import {
  explainCardPrice,
  getCardFinalCost,
  portResourcePrice,
  marketResourceAdjustment,
  productPurchasePrice,
  recipeMaterialCost,
} from "./pricing";

// Optional pools and quantities support charter content and Broker orders.
export type MarketPools = {
  resources: string[];
  products: string[];
  ports: string[];
  expanded?: boolean;
  rulesVersion?: number;
};

export function poolsFor(state: GameState): MarketPools {
  const { difficulty, currentRound, rulesVersion } = state;
  return {
    resources: unlockedResources(
      difficulty,
      currentRound,
      rulesVersion,
      state.specialties,
    ),
    products: unlockedProducts(
      difficulty,
      currentRound,
      rulesVersion,
      state.specialties,
    ),
    ports: unlockedPorts(difficulty, currentRound),
    expanded: expanded(state),
    rulesVersion,
  };
}

export function genRawOrder(
  rng: Rng,
  pools: MarketPools,
  filter: string | null = null,
  quantityOverride?: number,
  portOverride?: string,
): Omit<OrderCard, "id"> {
  const num = pools.expanded && rng() < 0.7 ? 1 : randInt(rng, 1, 3);
  const resources: { type: string; required: number }[] = [];
  const available = [...pools.resources];
  const drawnPort = pick(rng, pools.ports);
  const port = portOverride ?? drawnPort;
  let total = 0;
  if (pools.resources.includes(filter ?? "")) {
    const req = quantityOverride ?? randInt(rng, 2, 5);
    total += req;
    resources.push({ type: filter as string, required: req });
  } else {
    for (let i = 0; i < num; i++) {
      if (!available.length) break;
      const r = pools.expanded
        ? weightedPick(
            rng,
            available.map((item) => [item, RESOURCE_WEIGHTS[item]]),
          )
        : pick(rng, available);
      available.splice(available.indexOf(r), 1);
      const req = randInt(rng, 2, 5);
      total += req;
      resources.push({ type: r, required: req });
    }
  }
  const base = resources.reduce((sum, good) => {
    if (!pools.expanded) return sum + good.required * 5;
    const [min, max] = COMMODITIES[good.type].basePrice;
    const demand = COMMODITIES[good.type].ports.includes(port) ? 0 : 1;
    return sum + good.required * ((min + max) / 2 + 2 + demand);
  }, 0);
  const reward = pools.expanded
    ? Math.round(base * (0.98 + rng() * 0.16))
    : base + randInt(rng, 10, 25);
  return {
    demandPort: port,
    resources,
    reward,
    totalItems: total,
    isProductOrder: false,
  };
}

export function genProductOrder(
  rng: Rng,
  pools: MarketPools,
  filter: string | null = null,
  quantityOverride?: number,
): Omit<OrderCard, "id"> {
  const product =
    filter && pools.products.includes(filter)
      ? filter
      : pick(rng, pools.products);
  const req = quantityOverride ?? randInt(rng, 1, 3);
  const port = pick(rng, pools.ports);
  const [lo, hi] = productPriceRange(product, pools.rulesVersion);
  const basePrice = randInt(rng, lo, hi);
  return {
    demandPort: port,
    resources: [{ type: product, required: req }],
    reward: basePrice * req,
    totalItems: req,
    isProductOrder: true,
  };
}

// Broker guarantees are applied after this seeded mixed draw.
export function genMixedOrder(
  rng: Rng,
  pools: MarketPools,
): Omit<OrderCard, "id"> {
  return rng() < (pools.expanded ? 0.65 : 0.5)
    ? genRawOrder(rng, pools)
    : genProductOrder(rng, pools);
}

function genProductPurchaseCard(
  rng: Rng,
  pools: MarketPools,
  state: GameState,
): Omit<ResourceCard, "id"> {
  const product = pick(rng, pools.products);
  const qty = randInt(rng, 1, 2);
  const port = pick(rng, pools.ports);
  const matCost = recipeMaterialCost(product, state.rulesVersion);
  const details = Object.entries(
    voyageRecipe(product, state.rulesVersion).materials,
  )
    .map(([item, amount]) => `${item}×${amount}`)
    .join(" + ");
  const unitPrice = productPurchasePrice(product, matCost, rng(), state);
  return {
    port,
    resources: [
      {
        type: product,
        quantity: qty,
        price: unitPrice,
        materialCost: matCost,
        materialDetails: details,
      },
    ],
    totalCost: unitPrice * qty,
    isProductCard: true,
  };
}

// Pulse values adjust raw material prices without changing the seeded draw.
function genResourceCard(
  rng: Rng,
  pools: MarketPools,
  state: GameState,
): Omit<ResourceCard, "id"> {
  if (rng() < (rebalanced(state) ? 0.15 : 0.3))
    return genProductPurchaseCard(rng, pools, state);
  const num = randInt(rng, 1, 3);
  const resources: { type: string; quantity: number; price: number }[] = [];
  const available = pools.resources.map((item): [string, number] => [
    item,
    RESOURCE_WEIGHTS[item],
  ]);
  const port = pick(rng, pools.ports);
  for (let i = 0; i < num; i++) {
    if (!available.length) break;
    const chosen = weightedPick(rng, available);
    available.splice(
      available.findIndex(([item]) => item === chosen),
      1,
    );
    const qty = randInt(rng, 1, 3);
    const [min, max] = COMMODITIES[chosen].basePrice;
    const base = randInt(rng, min, max);
    const price = portResourcePrice(
      chosen,
      base,
      port,
      marketResourceAdjustment(state, chosen),
    );
    resources.push({ type: chosen, quantity: qty, price });
  }
  const total = resources.reduce((s, r) => s + r.quantity * r.price, 0);
  return { port, resources, totalCost: total, isProductCard: false };
}

// Totals raw material purchases for the next room price pulse.
export function tallyPurchasesByResource(
  state: GameState,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of state.purchasedCards) {
    const card = state.resourceCards.find((c) => c.id === id);
    if (!card || card.isProductCard) continue;
    for (const r of card.resources) {
      if (!(r.type in RESOURCE_WEIGHTS)) continue;
      out[r.type] = (out[r.type] || 0) + (r.quantity ?? 0);
    }
  }
  return out;
}

// Stores the server supplied price pulse for the next market draw.
export function applyHarborPulse(
  state: GameState,
  pulse: Record<string, number>,
) {
  state.harborPulse = pulse;
}

// Activates the permanent voyage bonus once and records its announcement.
export function applyTidewatchSurge(state: GameState, logs: string[]) {
  if (state.tidewatchSurge) return;
  state.tidewatchSurge = true;
  logs.push(
    `🌊 Tidewatch Alert: the harbor takes notice of a bustling crew! One more cargo lot joins the Port Merchant Exchange, every round, for the rest of this voyage.`,
  );
}

const STAPLE_TERMS = {
  fair_winds: { quantity: 2, premium: 1 },
  open_waters: { quantity: 3, premium: 6 },
  monsoon: { quantity: 4, premium: 14 },
};

function stapleGood(state: GameState, ctx: GameContext) {
  const choices = state.currentRound >= 3 ? ["Hemp", "Bamboo"] : ["Hemp"];
  return pick(
    createRng(
      `${ctx.seedBase}:V${state.voyageEpoch}:R${state.currentRound}:staple`,
    ),
    choices,
  );
}

export function stapleOrder(state: GameState, ctx?: GameContext): OrderCard {
  const type = rebalanced(state)
    ? (state.resourceCards[0]?.resources[0]?.type ?? "Hemp")
    : stapleGood(state, ctx!);
  const [, high] = COMMODITIES[type].basePrice;
  const { quantity, premium } = STAPLE_TERMS[state.difficulty];
  return {
    id: 0,
    demandPort: "Quanzhou Port",
    resources: [{ type, required: quantity }],
    reward: rebalanced(state)
      ? stapleReward(state, type)
      : high * quantity + premium,
    totalItems: quantity,
    isProductOrder: false,
    staple: true,
  };
}

export function featuredDemand(
  state: GameState,
  ctx: GameContext,
  round = state.currentRound,
) {
  if (!expanded(state) || round > state.maxRounds) return undefined;
  const forecast = forecastFor(state, round);
  if (forecast?.kind === "guild" && forecast.item) return forecast.item;
  const pool = unlockedProducts(
    state.difficulty,
    round,
    state.rulesVersion,
    state.specialties,
  );
  return pick(
    createRng(
      `${ctx.roomSeed ?? ctx.seedBase}:V${state.voyageEpoch}:R${round}:demand`,
    ),
    pool,
  );
}

export function ordinaryOrders(state: GameState, ctx: GameContext) {
  const random = createRng(
    `${ctx.seedBase}:V${state.voyageEpoch}:R${state.currentRound}:orders`,
  );
  const pools = poolsFor(state);
  const count = marketCountsFor(state.difficulty, state.currentRound).order;
  const cards: OrderCard[] = Array.from({ length: count }, (_, id) => ({
    id,
    ...genMixedOrder(random, pools),
  }));
  if (expanded(state)) {
    cards[0] = stapleOrder(state, ctx);
    const item = featuredDemand(state, ctx);
    cards[count - 1] = rebalanced(state)
      ? upcomingBuyer(state, ctx, state.currentRound)!
      : { id: count - 1, ...genProductOrder(random, pools, item) };
    if (forecastFor(state)?.kind === "guild") {
      cards[count - 2] = {
        id: count - 2,
        ...genProductOrder(
          random,
          pools,
          item,
          rebalanced(state) ? 1 : undefined,
        ),
      };
    }
  }
  if (rebalanced(state)) {
    const scout = upcomingBuyer(state, ctx, state.currentRound, true);
    if (scout) cards[scout.id] = scout;
  }
  return { cards, random };
}

function featuredLot(
  state: GameState,
  item: string,
  id: number,
  staple = false,
): ResourceCard {
  const good = COMMODITIES[item];
  const open = unlockedPorts(state.difficulty, state.currentRound);
  const port =
    good.ports.find((candidate) => open.includes(candidate)) ?? open[0];
  const [min, max] = good.basePrice;
  const quantity = staple ? STAPLE_TERMS[state.difficulty].quantity : 2;
  const unit = portResourcePrice(
    item,
    staple ? min + 1 : Math.floor((min + max) / 2),
    port,
    marketResourceAdjustment(state, item),
  );
  return {
    id,
    port,
    staple,
    featured: !staple,
    totalCost: unit * quantity,
    resources: [{ type: item, quantity, price: unit }],
    isProductCard: false,
  };
}

export function purchaseCard(state: GameState, cardId: number, logs: string[]) {
  const card = state.resourceCards.find((c) => c.id === cardId);
  if (!card || (rebalanced(state) && state.phase !== 1)) return;
  if (state.purchasedCards.includes(card.id)) return;
  const { final: cost, steps } = explainCardPrice(state, card);
  if (state.money < cost) {
    logs.push(
      `❌ Insufficient funds! Need ${cost} Gold, Have ${state.money} Gold`,
    );
    return;
  }
  state.money -= cost;
  state.roundCosts += cost;
  if (!card.isProductCard) {
    state.materialCosts += cost;
    state.totalMaterialCosts = (state.totalMaterialCosts ?? 0) + cost;
  }
  state.totalCosts += cost;
  // Ownership helpers safely initialize missing inventory keys.
  for (const r of card.resources)
    addOwnedAmount(state, r.type, r.quantity ?? 0);
  state.purchasedCards.push(card.id);
  state.purchaseCount++;
  if (card.isProductCard) {
    const r = card.resources[0];
    logs.push(
      `🛒 Bought Product at ${card.port}: ${ICONS[r.type]}${r.type}×${r.quantity} (@${r.price} Gold/item, Mat Cost ${r.materialCost} Gold), Total ${cost} Gold`,
    );
    logs.push("   💡 Tip: VAT applies when selling finished products");
  } else {
    const txt = card.resources
      .map(
        (r) => `${ICONS[r.type]}${r.type}×${r.quantity}(${r.price} Gold/item)`,
      )
      .join(" + ");
    logs.push(`🛒 Bought at ${card.port}: ${txt}, Total ${cost} Gold`);
  }
  for (const { label, delta, effect } of steps) {
    if (effect)
      spendEffect(
        state,
        effect,
        rebalanced(state) &&
          ["bamboo_fair", "deep_market", "merchant_scales"].includes(effect)
          ? -delta
          : 1,
      );
    if (delta < 0) logs.push(`✨ ${label} saved ${-delta} Gold`);
  }
  logs.push(`📊 Purchased ${state.purchaseCount} cargo batches`);
}

export function startPhase1(
  state: GameState,
  ctx: GameContext,
  logs: string[],
) {
  state.phase = 1;
  state.seatSeed ??= ctx.seedBase;
  state.purchaseCount = 0;
  state.purchasedCards = [];
  state.phase2DemandTags = [];
  // Builds the deterministic intel pool for this captain and round.
  const intelRng = createRng(
    `${ctx.seedBase}:V${state.voyageEpoch}:R${state.currentRound}:intel`,
  );
  const marketPools = poolsFor(state);
  const allItems = [...marketPools.resources, ...marketPools.products];
  for (let i = 0; i < brokerWhisperCapacity(state) && allItems.length; i++) {
    const index = Math.floor(intelRng() * allItems.length);
    state.phase2DemandTags.push(allItems.splice(index, 1)[0]);
  }
  if (rebalanced(state))
    state.phase2DemandTags = allItems.concat(state.phase2DemandTags);
  state.revealedIntel = [];
  // Farsight draws from this pool without consuming paid intel.
  const freeIntel = state.modifierFlags.free_intel ?? 0;
  for (let i = 0; i < freeIntel; i++) {
    const tip = revealBrokerWhisper(
      state,
      intelRng,
      marketPools.ports,
      brokerOfferItem(state),
    );
    if (!tip) break;
    prepareWhisperOrder(state, tip);
    const { item, port } = tip;
    if (rebalanced(state))
      logs.push(
        `Farsight guaranteed ${tip.quantity} ${item} at ${port} for ${tip.reward} Gold before costs.`,
      );
    else
      logs.push(
        `🔮 Farsight: 'Word from ${port}: High demand for ${item}!' (free)`,
      );
  }
  logs.push(
    `\n⚓=== Round ${state.currentRound} · Phase 1: Port Merchant Exchange ===`,
  );
  logs.push(`💰 Current Funds: ${state.money} Gold`);
  // Builds the deterministic port market for this captain and round.
  const marketRng = createRng(
    `${ctx.seedBase}:V${state.voyageEpoch}:R${state.currentRound}:market`,
  );
  state.resourceCards = [];
  // Difficulty and charter progress determine the card count.
  const tierPurchaseCount = marketCountsFor(
    state.difficulty,
    state.currentRound,
  ).purchase;
  // Announces a charter only on its opening round.
  if (charterOpensOn(state.difficulty, state.currentRound)) {
    logs.push(
      rebalanced(state)
        ? `🗺️ The Silk Road Charter opens. The harbor now lists ${tierPurchaseCount} cargo lots and ${tierPurchaseCount} ordinary buyers before bonuses.`
        : `🗺️ The Silk Road Charter opens! The harbor grows busier: ${tierPurchaseCount} cargo lots and as many buyers from this voyage on.`,
    );
  }
  // Tidewatch adds one card without repeating its activation message.
  const purchaseCount = tierPurchaseCount + (state.tidewatchSurge ? 1 : 0);
  state.scoutedOrder =
    state.modifierFlags.coastal_forecast && expanded(state)
      ? ordinaryOrders(state, ctx).cards.at(-1)
      : undefined;
  if (rebalanced(state)) {
    state.scoutedOrder = undefined;
    const orders = ordinaryOrders(state, ctx).cards;
    const reports = state.modifierFlags.coastal_forecast
      ? [orders.at(-1)!, upcomingBuyer(state, ctx, state.currentRound, true)!]
      : [];
    if (state.modifierFlags.extra_order)
      reports.push(convergingBuyer(state, ctx, orders.length));
    state.scoutedOrders = reports;
    for (const order of reports)
      logs.push(
        `Scouted buyer at ${order.demandPort}: ${order.resources.map(({ type, required }) => `${required} ${type}`).join(", ")} for ${order.reward} Gold before costs.`,
      );
  }
  if (state.scoutedOrder)
    logs.push(
      `Coastal Forecast spotted an order at ${state.scoutedOrder.demandPort}.`,
    );
  const forecast = forecastFor(state);
  for (let i = 0; i < purchaseCount; i++) {
    state.resourceCards.push({
      id: i,
      ...genResourceCard(marketRng, marketPools, state),
    });
  }
  if (expanded(state))
    state.resourceCards[0] = featuredLot(
      state,
      rebalanced(state) ? "Hemp" : stapleGood(state, ctx),
      0,
      true,
    );
  if (
    forecast?.kind === "market" &&
    forecast.item &&
    marketPools.resources.includes(forecast.item)
  ) {
    state.resourceCards[1] = featuredLot(state, forecast.item, 1);
    logs.push(describeForecast(forecast, state).detail);
  }
}

export function completePhase1(state: GameState, logs: string[]) {
  if (state.purchaseCount === 0) logs.push("⏭️ Purchasing skipped");
  else logs.push(`✅ Purchasing ended, bought ${state.purchaseCount} batches`);
  state.phase = "barter";
}

export function productMidpoint(product: string, version?: number) {
  const [lo, hi] = productPriceRange(product, version);
  return (lo + hi) / 2;
}

export function upcomingBuyer(
  state: GameState,
  ctx: GameContext,
  round: number,
  additional = false,
): OrderCard | undefined {
  const item = featuredDemand(state, ctx, round);
  if (!rebalanced(state) || !item) return;
  const rng = createRng(
    `${ctx.roomSeed ?? ctx.seedBase}:V${state.voyageEpoch}:R${round}:buyer:${additional}`,
  );
  const pool = unlockedProducts(
    state.difficulty,
    round,
    state.rulesVersion,
    state.specialties,
  );
  const ports = unlockedPorts(state.difficulty, round);
  const count = marketCountsFor(state.difficulty, round).order;
  const featuredCount = forecastFor(state, round)?.kind === "guild" ? 2 : 1;
  const product = additional
    ? pick(
        rng,
        pool.filter((candidate) => candidate !== item),
      )
    : item;
  return {
    id: additional ? count - featuredCount - 1 : count - 1,
    ...genProductOrder(
      rng,
      {
        resources: [],
        products: pool,
        ports,
        expanded: true,
        rulesVersion: state.rulesVersion,
      },
      product,
      additional ? randInt(rng, 1, 2) : 1,
    ),
  };
}

export function convergingBuyer(
  state: GameState,
  ctx: GameContext,
  id: number,
): OrderCard {
  const rng = createRng(
    `${ctx.seedBase}:V${state.voyageEpoch}:R${state.currentRound}:converge`,
  );
  const pools = poolsFor(state);
  return {
    id,
    ...genProductOrder(
      rng,
      pools,
      pools.products.reduce((best, item) =>
        (state.inventory[item] ?? 0) > (state.inventory[best] ?? 0)
          ? item
          : best,
      ),
      1,
    ),
  };
}

export const WORKSHOP_SUPPLY_ID = 100;
export const STAPLE_CHOICES = ["Hemp", "Silk", "Tea"] as const;

export function stapleReward(state: GameState, item: string) {
  const { quantity, premium } = STAPLE_TERMS[state.difficulty];
  return (COMMODITIES[item].basePrice[0] + 2) * quantity + premium + 9;
}

export function chooseStaple(state: GameState, item: string, logs: string[]) {
  if (
    !rebalanced(state) ||
    state.phase !== 1 ||
    state.purchasedCards.includes(0) ||
    !STAPLE_CHOICES.some((choice) => choice === item)
  )
    return;
  state.resourceCards[0] = featuredLot(state, item, 0, true);
  logs.push(`Staple contract selected for ${item}.`);
}

export function quoteWorkshopSupply(
  state: GameState,
  product: string,
): ResourceCard | undefined {
  if (
    !rebalanced(state) ||
    state.phase !== 1 ||
    state.currentRound >= state.maxRounds ||
    state.purchasedCards.includes(WORKSHOP_SUPPLY_ID) ||
    !poolsFor(state).products.includes(product)
  )
    return;
  const { inputs } = quoteRecipe(state, product);
  const resources = Object.entries(inputs).flatMap(([type, amount]) => {
    const quantity = Math.max(0, amount - (state.inventory[type] ?? 0));
    const [lo, hi] = COMMODITIES[type].basePrice;
    return quantity
      ? [{ type, quantity, price: Math.ceil((lo + hi) / 2) }]
      : [];
  });
  if (!resources.length) return;
  return {
    id: WORKSHOP_SUPPLY_ID,
    port: "Workshop Supplier",
    workshopSupply: true,
    resources,
    totalCost: resources.reduce(
      (sum, { price, quantity }) => sum + price * quantity,
      0,
    ),
    isProductCard: false,
  };
}

export function buyWorkshopSupply(
  state: GameState,
  product: string,
  logs: string[],
) {
  const card = quoteWorkshopSupply(state, product);
  if (!card || getCardFinalCost(state, card) > state.money) return;
  state.resourceCards.push(card);
  purchaseCard(state, card.id, logs);
}

export function brokerOfferItem(state: GameState) {
  if (!rebalanced(state)) return undefined;
  return state.phase2DemandTags.reduce<string | undefined>(
    (best, item) =>
      !best || (state.inventory[item] ?? 0) > (state.inventory[best] ?? 0)
        ? item
        : best,
    undefined,
  );
}

export function prepareWhisperOrder(state: GameState, intel: IntelItem) {
  if (!rebalanced(state)) return;
  const rng = createRng(
    `${state.seatSeed}:V${state.voyageEpoch}:R${state.currentRound}:whisperOrder:${intel.item}:${intel.port}`,
  );
  const pools = poolsFor(state);
  const order = pools.resources.includes(intel.item)
    ? genRawOrder(rng, pools, intel.item, intel.quantity, intel.port)
    : genProductOrder(rng, pools, intel.item, intel.quantity);
  intel.reward = order.reward;
}
