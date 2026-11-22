"use client";

import { Button } from "@/components/ui/button";
import { PRODUCTS, RESOURCES } from "@/lib/game/constants";
import {
  explainCardPrice,
  explainExpectedPrice,
  getCardFinalCost,
  purchaseCard,
} from "@/lib/game/engine";
import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { itemColorResolver } from "@/lib/use-color-preference";
import { Anchor, Check, Wallet, Star } from "lucide-react";
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

// Deal quality : classifies a card's price as great / good / fair based on
// the discount from its base totalCost. Purely decorative.
type DealQuality = "great" | "good" | "fair";

function dealQuality(finalCost: number, totalCost: number): DealQuality {
  if (totalCost <= 0) return "fair";
  const discount = (totalCost - finalCost) / totalCost;
  if (discount >= 0.2) return "great";
  if (discount > 0) return "good";
  return "fair";
}

const DEAL_BADGE: Record<DealQuality, { label: string; className: string }> = {
  great: {
    label: "★ Great Deal",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  good: {
    label: "Good Price",
    className: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  },
  fair: {
    label: "Fair Price",
    className: "bg-muted text-muted-foreground",
  },
};

// Sparkline: a deterministic compact chart derived from the item
// name. The trend is purely visual and does not reflect real price history.
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function Sparkline({ item, color }: { item: string; color: string }) {
  const w = 30;
  const h = 10;
  const seed = hashString(item);
  const points = 8;
  const vals = Array.from({ length: points }, (_, i) => {
    const r = (Math.sin(seed * 0.001 + i * 1.3) + 1) / 2;
    const trend = i / (points - 1);
    return 0.15 + r * 0.45 + trend * 0.25;
  });
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = max - min || 1;
  const path = vals
    .map((v, i) => {
      const x = (i / (points - 1)) * w;
      const y = h - ((v - min) / range) * (h - 2) - 1;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const lastY = h - ((vals[vals.length - 1] - min) / range) * (h - 2) - 1;
  return (
    <svg
      width={w}
      height={h}
      className="inline-block align-middle opacity-70"
      aria-hidden
    >
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={w} cy={lastY} r={1} fill={color} />
    </svg>
  );
}

// Market price reference : grouped resources vs products, with sparklines.
// Every raw material and product gets a price preview here, not just the
// ones that happened to roll onto one of this round's five market cards.
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
            {[...RESOURCES].map((item) => (
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
            {[...PRODUCTS].map((item) => (
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
        <Sparkline item={item} color={color} />
      </span>
    </Term>
  );
}

// Budget indicator : shows available gold vs total unpurchased card costs,
// plus an available deal counter. Purely informational.
function BudgetBar({
  money,
  totalCardCosts,
  dealsAvailable,
}: {
  money: number;
  totalCardCosts: number;
  dealsAvailable: number;
}) {
  const pct =
    totalCardCosts > 0 ? Math.min(100, (money / totalCardCosts) * 100) : 100;
  const canAffordAll = money >= totalCardCosts;
  return (
    <div className="mb-3.5 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-3.5 py-2.5">
      <Wallet className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between text-[11px]">
          <span className="font-semibold">Your Budget</span>
          <span
            className={cn(
              "text-muted-foreground",
              !canAffordAll && "text-rose-600 dark:text-rose-400",
            )}
          >
            {money}💰 available · {totalCardCosts}💰 total cards
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <motion.div
            className={cn(
              "h-full rounded-full",
              canAffordAll
                ? "bg-gradient-to-r from-emerald-400 to-emerald-600"
                : "bg-gradient-to-r from-amber-400 to-rose-500",
            )}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
      </div>
      <div className="shrink-0 border-l border-black/10 pl-3 text-center dark:border-white/10">
        <div className="text-[9px] tracking-wide text-muted-foreground/70">
          Deals
        </div>
        <div className="text-base font-bold leading-none text-amber-600 dark:text-amber-400">
          {dealsAvailable}
        </div>
      </div>
    </div>
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

  // Aggregate stats for the budget bar and best deal highlight. These are
  // derived from existing game state without changing game logic.
  const unpurchasedCards = game.resourceCards.filter(
    (c) => !game.purchasedCards.includes(c.id),
  );
  const totalCardCosts = unpurchasedCards.reduce(
    (sum, c) => sum + getCardFinalCost(game, c),
    0,
  );
  const dealsAvailable = unpurchasedCards.length;
  const bestDealId =
    unpurchasedCards.length > 0
      ? unpurchasedCards.reduce((best, c) => {
          const cost = getCardFinalCost(game, c);
          const bestCost = getCardFinalCost(game, best);
          return cost < bestCost ? c : best;
        }).id
      : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
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
              <ItemIcon item={i.item} className="h-3.5 w-3.5" /> {i.item} (
              {i.port})
            </span>
          ))}
          <span className="text-muted-foreground">
            {" "}
            (a matching order is guaranteed in Phase 2, buy accordingly).
          </span>
        </div>
      )}
      <BudgetBar
        money={game.money}
        totalCardCosts={totalCardCosts}
        dealsAvailable={dealsAvailable}
      />
      <MarketPriceReference game={game} colorFor={resolveColor} />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {game.resourceCards.map((c, index) => {
          const finalCost = getCardFinalCost(game, c);
          const breakdown = explainCardPrice(game, c);
          const purchased = game.purchasedCards.includes(c.id);
          const canAfford = game.money >= finalCost && !purchased;
          const quality = dealQuality(finalCost, c.totalCost);
          const accent = portAccent(c.port);
          const isBestDeal = c.id === bestDealId && !purchased;
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
                "rounded-xl border overflow-hidden flex flex-col transition-colors duration-200",
                accent.ring,
                purchased
                  ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                  : isBestDeal
                    ? "border-amber-500/40 bg-amber-500/[0.04] ring-1 ring-amber-500/30"
                    : "border-black/10 dark:border-white/10 bg-background/50",
              )}
            >
              {/* Port accent bar */}
              <div className={cn("h-1 w-full", accent.bar)} />
              <div className="px-3.5 py-2 text-xs font-semibold border-b border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] flex items-center justify-between">
                <span className={cn("flex items-center gap-1", accent.text)}>
                  📍 {c.port}
                </span>
                <div className="flex items-center gap-1.5">
                  {isBestDeal && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300">
                      <Star className="h-2.5 w-2.5" />
                      Best
                    </span>
                  )}
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
                    {c.isProductCard ? "Product" : "Raw Material"}
                  </span>
                </div>
              </div>
              <div className="p-3.5 flex-1 space-y-1.5">
                {c.resources.map((r, i) => (
                  <div key={i} className="flex items-center text-[12px]">
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
                      Listed unit: {r.price}💰
                    </span>
                  </div>
                ))}
                {c.isProductCard && c.resources[0].materialCost ? (
                  <div className="text-[10px] text-muted-foreground pl-6">
                    📦 Mat Cost: {c.resources[0].materialCost} Gold (
                    {c.resources[0].materialDetails})
                  </div>
                ) : null}
                <div className="pt-2 mt-1 border-t border-dashed border-black/10 dark:border-white/10 flex items-center justify-between gap-2">
                  <Term
                    content={<PriceBreakdownTooltip breakdown={breakdown} />}
                  >
                    <span className="text-rose-600 dark:text-rose-400 font-bold text-sm cursor-help">
                      💰 Total: {finalCost} Gold
                    </span>
                  </Term>
                  <div className="flex items-center gap-1.5">
                    {finalCost < c.totalCost && (
                      <span className="text-muted-foreground text-[10px]">
                        (Was {c.totalCost})
                      </span>
                    )}
                    <span
                      className={cn(
                        "text-[9px] font-semibold px-1.5 py-0.5 rounded-full",
                        DEAL_BADGE[quality].className,
                      )}
                    >
                      {DEAL_BADGE[quality].label}
                    </span>
                  </div>
                </div>
              </div>
              <div className="p-3 pt-0">
                <Button
                  className={cn(
                    "w-full rounded-lg",
                    canAfford ? "pm-grad-emerald text-white" : "",
                  )}
                  variant={canAfford ? "default" : "secondary"}
                  disabled={!canAfford}
                  onClick={() => act((g, l) => purchaseCard(g, c.id, l))}
                >
                  {purchased ? "✅ Purchased" : `🛒 Buy (${finalCost}💰)`}
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
