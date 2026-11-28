"use client";

import { useState } from "react";
import { describeWhisperCargo } from "@/lib/game/broker-whispers";
import { classicHarbor, harborTrading, rebalanced } from "@/lib/game/expansion";
import {
  buyWorkshopSupply,
  chooseStaple,
  poolsFor,
  quoteCardPayment,
  quoteWorkshopSupply,
  STAPLE_CHOICES,
  stapleOrder,
} from "@/lib/game/engine/market";
import { quoteOrder } from "@/lib/game/engine/orders";
import { quoteDues } from "@/lib/game/engine/pricing";
import { Button } from "@/components/ui/button";
import {
  canProduce,
  unlockedProducts,
  unlockedResources,
} from "@/lib/game/pools";
import {
  explainCardPrice,
  explainExpectedPrice,
  purchaseCard,
} from "@/lib/game/engine";
import type { GameState } from "@/lib/game/types";
import { cn, formatGoldProceeds } from "@/lib/utils";
import { itemColorResolver } from "@/lib/use-color-preference";
import { Anchor, Check, Wallet } from "lucide-react";
import { motion } from "framer-motion";
import type { PublicUser } from "@/lib/api";
import { Term } from "../../Term";
import { ItemIcon } from "../../shared";
import {
  PriceBreakdownTooltip,
  ExpectedPriceTooltip,
  priceAwareTermContent,
} from "../PriceTooltips";
import { ReadyFooter, type PhaseSync } from "./PhaseShared";

// Port accent colors : each port gets a consistent color for visual identity.
// This is purely decorative; it does not affect pricing or game logic.
const PORT_ACCENT: Record<string, { bar: string; ring: string; text: string }> =
  {
    "Quanzhou Port": {
      bar: "bg-teal-500",
      ring: "hover:border-teal-500/40",
      text: "text-teal-600 dark:text-teal-400",
    },
    "Guangzhou Port": {
      bar: "bg-amber-500",
      ring: "hover:border-amber-500/40",
      text: "text-amber-600 dark:text-amber-400",
    },
    "Ningbo Port": {
      bar: "bg-sky-500",
      ring: "hover:border-sky-500/40",
      text: "text-sky-600 dark:text-sky-400",
    },
    "Yangzhou Port": {
      bar: "bg-violet-500",
      ring: "hover:border-violet-500/40",
      text: "text-violet-600 dark:text-violet-400",
    },
    "Hangzhou Port": {
      bar: "bg-rose-500",
      ring: "hover:border-rose-500/40",
      text: "text-rose-600 dark:text-rose-400",
    },
    "Fuzhou Port": {
      bar: "bg-emerald-500",
      ring: "hover:border-emerald-500/40",
      text: "text-emerald-600 dark:text-emerald-400",
    },
    "Goryeo Port": {
      bar: "bg-indigo-500",
      ring: "hover:border-indigo-500/40",
      text: "text-indigo-600 dark:text-indigo-400",
    },
    "Srivijaya Port": {
      bar: "bg-lime-500",
      ring: "hover:border-lime-500/40",
      text: "text-lime-600 dark:text-lime-400",
    },
    "Dashi Port": {
      bar: "bg-fuchsia-500",
      ring: "hover:border-fuchsia-500/40",
      text: "text-fuchsia-600 dark:text-fuchsia-400",
    },
  };

function portAccent(port: string) {
  return (
    PORT_ACCENT[port] ?? {
      bar: "bg-slate-500",
      ring: "hover:border-slate-500/40",
      text: "text-slate-600 dark:text-slate-400",
    }
  );
}

