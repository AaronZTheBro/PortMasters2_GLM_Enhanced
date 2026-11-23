"use client";

import { describeWhisperCargo } from "@/lib/game/broker-whispers";
import { classicHarbor, harborTrading, rebalanced } from "@/lib/game/expansion";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { QuantityInput } from "@/components/ui/quantity-input";
import { BROKERS_FAVOR_UNLOCK_LEVEL, ITEMS } from "@/lib/game/constants";
import { callBrokersFavor, completeOrder } from "@/lib/game/engine";
import { poolsFor } from "@/lib/game/engine/market";
import {
  CLEARANCE_ID,
  quoteClearance,
  quoteOrder,
  quotePortExchange,
  sellAtPortExchange,
  sellClearance,
  whisperForOrder,
} from "@/lib/game/engine/orders";
import type { GameState } from "@/lib/game/types";
import { cn, formatGoldProceeds } from "@/lib/utils";
import { itemColorResolver } from "@/lib/use-color-preference";
import { Coins } from "lucide-react";
import type { PublicUser } from "@/lib/api";
import { Term } from "../../Term";
import { ItemIcon } from "../../shared";
import { PriceBreakdownTooltip, VatBreakdownTooltip } from "../PriceTooltips";
import { ReadyFooter, type PhaseSync } from "./PhaseShared";

