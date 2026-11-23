import { COMMODITIES } from "./constants";
import { marketCountsFor } from "./difficulty";
import {
  expanded,
  forecastFor,
  harborTrading,
  classicHarbor,
  rebalanced,
} from "./expansion";
import { pick, type Rng } from "./rng";
import type { GameState, IntelItem, OrderCard } from "./types";

export function brokerWhisperCapacity(state: GameState) {
  if (harborTrading(state)) return 4;
  const { order } = marketCountsFor(state.difficulty, state.currentRound);
  if (!expanded(state)) return Math.min(5, order);
  const featured = forecastFor(state)?.kind === "guild" ? 2 : 1;
  return Math.min(5, order - 1 - featured - Number(rebalanced(state)));
}

export function revealBrokerWhisper(
  state: GameState,
  random: Rng,
  ports: string[],
  preferred?: string,
) {
  if (
    !state.phase2DemandTags.length ||
    state.revealedIntel.length >= brokerWhisperCapacity(state)
  )
    return undefined;
  const index =
    preferred && state.phase2DemandTags.includes(preferred)
      ? state.phase2DemandTags.indexOf(preferred)
      : Math.floor(random() * state.phase2DemandTags.length);
  const [item] = state.phase2DemandTags.splice(index, 1);
  const entry: IntelItem = { item, port: pick(random, ports) };
  if (rebalanced(state))
    Object.assign(entry, {
      quantity:
        item in COMMODITIES
          ? Math.max(2, Math.min(4, state.inventory[item] ?? 0))
          : 1,
    });
  state.revealedIntel.push(entry);
  return entry;
}

export function remainingPlannedBuyers(state: GameState) {
  const known = new Set([
    ...state.revealedIntel.map(({ orderId }) => orderId),
    ...(state.scoutedOrders ?? []).map(({ id }) => id),
  ]);
  return (state.plannedOrders ?? []).filter(({ id }) => !known.has(id));
}

export function revealPlannedBuyer(
  state: GameState,
  random: Rng,
  preferred?: string,
) {
  if (
    !classicHarbor(state) ||
    state.revealedIntel.length >= brokerWhisperCapacity(state)
  )
    return;
  const remaining = remainingPlannedBuyers(state);
  const matches = preferred
    ? remaining.filter(({ resources }) =>
        resources.some(({ type }) => type === preferred),
      )
    : [];
  const order = pick(random, matches.length ? matches : remaining);
  if (!order) return;
  const entry: IntelItem = {
    item: order.resources[0].type,
    port: order.demandPort,
    orderId: order.id,
    reward: order.reward,
    cargo: order.resources.map(({ type, required }) => ({ type, required })),
  };
  state.revealedIntel.push(entry);
  return entry;
}

export function describeWhisperCargo(intel: IntelItem) {
  if (intel.cargo)
    return intel.cargo
      .map(({ type, required }) => `${required} ${type}`)
      .join(", ");
  return intel.quantity ? `${intel.quantity} ${intel.item}` : intel.item;
}

export function whisperForOrder(state: GameState, order: OrderCard) {
  if (
    order.isMandate ||
    order.isBrokerFavor ||
    order.staple ||
    order.whisperIndex === undefined
  )
    return undefined;
  const entry = state.revealedIntel[order.whisperIndex];
  return entry?.orderId === order.id ? entry : undefined;
}

export function restoreBrokerWhispers(state: GameState) {
  if (state.phase !== 2 || harborTrading(state)) return;
  for (const [whisperIndex, entry] of state.revealedIntel.entries()) {
    if (entry.orderId !== undefined) continue;
    const slot = whisperIndex + Number(expanded(state));
    const order = state.customerCards.find(
      (candidate) => candidate.id === slot,
    );
    if (
      !order ||
      order.isMandate ||
      order.isBrokerFavor ||
      order.staple ||
      order.resources.length !== 1 ||
      order.resources[0].type !== entry.item ||
      order.demandPort !== entry.port
    )
      continue;
    entry.orderId = order.id;
    order.whisperIndex = whisperIndex;
  }
}
