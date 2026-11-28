import { quoteRecipe } from "./workers";
// Seeded market draws depend only on captain, room, voyage, and unlocked
// pools so reloads reproduce the same board. Phase 2 shares these generators.
import {
  COMMODITIES,
  ICONS,
  RESOURCE_WEIGHTS,
  RESOURCES_TIER0,
} from "../constants";
import {
  brokerWhisperCapacity,
  revealBrokerWhisper,
  revealPlannedBuyer,
  describeWhisperCargo,
} from "../broker-whispers";
import { describeForecast } from "../forecast";
import {
  expanded,
  tunedHarbor,
  revisedHarbor,
  forecastFor,
  openHarbor,
  classicHarbor,
  harborTrading,
  harborArrival,
  rebalanced,
  reagentRules,
  effectUses,
  spendEffect,
} from "../expansion";
import { charterOpensOn, marketCountsFor } from "../difficulty";
import { hasEngine } from "../reagents";
import { voyageRandom } from "../voyage-rng";
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
    ports: unlockedPorts(difficulty, currentRound, rulesVersion),
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
  if (rng() < (rebalanced(state) && !classicHarbor(state) ? 0.15 : 0.3))
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

export { harborArrival } from "../expansion";

function harborOrders(
  state: GameState,
  ctx: GameContext,
  random: Rng,
  pools: MarketPools,
) {
  const event = forecastFor(state);
  const port = harborArrival(state);
  const orders: OrderCard[] = [];
  const add = (
    buyer: NonNullable<OrderCard["buyer"]>,
    terms: Omit<OrderCard, "id">,
    scale = 1,
  ) => {
    orders.push({
      ...terms,
      id: orders.length,
      buyer,
      reward: Math.round(terms.reward * scale),
    });
  };
  const raw = (item: string, units: number, destination?: string) =>
    genRawOrder(random, pools, item, units, destination);
  const finished = (item: string, units: number) =>
    genProductOrder(random, pools, item, units);
  const common = STAPLE_CHOICES;
  const specialty = pools.resources.filter(
    (item) => !common.some((good) => good === item),
  );
  const pressure = { fair_winds: 1, open_waters: 1.08, monsoon: 1.17 }[
    state.difficulty
  ];
  add(
    "merchant",
    raw(pick(random, common), randInt(random, 2, 4), port),
    1.24 * pressure,
  );
  add(
    "merchant",
    raw(pick(random, specialty), randInt(random, 2, 4)),
    1.21 * pressure,
  );
  const mixed = (source: readonly string[], prepared = false) => {
    const held = prepared
      ? pools.resources.filter((item) => state.inventory[item] >= 1)
      : [];
    const choices = held.length >= 2 ? held : pools.resources;
    const suited = choices.filter((item) => source.includes(item));
    const first = pick(random, suited.length ? suited : choices);
    const second = pick(
      random,
      choices.filter((item) => item !== first),
    );
    const third = choices.filter((item) => item !== first && item !== second);
    const goods = [
      first,
      second,
      ...(random() < 0.25 && third.length ? [pick(random, third)] : []),
    ];
    const demandPort = pick(random, pools.ports);
    const lots = goods.map((item) => {
      const draw = randInt(random, 1, 2);
      return raw(
        item,
        prepared ? Math.max(1, Math.min(state.inventory[item], draw)) : draw,
        demandPort,
      );
    });
    return {
      demandPort,
      resources: lots.flatMap((lot) => lot.resources),
      reward: lots.reduce((sum, lot) => sum + lot.reward, 0),
      totalItems: lots.reduce((sum, lot) => sum + lot.totalItems, 0),
      isProductOrder: false,
    };
  };
  add("mixed", mixed(common), 1.37 * pressure);
  const classics = pools.products.slice(0, 8);
  const expansion = pools.products.slice(8);
  const firstCommission = pick(random, classics);
  const secondCommission = pick(random, expansion);
  add("commission", finished(firstCommission, 1));
  add("commission", finished(secondCommission, random() < 0.3 ? 2 : 1));
  const standingRandom = createRng(
    `${ctx.seedBase}:V${state.voyageEpoch}:S${Math.floor((state.currentRound - 1) / 2)}:standing`,
  );
  const standingPort = pick(standingRandom, pools.ports);
  const standingItem = pick(standingRandom, common);
  const standingQuantity = randInt(standingRandom, 2, 4);
  const standing = genRawOrder(
    standingRandom,
    pools,
    standingItem,
    standingQuantity,
    standingPort,
  );
  add("standing", { ...standing, demandPort: standingPort }, 1.1 * pressure);
  if (event?.kind === "guild" && event.item)
    add("commission", finished(event.item, 1), 1.28);
  else if (event?.kind === "festival")
    add("commission", finished(pick(random, pools.products), 1), 1.22);
  else if (event?.kind === "rival")
    add("rival", mixed(specialty), 1.47 * pressure);
  else if (random() < 0.45)
    add("speculative", finished(pick(random, pools.products), 1), 1.25);
  else
    add(
      "speculative",
      raw(pick(random, pools.resources), randInt(random, 3, 5)),
      1.3,
    );
  add("mixed", mixed(specialty, true), 1.32 * pressure);
  const finishedHeld = pools.products.filter(
    (item) => state.inventory[item] > 0,
  );
  if (finishedHeld.length && random() < 0.52)
    add("commission", finished(pick(random, finishedHeld), 1), 0.85);
  else add("merchant", raw(pick(random, common), 2), 1.13 * pressure);
  if (state.difficulty === "monsoon")
    add("commission", finished(pick(random, pools.products), 1), 1.06);
  return orders;
}

