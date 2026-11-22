"use client";

import { ShipIcon } from "./ShipVisualizer";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  AlertCircle,
  Lightbulb,
  Info,
  Compass,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  X,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { GameState } from "@/lib/game/types";
import { quoteDues, quoteShipUpgrade } from "@/lib/game/engine/pricing";
import { quoteOrder } from "@/lib/game/engine/orders";
import { rebalanced } from "@/lib/game/expansion";
import { pirateChanceFor } from "@/lib/game/difficulty";
import { quotePirateWaters } from "@/lib/game/engine/pirates";
import { WORKER_TYPES } from "@/lib/game/constants";

// Props

type Props = {
  game: GameState;
  className?: string;
};

// Types

type AdvicePriority = "critical" | "warning" | "tip" | "info";

type Advice = {
  id: string;
  priority: AdvicePriority;
  title: string;
  description: string;
  /** Optional text action shown beneath the description. */
  action?: string;
};

// Constants

const PRIORITY_ORDER: Record<AdvicePriority, number> = {
  critical: 0,
  warning: 1,
  tip: 2,
  info: 3,
};

const PRIORITY_META: Record<
  AdvicePriority,
  {
    icon: LucideIcon;
    label: string;
    // Card surface + accents (light + dark variants).
    card: string;
    iconWrap: string;
    accent: string;
    action: string;
  }
> = {
  critical: {
    icon: AlertTriangle,
    label: "Critical",
    card: "border-rose-500/30 bg-rose-50/70 dark:border-rose-500/25 dark:bg-rose-950/30",
    iconWrap:
      "bg-rose-500/15 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300",
    accent: "bg-rose-500 dark:bg-rose-400",
    action: "text-rose-700 dark:text-rose-300",
  },
  warning: {
    icon: AlertCircle,
    label: "Warning",
    card: "border-amber-500/30 bg-amber-50/70 dark:border-amber-500/25 dark:bg-amber-950/30",
    iconWrap:
      "bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300",
    accent: "bg-amber-500 dark:bg-amber-400",
    action: "text-amber-700 dark:text-amber-300",
  },
  tip: {
    icon: Lightbulb,
    label: "Tip",
    card: "border-emerald-500/30 bg-emerald-50/70 dark:border-emerald-500/25 dark:bg-emerald-950/30",
    iconWrap:
      "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300",
    accent: "bg-emerald-500 dark:bg-emerald-400",
    action: "text-emerald-700 dark:text-emerald-300",
  },
  info: {
    icon: Info,
    label: "Info",
    card: "border-sky-500/30 bg-sky-50/70 dark:border-sky-500/25 dark:bg-sky-950/30",
    iconWrap: "bg-sky-500/15 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300",
    accent: "bg-sky-500 dark:bg-sky-400",
    action: "text-sky-700 dark:text-sky-300",
  },
};

// Analysis engine (pure functions)

/** Number of workers with no task assigned, across the whole roster. */
function countIdleWorkers(game: GameState): number {
  let idle = 0;
  for (const w of WORKER_TYPES) {
    const list = game.workers[w.id as keyof typeof game.workers];
    if (!Array.isArray(list)) continue;
    for (const worker of list) {
      if (worker.task === null) idle += 1;
    }
  }
  return idle;
}

/**
 * Which of the captain's outstanding trade orders can be settled right now,
 * given current inventory. Returns the order objects (so we can sum their
 * rewards and quote the windfall).
 */
function completableOrders(game: GameState) {
  const out: { id: number; reward: number }[] = [];
  for (const order of game.customerCards) {
    if (game.completedOrders.includes(order.id)) continue;
    let can = true;
    for (const r of order.resources) {
      const need = r.required ?? 0;
      if ((game.inventory[r.type] ?? 0) < need) {
        can = false;
        break;
      }
    }
    if (can) {
      const { reward, freight } = quoteOrder(game, order);
      const net = reward - freight.final;
      if (game.money + net >= 0) out.push({ id: order.id, reward: net });
    }
  }
  return out;
}

