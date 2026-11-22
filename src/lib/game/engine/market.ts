// Seeded market draws depend only on captain, room, voyage, and unlocked
// pools so reloads reproduce the same board. Phase 2 shares these generators.
import {
  COMMODITIES,
  ICONS,
  PRODUCT_PRICES,
  RECIPES,
  RESOURCE_WEIGHTS,
} from "../constants";
import { charterOpensOn, marketCountsFor } from "../difficulty";
import {
  unlockedPorts,
  unlockedProducts,
  unlockedResourceDraw,
  unlockedResources,
} from "../pools";
import { createRng, pick, randInt, type Rng } from "../rng";
import type { GameContext, GameState, OrderCard, ResourceCard } from "../types";
import { addOwnedAmount } from "./core";
import { explainCardPrice, portResourcePrice } from "./pricing";

// Optional pools and quantities support charter content and Broker orders.
export type MarketPools = {
  resources: string[];
  products: string[];
  ports: string[];
  draw: { items: string[]; probs: number[] };
};

export function poolsFor(state: GameState): MarketPools {
  const { difficulty, currentRound } = state;
  return {
    resources: unlockedResources(difficulty, currentRound),
    products: unlockedProducts(difficulty, currentRound),
    ports: unlockedPorts(difficulty, currentRound),
    draw: unlockedResourceDraw(difficulty, currentRound),
  };
}

export function genRawOrder(
  rng: Rng,
  pools: MarketPools,
  filter: string | null = null,
  quantityOverride?: number,
): Omit<OrderCard, "id"> {
  const num = randInt(rng, 1, 3);
  const resources: { type: string; required: number }[] = [];
  const available = [...pools.resources];
  const port = pick(rng, pools.ports);
  let total = 0;
  if (pools.resources.includes(filter ?? "")) {
    const req = quantityOverride ?? randInt(rng, 2, 5);
    total += req;
    resources.push({ type: filter as string, required: req });
  } else {
    for (let i = 0; i < num; i++) {
      if (!available.length) break;
      const r = pick(rng, available);
      available.splice(available.indexOf(r), 1);
      const req = randInt(rng, 2, 5);
      total += req;
      resources.push({ type: r, required: req });
    }
  }
  const base = resources.reduce((s, r) => s + r.required * 5, 0);
  return {
    demandPort: port,
    resources,
    reward: base + randInt(rng, 10, 25),
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
  const basePrice = randInt(
    rng,
    PRODUCT_PRICES[product][0],
    PRODUCT_PRICES[product][1],
  );
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
  return rng() < 0.5 ? genRawOrder(rng, pools) : genProductOrder(rng, pools);
}

function genProductPurchaseCard(
  rng: Rng,
  pools: MarketPools,
): Omit<ResourceCard, "id"> {
  const product = pick(rng, pools.products);
  const qty = randInt(rng, 1, 2);
  const port = pick(rng, pools.ports);
  const recipe = RECIPES[product];
  let matCost = 0;
  const details: string[] = [];
  for (const [m, a] of Object.entries(recipe.materials)) {
    const avg = (COMMODITIES[m].basePrice[0] + COMMODITIES[m].basePrice[1]) / 2;
    matCost += avg * a;
    details.push(`${m}×${a}`);
  }
  const markup = 1.4 + rng() * 0.4;
  let unitPrice = Math.floor(matCost * markup);
  const [min, max] = PRODUCT_PRICES[product];
  unitPrice = Math.max(min, Math.min(unitPrice, max));
  return {
    port,
    resources: [
      {
        type: product,
        quantity: qty,
        price: unitPrice,
        materialCost: matCost,
        materialDetails: details.join(" + "),
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
  pulse: Record<string, number> = {},
): Omit<ResourceCard, "id"> {
  if (rng() < 0.3) return genProductPurchaseCard(rng, pools);
  const num = randInt(rng, 1, 3);
  const resources: { type: string; quantity: number; price: number }[] = [];
  const available = [...pools.draw.items];
  const probs = [...pools.draw.probs];
  const port = pick(rng, pools.ports);
  for (let i = 0; i < num; i++) {
    if (!available.length) break;
    const r = rng();
    let acc = 0;
    let chosen = available[0];
    for (let j = 0; j < available.length; j++) {
      acc += probs[j];
      if (r <= acc) {
        chosen = available[j];
        break;
      }
    }
    const idx = available.indexOf(chosen);
    available.splice(idx, 1);
    probs.splice(idx, 1);
    const qty = randInt(rng, 1, 3);
    const [min, max] = COMMODITIES[chosen].basePrice;
    const base = randInt(rng, min, max);
    const price = portResourcePrice(chosen, base, port, pulse[chosen] ?? 0);
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

export function purchaseCard(state: GameState, cardId: number, logs: string[]) {
  const card = state.resourceCards.find((c) => c.id === cardId);
  if (!card) return;
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
  for (const { label, delta } of steps) {
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
  state.purchaseCount = 0;
  state.purchasedCards = [];
  state.phase2DemandTags = [];
  // Builds the deterministic intel pool for this captain and round.
  const intelRng = createRng(
    `${ctx.seedBase}:V${state.voyageEpoch}:R${state.currentRound}:intel`,
  );
  const marketPools = poolsFor(state);
  const allItems = [...marketPools.resources, ...marketPools.products];
  for (let i = 0; i < 5 && allItems.length; i++) {
    const index = Math.floor(intelRng() * allItems.length);
    state.phase2DemandTags.push(allItems.splice(index, 1)[0]);
  }
  state.revealedIntel = [];
  // Farsight draws from this pool without consuming paid intel.
  const freeIntel = state.modifierFlags.free_intel ?? 0;
  for (let i = 0; i < freeIntel; i++) {
    if (!state.phase2DemandTags.length) break;
    const idx = Math.floor(intelRng() * state.phase2DemandTags.length);
    const item = state.phase2DemandTags.splice(idx, 1)[0];
    const openPorts = unlockedPorts(state.difficulty, state.currentRound);
    const port = openPorts[Math.floor(intelRng() * openPorts.length)];
    state.revealedIntel.push({ item, port });
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
      `🗺️ The Silk Road Charter opens! The harbor grows busier: ${tierPurchaseCount} cargo lots and as many buyers from this voyage on.`,
    );
  }
  // Tidewatch adds one card without repeating its activation message.
  const purchaseCount = tierPurchaseCount + (state.tidewatchSurge ? 1 : 0);
  for (let i = 0; i < purchaseCount; i++) {
    state.resourceCards.push({
      id: i,
      ...genResourceCard(marketRng, marketPools, state.harborPulse),
    });
  }
}

export function completePhase1(state: GameState, logs: string[]) {
  if (state.purchaseCount === 0) logs.push("⏭️ Purchasing skipped");
  else logs.push(`✅ Purchasing ended, bought ${state.purchaseCount} batches`);
  state.phase = "barter";
}