function foundingPools(state: GameState): MarketPools {
  const { difficulty, currentRound, rulesVersion } = state;
  // Founding goods stay on the base tier schedule for the waters. Later
  // imports rotate into existing offers through rotationProduct.
  return {
    resources: unlockedResources(difficulty, currentRound),
    products: unlockedProducts(difficulty, currentRound),
    ports: unlockedPorts(difficulty, currentRound),
    rulesVersion,
  };
}

function rotationProduct(state: GameState, ctx: GameContext) {
  const founding = foundingPools(state);
  const imports = poolsFor(state).products.filter(
    (item) => !founding.products.includes(item),
  );
  if (!imports.length) return;
  const port = harborArrival(state);
  const local = imports.filter((item) =>
    Object.keys(voyageRecipe(item, state.rulesVersion).materials).some((good) =>
      COMMODITIES[good].ports.includes(port),
    ),
  );
  const random = createRng(
    `${ctx.roomSeed ?? ctx.seedBase}:V${state.voyageEpoch}:R${state.currentRound}:imports`,
  );
  return pick(random, local.length && random() < 0.55 ? local : imports);
}

function classicHarborOrders(state: GameState, ctx: GameContext, random: Rng) {
  const founding = foundingPools(state);
  const pools = poolsFor(state);
  const { order: count } = marketCountsFor(
    state.difficulty,
    state.currentRound,
  );
  const cards = Array.from({ length: count }, (_, id): OrderCard => {
    const order = genMixedOrder(random, founding);
    return {
      id,
      ...order,
      buyer: order.isProductOrder
        ? "commission"
        : order.resources.length > 1
          ? "mixed"
          : "merchant",
    };
  });
  if (state.currentRound === 1) {
    if (state.modifierFlags.extra_order) {
      const id = cards.length - 1;
      cards[id] = { ...convergingBuyer(state, ctx, id), buyer: "commission" };
    }
    return cards;
  }
  const port = harborArrival(state);
  const local = founding.resources.filter((item) =>
    COMMODITIES[item].ports.includes(port),
  );
  const staple = pick(random, local.length ? local : founding.resources);
  const smallShipment =
    tunedHarbor(state.rulesVersion) &&
    state.difficulty === "monsoon" &&
    state.currentRound % 2 === 0;
  const quantity = randInt(random, 2, 3);
  const merchant = genRawOrder(
    random,
    founding,
    staple,
    smallShipment ? 1 : quantity,
    port,
  );
  cards[0] = { id: 0, ...merchant, buyer: "merchant" };
  const pastShipment = rotationProduct(
    { ...state, currentRound: state.currentRound - 1 },
    ctx,
  );
  const announced = pastShipment && random() < 0.3 ? pastShipment : null;
  // Keep the commission draw in the seed sequence for the rest of the board.
  const commission = genProductOrder(
    random,
    announced ? pools : founding,
    announced,
    1,
  );
  const visitingBuyer =
    tunedHarbor(state.rulesVersion) &&
    state.difficulty === "fair_winds" &&
    state.currentRound >= 3 &&
    !announced;
  if (!visitingBuyer) cards[1] = { id: 1, ...commission, buyer: "commission" };
  const stapleDraw = pick(random, STAPLE_CHOICES);
  const event = forecastFor(state);
  const first =
    revisedHarbor(state.rulesVersion) && event?.kind === "market" && event.item
      ? event.item
      : stapleDraw;
  const types = [
    first,
    pick(
      random,
      founding.resources.filter((item) => item !== first),
    ),
  ];
  const cargo = types.map((type) => ({
    type,
    required: randInt(random, 1, 2),
  }));
  const totalItems = cargo.reduce((sum, { required }) => sum + required, 0);
  cards[2] = {
    id: 2,
    resources: cargo,
    totalItems,
    demandPort: random() < 0.65 ? port : pick(random, founding.ports),
    reward: totalItems * 5 + randInt(random, 10, 25),
    isProductOrder: false,
    buyer: "mixed",
  };
  const earlyStock = founding.products.filter(
    (item) => item !== cards[1].resources[0].type,
  );
  cards[3] = {
    id: 3,
    ...genProductOrder(
      random,
      founding,
      pick(random, earlyStock),
      randInt(random, 1, 2),
    ),
    buyer: "commission",
  };
  for (const order of cards) {
    if (order.isProductOrder) continue;
    order.reward += order.resources.reduce((sum, { type, required = 0 }) => {
      if ((RESOURCES_TIER0 as readonly string[]).includes(type)) return sum;
      const [min, max] = COMMODITIES[type].basePrice;
      return sum + Math.max(0, Math.round((min + max) / 2) - 5) * required;
    }, 0);
  }
  const id = cards.length - 1;
  const imports = pools.products.filter(
    (item) => !founding.products.includes(item),
  );
  if (state.modifierFlags.extra_order) {
    cards[id] = { ...convergingBuyer(state, ctx, id), buyer: "commission" };
  } else if (event?.kind === "guild" && event.item) {
    cards[id] = {
      id,
      ...genProductOrder(random, pools, event.item, 1),
      buyer: "commission",
    };
  } else if (imports.length && random() < 0.65) {
    cards[id] = {
      id,
      ...genProductOrder(random, pools, pick(random, imports), 1),
      buyer: "commission",
    };
  }
  return cards;
}