/** Find goods whose stock has piled past the excess threshold. */
function findExcessGoods(game: GameState, threshold = 10) {
  const out: { item: string; qty: number }[] = [];
  for (const [item, qty] of Object.entries(game.inventory)) {
    if (typeof qty === "number" && qty >= threshold) {
      out.push({ item, qty });
    }
  }
  // Largest pile first : that's the most pressing one to mention.
  out.sort((a, b) => b.qty - a.qty);
  return out;
}

/**
 * The full advice set for the given game state. Pure: same state in, same
 * advice out. The React layer handles dismissal + ordering.
 */
function computeAdvice(game: GameState): Advice[] {
  const advice: Advice[] = [];

  const beforeBills = [5, 1, "barter", "worker_mgmt", 2, 3].includes(
    game.phase,
  );
  const due = quoteDues(game);
  if (beforeBills && game.money < due.total) {
    advice.push({
      id: "bankruptcy",
      priority: "critical",
      title: "Settlement funds are short",
      description: `Wages and maintenance require ${due.total} Gold. You have ${game.money} Gold.`,
      action:
        game.phase === 3
          ? "Request Financial Aid if you need help covering the bills."
          : "Reserve Gold and look for a trade you can complete this round.",
    });
  }

  // Worker efficiency
  const idle = countIdleWorkers(game);
  if (
    idle > 0 &&
    game.phase === "worker_mgmt" &&
    (!rebalanced(game) || game.currentRound < game.maxRounds)
  ) {
    advice.push({
      id: "idle_workers",
      priority: "warning",
      title: `${idle} idle ${idle === 1 ? "worker" : "workers"}`,
      description: `Idle artisans still draw wages every round without producing goods. Assign them tasks in Artisan Management to start converting materials into more valuable stock.`,
      action:
        "Open Artisan Management and assign a recipe to each idle artisan.",
    });
  }

  const firstRoundRisk = pirateChanceFor(game.difficulty, 1, game.maxRounds);
  const { chance, raidLoss } = quotePirateWaters(game);
  if (
    beforeBills &&
    chance > firstRoundRisk &&
    !game.pirateAttackResolved &&
    !game.gameOver
  ) {
    advice.push({
      id: "pirate_risk",
      priority: "warning",
      title: "Pirate risk increasing",
      description: `You face a ${Number((chance * 100).toFixed(1))}% chance of losing ${raidLoss} Gold this round.`,
      action:
        "Consider hiring an escort, or keep your treasury small before settlement.",
    });
  }

  // Ship upgrade readiness
  const nextLevel = game.shipLevel;
  const { cost: upgradeCost, available } = quoteShipUpgrade(game);
  if (
    game.phase === 4 &&
    nextLevel < 3 &&
    (!rebalanced(game) || game.currentRound < game.maxRounds) &&
    available >= upgradeCost
  ) {
    advice.push({
      id: "ship_upgrade",
      priority: "tip",
      title: "Ship upgrade ready",
      description: `You can afford the ${upgradeCost} Gold upgrade to ship level ${nextLevel + 1}. An upgrade adds one module slot and can reduce freight by up to 5 Gold.`,
      action: "Visit the Shipyard during Phase 4 to upgrade.",
    });
  }

  // Cargo analysis (excess goods)
  const excess = findExcessGoods(game, 10);
  if (excess.length > 0) {
    // One advice per excess good would flood the panel; lead with the worst
    // pile and mention the count of others.
    const worst = excess[0];
    const others = excess.length - 1;
    advice.push({
      id: "excess_goods",
      priority: "tip",
      title: `Excess ${worst.item} (${worst.qty})`,
      description: `Your hold is overflowing with ${worst.item}${others > 0 ? `, plus ${others} more good${others === 1 ? "" : "s"} past 10 units` : ""}. Excess stock ties up capital that could be working for you.`,
      action:
        "Post a barter offer or fulfill an order to convert stock into Gold.",
    });
  }

  // Order fulfillment
  const completable = game.phase === 2 ? completableOrders(game) : [];
  if (completable.length > 0) {
    const best = Math.max(...completable.map(({ reward }) => reward));
    advice.push({
      id: "orders_ready",
      priority: "tip",
      title: `${completable.length} order${completable.length === 1 ? "" : "s"} ready to fulfill`,
      description: `You already hold everything needed to settle ${completable.length === 1 ? "one open order" : `${completable.length} open orders`}, with a best quoted payout of ${best} Gold after freight and VAT. Orders may need the same cargo.`,
      action: "Prioritize the best reward first during Phase 2.",
    });
  }

  // No orders completed yet
  if (
    game.phase === 2 &&
    game.totalOrdersCompleted === 0 &&
    game.currentRound > 2
  ) {
    advice.push({
      id: "no_orders",
      priority: "warning",
      title: "No orders completed yet",
      description: `You're on round ${game.currentRound} and haven't settled a single trade order. Reputation and revenue both come from orders. Falling behind here is hard to recover from.`,
      action: "Focus on fulfilling trade orders this round, even a small one.",
    });
  }

  // Loan management
  if (game.debts.length > 0) {
    const total = game.debts.reduce((s, d) => s + d.amount, 0);
    advice.push({
      id: "debts",
      priority: "info",
      title: `You owe ${total} Gold in loans`,
      description: `${game.debts.length} outstanding loan${game.debts.length === 1 ? "" : "s"} totaling ${total} Gold. Unpaid debts are forcibly settled at the end of round ${game.maxRounds}, and shortfalls trigger default.`,
      action:
        "Plan repayment before the voyage ends to keep your ledger clean.",
    });
  }

  return advice;
}

