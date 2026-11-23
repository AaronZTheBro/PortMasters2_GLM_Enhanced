"use client";

import { useEffect, useRef, useState } from "react";
import { quoteOrder, whisperForOrder } from "./game/engine/orders";
import type { GameState } from "./game/types";

export type PricePoint = { round: number; price: number; port: string };
export type PriceHistory = Record<string, PricePoint[]>;
export type PriceSide = "buy" | "sell";
type History = Record<PriceSide, PriceHistory>;
const EMPTY_HISTORY: History = { buy: {}, sell: {} };

export function buildPriceSnapshot(game: GameState, side: PriceSide) {
  const samples = new Map<string, { prices: number[]; ports: Set<string> }>();
  function add(item: string, price: number, port: string) {
    const sample = samples.get(item) ?? {
      prices: [],
      ports: new Set<string>(),
    };
    sample.prices.push(price);
    sample.ports.add(port);
    samples.set(item, sample);
  }

  if (side === "buy") {
    for (const card of game.resourceCards) {
      if (card.workshopSupply) continue;
      for (const item of card.resources) {
        if (item.price !== undefined) add(item.type, item.price, card.port);
      }
    }
  } else {
    const opening = { ...game, effectUses: {}, completedOrders: [] };
    for (const order of game.customerCards) {
      if (
        !order.totalItems ||
        order.isBrokerFavor ||
        order.isMandate ||
        order.clearance ||
        order.workshop
      )
        continue;
      const quote = quoteOrder(opening, order);
      const price = (quote.reward - quote.freight.final) / order.totalItems;
      const port = whisperForOrder(game, order)?.port ?? order.demandPort;
      for (const item of order.resources) add(item.type, price, port);
    }
  }

  return Object.fromEntries(
    Array.from(samples, ([item, { prices, ports }]) => [
      item,
      {
        round: game.currentRound,
        price: Math.round(
          prices.reduce((sum, price) => sum + price, 0) / prices.length,
        ),
        port: [...ports].sort().join(", "),
      },
    ]),
  );
}

function readHistory(key: string): History {
  try {
    const stored = JSON.parse(
      localStorage.getItem(key) ?? "{}",
    ) as Partial<History>;
    return { buy: stored.buy ?? {}, sell: stored.sell ?? {} };
  } catch {
    return { buy: {}, sell: {} };
  }
}

export function usePriceHistory(
  game: GameState,
  roomId: string,
  userId: string,
  loaded: boolean,
) {
  const key = `pm2_prices_${userId}_${roomId}_${game.voyageEpoch}`;
  const [record, setRecord] = useState<{ key: string; value: History } | null>(
    null,
  );
  const latest = useRef(record);
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      const previous = latest.current;
      const stored = previous?.key === key ? previous.value : readHistory(key);
      const value = { buy: { ...stored.buy }, sell: { ...stored.sell } };
      let changed = false;
      const sides: PriceSide[] =
        game.phase === 1 ? ["buy"] : game.phase === 2 ? ["buy", "sell"] : [];
      for (const side of sides) {
        for (const [item, point] of Object.entries(
          buildPriceSnapshot(game, side),
        )) {
          const observations = value[side][item] ?? [];
          const existing = observations.find(
            ({ round }) => round === point.round,
          );
          if (
            existing &&
            (side === "sell" ||
              (existing.price === point.price && existing.port === point.port))
          )
            continue;
          const series = observations.filter(
            (old) => old.round !== point.round,
          );
          changed = true;
          value[side][item] = [...series, point]
            .sort((a, b) => a.round - b.round)
            .slice(-20);
        }
      }
      if (changed) {
        try {
          localStorage.setItem(key, JSON.stringify(value));
        } catch {
          // The open voyage can still display the current observations.
        }
      }
      if (changed || previous?.key !== key) {
        const next = { key, value };
        latest.current = next;
        setRecord(next);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [game, key, loaded]);

  return record?.key === key ? record.value : EMPTY_HISTORY;
}
