// Generates and settles trade orders, mandates, and Broker favors.
import {
  BROKERS_FAVOR_UNLOCK_LEVEL,
  ICONS,
  PRODUCTS_TIER1,
  PRODUCTS_TIER2,
  RESOURCES,
  RESOURCES_TIER1,
  WORD_ON_THE_DOCKS_LEDGER_ENTRY,
  WORD_ON_THE_DOCKS_REWARD,
  WORD_ON_THE_DOCKS_THRESHOLD,
} from "../constants";
import {
  MANDATE_TEMPLATES,
  difficultyConfig,
  mandateIndexFor,
} from "../difficulty";
import { isSilkProduct, unlockedPorts } from "../pools";

import {
  EFFECT,
  expanded,
  effectUses,
  isOceanMaterial,
  spendEffect,
} from "../expansion";
import {
  brokerWhisperCapacity,
  revealBrokerWhisper,
  whisperForOrder,
} from "../broker-whispers";
import { voyageRandom } from "../voyage-rng";

import type { GameContext, GameState, OrderCard } from "../types";
import { hasModule, whisperCost } from "./core";
import {
  genMixedOrder,
  ordinaryOrders,
  genProductOrder,
  genRawOrder,
  poolsFor,
} from "./market";
import {
  brokersFavorCommission,
  explainTransportCost,
  explainVAT,
} from "./pricing";

export { whisperForOrder } from "../broker-whispers";

export function quoteOrder(state: GameState, order: OrderCard) {
  const freight = explainTransportCost(state, order);
  const product =
    order.isProductOrder && !order.isMandate ? order.resources[0] : undefined;
  const vat = product
    ? explainVAT(state, product.type, order.reward / product.required!)
    : null;
  const totalVat = product && vat ? vat.final * product.required! : 0;
  let reward = order.reward - totalVat;
  const bonuses: { name: string; gold: number; effect?: string }[] = [];

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
  if (expanded(state) && !order.isMandate && !order.isBrokerFavor) {
    const addFlat = (effect: string, name: string, gold: number) => {
      if (effectUses(state, effect)) return;
      bonuses.push({ effect, name, gold });
      reward += gold;
    };
    if (state.modifierFlags.reliable_buyer && order.staple)
      addFlat("reliable_buyer", "Reliable Buyer", EFFECT.reliableBuyer);
    if (
      state.modifierFlags.ceramic_commission &&
      order.resources.some(
        ({ type }) => type === "Celadon Ware" || type === "Lacquered Jar",
      )
    )
      addFlat(
        "ceramic_commission",
        "Ceramic Commission",
        EFFECT.ceramicCommission,
      );
    if (
      state.modifierFlags.rare_cargo_charter &&
      order.resources.some(
        ({ type, required }) => isOceanMaterial(type) && (required ?? 0) >= 2,
      )
    )
      addFlat(
        "rare_cargo_charter",
        "Rare Cargo Charter",
        EFFECT.rareCargoCharter,
      );
    if (
      hasModule(state, "ocean_exchange_ledger") &&
      order.resources.some(({ type }) => isOceanMaterial(type))
    )
      addFlat(
        "ocean_exchange_ledger",
        "Ocean Exchange Ledger",
        EFFECT.oceanExchangeLedger,
      );
  }
  const commissionBase = reward;
  const commission = order.isBrokerFavor
    ? brokersFavorCommission(commissionBase)
    : 0;
  reward -= commission;
  const salvageChance =
    hasModule(state, "salvage_crane") && freight.final > 0 ? 0.3 : 0;
  const auditChance = hasModule(state, "tax_evasion") ? 0.15 : 0;
  return {
    freight,
    vat,
    totalVat,
    commission,
    commissionBase,
    bonuses,
    reward,
    salvageChance,
    auditChance,
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
  const {
    freight,
    totalVat,
    commission,
    commissionBase,
    bonuses,
    reward,
    salvageChance,
    auditChance,
  } = quoteOrder(state, order);
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
  for (const { name, gold, effect } of bonuses) {
    if (effect) spendEffect(state, effect);
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
  for (const { label, delta, effect } of freight.steps) {
    if (!effect) continue;
    spendEffect(state, effect);
    if (delta < 0) logs.push(`${label} saved ${-delta} Gold on freight`);
  }
  const random = voyageRandom(state, `settleOrder:${order.id}`);
  let transport = freight.final;
  if (salvageChance && random() < salvageChance) {
    logs.push(`♻️ Salvage Crane: Refunded ${transport} Gold transport!`);
    transport = 0;
  }
  const netBeforeAudit = reward - transport;
  const audit =
    auditChance && random() < auditChance
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
  if (state.docksRewardClaimed) return;
  state.docksRewardClaimed = true;
  state.money += WORD_ON_THE_DOCKS_REWARD;
  logs.push(WORD_ON_THE_DOCKS_LEDGER_ENTRY);
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
  const pools = poolsFor(state);
  const isRaw = pools.resources.includes(item);
  const isProduct = pools.products.includes(item);
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
  const localRng = voyageRandom(state, "brokerFavor");
  const order = isRaw
    ? genRawOrder(localRng, pools, item, qty)
    : genProductOrder(localRng, pools, item, qty);
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
  return Math.max(
    0,
    Math.min(
      base + extra,
      state.phase2DemandTags.length,
      brokerWhisperCapacity(state) - state.revealedIntel.length,
    ),
  );
}

export function purchaseIntel(state: GameState, logs: string[]) {
  if (state.phase !== 1) return;
  const count = intelPurchaseCount(state);
  if (!count) {
    logs.push("🔮 The Broker has no more whispers...");
    return;
  }
  const cost = whisperCost(state);
  if (state.money < cost) {
    logs.push(`❌ Need ${cost} Gold for this purchase`);
    return;
  }
  // Ocean Interpreter adds a rumor without increasing the fee.
  const openPorts = unlockedPorts(state.difficulty, state.currentRound);
  const cfg = difficultyConfig(state.difficulty);
  const random = voyageRandom(state, `whisper:${state.revealedIntel.length}`);
  state.money -= cost;
  for (let i = 0; i < count; i++) {
    const tip = revealBrokerWhisper(state, random, openPorts);
    if (!tip) break;
    const { item, port } = tip;
    logs.push(
      `🗣️ Broker's Whisper: 'Word from ${port}: High demand for ${item}!'`,
    );
  }
  if (
    cfg.brokerCorruption &&
    !state.brokerTippedPirates &&
    random() < cfg.brokerCorruptionChance
  ) {
    state.brokerTippedPirates = true;
    logs.push(
      state.modifierFlags.false_colors
        ? "False Colors masked the Broker leak. Raid risk stayed unchanged."
        : `🕵️ A corrupt broker leaked your position. Base raid risk rises by ${Math.round(cfg.brokerCorruptionRisk * 100)} percentage points this round.`,
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
  state.seatSeed ??= ctx.seedBase;
  const orderPools = poolsFor(state);
  const { cards, random: orderRng } = ordinaryOrders(state, ctx);
  state.customerCards = cards;
  const orderCount = cards.length;
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
    brokerWhisperCapacity(state),
  );
  for (let i = 0; i < guaranteedCount; i++) {
    const intel = state.revealedIntel[i];
    const guaranteed = (RESOURCES as readonly string[]).includes(intel.item)
      ? genRawOrder(orderRng, orderPools, intel.item, undefined, intel.port)
      : genProductOrder(orderRng, orderPools, intel.item);
    const slot = i + Number(expanded(state));
    const id = state.customerCards[slot].id;
    intel.orderId = id;
    state.customerCards[slot] = {
      id,
      whisperIndex: i,
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
