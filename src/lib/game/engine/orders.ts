// Generates and settles trade orders, mandates, and Broker favors.
import {
  BROKERS_FAVOR_UNLOCK_LEVEL,
  ICONS,
  PRODUCTS,
  PRODUCTS_TIER1,
  PRODUCTS_TIER2,
  RESOURCES,
  RESOURCES_TIER1,
  WORD_ON_THE_DOCKS_REWARD,
  WORD_ON_THE_DOCKS_THRESHOLD,
} from "../constants";
import {
  MANDATE_TEMPLATES,
  difficultyConfig,
  mandateIndexFor,
  marketCountsFor,
} from "../difficulty";
import { isSilkProduct, unlockedPorts } from "../pools";
import { createRng, type Rng } from "../rng";
import type { GameContext, GameState, OrderCard } from "../types";
import { hasModule } from "./core";
import {
  genMixedOrder,
  genProductOrder,
  genRawOrder,
  poolsFor,
} from "./market";
import {
  brokersFavorCommission,
  explainTransportCost,
  explainVAT,
} from "./pricing";

export function whisperForOrder(state: GameState, order: OrderCard) {
  // Guaranteed cards keep the original slot ID, including in saved boards.
  if (order.isMandate || order.isBrokerFavor) return undefined;
  const intel = state.revealedIntel[order.id];
  return intel &&
    order.resources.length === 1 &&
    order.resources[0].type === intel.item
    ? intel
    : undefined;
}

export function quoteOrder(state: GameState, order: OrderCard) {
  const freight = explainTransportCost(state, order);
  const product =
    order.isProductOrder && !order.isMandate ? order.resources[0] : undefined;
  const vat = product
    ? explainVAT(state, product.type, order.reward / product.required!)
    : null;
  const totalVat = product && vat ? vat.final * product.required! : 0;
  let reward = order.reward - totalVat;
  const bonuses: { name: string; gold: number }[] = [];

  const applyBonus = (
    name: string,
    rate: number,
    eligible: (item: string) => boolean,
  ) => {
    if (order.isMandate) return;
    const units = order.resources.reduce(
      (sum, item) => sum + (eligible(item.type) ? (item.required ?? 0) : 0),
      0,
    );
    if (units === 0) return;
    const gold = Math.floor(((reward * units) / order.totalItems) * rate);
    bonuses.push({ name, gold });
    reward += gold;
  };

  const kilnGood = (item: string) =>
    PRODUCTS_TIER1.some((good) => good === item);
  if (hasModule(state, "silk_monopoly")) {
    applyBonus("Silk Road Monopoly", 0.2, isSilkProduct);
  }
  const kilnBonus = state.modifierFlags.charter_order_bonus;
  if (kilnBonus) {
    applyBonus("Kiln and Forge Guild", kilnBonus, kilnGood);
  }
  if (hasModule(state, "bureau_token")) {
    applyBonus(
      "Maritime Bureau Token",
      0.1,
      (item) => kilnGood(item) || RESOURCES_TIER1.some((good) => good === item),
    );
  }
  const exoticBonus = state.modifierFlags.exotic_order_bonus;
  if (exoticBonus) {
    applyBonus("Exotic Treasures", exoticBonus, (item) =>
      PRODUCTS_TIER2.some((good) => good === item),
    );
  }
  const commissionBase = reward;
  const commission = order.isBrokerFavor
    ? brokersFavorCommission(commissionBase)
    : 0;
  reward -= commission;
  return {
    freight,
    vat,
    totalVat,
    commission,
    commissionBase,
    bonuses,
    reward,
  };
}