function classicHarborLots(
  state: GameState,
  ctx: GameContext,
  random: Rng,
  buyers: OrderCard[],
) {
  const pools = foundingPools(state);
  const count =
    marketCountsFor(state.difficulty, state.currentRound).purchase +
    Number(state.currentRound > 1 && state.tidewatchSurge);
  const cards = Array.from({ length: count }, (_, id) => ({
    id,
    ...genResourceCard(random, pools, state),
  }));
  if (state.currentRound > 1) {
    const [merchant, , mixed] = buyers;
    const { type, required = 2 } = merchant.resources[0];
    const port = merchant.demandPort;
    const localLot = (
      id: number,
      good: string,
      quantity: number,
    ): ResourceCard => {
      const [min, max] = COMMODITIES[good].basePrice;
      const price = portResourcePrice(
        good,
        randInt(random, min, max),
        port,
        marketResourceAdjustment(state, good),
      );
      return {
        id,
        port,
        resources: [{ type: good, quantity, price }],
        totalCost: price * quantity,
        isProductCard: false,
      };
    };
    const spare = randInt(random, 0, 1);
    const shipment = required === 1 ? 1 : required + spare;
    cards[0] = localLot(0, type, shipment);
    if (state.currentRound >= 3) {
      const extra = mixed.resources.find((good) => good.type !== type)!;
      cards[1] = localLot(
        1,
        extra.type,
        (extra.required ?? 1) + randInt(random, 0, 1),
      );
    }
  }
  const id = cards.length - 1;
  const event = forecastFor(state);
  const product = rotationProduct(state, ctx);
  if (event?.kind === "market" && event.item) {
    cards[id] = featuredLot(state, event.item, id);
  } else if (product) {
    const port = harborArrival(state);
    const resources = Object.entries(
      voyageRecipe(product, state.rulesVersion).materials,
    ).map(([type, quantity]) => {
      const [min, max] = COMMODITIES[type].basePrice;
      const price = portResourcePrice(
        type,
        randInt(random, min, max),
        port,
        marketResourceAdjustment(state, type),
      );
      return { type, quantity, price };
    });
    cards[id] = {
      id,
      port,
      resources,
      featured: true,
      isProductCard: false,
      totalCost: resources.reduce(
        (sum, { price, quantity }) => sum + price * quantity,
        0,
      ),
    };
  }
  return cards;
}