// Helpers

function dismissKey(round: number, adviceId: string): string {
  return `pm2_advisor_dismissed_r${round}_${adviceId}`;
}

function readDismissed(round: number): Set<string> {
  const out = new Set<string>();
  try {
    const prefix = `pm2_advisor_dismissed_r${round}_`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        out.add(key.slice(prefix.length));
      }
    }
  } catch {
    // localStorage unavailable (private mode, SSR, etc.).
  }
  return out;
}

function clearDismissedForRound(round: number): number {
  let cleared = 0;
  try {
    const prefix = `pm2_advisor_dismissed_r${round}_`;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) toRemove.push(key);
    }
    for (const key of toRemove) {
      localStorage.removeItem(key);
      cleared += 1;
    }
  } catch {
    // ignore
  }
  return cleared;
}

function countByPriority(list: Advice[]): Record<AdvicePriority, number> {
  const out: Record<AdvicePriority, number> = {
    critical: 0,
    warning: 0,
    tip: 0,
    info: 0,
  };
  for (const a of list) out[a.priority] += 1;
  return out;
}

// Supporting components

function PriorityDots({ counts }: { counts: Record<AdvicePriority, number> }) {
  const items: { p: AdvicePriority; n: number }[] = [
    { p: "critical", n: counts.critical },
    { p: "warning", n: counts.warning },
    { p: "tip", n: counts.tip },
    { p: "info", n: counts.info },
  ];
  return (
    <div className="flex items-center gap-1" aria-hidden>
      {items.map(({ p, n }) => (
        <span
          key={p}
          title={`${n} ${PRIORITY_META[p].label.toLowerCase()}`}
          className={cn(
            "inline-flex h-1.5 w-1.5 rounded-full transition-opacity",
            PRIORITY_META[p].accent,
            n === 0 ? "opacity-20" : "opacity-100",
          )}
        />
      ))}
    </div>
  );
}