function MarketPriceReference({
  game,
  colorFor,
}: {
  game: GameState;
  colorFor: (item: string) => string | undefined;
}) {
  return (
    <div className="rounded-xl border border-teal-500/15 bg-teal-500/[0.03] px-3.5 py-2.5 mb-3.5">
      <div className="text-[10px] font-semibold tracking-wide text-muted-foreground/80 mb-2">
        Market price reference
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
        <div>
          <div className="mb-1 text-[9px] tracking-wider text-muted-foreground/60">
            Resources
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {unlockedResources(
              game.difficulty,
              game.currentRound,
              game.rulesVersion,
              game.specialties,
            ).map((item) => (
              <PricePill
                key={item}
                item={item}
                game={game}
                colorFor={colorFor}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[9px] tracking-wider text-muted-foreground/60">
            Products
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {unlockedProducts(
              game.difficulty,
              game.currentRound,
              game.rulesVersion,
              game.specialties,
            ).map((item) => (
              <PricePill
                key={item}
                item={item}
                game={game}
                colorFor={colorFor}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PricePill({
  item,
  game,
  colorFor,
}: {
  item: string;
  game: GameState;
  colorFor: (item: string) => string | undefined;
}) {
  const price = explainExpectedPrice(game, item);
  const color = colorFor(item) ?? "#64748b";
  return (
    <Term term={item} content={<ExpectedPriceTooltip price={price} />}>
      <span
        className="inline-flex items-center gap-1 text-[11px]"
        style={{ color }}
      >
        <ItemIcon item={item} className="h-3 w-3" />
        {item}
      </span>
    </Term>
  );
}

export function Purchase({
  game,
  act,
  phaseSync,
  members,
  onShowRumors,
  colorFor,
}: {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  phaseSync: PhaseSync;
  members: PublicUser[];
  onShowRumors: () => void;
  // Optional, falls back to the
  // plain COLORS lookup when a caller hasn't wired useColorPreference in.
  colorFor?: (item: string) => string | undefined;
}) {
  const resolveColor = itemColorResolver(colorFor);
  const [recipe, setRecipe] = useState("Linen Clothes");
  const supply = quoteWorkshopSupply(game, recipe);
  const supplyWorker = Object.entries(game.workers).some(
    ([type, crew]) => crew.length > 0 && canProduce(type, recipe),
  );
  const supplyPayment = supply ? quoteCardPayment(game, supply) : undefined;
  const supplyCost = supplyPayment?.paid ?? 0;
  const staple = game.resourceCards.find((card) => card.staple);
  const stapleItem = staple?.resources[0]?.type;
  const stapleQuote =
    rebalanced(game) && staple
      ? quoteOrder(game, stapleOrder(game))
      : undefined;
  const due = quoteDues(game).total;

  const remainingLots = game.resourceCards.filter(
    (card) => !game.purchasedCards.includes(card.id),
  ).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Anchor className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          Port Merchant Exchange
        </h2>
        <Button
          variant="secondary"
          size="sm"
          className="rounded-lg"
          onClick={onShowRumors}
        >
          🔮 Broker's Rumor Board
        </Button>
      </div>
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
            {classicHarbor(game)
              ? "These buyers appear in Phase 2."
              : "(each rumor guarantees one order in Phase 2)."}
          </span>
        </div>
      )}
      {rebalanced(game) && game.currentRound >= game.maxRounds && (
        <div className="mb-3.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-2.5 text-sm">
          <strong>Final purchase phase.</strong> Artisan assignments are closed
          for the voyage, so raw lots can only be sold on this round's orders or
          at the Port Exchange. Buy with a buyer in mind.
        </div>
      )}
      <div className="mb-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-3.5 py-2.5 text-sm">
        <Wallet className="size-4 text-amber-600 dark:text-amber-400" />
        <strong>{game.money} Gold available</strong>
        <span>Current bills due: {due} Gold</span>
        <span>
          {remainingLots} {remainingLots === 1 ? "lot" : "lots"} available
        </span>
      </div>
      {rebalanced(game) && (
        <div className="mb-4 grid gap-3 lg:grid-cols-2">
          {stapleItem && stapleQuote && (
            <section className="min-w-0 space-y-2 rounded-xl border bg-card p-3 text-sm">
              <label className="grid gap-1 font-semibold">
                Staple cargo
                <select
                  className="rounded-md border bg-background p-2"
                  disabled={
                    phaseSync.waiting ||
                    game.purchasedCards.includes(staple!.id)
                  }
                  value={stapleItem}
                  onChange={(event) =>
                    act((g, logs) => chooseStaple(g, event.target.value, logs))
                  }
                >
                  {STAPLE_CHOICES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <p className="text-muted-foreground">
                Deliver {staple!.resources[0].quantity} {stapleItem} at Quanzhou
                Port this round. Quoted{" "}
                {formatGoldProceeds(
                  stapleQuote.reward - stapleQuote.freight.final,
                )}{" "}
                after quoted freight.
              </p>
            </section>
          )}
          {game.currentRound < game.maxRounds && (
            <section className="min-w-0 space-y-2 rounded-xl border bg-card p-3 text-sm">
              <label className="grid gap-1 font-semibold">
                Workshop Supplier
                <select
                  className="min-w-0 rounded-md border bg-background p-2"
                  value={recipe}
                  onChange={(event) => setRecipe(event.target.value)}
                >
                  {poolsFor(game).products.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <p className="text-muted-foreground">
                {supply
                  ? supply.resources
                      .map(({ type, quantity }) => `${quantity} ${type}`)
                      .join(", ")
                  : game.resourceCards.some((card) => card.workshopSupply)
                    ? "This round's supply lot was purchased."
                    : "No missing ingredients for this recipe."}
              </p>
              {!supplyWorker && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  No hired artisan can make this recipe yet. The inputs can
                  still be stocked for a later hire.
                </p>
              )}
              {harborTrading(game) && (
                <p className="text-xs text-muted-foreground">
                  Missing ingredients cost a premium.
                </p>
              )}
              {supply && (
                <Button
                  size="sm"
                  disabled={phaseSync.waiting || game.money < supplyCost}
                  onClick={() =>
                    act((g, logs) => buyWorkshopSupply(g, recipe, logs))
                  }
                >
                  {supplyPayment && supplyPayment.deferred > 0
                    ? `Buy supplies: ${supplyCost} Gold now, ${supplyPayment.deferred} at settlement`
                    : `Buy workshop supplies for ${supplyCost} Gold`}
                </Button>
              )}
            </section>
          )}
        </div>
      )}
      <MarketPriceReference game={game} colorFor={resolveColor} />
      <div className="pm-decision-grid">
        {game.resourceCards.map((c, index) => {
          const breakdown = explainCardPrice(game, c);
          const finalCost = breakdown.final;
          const payment = quoteCardPayment(game, c);
          const purchased = game.purchasedCards.includes(c.id);
          const canAfford = game.money >= payment.paid && !purchased;
          const accent = portAccent(c.port);
          return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: index * 0.06,
                duration: 0.3,
                ease: "easeOut",
              }}
              className={cn(
                "pm-decision-card rounded-xl border flex flex-col transition-colors duration-200",
                accent.ring,
                purchased
                  ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                  : "border-black/10 dark:border-white/10 bg-background/50",
              )}
            >
              {/* Port accent bar */}
              <div className={cn("h-1 w-full", accent.bar)} />
              <div className="px-3.5 py-2 text-xs font-semibold border-b border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] flex flex-wrap items-center justify-between gap-1">
                <span className={cn("flex items-center gap-1", accent.text)}>
                  📍 {c.port}
                </span>
                <div className="flex items-center gap-1.5">
                  {purchased && (
                    <motion.span
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 15,
                      }}
                      className="inline-flex items-center justify-center rounded-full bg-emerald-500/20 p-0.5"
                    >
                      <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    </motion.span>
                  )}
                  <span className="text-muted-foreground">
                    {c.staple
                      ? "Staple lot"
                      : c.workshopSupply
                        ? "Workshop supply"
                        : c.featured
                          ? "Featured lot"
                          : c.isProductCard
                            ? "Finished good"
                            : "Raw material"}
                  </span>
                </div>
              </div>
              <div className="p-3.5 flex-1 space-y-1.5">
                {c.resources.map((r, i) => (
                  <div
                    key={i}
                    className="flex min-w-0 flex-wrap items-center gap-x-1 text-xs"
                  >
                    <ItemIcon item={r.type} className="mr-1.5 h-4 w-4" />
                    <Term
                      term={r.type}
                      content={priceAwareTermContent(game, r.type)}
                    >
                      <span
                        className="font-medium"
                        style={{ color: resolveColor(r.type) }}
                      >
                        {r.type}
                      </span>
                    </Term>
                    <span className="mx-1.5">×{r.quantity}</span>
                    <span className="ml-auto text-muted-foreground">
                      Own {game.inventory[r.type] ?? 0} · {r.price} Gold each
                    </span>
                  </div>
                ))}
                {c.isProductCard && c.resources[0].materialCost ? (
                  <div className="text-[10px] text-muted-foreground pl-6">
                    📦 Recipe materials: {c.resources[0].materialCost} Gold (
                    {c.resources[0].materialDetails})
                  </div>
                ) : null}
                {purchased ? (
                  <p className="text-sm text-muted-foreground">
                    {c.paidGold === undefined
                      ? "See the ledger for the amount paid."
                      : `Paid ${c.paidGold} Gold`}
                  </p>
                ) : (
                  <div className="pt-2 mt-1 border-t border-dashed border-black/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-2">
                    <Term
                      content={<PriceBreakdownTooltip breakdown={breakdown} />}
                    >
                      <span className="text-rose-600 dark:text-rose-400 font-bold text-sm cursor-help">
                        💰 Total: {finalCost} Gold
                      </span>
                    </Term>
                    {finalCost < c.totalCost && (
                      <span className="text-xs text-teal-700 dark:text-teal-300">
                        Save {c.totalCost - finalCost} Gold
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="p-3 pt-0">
                {!purchased && (
                  <p className="mb-2 text-xs text-muted-foreground">
                    {canAfford
                      ? payment.deferred > 0
                        ? `Gold after purchase: ${game.money - payment.paid}. ${payment.deferred} Gold is deferred to settlement.`
                        : `Gold after purchase: ${game.money - payment.paid}`
                      : `Need ${payment.paid - game.money} more Gold`}
                  </p>
                )}
                <Button
                  className={cn(
                    "w-full rounded-lg",
                    canAfford ? "pm-grad-emerald text-white" : "",
                  )}
                  variant={canAfford ? "default" : "secondary"}
                  disabled={phaseSync.waiting || !canAfford}
                  onClick={() => act((g, l) => purchaseCard(g, c.id, l))}
                >
                  {purchased
                    ? "✅ Purchased"
                    : payment.deferred > 0
                      ? `🛒 Buy (${payment.paid} now, ${payment.deferred} at settlement)`
                      : `🛒 Buy (${finalCost}💰)`}
                </Button>
              </div>
            </motion.div>
          );
        })}
      </div>
      <ReadyFooter
        phaseSync={phaseSync}
        members={members}
        idleLabel="✅ Complete Purchase, Continue"
        onConfirm={() => void phaseSync.markReady()}
      />
    </div>
  );
}