export function completeOrder(
  state: GameState,
  orderId: number,
  logs: string[],
) {
  const order = state.customerCards.find((o) => o.id === orderId);
  if (!order) return;
  if (state.completedOrders.includes(order.id)) return;
  for (const r of order.resources) {
    if ((state.inventory[r.type] || 0) < r.required!) {
      logs.push(`❌ Inventory short! Need ${r.type}×${r.required}`);
      return;
    }
  }
  const { freight, totalVat, commission, commissionBase, bonuses, reward } =
    quoteOrder(state, order);
  if (state.money + reward < freight.final) {
    logs.push("❌ This order would cost more Gold than you have.");
    return;
  }
  for (const r of order.resources) state.inventory[r.type] -= r.required!;
  if (order.isProductOrder && !order.isMandate) {
    state.vatPaid += totalVat;
    state.roundVatPaid = (state.roundVatPaid ?? 0) + totalVat;
    logs.push(`🧾 Product Sales VAT: ${totalVat} Gold`);
  }
  for (const { name, gold } of bonuses) {
    logs.push(`${name} added ${gold} Gold to the reward`);
  }
  const fleetDiscount = freight.steps.find(
    (step) => step.label === "Fleet of Treasures module",
  );
  if (fleetDiscount && fleetDiscount.delta < 0) {
    logs.push(
      `⛵ Fleet of Treasures: Saved ${-fleetDiscount.delta} Gold on freight`,
    );
  }
  let transport = freight.final;
  if (
    hasModule(state, "salvage_crane") &&
    transport > 0 &&
    Math.random() < 0.3
  ) {
    logs.push(`♻️ Salvage Crane: Refunded ${transport} Gold transport!`);
    transport = 0;
  }
  const netBeforeAudit = reward - transport;
  const audit =
    hasModule(state, "tax_evasion") && Math.random() < 0.15
      ? Math.min(20, Math.max(0, state.money + netBeforeAudit))
      : 0;
  if (audit > 0) logs.push(`🚨 Tax Evasion Ledger audit: Paid ${audit} Gold.`);
  if (order.isBrokerFavor) {
    const pct =
      commissionBase > 0 ? Math.round((commission / commissionBase) * 100) : 0;
    logs.push(`🤝 Broker's Commission (${pct}%): ${commission} Gold`);
  }
  state.money += netBeforeAudit - audit;
  state.roundCosts += transport + audit;
  state.totalCosts += transport + audit;
  state.roundRevenue += reward;
  state.totalRevenue += reward;
  state.score += netBeforeAudit - audit;
  state.completedOrders.push(order.id);
  state.orderCount++;
  state.totalOrdersCompleted++;
  const txt = order.resources
    .map((r) => `${ICONS[r.type]}${r.type}×${r.required}`)
    .join(" + ");
  const demandPort = whisperForOrder(state, order)?.port ?? order.demandPort;
  logs.push(`📦 Completed Order at ${demandPort}: ${txt}`);
  logs.push(
    `   💰 Reward: ${reward} Gold · ⚓ Freight: ${transport} Gold = 📊 Net Profit: ${netBeforeAudit - audit} Gold${audit > 0 ? ` after ${audit} Gold audit` : ""}`,
  );
  logs.push(`📊 Completed ${state.orderCount} transactions`);
  // Signals the server when this captain first reaches the race threshold.
  if (state.totalOrdersCompleted === WORD_ON_THE_DOCKS_THRESHOLD) {
    state._pendingDocksClaim = { total: state.totalOrdersCompleted };
  }
}

// Credits the captain confirmed by the server as the race winner.
export function claimWordOnTheDocksReward(state: GameState, logs: string[]) {
  state.money += WORD_ON_THE_DOCKS_REWARD;
  logs.push(
    `📣 Word on the Docks: you were first to complete ${WORD_ON_THE_DOCKS_THRESHOLD} trade orders this voyage! +${WORD_ON_THE_DOCKS_REWARD} Gold`,
  );
}

// Adds one personal order for held cargo after validating the Renown gate.
export function callBrokersFavor(
  state: GameState,
  item: string,
  quantity: number,
  logs: string[],
) {
  if (state.phase !== 2) return;
  if (state.renownLevel < BROKERS_FAVOR_UNLOCK_LEVEL) {
    logs.push(
      `❌ Broker's Favor unlocks at Renown Level ${BROKERS_FAVOR_UNLOCK_LEVEL}`,
    );
    return;
  }
  if (state.brokersFavorUsed) {
    logs.push("❌ You've already called in a Broker's Favor this voyage");
    return;
  }
  const isRaw = (RESOURCES as readonly string[]).includes(item);
  const isProduct = (PRODUCTS as readonly string[]).includes(item);
  if (!isRaw && !isProduct) {
    logs.push(`❌ The Broker can't find a buyer for ${item}`);
    return;
  }
  const held = state.inventory[item] || 0;
  if (held <= 0) {
    logs.push(`❌ You have no ${item} in the hold for the Broker to sell`);
    return;
  }
  const qty = Math.floor(quantity);
  if (!Number.isFinite(qty) || qty < 1 || qty > held) {
    logs.push(`❌ Choose between 1 and ${held} ${item} for the Broker to sell`);
    return;
  }
  const localRng: Rng = Math.random;
  const order = isRaw
    ? genRawOrder(localRng, poolsFor(state), item, qty)
    : genProductOrder(localRng, poolsFor(state), item, qty);
  const nextId =
    state.customerCards.reduce((m, c) => Math.max(m, c.id), -1) + 1;
  state.customerCards.push({ id: nextId, ...order, isBrokerFavor: true });
  state.brokersFavorUsed = true;
  const txt = order.resources
    .map((r) => `${ICONS[r.type]}${r.type}×${r.required}`)
    .join(" + ");
  logs.push(
    `🤝 Broker's Favor called in: a buyer at ${order.demandPort} now wants ${txt}. The bigger the ask, the bigger the Broker's cut.`,
  );
}