export function ordinaryOrders(state: GameState, ctx: GameContext) {
  const random = createRng(
    `${ctx.seedBase}:V${state.voyageEpoch}:R${state.currentRound}:orders`,
  );
  if (classicHarbor(state))
    return { cards: classicHarborOrders(state, ctx, random), random };
  const pools = poolsFor(state);
  if (openHarbor(state))
    return { cards: harborOrders(state, ctx, random, pools), random };
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

function harborLots(
  state: GameState,
  random: Rng,
  pools: MarketPools,
): ResourceCard[] {
  const event = forecastFor(state);
  const port = harborArrival(state);
  const common = STAPLE_CHOICES;
  const specialty = pools.resources.filter(
    (item) => !common.some((good) => good === item),
  );
  const home = pools.resources.filter((item) =>
    COMMODITIES[item].ports.includes(port),
  );
  const lots: ResourceCard[] = [];
  const add = (
    items: string[],
    quantity: () => number,
    rate = 1,
    featured = false,
  ) => {
    const resources = [...new Set(items)].map((type) => {
      const [lo, hi] = COMMODITIES[type].basePrice;
      const price = Math.max(
        1,
        Math.round(
          rate *
            portResourcePrice(
              type,
              randInt(random, lo, hi),
              port,
              marketResourceAdjustment(state, type),
            ),
        ),
      );
      return { type, quantity: quantity(), price };
    });
    lots.push({
      id: lots.length,
      port,
      resources,
      featured,
      totalCost: resources.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      ),
      isProductCard: false,
    });
  };
  const first = pick(random, common);
  add([first], () => randInt(random, 3, 6));
  add(
    [
      pick(
        random,
        common.filter((item) => item !== first),
      ),
    ],
    () => randInt(random, 2, 5),
  );
  add(
    [pick(random, home.length ? home : specialty)],
    () => randInt(random, 2, 5),
    0.92,
    true,
  );
  add([pick(random, specialty)], () => randInt(random, 2, 4));
  const recipe = voyageRecipe(pick(random, pools.products), state.rulesVersion);
  add(Object.keys(recipe.materials), () => randInt(random, 1, 3), 0.92);
  if ((event?.kind === "market" || event?.kind === "fleet") && event.item)
    add(
      [event.item],
      () => randInt(random, 4, 6),
      event.kind === "fleet" ? 0.86 : 1,
      true,
    );
  else
    add(
      [pick(random, common), pick(random, specialty)],
      () => randInt(random, 1, 3),
      0.9,
    );
  const count =
    (state.difficulty === "monsoon" ? 8 : 7) + Number(state.tidewatchSurge);
  if (random() < 0.6)
    lots.push({
      id: lots.length,
      ...genProductPurchaseCard(random, pools, state),
    });
  while (lots.length < count)
    add([pick(random, pools.resources)], () => randInt(random, 2, 4));
  return lots;
}

