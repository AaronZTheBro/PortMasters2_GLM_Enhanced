import {
  brokerOfferItem,
  harborArrival,
  convergingBuyer,
  prepareWhisperOrder,
  productMidpoint,
} from "./market";
import { canProduce, isOceanCargo, unlockedProducts } from "../pools";
// Generates and settles trade orders, mandates, and Broker favors.
import {
  BROKERS_FAVOR_UNLOCK_LEVEL,
  ICONS,
  COMMODITIES,
  ITEMS,
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
  classicHarbor,
  harborTrading,
  forecastFor,
  isOceanMaterial,
  spendEffect,
} from "../expansion";
import {
  brokerWhisperCapacity,
  revealBrokerWhisper,
  remainingPlannedBuyers,
  revealPlannedBuyer,
  describeWhisperCargo,
  whisperForOrder,
} from "../broker-whispers";
import { createRng } from "../rng";
import { CERAMICS, TEXTILES } from "../harbor-catalog";
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
  marketResourceAdjustment,
} from "./pricing";

export { whisperForOrder } from "../broker-whispers";

function ordinarySale(order: OrderCard) {
  return !order.isMandate && !order.isBrokerFavor && !order.clearance;
}

function ceramicSale(order: OrderCard) {
  return (
    ordinarySale(order) &&
    order.resources.some(({ type }) => CERAMICS.has(type))
  );
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
  const bonuses: { name: string; gold: number; effect?: string }[] = [];

  const applyBonus = (
    name: string,
    rate: number,
    eligible: (item: string) => boolean,
    effect?: string,
    cap = Infinity,
  ) => {
    if (
      order.isMandate ||
      order.clearance ||
      (harborTrading(state) && order.isBrokerFavor)
    )
      return;
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
    harborTrading(state) &&
    ordinarySale(order) &&
    state.modifierFlags.vat_discount
  )
    applyBonus(
      "Frontier Tariff Relief",
      0.12,
      (item) => !(item in COMMODITIES),
    );

  const addFlat = (effect: string, name: string, gold: number) => {
    if (gold <= 0 || effectUses(state, effect)) return;
    bonuses.push({ effect, name, gold });
    reward += gold;
  };
  if (expanded(state) && ordinarySale(order)) {
    if (
      state.modifierFlags.reliable_buyer &&
      (order.staple || (harborTrading(state) && order.buyer === "merchant"))
    )
      addFlat(
        "reliable_buyer",
        "Reliable Buyer",
        rebalanced(state) ? REBALANCE.reliableBuyer : EFFECT.reliableBuyer,
      );
    if (rebalanced(state)) {
      const ocean = (item: string) => isOceanCargo(item, state.rulesVersion);
      const ceramic = (item: string) =>
        harborTrading(state)
          ? CERAMICS.has(item)
          : item === "Celadon Ware" || item === "Lacquered Jar";
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
  if (harborTrading(state) && ordinarySale(order)) {
    const any = () => true;
    if (hasModule(state, "silk_market_charter"))
      applyBonus(
        "Silk Market Charter",
        0.25,
        (item) => item === "Silk" || isSilkProduct(item),
      );
    if (state.modifierFlags.buyers_festival)
      applyBonus(
        "Buyer's Festival",
        0.2,
        (item) => TEXTILES.has(item),
        "buyers_festival",
        18 - effectUses(state, "buyers_festival"),
      );
    if (
      hasModule(state, "traveling_commission") &&
      state.travelingCommissionRound === state.currentRound &&
      order.isProductOrder &&
      !effectUses(state, "traveling_commission")
    )
      applyBonus("Traveling Commission", 0.15, any, "traveling_commission");
    if (
      hasModule(state, "storm_dividend") &&
      state.directPassageRound === state.currentRound - 1 &&
      !effectUses(state, "storm_dividend")
    )
      applyBonus("Storm Dividend", 0.25, any, "storm_dividend");
    if (
      state.modifierFlags.market_momentum &&
      effectUses(state, "momentum_ready") &&
      !effectUses(state, "market_momentum") &&
      order.isProductOrder
    )
      applyBonus("Market Momentum", 0.2, any, "market_momentum");
    if (hasModule(state, "open_hold") && !order.isProductOrder) {
      const rawTypes = new Set(
        order.resources
          .map(({ type }) => type)
          .filter((type) => type in COMMODITIES),
      );
      if (rawTypes.size >= 2)
        addFlat("open_hold", "Open Hold", Math.min(15, rawTypes.size * 5));
    }
    if (
      hasModule(state, "collectors_seal") &&
      ceramicSale(order) &&
      !state.customerCards.some(
        (buyer) =>
          state.completedOrders.includes(buyer.id) && ceramicSale(buyer),
      )
    )
      addFlat(
        "collectors_seal",
        "Collector's Seal",
        Math.min(15, (state.ceramicCollection?.length ?? 0) * 5),
      );
  }
  const commissionBase = reward;
  const commission = order.isBrokerFavor
    ? brokersFavorCommission(commissionBase)
    : 0;
  reward -= commission;
  const salvageChance =
    hasModule(state, "salvage_crane") && freight.final > 0
      ? harborTrading(state)
        ? 0.5
        : 0.3
      : 0;
  const auditChance =
    hasModule(state, "tax_evasion") &&
    (!harborTrading(state) || !effectUses(state, "tax_audit"))
      ? 0.15
      : 0;
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
            "buyers_festival",
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
  if (audit > 0) {
    if (harborTrading(state)) spendEffect(state, "tax_audit");
    logs.push(`🚨 Tax Evasion Ledger audit: Paid ${audit} Gold.`);
  }
  if (order.isBrokerFavor) {
    const pct =
      commissionBase > 0 ? Math.round((commission / commissionBase) * 100) : 0;
    logs.push(`🤝 Broker's Commission (${pct}%): ${commission} Gold`);
  }
  order.settledGold = settleSale(state, reward, transport, audit);
  if (!order.clearance) state.score += order.settledGold;
  if (harborTrading(state) && ordinarySale(order)) {
    if (
      hasModule(state, "storm_dividend") &&
      state.directPassageRound === state.currentRound - 1 &&
      !effectUses(state, "storm_dividend")
    )
      spendEffect(state, "storm_dividend");
    if (
      order.isProductOrder &&
      hasModule(state, "traveling_commission") &&
      state.travelingCommissionRound === state.currentRound &&
      !effectUses(state, "traveling_commission")
    )
      spendEffect(state, "traveling_commission");
    if (
      order.isProductOrder &&
      state.modifierFlags.market_momentum &&
      effectUses(state, "momentum_ready") &&
      !effectUses(state, "market_momentum")
    )
      spendEffect(state, "market_momentum");
    if (
      !order.isProductOrder &&
      state.modifierFlags.market_momentum &&
      !effectUses(state, "momentum_ready")
    ) {
      spendEffect(state, "momentum_ready");
      logs.push(
        "Market Momentum is ready for an ordinary finished good order this round.",
      );
    }
    if (order.isProductOrder && hasModule(state, "traveling_commission")) {
      const previous = state.finishedSales ?? [];
      state.finishedSales = [
        ...new Set([...previous, ...order.resources.map(({ type }) => type)]),
      ];
      if (
        previous.length < 2 &&
        state.finishedSales.length >= 2 &&
        state.currentRound < state.maxRounds
      ) {
        state.travelingCommissionRound = state.currentRound + 1;
        logs.push("Traveling Commission is ready for next round.");
      }
    }
    if (hasModule(state, "collectors_seal") && ceramicSale(order)) {
      const seen = state.ceramicCollection ?? [];
      const novel = order.resources
        .map(({ type }) => type)
        .filter((type) => CERAMICS.has(type) && !seen.includes(type));
      state.ceramicCollection = [...seen, ...novel];
      if (novel.length)
        logs.push(
          `Collector's Seal recorded ${novel.join(", ")} for future ceramic sales.`,
        );
    }
  }
  state.completedOrders.push(order.id);
  state.orderCount++;
  if (!order.clearance) state.totalOrdersCompleted++;
  const txt = order.resources
    .map((r) => `${ICONS[r.type]}${r.type}×${r.required}`)
    .join(" + ");
  const demandPort = whisperForOrder(state, order)?.port ?? order.demandPort;
  logs.push(`📦 Completed Order at ${demandPort}: ${txt}`);
  logs.push(
    `   💰 Reward: ${reward} Gold · ⚓ Freight: ${transport} Gold = 📊 ${order.settledGold < 0 ? "Net Cost" : "Net Proceeds"}: ${Math.abs(order.settledGold)} Gold${audit > 0 ? ` after ${audit} Gold audit` : ""}`,
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
  if (harborTrading(state) && effectUses(state, "broker_bundle")) return 0;
  const base = hasModule(state, "brokers_network") ? 2 : 1;
  const extra = hasModule(state, "ocean_relay") ? 1 : 0;
  return Math.max(
    0,
    Math.min(
      base + extra,
      classicHarbor(state)
        ? remainingPlannedBuyers(state).length
        : state.phase2DemandTags.length,
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
  if (harborTrading(state) && effectUses(state, "broker_bundle")) {
    logs.push("The paid Broker bundle was already purchased this round.");
    return;
  }
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
  const openPorts = unlockedPorts(
    state.difficulty,
    state.currentRound,
    state.rulesVersion,
  );
  const cfg = difficultyConfig(state.difficulty);
  const random = voyageRandom(state, `whisper:${state.revealedIntel.length}`);
  state.money -= cost;
  if (harborTrading(state)) spendEffect(state, "broker_bundle");
  if (rebalanced(state)) {
    state.roundCosts += cost;
    state.totalCosts += cost;
  }
  for (let i = 0; i < count; i++) {
    if (classicHarbor(state)) {
      const tip = revealPlannedBuyer(
        state,
        random,
        i === 0 ? preferred : undefined,
      );
      if (tip)
        logs.push(
          `Broker revealed a buyer at ${tip.port} for ${describeWhisperCargo(tip)} paying ${tip.reward} Gold before costs.`,
        );
      continue;
    }
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
  if (classicHarbor(state)) {
    const planned = state.plannedOrders ?? ordinaryOrders(state, ctx).cards;
    state.customerCards = planned.map((order) => {
      const index = state.revealedIntel.findIndex(
        ({ orderId }) => orderId === order.id,
      );
      return index < 0 ? order : { ...order, whisperIndex: index };
    });
    state.plannedOrders = undefined;
  } else {
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
      const id = harborTrading(state) ? 200 + i : state.customerCards[slot].id;
      intel.orderId = id;
      state.customerCards[
        harborTrading(state) ? state.customerCards.length : slot
      ] = {
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
  }
  const workshop = workshopBuyer(state, state.currentRound);
  if (workshop) state.customerCards.push(workshop);
  if (state.workshopContracts)
    state.workshopContracts = state.workshopContracts.filter(
      ({ round }) => round >= state.currentRound,
    );
  // Adds the same fixed, VAT exempt mandate to every captain's board.
  const mandateIdx = mandateIndexFor(
    state.difficulty,
    state.currentRound,
    state.rulesVersion,
  );
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
  if (harborTrading(state)) return;
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
  if (harborTrading(state)) return;
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

function settleSale(
  state: GameState,
  reward: number,
  freight: number,
  otherCost = 0,
) {
  const net = reward - freight - otherCost;
  state.money += net;
  state.roundCosts += freight + otherCost;
  state.totalCosts += freight + otherCost;
  state.roundRevenue += reward;
  state.totalRevenue += reward;
  return net;
}

export function quotePortExchange(
  state: GameState,
  item: string,
  quantity: number,
) {
  if (
    !harborTrading(state) ||
    state.phase !== 2 ||
    state.gameOver ||
    !(ITEMS as readonly string[]).includes(item) ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > (state.inventory[item] ?? 0)
  )
    return;
  const sold = state.exchangeSales?.[item] ?? 0;
  const tierUnits = Math.min(quantity, Math.max(0, 3 - sold));
  const port = harborArrival(state);
  const event = forecastFor(state);
  const raw = COMMODITIES[item];
  const value = raw
    ? (raw.basePrice[0] + raw.basePrice[1]) / 2 + 2
    : productMidpoint(item, state.rulesVersion);
  const markup = raw
    ? (raw.ports.includes(port) ? -0.04 : 0.04) +
      marketResourceAdjustment(state, item) * 0.6
    : (createExchangeDraw(state, item, port) - 0.5) * 0.16;
  const liquidity = (
    classicHarbor(state)
      ? { fair_winds: 0.57, open_waters: 0.54, monsoon: 0.51 }
      : { fair_winds: 0.68, open_waters: 0.63, monsoon: 0.59 }
  )[state.difficulty];
  const first = Math.max(
    1,
    Math.floor(
      value * (liquidity + markup + (event?.kind === "festival" ? 0.14 : 0)),
    ),
  );
  const further = Math.max(1, Math.floor(value * (liquidity - 0.24 + markup)));
  const tiers = [
    { quantity: tierUnits, unitPrice: first },
    { quantity: quantity - tierUnits, unitPrice: further },
  ];
  let gross = 0,
    freight = 0,
    vat = 0;
  for (const tier of tiers) {
    const unitVat = raw ? 0 : explainVAT(state, item, tier.unitPrice).final;
    const unitFreight = Math.max(0, Math.min(1, tier.unitPrice - unitVat - 1));
    gross += tier.unitPrice * tier.quantity;
    freight += unitFreight * tier.quantity;
    vat += unitVat * tier.quantity;
  }
  return {
    item,
    quantity,
    sold,
    round: state.currentRound,
    epoch: state.voyageEpoch,
    port,
    tiers,
    gross,
    freight,
    vat,
    net: gross - freight - vat,
  };
}

function createExchangeDraw(state: GameState, item: string, port: string) {
  return createRng(
    `${state.seatSeed}:V${state.voyageEpoch}:R${state.currentRound}:exchange:${port}:${item}`,
  )();
}

export function sellAtPortExchange(
  state: GameState,
  expected: NonNullable<ReturnType<typeof quotePortExchange>>,
  logs: string[],
) {
  const quote = quotePortExchange(state, expected.item, expected.quantity);
  if (
    !quote ||
    quote.sold !== expected.sold ||
    quote.round !== expected.round ||
    quote.epoch !== expected.epoch ||
    quote.gross !== expected.gross ||
    quote.freight !== expected.freight ||
    quote.vat !== expected.vat
  )
    return false;
  state.exchangeSales ??= {};
  state.exchangeSales[quote.item] = quote.sold + quote.quantity;
  state.inventory[quote.item] -= quote.quantity;
  state.vatPaid += quote.vat;
  state.roundVatPaid = (state.roundVatPaid ?? 0) + quote.vat;
  settleSale(state, quote.gross - quote.vat, quote.freight);
  state.orderCount++;
  logs.push(
    `Port Exchange at ${quote.port}: Sold ${quote.quantity} ${ICONS[quote.item]}${quote.item} for ${quote.gross} Gold. Freight ${quote.freight} Gold. VAT ${quote.vat} Gold. Net ${quote.net} Gold.`,
  );
  return true;
}

export const CLEARANCE_ID = 100;
export function quoteClearance(
  state: GameState,
  item: string,
  quantity: number,
): OrderCard | undefined {
  if (harborTrading(state)) return;
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