export function intelPurchaseCount(state: GameState): number {
  const base = hasModule(state, "brokers_network") ? 2 : 1;
  const extra = hasModule(state, "ocean_relay") ? 1 : 0;
  return Math.min(base + extra, state.phase2DemandTags.length);
}

export function purchaseIntel(state: GameState, logs: string[]) {
  if (state.phase !== 1) return;
  if (!state.phase2DemandTags.length) {
    logs.push("🔮 The Broker has no more whispers...");
    return;
  }
  if (state.money < state.intelCost) {
    logs.push(`❌ Need ${state.intelCost} Gold for this purchase`);
    return;
  }
  // Ocean Interpreter adds a rumor without increasing the fee.
  const count = intelPurchaseCount(state);
  const openPorts = unlockedPorts(state.difficulty, state.currentRound);
  const cfg = difficultyConfig(state.difficulty);
  state.money -= state.intelCost;
  for (let i = 0; i < count; i++) {
    const item =
      state.phase2DemandTags[
        Math.floor(Math.random() * state.phase2DemandTags.length)
      ];
    state.phase2DemandTags.splice(state.phase2DemandTags.indexOf(item), 1);
    const port = openPorts[Math.floor(Math.random() * openPorts.length)];
    state.revealedIntel.push({ item, port });
    logs.push(
      `🗣️ Broker's Whisper: 'Word from ${port}: High demand for ${item}!'`,
    );
  }
  if (
    cfg.brokerCorruption &&
    !state.brokerTippedPirates &&
    Math.random() < cfg.brokerCorruptionChance
  ) {
    state.brokerTippedPirates = true;
    logs.push(
      `🕵️ A corrupt broker leaked your position. Base raid risk rises by ${Math.round(cfg.brokerCorruptionRisk * 100)} percentage points this round.`,
    );
  }
}

export function startPhase2(
  state: GameState,
  ctx: GameContext,
  logs: string[],
) {
  state.phase = 2;
  state.orderCount = 0;
  state.completedOrders = [];
  logs.push(
    `\n🤝=== Round ${state.currentRound} · Phase 2: Trade Transaction ===`,
  );
  // Builds a reproducible personal order board for this round.
  const orderRng = createRng(
    `${ctx.seedBase}:V${state.voyageEpoch}:R${state.currentRound}:orders`,
  );
  state.customerCards = [];
  const orderPools = poolsFor(state);
  // Uses the same charter based widening as the port market.
  const orderCount = marketCountsFor(
    state.difficulty,
    state.currentRound,
  ).order;
  for (let i = 0; i < orderCount; i++) {
    state.customerCards.push({ id: i, ...genMixedOrder(orderRng, orderPools) });
  }
  const extraOrders = state.modifierFlags.extra_order ?? 0;
  for (let i = 0; i < extraOrders; i++) {
    const nextId = orderCount + i;
    state.customerCards.push({
      id: nextId,
      ...genMixedOrder(orderRng, orderPools),
    });
    logs.push("🛍️ Merchants Converge: One extra order appeared.");
  }
  // Applies Broker guarantees after the seeded draw.
  const guaranteedCount = Math.min(
    state.revealedIntel.length,
    state.customerCards.length,
  );
  for (let i = 0; i < guaranteedCount; i++) {
    const intel = state.revealedIntel[i];
    const localRng = orderRng;
    const guaranteed = (RESOURCES as readonly string[]).includes(intel.item)
      ? genRawOrder(localRng, orderPools, intel.item)
      : genProductOrder(localRng, orderPools, intel.item);
    state.customerCards[i] = {
      id: state.customerCards[i].id,
      ...guaranteed,
      demandPort: intel.port,
    };
  }
  // Adds the same fixed, VAT exempt mandate to every captain's board.
  const mandateIdx = mandateIndexFor(state.difficulty, state.currentRound);
  const mandate =
    mandateIdx === undefined ? undefined : MANDATE_TEMPLATES[mandateIdx];
  if (mandate) {
    const nextId =
      state.customerCards.reduce((m, c) => Math.max(m, c.id), -1) + 1;
    // Places the mandate first without changing card identity.
    state.customerCards.unshift({
      id: nextId,
      demandPort: mandate.port,
      resources: mandate.resources.map((r) => ({
        type: r.type,
        required: r.required,
      })),
      reward: mandate.reward,
      totalItems: mandate.resources.reduce((s, r) => s + r.required, 0),
      isProductOrder: false,
      isMandate: true,
    });
    const need = mandate.resources
      .map((r) => `${ICONS[r.type]}${r.type}×${r.required}`)
      .join(" + ");
    logs.push(
      `📜 Imperial Mandate at ${mandate.port}: ${need} for ${mandate.reward} Gold. The Emperor's commission is exempt from VAT.`,
    );
  }
}