// The False Manifest splits a lot into cash now and shadow debt at
// settlement. Keep the calculation in one place so the purchase button and
// the engine agree on what the captain can afford.
export function quoteCardPayment(state: GameState, card: ResourceCard) {
  const { final: cost, steps } = explainCardPrice(state, card);
  // An unpaid balance is collected at settlement before new deferrals open.
  // The final round has no settlement after it, so credit closes there.
  const deferred =
    hasEngine(state, "false_manifest") &&
    !(state.shadowGold ?? 0) &&
    state.currentRound < state.maxRounds
      ? Math.floor(cost * 0.2)
      : 0;
  return { cost, steps, deferred, paid: cost - deferred };
}

export function purchaseCard(state: GameState, cardId: number, logs: string[]) {
  const card = state.resourceCards.find((c) => c.id === cardId);
  if (!card || (rebalanced(state) && state.phase !== 1)) return;
  if (state.purchasedCards.includes(card.id)) return;
  const { cost, steps, deferred, paid } = quoteCardPayment(state, card);
  const paidNote =
    deferred > 0
      ? `${paid} Gold now and ${deferred} Gold at settlement`
      : `${cost} Gold`;
  if (state.money < paid) {
    logs.push(
      `❌ Insufficient funds! Need ${paid} Gold, Have ${state.money} Gold`,
    );
    return;
  }
  card.paidGold = paid;
  state.money -= paid;
  // The whole lot is a cost when it is bought. Deferring the cash does not
  // defer the expense, so profit and the Income Tax quote see the full price.
  state.roundCosts += cost;
  if (!card.isProductCard) {
    state.materialCosts += cost;
    state.totalMaterialCosts = (state.totalMaterialCosts ?? 0) + cost;
  }
  state.totalCosts += cost;
  if (deferred > 0) {
    state.shadowGold = (state.shadowGold ?? 0) + deferred;
    logs.push(
      `🕯️ The False Manifest defers ${deferred} Gold to settlement. Shadow debt: ${state.shadowGold}.`,
    );
  }
  // Ownership helpers safely initialize missing inventory keys.
  for (const r of card.resources)
    addOwnedAmount(state, r.type, r.quantity ?? 0);
  state.purchasedCards.push(card.id);
  state.purchaseCount++;
  if (card.isProductCard) {
    const r = card.resources[0];
    logs.push(
      `🛒 Bought Product at ${card.port}: ${ICONS[r.type]}${r.type}×${r.quantity} (@${r.price} Gold/item, Mat Cost ${r.materialCost} Gold), Total ${paidNote}`,
    );
    logs.push("   💡 Tip: VAT applies when selling finished products");
  } else {
    const txt = card.resources
      .map(
        (r) => `${ICONS[r.type]}${r.type}×${r.quantity}(${r.price} Gold/item)`,
      )
      .join(" + ");
    logs.push(`🛒 Bought at ${card.port}: ${txt}, Total ${paidNote}`);
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
  if (reagentRules(state)) {
    for (const resource of card.resources)
      spendEffect(state, `bought:${resource.type}`);
    const distinct = Object.keys(state.effectUses ?? {}).filter((key) =>
      key.startsWith("bought:"),
    ).length;
    if (
      state.modifierFlags.favor_market_rebate &&
      distinct >= 3 &&
      effectUses(state, "market_rebate_paid") === 0
    ) {
      const rebate = state.modifierFlags.favor_market_rebate;
      state.money += rebate;
      spendEffect(state, "market_rebate_paid");
      logs.push(
        `✨ Merchant's Charm rank 3 rebate: three different goods bought, ${rebate} Gold back.`,
      );
    }
    if (
      state.modifierFlags.favor_hemp_rebate &&
      card.resources.some(({ type }) => type === "Hemp") &&
      effectUses(state, "hemp_rebate_paid") === 0
    ) {
      const rebate = state.modifierFlags.favor_hemp_rebate;
      state.money += rebate;
      spendEffect(state, "hemp_rebate_paid");
      logs.push(`✨ Hemp Monopoly rank 3 rebate: ${rebate} Gold back.`);
    }
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
  const marketRng = createRng(
    `${ctx.seedBase}:V${state.voyageEpoch}:R${state.currentRound}:market`,
  );
  if (classicHarbor(state)) {
    const orders = ordinaryOrders(state, ctx).cards;
    const previous = state.announcedBuyers;
    const announced =
      revisedHarbor(state.rulesVersion) &&
      previous?.round === state.currentRound
        ? previous.buyers
        : [];
    for (const buyer of announced) orders[buyer.id] = buyer;
    if (reagentRules(state)) {
      const rng = voyageRandom(state, "standingOrder");
      const item =
        marketPools.resources[Math.floor(rng() * marketPools.resources.length)];
      const standing = genRawOrder(
        rng,
        marketPools,
        item,
        2 + (state.currentRound % 3),
        harborArrival(state),
      );
      orders.push({ id: 300, ...standing, buyer: "standing" });
      logs.push(
        `📦 Standing contract at ${harborArrival(state)}: ${item}×${standing.totalItems} for ${standing.reward} Gold.`,
      );
    }
    state.plannedOrders = orders;
    state.resourceCards = classicHarborLots(state, ctx, marketRng, orders);
    state.revealedIntel = [];
    state.phase2DemandTags = [
      ...marketPools.resources,
      ...marketPools.products,
    ];
    const reports = state.currentRound > 1 ? [orders[0]] : [];
    if (
      state.currentRound > 1 &&
      (state.difficulty === "fair_winds" || state.currentRound >= 3)
    )
      reports.push(orders[2]);
    if (revisedHarbor(state.rulesVersion)) {
      reports.push(...announced.filter((buyer) => !reports.includes(buyer)));
      state.announcedBuyers = undefined;
      if (state.currentRound < state.maxRounds) {
        const round = state.currentRound + 1;
        const next = ordinaryOrders(
          { ...state, modifierFlags: {}, currentRound: round },
          ctx,
        ).cards;
        const hasLantern = state.equippedModules.some(
          ({ id }) => id === "signal_lantern",
        );
        const publicBuyer =
          forecastFor(state, round)?.kind === "market" ? next[2] : next[1];
        state.announcedBuyers = {
          round,
          buyers: hasLantern ? [publicBuyer, next[3]] : [publicBuyer],
        };
      }
    }
    if (state.modifierFlags.coastal_forecast)
      reports.push(
        ...orders.filter((order) => !reports.includes(order)).slice(0, 2),
      );
    if (state.modifierFlags.extra_order) reports.push(orders.at(-1)!);
    state.scoutedOrders = reports;
    for (let i = 0; i < (state.modifierFlags.free_intel ?? 0); i++) {
      const tip = revealPlannedBuyer(state, intelRng);
      if (tip)
        logs.push(
          `Farsight found a buyer at ${tip.port} for ${describeWhisperCargo(tip)} paying ${tip.reward} Gold before costs.`,
        );
    }
    logs.push(
      `\n⚓=== Round ${state.currentRound} · Phase 1: Port Merchant Exchange ===`,
    );
    logs.push(`Arrived at ${harborArrival(state)} with ${state.money} Gold.`);
    if (charterOpensOn(state.difficulty, state.currentRound)) {
      const { purchase, order } = marketCountsFor(
        state.difficulty,
        state.currentRound,
      );
      logs.push(
        `The Silk Road Charter opens new ports. The board now has ${purchase} base lots and ${order} ordinary buyers.`,
      );
    }
    for (const order of reports)
      logs.push(
        `Scouted buyer at ${order.demandPort}: ${order.resources.map(({ type, required }) => `${required} ${type}`).join(", ")} for ${order.reward} Gold before costs.`,
      );
    return;
  }
  if (openHarbor(state))
    state.resourceCards = harborLots(state, marketRng, marketPools);
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
  if (openHarbor(state)) {
    const orders = ordinaryOrders(state, ctx).cards;
    const reports = state.modifierFlags.coastal_forecast
      ? [orders[3], orders[6]]
      : [];
    if (state.currentRound % 2 === 0) reports.push(orders[5]);
    if (state.modifierFlags.extra_order)
      reports.push(convergingBuyer(state, ctx, orders.length));
    state.scoutedOrders = reports;
    for (const order of reports)
      logs.push(
        `Scouted buyer at ${order.demandPort}: ${order.resources.map(({ type, required }) => `${required} ${type}`).join(", ")} for ${order.reward} Gold before costs.`,
      );
    logs.push(
      `Arrived at ${harborArrival(state)}. A visiting trader can source missing recipe inputs for a premium.`,
    );
    return;
  }
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
    state.modifierFlags.coastal_forecast &&
    expanded(state) &&
    !rebalanced(state)
      ? ordinaryOrders(state, ctx).cards.at(-1)
      : undefined;
  if (
    rebalanced(state) &&
    (state.modifierFlags.coastal_forecast || state.modifierFlags.extra_order)
  ) {
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
  if (revisedHarbor(state.rulesVersion)) {
    const announced = state.announcedBuyers;
    return announced?.round === round
      ? announced.buyers[Number(additional)]
      : undefined;
  }
  if (classicHarbor(state)) {
    if (
      round <= state.currentRound ||
      round > state.maxRounds ||
      (additional &&
        !state.equippedModules.some(({ id }) => id === "signal_lantern"))
    )
      return;
    const choices = ordinaryOrders(
      { ...state, modifierFlags: {}, currentRound: round },
      ctx,
    ).cards;
    return choices[additional ? 3 : 1];
  }
  if (openHarbor(state)) {
    if (
      round > state.maxRounds ||
      !additional ||
      !state.equippedModules.some(({ id }) => id === "signal_lantern")
    )
      return;
    return ordinaryOrders({ ...state, currentRound: round }, ctx).cards[3];
  }
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
      harborTrading(state)
        ? pick(rng, pools.products)
        : pools.products.reduce((best, item) =>
            (state.inventory[item] ?? 0) > (state.inventory[best] ?? 0)
              ? item
              : best,
          ),
      1,
    ),
  };
}

const WORKSHOP_SUPPLY_ID = 100;
export const STAPLE_CHOICES = ["Hemp", "Silk", "Tea"] as const;

function stapleReward(state: GameState, item: string) {
  const { quantity, premium } = STAPLE_TERMS[state.difficulty];
  return (COMMODITIES[item].basePrice[0] + 2) * quantity + premium + 9;
}

export function chooseStaple(state: GameState, item: string, logs: string[]) {
  if (harborTrading(state)) return;
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
      ? [
          {
            type,
            quantity,
            price: harborTrading(state)
              ? Math.ceil(
                  ((lo + hi) / 2) *
                    (state.difficulty === "fair_winds" ? 1.18 : 1.3),
                )
              : Math.ceil((lo + hi) / 2),
          },
        ]
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
  if (!card || quoteCardPayment(state, card).paid > state.money) return;
  state.resourceCards.push(card);
  purchaseCard(state, card.id, logs);
}

export function brokerOfferItem(state: GameState) {
  if (classicHarbor(state)) return undefined;
  if (!rebalanced(state)) return undefined;
  if (openHarbor(state)) {
    const local = state.phase2DemandTags.filter(
      (item) =>
        (state.inventory[item] ?? 0) > 0 ||
        state.resourceCards.some((lot) =>
          lot.resources.some((good) => good.type === item),
        ),
    );
    if (local.length) {
      const random = createRng(
        `${state.seatSeed}:V${state.voyageEpoch}:R${state.currentRound}:tip:${state.revealedIntel.length}`,
      );
      return pick(random, local);
    }
  }
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
  intel.reward =
    openHarbor(state) && !order.isProductOrder
      ? Math.round(
          order.reward *
            { fair_winds: 1.16, open_waters: 1.2, monsoon: 1.26 }[
              state.difficulty
            ],
        )
      : order.reward;
}