function AdviceCard({
  advice,
  index,
  onDismiss,
}: {
  advice: Advice;
  index: number;
  onDismiss: (id: string) => void;
}) {
  const meta = PRIORITY_META[advice.priority];
  const Icon = meta.icon;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -16, scale: 0.95 }}
      transition={{
        duration: 0.3,
        ease: "easeOut",
        delay: Math.min(index * 0.05, 0.4),
      }}
      className={cn(
        "group relative overflow-hidden rounded-xl border p-3 shadow-sm",
        meta.card,
      )}
    >
      {/* Left priority accent bar */}
      <div
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-1", meta.accent)}
      />
      <div className="flex items-start gap-2.5 pl-1.5">
        <div
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            meta.iconWrap,
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-[13px] font-semibold leading-tight text-foreground">
              {advice.title}
            </h4>
            <span
              className={cn(
                "ml-auto inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wider",
                meta.iconWrap,
              )}
            >
              {meta.label}
            </span>
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
            {advice.description}
          </p>
          {advice.action && (
            <p
              className={cn(
                "mt-1.5 flex items-start gap-1 text-[11px] font-medium leading-snug",
                meta.action,
              )}
            >
              <ChevronRight className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              <span>{advice.action}</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(advice.id)}
          aria-label={`Dismiss: ${advice.title}`}
          title="Dismiss this advice"
          className="ml-1 shrink-0 rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </motion.div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col items-center justify-center gap-2 px-4 py-7 text-center"
    >
      <motion.div
        animate={{ rotate: [0, -10, 10, -6, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="relative flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300"
      >
        <Compass className="h-6 w-6" aria-hidden />
        <motion.span
          animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.4, 0.9, 0.4] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -right-1 -top-1 text-amber-400"
        >
          <Sparkles className="h-3 w-3" aria-hidden />
        </motion.span>
      </motion.div>
      <p className="pm-text-shadow text-sm font-semibold text-amber-900 dark:text-amber-100">
        Smooth sailing, Captain!
      </p>
      <p className="max-w-[16rem] text-[11px] leading-relaxed text-muted-foreground">
        No pressing concerns at the moment. Your charts are clear and the hold
        is balanced : press on toward the next port.
      </p>
    </motion.div>
  );
}

// Main component

export function StrategyAdvisor({ game, className }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Tracks which advice ids the captain has dismissed for the current round.
  // Loaded from localStorage whenever the round changes or the captain
  // hits the Refresh button.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() =>
    readDismissed(game.currentRound),
  );
  // Bumped by the Refresh button to run the dismissed set effect again
  // even when the round hasn't changed.
  const [refreshNonce, setRefreshNonce] = useState(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recompute the dismissed set when the round changes or the captain asks
  // for a refresh. Defer the update so the effect body stays synchronous.
  useEffect(() => {
    const t = setTimeout(() => {
      setDismissedIds(readDismissed(game.currentRound));
    }, 0);
    return () => clearTimeout(t);
  }, [game.currentRound, refreshNonce]);

  // Cleanup the refresh spin timer on unmount.
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  // Derive the advice list, then filter + sort.
  const allAdvice = useMemo(() => computeAdvice(game), [game]);
  const visibleAdvice = useMemo(() => {
    return allAdvice
      .filter((a) => !dismissedIds.has(a.id))
      .sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority];
        const pb = PRIORITY_ORDER[b.priority];
        if (pa !== pb) return pa - pb;
        // Stable within a priority: keep insertion order from computeAdvice.
        return 0;
      });
  }, [allAdvice, dismissedIds]);

  const counts = useMemo(() => countByPriority(visibleAdvice), [visibleAdvice]);
  const dismissedCount = allAdvice.length - visibleAdvice.length;

  // Handlers
  const handleDismiss = useCallback(
    (id: string) => {
      try {
        localStorage.setItem(dismissKey(game.currentRound, id), "1");
      } catch {
        // ignore : dismissal just won't persist
      }
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    },
    [game.currentRound],
  );

  const handleRefresh = useCallback(() => {
    const cleared = clearDismissedForRound(game.currentRound);
    setRefreshing(true);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => setRefreshing(false), 600);
    // Bumping the nonce reloads the dismissed set after localStorage clears.
    setRefreshNonce((n) => n + 1);
    if (cleared > 0) {
      toast.success(
        `Restored ${cleared} dismissed tip${cleared === 1 ? "" : "s"}`,
      );
    } else {
      toast.info("Analysis refreshed");
    }
  }, [game.currentRound]);

  // Render
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
      className={cn(
        "pm-glass-warm relative flex flex-col overflow-hidden rounded-2xl",
        className,
      )}
      aria-label="Strategy advisor"
    >
      {/* Warm amber radial accent in the upper right corner */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-[0.18]"
        style={{
          background:
            "radial-gradient(circle, oklch(0.78 0.16 70 / 0.55) 0%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-8 -left-8 h-28 w-28 rounded-full opacity-[0.12]"
        style={{
          background:
            "radial-gradient(circle, oklch(0.7 0.14 55 / 0.5) 0%, transparent 70%)",
        }}
      />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-2 px-3.5 py-3">
        <motion.div
          animate={{ rotate: [0, -6, 6, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300"
        >
          <Compass className="h-4.5 w-4.5" aria-hidden />
        </motion.div>
        <div className="min-w-0 flex-1">
          <h3 className="pm-text-shadow flex items-center gap-1.5 text-sm font-semibold tracking-wide text-amber-900 dark:text-amber-100">
            Strategy Advisor
          </h3>
          <p className="truncate text-[10px] text-amber-700/70 dark:text-amber-200/55">
            Round {game.currentRound} of {game.maxRounds}
            {visibleAdvice.length > 0 && (
              <>
                {" · "}
                <span className="font-medium text-amber-800 dark:text-amber-200">
                  {visibleAdvice.length}{" "}
                  {visibleAdvice.length === 1 ? "tip" : "tips"}
                </span>
              </>
            )}
          </p>
        </div>

        {/* Priority indicator dots (hidden when collapsed for cleanliness) */}
        {!collapsed && visibleAdvice.length > 0 && (
          <PriorityDots counts={counts} />
        )}

        {/* Refresh */}
        <button
          type="button"
          onClick={handleRefresh}
          aria-label="Refresh analysis"
          title="Refresh analysis & restore dismissed tips"
          className="rounded-md p-1.5 text-amber-700/70 transition-colors hover:bg-amber-500/10 hover:text-amber-800 dark:text-amber-200/60 dark:hover:bg-amber-400/15 dark:hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
            aria-hidden
          />
        </button>

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand advisor" : "Collapse advisor"}
          aria-expanded={!collapsed}
          className="rounded-md p-1.5 text-amber-700/70 transition-colors hover:bg-amber-500/10 hover:text-amber-800 dark:text-amber-200/60 dark:hover:bg-amber-400/15 dark:hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      </div>

      {/* Body */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="relative z-10 overflow-hidden"
          >
            <div className="px-3.5 pb-3.5">
              {visibleAdvice.length === 0 ? (
                <EmptyState />
              ) : (
                <>
                  <div className="pm-scroll flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
                    <AnimatePresence initial={false}>
                      {visibleAdvice.map((a, i) => (
                        <AdviceCard
                          key={a.id}
                          advice={a}
                          index={i}
                          onDismiss={handleDismiss}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                  {dismissedCount > 0 && (
                    <div className="mt-2 flex items-center justify-center">
                      <button
                        type="button"
                        onClick={handleRefresh}
                        className="inline-flex items-center gap-1 rounded-full border border-amber-700/15 bg-amber-50/60 px-2.5 py-1 text-[10px] font-medium text-amber-700/80 transition-colors hover:border-amber-700/30 hover:bg-amber-100/70 hover:text-amber-800 dark:border-amber-300/15 dark:bg-amber-400/10 dark:text-amber-200/70 dark:hover:bg-amber-400/15 dark:hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
                      >
                        <RefreshCw className="h-2.5 w-2.5" aria-hidden />
                        Restore {dismissedCount} dismissed tip
                        {dismissedCount === 1 ? "" : "s"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed summary strip */}
      {collapsed && visibleAdvice.length > 0 && (
        <div className="relative z-10 flex items-center gap-2 px-3.5 pb-2.5">
          <PriorityDots counts={counts} />
          <span className="text-[10px] text-amber-700/70 dark:text-amber-200/55">
            {visibleAdvice.length} {visibleAdvice.length === 1 ? "tip" : "tips"}{" "}
            pending
          </span>
        </div>
      )}
      {collapsed && visibleAdvice.length === 0 && (
        <div className="relative z-10 flex items-center gap-1.5 px-3.5 pb-2.5 text-[10px] text-amber-700/70 dark:text-amber-200/55">
          <ShipIcon className="h-3 w-3" aria-hidden />
          <span>Smooth sailing</span>
        </div>
      )}
    </motion.section>
  );
}

export default StrategyAdvisor;