export function Orders({
  game,
  flush,
  act,
  phaseSync,
  members,
  colorFor,
}: {
  game: GameState;
  flush: () => Promise<void>;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  phaseSync: PhaseSync;
  members: PublicUser[];
  // Optional, falls back to the
  // plain COLORS lookup when a caller hasn't wired useColorPreference in.
  colorFor?: (item: string) => string | undefined;
}) {
  const resolveColor = itemColorResolver(colorFor);
  const [favorOpen, setFavorOpen] = useState(false);
  const [favorItem, setFavorItem] = useState<string | null>(null);
  const [favorQty, setFavorQty] = useState(1);
  const favorUnlocked = game.renownLevel >= BROKERS_FAVOR_UNLOCK_LEVEL;
  const pool = poolsFor(game);
  const sellableGoods = [...pool.resources, ...pool.products].filter(
    (it) => (game.inventory[it] || 0) > 0,
  );
  const [clearanceItem, setClearanceItem] = useState("");
  const [clearanceQuantity, setClearanceQuantity] = useState(1);
  const clearanceGoods = pool.products.filter(
    (item) => game.inventory[item] > 0,
  );
  const clearanceGood = clearanceGoods.includes(clearanceItem)
    ? clearanceItem
    : clearanceGoods[0];
  const clearanceAmount = Math.min(
    clearanceQuantity,
    game.inventory[clearanceGood] ?? 0,
  );
  const clearance = quoteClearance(game, clearanceGood, clearanceAmount);
  const clearanceQuote = clearance ? quoteOrder(game, clearance) : undefined;
  const favorHeld = favorItem ? game.inventory[favorItem] || 0 : 0;
  const closeFavor = () => {
    setFavorOpen(false);
    setFavorItem(null);
  };
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Coins className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        Trade Manifest
      </h2>
      {harborTrading(game) && (
        <PortExchange
          game={game}
          act={act}
          flush={flush}
          locked={phaseSync.waiting}
          goods={ITEMS.filter((item) => game.inventory[item] > 0)}
        />
      )}
      {game.revealedIntel.length > 0 && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-2.5 mb-3.5 text-xs">
          <strong>🗣️ Broker's Whispers active this round:</strong>{" "}
          {game.revealedIntel.map((i, idx) => (
            <span key={idx}>
              {idx > 0 && ", "}
              <ItemIcon item={i.item} className="h-3.5 w-3.5" />{" "}
              {describeWhisperCargo(i)} ({i.port})
            </span>
          ))}
          <span className="text-muted-foreground">
            {" "}
            (look for the 🔮 badge below).
          </span>
        </div>
      )}
      {!favorUnlocked && (
        <div className="rounded-lg border border-dashed border-violet-500/25 bg-violet-500/[0.04] px-3.5 py-2.5 mb-3.5 text-xs text-muted-foreground">
          🔒 <strong className="text-foreground">Broker's Favor</strong> unlocks
          at Renown Level {BROKERS_FAVOR_UNLOCK_LEVEL}: call one in once per
          voyage to summon a guaranteed buyer for a good already in your hold.
          You're Renown Level {game.renownLevel} now,{" "}
          {BROKERS_FAVOR_UNLOCK_LEVEL - game.renownLevel} to go.
        </div>
      )}
      {favorUnlocked && !game.brokersFavorUsed && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] px-3.5 py-2.5 mb-3.5 text-xs">
          {!favorOpen ? (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span>
                <strong>🤝 Broker's Favor</strong> (once per voyage): summon a
                guaranteed buyer for as much of a good as you choose from your
                hold. The bigger the ask, the bigger the Broker's cut.
              </span>
              <Button
                size="sm"
                className="pm-grad-violet text-white font-semibold rounded-lg shrink-0 hover:opacity-95"
                disabled={phaseSync.waiting}
                onClick={() => setFavorOpen(true)}
              >
                Call in a Favor
              </Button>
            </div>
          ) : !favorItem ? (
            <div className="space-y-2">
              <div className="font-semibold">🤝 Which good needs a buyer?</div>
              {sellableGoods.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {sellableGoods.map((it) => (
                    <Button
                      key={it}
                      size="sm"
                      variant="secondary"
                      className="rounded-lg"
                      onClick={() => {
                        setFavorItem(it);
                        setFavorQty(game.inventory[it] || 1);
                      }}
                    >
                      <ItemIcon item={it} className="h-3.5 w-3.5" /> {it} (
                      {game.inventory[it]})
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground">
                  Your hold is empty, so there is nothing for the Broker to sell
                  right now.
                </div>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="rounded-lg"
                onClick={closeFavor}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="font-semibold">
                <ItemIcon item={favorItem} className="h-4 w-4" /> How much{" "}
                {favorItem} should the Broker sell?
              </div>
              <div className="flex items-center gap-2">
                <QuantityInput
                  value={favorQty}
                  onCommit={setFavorQty}
                  min={1}
                  max={favorHeld}
                  aria-label={`How much ${favorItem} to sell`}
                  className="w-20 h-9"
                />
                <span className="text-muted-foreground">
                  of {favorHeld} in your hold
                </span>
              </div>
              <p className="text-muted-foreground">
                The Broker's payout has a limit. Freight grows with the cargo
                quantity and can exceed the payout. Check the buyer's quote
                before trading.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="pm-grad-violet text-white font-semibold rounded-lg hover:opacity-95"
                  disabled={phaseSync.waiting || favorQty > favorHeld}
                  onClick={() => {
                    act((g, l) => callBrokersFavor(g, favorItem, favorQty, l));
                    closeFavor();
                  }}
                >
                  Call in the Favor
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-lg"
                  onClick={() => setFavorItem(null)}
                >
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="pm-decision-grid">
        {game.customerCards.map((o) => {
          const hasCargo = o.resources.every(
            (r) => (game.inventory[r.type] || 0) >= r.required!,
          );
          const completed = game.completedOrders.includes(o.id);
          const {
            freight,
            vat,
            totalVat,
            commission,
            commissionBase,
            bonuses,
            reward,
            salvageChance,
            auditChance,
          } = quoteOrder(game, o);
          const netProceeds = reward - freight.final;
          const canComplete = hasCargo && game.money + netProceeds >= 0;
          const brokerCommissionPct =
            commissionBase > 0
              ? Math.round((commission / commissionBase) * 100)
              : 0;
          const intel = whisperForOrder(game, o);
          return (
            <div
              key={o.id}
              className={cn(
                "pm-decision-card rounded-xl border flex flex-col",
                // Harbor gold, filled rather than outlined. The intel
                // "Guaranteed" highlight already owns amber as a thin outline,
                // so filled versus outlined keeps the two distinguishable
                // without relying on hue alone.
                o.isMandate
                  ? "border-amber-400/70 bg-gradient-to-br from-amber-400/[0.18] to-amber-500/[0.06] shadow-[0_0_0_1px_rgba(245,190,80,0.25)]"
                  : o.isBrokerFavor
                    ? "border-emerald-500/45 bg-emerald-500/[0.05]"
                    : intel
                      ? "border-amber-500/40 bg-amber-500/[0.04]"
                      : "border-black/10 dark:border-white/10 bg-background/50",
              )}
            >
              <div className="px-3.5 py-2 text-xs font-semibold border-b border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <span>
                  📍 {intel?.port ?? o.demandPort}{" "}
                  <span className="text-muted-foreground">
                    {o.buyer
                      ? `· ${BUYER_NAMES[o.buyer]}`
                      : o.isMandate
                        ? "· Imperial Mandate"
                        : o.workshop
                          ? "· Workshop contract"
                          : o.clearance
                            ? "· Clearance sale"
                            : o.isProductOrder
                              ? "· Finished Product Demand"
                              : o.staple
                                ? "· Staple contract"
                                : "· Raw Material Demand"}
                  </span>
                </span>
                {o.isMandate ? (
                  <span className="pm-text-gold shrink-0 font-bold">
                    📜 Imperial Mandate
                  </span>
                ) : o.isBrokerFavor ? (
                  <span className="text-emerald-600 dark:text-emerald-400 shrink-0">
                    🤝 Broker's Favor
                  </span>
                ) : (
                  intel && (
                    <span className="text-amber-600 dark:text-amber-400 shrink-0">
                      🔮 {classicHarbor(game) ? "Revealed" : "Guaranteed"}
                    </span>
                  )
                )}
              </div>
              <div className="p-3.5 flex-1 space-y-1.5">
                {o.resources.map((r, i) => {
                  const has = (game.inventory[r.type] || 0) >= r.required!;
                  return (
                    <div
                      key={i}
                      className="flex min-w-0 flex-wrap items-center gap-y-1 text-[12px]"
                    >
                      <span className="mr-1.5">
                        {completed || has ? "✅" : "❌"}
                      </span>
                      <ItemIcon item={r.type} className="mr-1.5 h-4 w-4" />
                      <Term term={r.type}>
                        <span
                          className="font-medium"
                          style={{ color: resolveColor(r.type) }}
                        >
                          {r.type}
                        </span>
                      </Term>
                      <span className="mx-1.5">×{r.required}</span>
                      <span
                        className={cn(
                          "ml-auto text-[10px]",
                          has
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-rose-700 dark:text-rose-300",
                        )}
                      >
                        Held: {game.inventory[r.type] || 0}
                      </span>
                    </div>
                  );
                })}
                {completed ? (
                  <p className="text-sm text-muted-foreground">
                    {o.settledGold === undefined
                      ? "See the ledger for the amount settled."
                      : o.settledGold < 0
                        ? `Settled at a cost of ${Math.abs(o.settledGold)} Gold after any refund or audit.`
                        : `Settled for ${o.settledGold} Gold after any refund or audit.`}
                  </p>
                ) : (
                  <>
                    <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-1.5">
                      <Term
                        content={<PriceBreakdownTooltip breakdown={freight} />}
                      >
                        ⚓ Freight: {freight.final} Gold
                      </Term>
                    </div>
                    <div
                      className={cn(
                        "text-[13px] font-semibold mt-0.5",
                        netProceeds >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      Gross {o.reward} Gold · Payout {reward} Gold · Net{" "}
                      {netProceeds < 0
                        ? `Cost ${Math.abs(netProceeds)}`
                        : netProceeds}{" "}
                      Gold
                    </div>
                    {(salvageChance > 0 || auditChance > 0) && (
                      <p className="text-[11px] text-muted-foreground">
                        {salvageChance > 0 &&
                          `${salvageChance * 100}% chance to recover freight. `}
                        {auditChance > 0 &&
                          `${auditChance * 100}% chance of an audit.`}
                      </p>
                    )}
                    {bonuses.map(({ name, gold }) => (
                      <div
                        key={name}
                        className="text-[10px] text-teal-700 dark:text-teal-300"
                      >
                        {name} adds {gold} Gold
                      </div>
                    ))}
                    {o.isBrokerFavor && (
                      <div className="text-[10px] text-emerald-700 dark:text-emerald-300">
                        🤝 Broker's cut ({brokerCommissionPct}%): {commission}{" "}
                        Gold
                      </div>
                    )}
                    {vat && (
                      <div className="text-[10px] text-muted-foreground">
                        <Term content={<VatBreakdownTooltip vat={vat} />}>
                          🧾 VAT: {totalVat} Gold (select for unit details)
                        </Term>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="p-3 pt-0">
                <Button
                  className={cn(
                    "w-full rounded-lg",
                    canComplete && !completed
                      ? "pm-grad-primary text-white"
                      : "",
                  )}
                  variant={canComplete && !completed ? "default" : "secondary"}
                  disabled={phaseSync.waiting || !canComplete || completed}
                  onClick={() => act((g, l) => completeOrder(g, o.id, l))}
                >
                  {completed
                    ? "✅ Completed"
                    : netProceeds < 0
                      ? `🤝 Trade (Cost ${Math.abs(netProceeds)} Gold)`
                      : `🤝 Trade (Net ${netProceeds}💰)`}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {rebalanced(game) && !harborTrading(game) && (
        <section className="my-4 space-y-2 rounded-xl border bg-card p-3 text-sm">
          <h3 className="font-semibold">Clearance Buyer</h3>
          {game.completedOrders.includes(CLEARANCE_ID) ? (
            <p>Clearance sale completed this round.</p>
          ) : clearanceQuote ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid min-w-0 gap-1">
                  Finished good
                  <select
                    className="min-w-0 rounded-md border bg-background p-2"
                    value={clearanceGood}
                    onChange={(event) => setClearanceItem(event.target.value)}
                  >
                    {clearanceGoods.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  Units to clear
                  <select
                    className="rounded-md border bg-background p-2"
                    value={clearanceAmount}
                    onChange={(event) =>
                      setClearanceQuantity(Number(event.target.value))
                    }
                  >
                    <option value={1}>One unit</option>
                    {game.inventory[clearanceGood] >= 2 && (
                      <option value={2}>Two units</option>
                    )}
                  </select>
                </label>
              </div>
              <p>
                Quoted{" "}
                {formatGoldProceeds(
                  clearanceQuote.reward - clearanceQuote.freight.final,
                )}{" "}
                after {clearanceQuote.totalVat} Gold VAT and{" "}
                {clearanceQuote.freight.final} Gold freight.
                {clearanceQuote.salvageChance > 0 &&
                  ` ${clearanceQuote.salvageChance * 100}% chance to recover freight.`}
                {clearanceQuote.auditChance > 0 &&
                  ` ${clearanceQuote.auditChance * 100}% chance of an audit.`}
                Clearance sales grant no Reputation.
              </p>
              <Button
                size="sm"
                disabled={phaseSync.waiting}
                onClick={() =>
                  act((g, logs) =>
                    sellClearance(g, clearanceGood, clearanceAmount, logs),
                  )
                }
              >
                Sell surplus goods
              </Button>
            </>
          ) : (
            <p>
              Bring up to two finished goods of one kind to sell here once each
              round.
            </p>
          )}
        </section>
      )}
      <ReadyFooter
        phaseSync={phaseSync}
        members={members}
        idleLabel="✅ Complete Trades, Continue"
        onConfirm={() => void phaseSync.markReady()}
      />
    </div>
  );
}

const BUYER_NAMES = {
  merchant: "Merchant",
  commission: "Commission",
  mixed: "Mixed cargo",
  speculative: "Speculative buyer",
  standing: "Standing contract",
  rival: "Rival merchant",
};

function PortExchange({
  game,
  act,
  flush,
  locked,
  goods,
}: {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  flush: () => Promise<void>;
  locked: boolean;
  goods: string[];
}) {
  const [selected, setSelected] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const item = goods.includes(selected) ? selected : goods[0];
  const held = game.inventory[item] ?? 0;
  const quote = quotePortExchange(game, item, Number(quantity));
  const save = async () => {
    setSaving(true);
    try {
      await flush();
      setSaveError(false);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <details className="mb-4 min-w-0 rounded-xl border bg-card p-3 text-sm">
      <summary className="cursor-pointer font-semibold">Port Exchange</summary>
      <p className="my-2 text-muted-foreground">
        Sell any cargo for Gold. The first three units of each good use a higher
        rate each round, subject to rounding. Exchange sales earn no Reputation.
      </p>
      {!item ? (
        <p>Your hold is empty.</p>
      ) : (
        <div className="grid min-w-0 gap-2">
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1">
              Cargo
              <select
                className="min-w-0 rounded-md border bg-background p-2"
                aria-label="Exchange cargo"
                value={item}
                disabled={locked || saving}
                onChange={(event) => {
                  setSelected(event.target.value);
                  setQuantity("1");
                }}
              >
                {goods.map((good) => (
                  <option key={good} value={good}>
                    {good} ({game.inventory[good]} held)
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              Quantity
              <span className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-md border bg-background p-2"
                  aria-label="Exchange quantity"
                  type="number"
                  min={1}
                  max={held}
                  step={1}
                  value={quantity}
                  disabled={locked || saving}
                  onChange={(event) => setQuantity(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setQuantity(String(held))}
                  disabled={locked || saving}
                >
                  All
                </Button>
              </span>
            </label>
          </div>
          <p aria-live="polite">
            {quote ? (
              <>
                <strong>Receive {quote.net} Gold</strong>
                <span className="block text-muted-foreground">
                  {quote.tiers
                    .filter((tier) => tier.quantity > 0)
                    .map(
                      ({ quantity, unitPrice }) =>
                        `${quantity} at ${unitPrice} Gold`,
                    )
                    .join(" + ")}{" "}
                  · Freight {quote.freight} · VAT {quote.vat}
                </span>
              </>
            ) : (
              `Enter a whole quantity from 1 to ${held}.`
            )}
          </p>
          <Button
            className="w-fit max-w-full"
            disabled={!quote || locked || saving || saveError}
            onClick={() => {
              if (!quote) return;
              act((g, logs) => sellAtPortExchange(g, quote, logs));
              setQuantity("1");
              void save();
            }}
          >
            {saving ? "Saving sale" : "Sell at the Port Exchange"}
          </Button>
        </div>
      )}
      {saveError && (
        <p role="alert">
          The sale has not synced.{" "}
          <Button variant="link" onClick={() => void save()} disabled={saving}>
            Retry saving
          </Button>
        </p>
      )}
    </details>
  );
}
