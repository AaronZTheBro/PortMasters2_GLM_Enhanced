import {
  brokerOfferItem,
  convergingBuyer,
  prepareWhisperOrder,
  productMidpoint,
} from "./market";
import { canProduce, isOceanCargo, unlockedProducts } from "../pools";
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
  REBALANCE,
  rebalanced,
  forecastFor,
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
    effect?: string,
    cap = Infinity,
  ) => {
    if (order.isMandate || order.clearance) return;
    const units = order.resources.reduce(
      (sum, item) => sum + (eligible(item.type) ? (item.required ?? 0) : 0),
      0,
    );
    if (units === 0) return;
    const base = rebalanced(state) ? order.reward - totalVat : reward;
    const gold = Math.min(
      cap,
      Math.floor(((base * units) / order.totalItems) * rate),
    );
    if (gold <= 0 && rebalanced(state)) return;
    bonuses.push({ name, gold, effect });
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
  if (
    expanded(state) &&
    !order.isMandate &&
    !order.isBrokerFavor &&
    !order.clearance
  ) {
    const addFlat = (effect: string, name: string, gold: number) => {
      if (effectUses(state, effect)) return;
      bonuses.push({ effect, name, gold });
      reward += gold;
    };
    if (state.modifierFlags.reliable_buyer && order.staple)
      addFlat(
        "reliable_buyer",
        "Reliable Buyer",
        rebalanced(state) ? REBALANCE.reliableBuyer : EFFECT.reliableBuyer,
      );
    if (rebalanced(state)) {
      const ocean = (item: string) => isOceanCargo(item, state.rulesVersion);
      const ceramic = (item: string) =>
        item === "Celadon Ware" || item === "Lacquered Jar";
      if (state.modifierFlags.ceramic_commission)
        applyBonus(
          "Ceramic Commission",
          REBALANCE.ceramicRate,
          ceramic,
          "ceramic_commission",
          REBALANCE.ceramicCap - effectUses(state, "ceramic_commission"),
        );
      if (state.modifierFlags.rare_cargo_charter)
        applyBonus(
          "Rare Cargo Charter",
          REBALANCE.rareRate,
          ocean,
          "rare_cargo_charter",
          REBALANCE.rareCap - effectUses(state, "rare_cargo_charter"),
        );
      if (hasModule(state, "ocean_exchange_ledger"))
        applyBonus(
          "Ocean Exchange Ledger",
          REBALANCE.oceanRate,
          ocean,
          "ocean_exchange_ledger",
          REBALANCE.oceanCap - effectUses(state, "ocean_exchange_ledger"),
        );
      if (hasModule(state, "convoy_pennant") && forecastFor(state))
        addFlat("convoy_pennant", "Convoy Pennant", REBALANCE.convoyReward);
    } else {
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
  if (rebalanced(state) && state.phase !== 2) return;
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
    if (effect)
      spendEffect(
        state,
        effect,
        rebalanced(state) &&
          [
            "ceramic_commission",
            "rare_cargo_charter",
            "ocean_exchange_ledger",
          ].includes(effect)
          ? gold
          : 1,
      );
    logs.push(`${name} added ${gold} Gold to the reward`);
  }
  const fleetDiscount = freight.steps.find(
    (step) => step.label === "Fleet of Treasures module",
  );
  if (!rebalanced(state) && fleetDiscount && fleetDiscount.delta < 0) {
    logs.push(
      `⛵ Fleet of Treasures: Saved ${-fleetDiscount.delta} Gold on freight`,
    );
  }
  for (const { label, delta, effect } of freight.steps) {
    if (!effect && !rebalanced(state)) continue;
    if (effect && !(rebalanced(state) && effect === "convoy_pennant"))
      spendEffect(state, effect);
    if (delta < 0) logs.push(`${label} saved ${-delta} Gold on freight`);
  }
  if (
    rebalanced(state) &&
    hasModule(state, "convoy_pennant") &&
    !order.isMandate &&
    !order.isBrokerFavor &&
    !order.clearance &&
    !effectUses(state, "convoy_pennant")
  )
    spendEffect(state, "convoy_pennant");
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
  if (!order.clearance) state.score += netBeforeAudit - audit;
  state.completedOrders.push(order.id);
  state.orderCount++;
  if (!order.clearance) state.totalOrdersCompleted++;
  const txt = order.resources
    .map((r) => `${ICONS[r.type]}${r.type}×${r.required}`)
    .join(" + ");
  const demandPort = whisperForOrder(state, order)?.port ?? order.demandPort;
  logs.push(`📦 Completed Order at ${demandPort}: ${txt}`);
  logs.push(
    `   💰 Reward: ${reward} Gold · ⚓ Freight: ${transport} Gold = 📊 Net Proceeds: ${netBeforeAudit - audit} Gold${audit > 0 ? ` after ${audit} Gold audit` : ""}`,
  );
  logs.push(`📊 Completed ${state.orderCount} transactions`);
  // Signals the server when this captain first reaches the race threshold.
  if (
    !order.clearance &&
    state.totalOrdersCompleted === WORD_ON_THE_DOCKS_THRESHOLD
  ) {
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

export function purchaseIntel(
  state: GameState,
  logs: string[],
  preferred?: string,
) {
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
  if (rebalanced(state)) {
    state.roundCosts += cost;
    state.totalCosts += cost;
  }
  for (let i = 0; i < count; i++) {
    const tip = revealBrokerWhisper(
      state,
      random,
      openPorts,
      rebalanced(state)
        ? i === 0
          ? (preferred ?? brokerOfferItem(state))
          : brokerOfferItem(state)
        : undefined,
    );
    if (!tip) break;
    prepareWhisperOrder(state, tip);
    const { item, port } = tip;
    if (rebalanced(state))
      logs.push(
        `Broker guaranteed ${tip.quantity} ${item} at ${port} for ${tip.reward} Gold before costs.`,
      );
    else
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
    `\n🤝=== Round ${state.currentRound} · Phase 2: Trade Manifest ===`,
  );
  state.seatSeed ??= ctx.seedBase;
  const orderPools = poolsFor(state);
  const { cards, random: orderRng } = ordinaryOrders(state, ctx);
  state.customerCards = cards;
  const orderCount = cards.length;
  const extraOrders = state.modifierFlags.extra_order ?? 0;
  for (let i = 0; i < extraOrders; i++) {
    const nextId = orderCount + i;
    const scouted = state.scoutedOrders?.find(({ id }) => id === nextId);
    state.customerCards.push(
      rebalanced(state)
        ? (scouted ?? convergingBuyer(state, ctx, nextId))
        : { id: nextId, ...genMixedOrder(orderRng, orderPools) },
    );
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
      ...(rebalanced(state) && intel.quantity && intel.reward !== undefined
        ? {
            resources: [{ type: intel.item, required: intel.quantity }],
            totalItems: intel.quantity,
            reward: intel.reward,
          }
        : {}),
      demandPort: intel.port,
    };
  }
  const workshop = workshopBuyer(state, state.currentRound);
  if (workshop) state.customerCards.push(workshop);
  if (state.workshopContracts)
    state.workshopContracts = state.workshopContracts.filter(
      ({ round }) => round >= state.currentRound,
    );
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

export function workshopOptions(state: GameState, round = state.currentRound) {
  return unlockedProducts(
    state.difficulty,
    round,
    state.rulesVersion,
    state.specialties,
  ).filter((item) =>
    Object.entries(state.workers).some(
      ([type, crew]) => crew.length && canProduce(type, item),
    ),
  );
}

export function chooseWorkshopContract(
  state: GameState,
  item: string,
  quantity: number,
  logs: string[],
) {
  if (
    !rebalanced(state) ||
    state.phase !== "worker_mgmt" ||
    state.currentRound >= state.maxRounds ||
    !workshopOptions(state).includes(item) ||
    ![1, 2].includes(quantity)
  )
    return;
  const round = state.currentRound + 1;
  const previous = state.workshopContracts?.find(
    (contract) => contract.round === round,
  );
  if (previous?.item === item && previous.quantity === quantity) return;
  state.workshopContracts = [
    ...(state.workshopContracts ?? []).filter(
      (contract) => contract.round === state.currentRound,
    ),
    { round, item, quantity },
  ];
  const order = workshopBuyer(state, round)!;
  logs.push(
    `Workshop buyer booked for round ${round}. Deliver ${quantity} ${item} at ${order.demandPort} for ${order.reward} Gold before costs.`,
  );
}

export function workshopBuyer(
  state: GameState,
  round: number,
): OrderCard | undefined {
  const contract = state.workshopContracts?.find(
    (entry) => entry.round === round,
  );
  if (!rebalanced(state) || !contract || contract.round !== round) return;
  const { item, quantity } = contract;
  return {
    id: 50,
    demandPort: "Quanzhou Port",
    resources: [{ type: item, required: quantity }],
    reward:
      Math.floor(productMidpoint(item, state.rulesVersion) * 0.85) * quantity,
    totalItems: quantity,
    isProductOrder: true,
    workshop: true,
  };
}

export const CLEARANCE_ID = 100;
export function quoteClearance(
  state: GameState,
  item: string,
  quantity: number,
): OrderCard | undefined {
  if (
    !rebalanced(state) ||
    state.phase !== 2 ||
    state.completedOrders.includes(CLEARANCE_ID) ||
    ![1, 2].includes(quantity) ||
    (state.inventory[item] ?? 0) < quantity ||
    !unlockedProducts(
      state.difficulty,
      state.currentRound,
      state.rulesVersion,
      state.specialties,
    ).includes(item)
  )
    return;
  return {
    id: CLEARANCE_ID,
    demandPort: "Clearance Buyer",
    resources: [{ type: item, required: quantity }],
    reward:
      Math.floor(
        productMidpoint(item, state.rulesVersion) * REBALANCE.clearanceRate,
      ) * quantity,
    totalItems: quantity,
    isProductOrder: true,
    clearance: true,
  };
}

export function sellClearance(
  state: GameState,
  item: string,
  quantity: number,
  logs: string[],
) {
  const order = quoteClearance(state, item, quantity);
  if (!order) return;
  const quote = quoteOrder(state, order);
  if (state.money + quote.reward < quote.freight.final) return;
  state.customerCards.push(order);
  completeOrder(state, order.id, logs);
}
