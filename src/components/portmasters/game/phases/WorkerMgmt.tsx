"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RECIPES, WAGES } from "@/lib/game/constants";
import {
  assignTask,
  fireWorker,
  getHireCost,
  getWorkerWage,
  workerWagesFor,
  hireWorker,
} from "@/lib/game/engine";
import { productionOutput } from "@/lib/game/engine/workers";
import {
  unlockedProducts,
  unlockedResources,
  unlockedWorkerTypes,
} from "@/lib/game/pools";
import type { GameState, Worker } from "@/lib/game/types";
import type { PublicUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import { itemColorResolver } from "@/lib/use-color-preference";
import {
  AlertTriangle,
  Anvil,
  ArrowRight,
  Backpack,
  Banknote,
  Coins,
  Eye,
  Hammer,
  Hourglass,
  PackageCheck,
  PartyPopper,
  Ship,
  Sparkles,
  Star,
  TrendingDown,
  Wrench,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Term } from "../../Term";
import { ItemIcon } from "../../shared";
import { ReadyFooter, type PhaseSync } from "./PhaseShared";

// The wrapper carries an artisan type's hue to everything nested inside it.
// Its class is composed from the worker id, so adding an artisan means adding one
// hue in the stylesheet and nothing at all in this file.
function artisanTint(id: string) {
  return `pm-artisan pm-artisan-${id}`;
}

// === Decorative helpers (no game logic) ============================
// Worker mood: a tiny status hint derived from whether the worker has a
// task assigned. Purely cosmetic : never affects production.
function workerMood(w: Worker): { face: string; label: string; tone: string } {
  if (w.task) {
    return w.isSkilled
      ? {
          face: "⚙️",
          label: "In the zone",
          tone: "text-emerald-600 dark:text-emerald-300",
        }
      : {
          face: "🔨",
          label: "Hard at work",
          tone: "text-teal-600 dark:text-teal-300",
        };
  }
  return w.isSkilled
    ? {
        face: "⭐",
        label: "Bored expert",
        tone: "text-amber-600 dark:text-amber-300",
      }
    : { face: "💤", label: "Idle", tone: "text-muted-foreground" };
}

// === Worker list ===================================================
function WorkerList({
  type,
  icon,
  list,
  name,
  tasks,
  act,
  game,
  resolveColor,
}: {
  type: string;
  icon: string;
  list: Worker[];
  name: string;
  tasks: string[];
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  game: GameState;
  resolveColor: (item: string) => string | undefined;
}) {
  if (!list.length) return null;
  return (
    <div
      className={cn(
        artisanTint(type),
        "pm-artisan-wash pm-artisan-edge my-2.5 rounded-lg border-l-[3px] px-3 py-2.5",
      )}
    >
      <div className="pm-artisan-ink text-xs font-semibold flex items-center gap-1.5">
        <span className="text-sm">{icon}</span>
        {name}s: {list.length}
        <span className="ml-auto text-[10px] font-normal text-muted-foreground">
          {list.filter((w) => w.task).length}/{list.length} working
        </span>
      </div>
      {list.map((w, i) => {
        const mood = workerMood(w);
        const taskColor = w.task ? resolveColor(w.task) : undefined;
        return (
          <div
            key={i}
            className="flex items-center justify-between bg-background/70 rounded-md px-2.5 py-1.5 my-1 text-xs border border-black/5 dark:border-white/10 gap-2"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {/* Worker avatar circle */}
              <div className="relative shrink-0">
                <div
                  className={cn(
                    "grid place-items-center h-7 w-7 rounded-full text-sm border",
                    w.task
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : "border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/5",
                  )}
                >
                  {icon}
                </div>
                {w.isSkilled && (
                  <span
                    title="Skilled workers have a base output of 2 items per round"
                    className="absolute -top-1 -right-1 grid place-items-center h-3.5 w-3.5 rounded-full bg-amber-400 text-white shadow-[0_0_6px_1px_oklch(0.78_0.16_85/0.6)]"
                  >
                    <Star className="h-2 w-2 fill-current" />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">
                    {name} {i + 1}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] inline-flex items-center gap-0.5",
                      mood.tone,
                    )}
                    title={mood.label}
                  >
                    <span aria-hidden>{mood.face}</span>
                    <span className="hidden sm:inline">{mood.label}</span>
                  </span>
                </div>
                {/* Task + decorative progress bar */}
                {w.task ? (
                  <div className="mt-1 flex items-center gap-1.5">
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-medium"
                      style={{ color: taskColor }}
                    >
                      <ItemIcon item={w.task} className="h-3 w-3" />
                      {w.task}
                    </span>
                    <div className="flex-1 h-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                      <motion.div
                        className={cn("h-full rounded-full", "pm-artisan-chip")}
                        initial={{ width: "10%" }}
                        animate={{ width: "55%" }}
                        transition={{
                          duration: 2.2,
                          repeat: Infinity,
                          repeatType: "reverse",
                          ease: "easeInOut",
                        }}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground shrink-0">
                      +{w.isSkilled ? 2 : 1} next phase
                    </span>
                  </div>
                ) : (
                  <div className="mt-1 text-[10px] text-muted-foreground italic">
                    Idle : assign a task below
                  </div>
                )}
              </div>
            </div>
            {!w.task && (
              // Keep dismissal visually secondary to hiring and assignment.
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px] rounded border border-rose-500/25 bg-rose-500/5 text-rose-600/90 hover:border-rose-500/40 hover:bg-rose-500/15 hover:text-rose-600 dark:text-rose-400/90 dark:hover:text-rose-300 shrink-0"
                onClick={() => act((g, l) => fireWorker(g, type, i, l))}
              >
                Dismiss ({WAGES[type]}💰)
              </Button>
            )}
          </div>
        );
      })}
      {/* Task assignment buttons with material cost preview + shortage warnings */}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {tasks.map((t) => {
          const recipe = RECIPES[t];
          const materials = Object.entries(recipe.materials);
          // Decorative shortage check: highlight the button red if the
          // player doesn't currently hold the materials for this task. The
          // engine will still refuse the assignment, this just previews it.
          const short = materials.some(
            ([m, a]) => (game.inventory[m] || 0) < a,
          );
          return (
            <Button
              key={t}
              size="sm"
              variant="secondary"
              title={short ? "Not enough materials" : `Assign: produce ${t}`}
              className={cn(
                "pm-artisan-chip h-7 px-2.5 text-[10px] rounded border gap-1",
                short &&
                  "!bg-rose-500/10 !border-rose-500/40 !text-rose-600 dark:!text-rose-300",
              )}
              onClick={() => act((g, l) => assignTask(g, type, t, l))}
            >
              <Hammer className="h-3 w-3" />
              {t}
              <span className="opacity-70 inline-flex items-center gap-0.5">
                {materials.map(([m, a]) => {
                  const have = game.inventory[m] || 0;
                  const enough = have >= a;
                  return (
                    <span
                      key={m}
                      className={cn(
                        "inline-flex items-center gap-0.5",
                        !enough && "text-rose-600 dark:text-rose-400 font-bold",
                      )}
                      style={enough ? { color: resolveColor(m) } : undefined}
                    >
                      <ItemIcon item={m} className="h-2.5 w-2.5" />×{a}
                    </span>
                  );
                })}
              </span>
              {short && <AlertTriangle className="h-2.5 w-2.5" />}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

// === Phase timeline step config ====================================
const PHASE_STEPS = [
  {
    n: 1,
    label: "Now",
    icon: Anvil,
    desc: "Assign tasks · materials consumed now",
    grad: "pm-grad-emerald",
  },
  {
    n: 2,
    label: "Phase 2",
    icon: Ship,
    desc: "Trade orders at port",
    grad: "pm-grad-primary",
  },
  {
    n: 3,
    label: "Phase 3",
    icon: PackageCheck,
    desc: "Items produced · wages paid",
    grad: "pm-grad-amber",
  },
  {
    n: 4,
    label: "Phase 4",
    icon: Wrench,
    desc: "Shipyard upgrades",
    grad: "bg-fuchsia-600",
  },
] as const;

// === Main component ================================================
export function WorkerMgmt({
  game,
  act,
  phaseSync,
  members,
  colorFor,
}: {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  phaseSync: PhaseSync;
  members: PublicUser[];
  // Optional, falls back to the
  // plain COLORS lookup when a caller hasn't wired useColorPreference in.
  colorFor?: (item: string) => string | undefined;
}) {
  const resolveColor = itemColorResolver(colorFor);
  // Driven by the roster rather than three hardcoded artisans, so the
  // Coppersmith and Potter a charter brings are hirable, payable, and
  // assignable the moment they unlock, with no further edits here. Each
  // type's craftable goods are derived from the recipes that name it, which
  // is also what keeps the Master's inherited weaver goods correct.
  const openProducts = unlockedProducts(game.difficulty, game.currentRound);
  const roster = unlockedWorkerTypes(game.difficulty, game.currentRound).map(
    (w) => {
      const list = game.workers[w.id] ?? [];
      const cost = getHireCost(game, w.id);
      return {
        ...w,
        list,
        cost,
        due: workerWagesFor(game, w.id),
        tasks: openProducts.filter((p) => {
          const owner = RECIPES[p]?.worker_type;
          return owner === w.id || (w.id === "master" && owner === "weaver");
        }),
      };
    },
  );
  const totalWages = roster.reduce((sum, r) => sum + r.due, 0);
  const nW = roster.reduce((sum, r) => sum + r.list.length, 0);

  // Projected balance & bankruptcy warning
  const projectedBalance = game.money - totalWages;
  const bankrupt = projectedBalance < 0;

  // Production preview: items currently being crafted (one entry per
  // active worker task), aggregated by item.
  const inProduction = (() => {
    const map = new Map<string, { count: number; skilled: boolean }>();
    for (const r of roster) {
      for (const w of r.list) {
        if (!w.task) continue;
        const prev = map.get(w.task);
        const { total } = productionOutput(game, w);
        map.set(w.task, {
          count: (prev?.count ?? 0) + total,
          skilled: w.isSkilled || prev?.skilled || false,
        });
      }
    }
    return Array.from(map.entries());
  })();

  // Resources & finished goods (used in inventory grid)
  const resources = unlockedResources(game.difficulty, game.currentRound);

  const [showPreview, setShowPreview] = useState(true);

  return (
    <div className="max-w-3xl mx-auto relative">
      {/* Decorative workshop background elements */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 rounded-2xl overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/[0.04] via-amber-500/[0.03] to-teal-500/[0.04]" />
        <div className="absolute -top-8 right-4 h-32 w-32 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="absolute -bottom-10 left-4 h-36 w-36 rounded-full bg-orange-400/10 blur-3xl" />
      </div>

      {/* === Header ================================================== */}
      <div className="flex items-center gap-2.5 mb-1">
        <div className="relative">
          <div className="absolute inset-0 rounded-xl bg-orange-500/20 blur-md" />
          <div className="relative grid place-items-center h-9 w-9 rounded-xl pm-grad-amber text-white shadow-md">
            <Hammer className="h-5 w-5" />
          </div>
        </div>
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 leading-tight">
            Artisan Management
            <Sparkles className="h-3.5 w-3.5 text-amber-500/80" />
          </h2>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Banknote className="h-3 w-3" />
            Current Funds:{" "}
            <b className="text-amber-700 dark:text-amber-300">
              {game.money} Gold
            </b>
            <span className="opacity-50">·</span>
            <Backpack className="h-3 w-3" />
            Inventory below
          </p>
        </div>
      </div>

      {/* === Production cycle timeline (animated) ==================== */}
      <div className="rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 p-3.5 mb-4 text-xs">
        <div className="flex items-center justify-between mb-2">
          <strong className="flex items-center gap-1.5">
            <Hourglass className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />
            Production Cycle: What Happens When
          </strong>
          <span className="text-[10px] text-muted-foreground">Step 1 of 4</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5 mt-1 text-center">
          {PHASE_STEPS.map((s, i) => {
            const StepIcon = s.icon;
            const active = i === 0;
            return (
              <div
                key={s.n}
                className={cn(
                  "group relative rounded-md py-1.5 text-white transition-all",
                  s.grad,
                  !active && "opacity-70",
                )}
                title={`${s.label}: ${s.desc}`}
              >
                {active && (
                  <motion.div
                    className="absolute inset-0 rounded-md ring-2 ring-white/60"
                    initial={{ opacity: 0.4, scale: 1 }}
                    animate={{ opacity: [0.4, 0.9, 0.4], scale: [1, 1.03, 1] }}
                    transition={{
                      duration: 1.8,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                )}
                <div className="relative">
                  <div className="flex items-center justify-center gap-1 font-semibold">
                    <StepIcon className="h-3.5 w-3.5" />
                    {s.label}
                  </div>
                  <div className="text-[9px] opacity-90 mt-0.5 leading-tight">
                    {s.desc.split(" · ").map((line, idx) => (
                      <div key={idx}>{line}</div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {/* Progress connector line */}
        <div className="relative mt-2 h-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
          <motion.div
            className="absolute left-0 top-0 h-full rounded-full pm-grad-emerald"
            initial={{ width: "0%" }}
            animate={{ width: "25%" }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
        <div className="mt-2 text-emerald-700 dark:text-emerald-300 flex items-start gap-1.5">
          <Eye className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            <strong>Materials consumed now.</strong> Finished goods and wage
            deductions happen at <strong>Phase 3</strong>, not instantly.
          </span>
        </div>
      </div>

      {/* === Inventory grid with active production indicators ========= */}
      <div className="rounded-xl border border-teal-500/15 bg-teal-500/[0.03] p-4 mb-4">
        <h3 className="text-center font-semibold mb-2 flex items-center justify-center gap-1.5">
          <Backpack className="h-4 w-4 text-teal-600 dark:text-teal-400" />
          Current Inventory
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {/* Raw materials */}
          <div className="rounded-lg border border-black/5 dark:border-white/10 bg-background/50 p-2">
            <strong className="text-[11px] text-teal-700 dark:text-teal-300 flex items-center gap-1 mb-1">
              <Wrench className="h-3 w-3" /> Raw Materials
            </strong>
            <div className="space-y-0.5">
              {resources.map((r) => {
                const qty = game.inventory[r] || 0;
                const low = qty === 0;
                const inProd = inProduction.some(([it]) => it === r);
                return (
                  <div
                    key={r}
                    className={cn(
                      "flex items-center text-[11px] py-0.5 px-1.5 rounded",
                      low && "bg-rose-500/10",
                    )}
                  >
                    <ItemIcon item={r} className="mr-1.5 h-3.5 w-3.5" />
                    <span className="flex-1" style={{ color: resolveColor(r) }}>
                      {r}
                    </span>
                    {inProd && (
                      <span
                        title="Being consumed by an assigned task"
                        className="mr-1 inline-flex items-center gap-0.5 text-[9px] text-amber-600 dark:text-amber-400"
                      >
                        <Hourglass className="h-2.5 w-2.5" /> used
                      </span>
                    )}
                    <span
                      className={cn(
                        "inline-flex items-center justify-center min-w-[1.5rem] rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                        low
                          ? "bg-rose-500/20 text-rose-700 dark:text-rose-300"
                          : qty >= 5
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-black/5 dark:bg-white/10 text-foreground",
                      )}
                    >
                      {qty}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Finished goods */}
          <div className="rounded-lg border border-black/5 dark:border-white/10 bg-background/50 p-2">
            <strong className="text-[11px] text-teal-700 dark:text-teal-300 flex items-center gap-1 mb-1">
              <PackageCheck className="h-3 w-3" /> Finished Goods
            </strong>
            <div className="space-y-0.5">
              {openProducts.map((r) => {
                const qty = game.inventory[r] || 0;
                const prodEntry = inProduction.find(([it]) => it === r);
                return (
                  <div
                    key={r}
                    className="flex items-center text-[11px] py-0.5 px-1.5 rounded"
                  >
                    <ItemIcon item={r} className="mr-1.5 h-3.5 w-3.5" />
                    <span className="flex-1" style={{ color: resolveColor(r) }}>
                      {r}
                    </span>
                    {prodEntry && (
                      <span
                        title={`+${prodEntry[1].count} arriving at Phase 3`}
                        className="mr-1 inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1 py-0.5 text-[9px] font-medium text-amber-700 dark:text-amber-300"
                      >
                        <Hourglass className="h-2.5 w-2.5" />+
                        {prodEntry[1].count}
                      </span>
                    )}
                    <span
                      className={cn(
                        "inline-flex items-center justify-center min-w-[1.5rem] rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                        qty === 0
                          ? "bg-black/5 dark:bg-white/10 text-muted-foreground"
                          : qty >= 3
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-black/5 dark:bg-white/10 text-foreground",
                      )}
                    >
                      {qty}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* === Payroll summary with projected balance & bankruptcy warn == */}
      {nW > 0 && (
        <div
          className={cn(
            "rounded-xl border p-3.5 mb-4",
            bankrupt
              ? "bg-rose-500/[0.08] border-rose-500/40"
              : "bg-orange-500/[0.06] border-orange-500/20",
          )}
        >
          <h3
            className={cn(
              "text-center font-semibold mb-2 flex items-center justify-center gap-1.5",
              bankrupt
                ? "text-rose-700 dark:text-rose-300"
                : "text-orange-700 dark:text-orange-300",
            )}
          >
            <Banknote className="h-4 w-4" />
            Pending Payroll: Deducted at Phase 3
          </h3>
          {/* Individual worker breakdown */}
          <div className="text-xs space-y-0.5">
            {roster
              .filter((r) => r.due > 0)
              .flatMap((r) =>
                r.list.map((_, i) => (
                  <div
                    key={`${r.id}-${i}`}
                    className={cn(
                      artisanTint(r.id),
                      "flex justify-between items-center py-0.5",
                    )}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span className="grid place-items-center h-4 w-4 rounded-full bg-black/5 dark:bg-white/10 text-[10px]">
                        {r.icon}
                      </span>
                      <span className="pm-artisan-ink font-medium">
                        {r.label} #{i + 1}
                      </span>
                      <span className="text-muted-foreground">@ {r.cost}g</span>
                    </span>
                    <b className="tabular-nums">{r.cost} Gold</b>
                  </div>
                )),
              )}
            {/* Subtotal per type */}
            {roster
              .filter((r) => r.due > 0 && r.list.length > 1)
              .map((r) => (
                <div
                  key={`sub-${r.id}`}
                  className={cn(
                    artisanTint(r.id),
                    "flex justify-between text-[10px] italic pl-5 text-muted-foreground",
                  )}
                >
                  <span>
                    {r.list.length}× {r.label} subtotal
                  </span>
                  <span>{r.due} Gold</span>
                </div>
              ))}
            <div className="flex justify-between border-t border-orange-500/20 pt-1 mt-1 font-bold">
              <span className="flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                Total Wages Due
              </span>
              <span className="text-rose-600 dark:text-rose-400 tabular-nums">
                {totalWages} Gold
              </span>
            </div>
          </div>
          {/* Projected balance */}
          <div
            className={cn(
              "mt-2 rounded-lg px-3 py-2 text-xs flex items-center justify-between border",
              bankrupt
                ? "bg-rose-500/15 border-rose-500/40"
                : "bg-emerald-500/10 border-emerald-500/30",
            )}
          >
            <span className="flex items-center gap-1.5">
              <Coins className="h-3.5 w-3.5" />
              Projected balance after wages
            </span>
            <b
              className={cn(
                "tabular-nums",
                bankrupt
                  ? "text-rose-700 dark:text-rose-300"
                  : "text-emerald-700 dark:text-emerald-300",
              )}
            >
              {projectedBalance} Gold
            </b>
          </div>
          {bankrupt && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 flex items-start gap-2 rounded-lg bg-rose-500/15 border border-rose-500/40 px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300 pm-shake"
            >
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <b>Bankruptcy warning!</b> You&apos;ll be{" "}
                <b>{Math.abs(projectedBalance)} Gold</b> short at Phase 3.
                Either sell goods in trade, dismiss workers, or raise funds
                before wages come due.
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* === Hire Workers panel ====================================== */}
      <div className="rounded-xl bg-amber-500/[0.05] border border-teal-500/15 p-4 mb-4">
        <h3 className="text-center font-semibold mb-2 flex items-center justify-center gap-1.5">
          <Anvil className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Hire Workers
        </h3>
        <div className="text-xs space-y-1 mb-3">
          {roster.map((r) => (
            <div key={r.id} className={artisanTint(r.id)}>
              <strong className="pm-artisan-ink">
                {r.icon} <Term term={r.label}>{r.label}</Term>
              </strong>
              :{" "}
              {r.tasks
                .map((t) => {
                  const mats = Object.entries(RECIPES[t]?.materials ?? {})
                    .map(([m, a]) => `${a} ${m}`)
                    .join("+");
                  return `${t}(${mats})`;
                })
                .join(" or ")}
              ,{" "}
              <span className="text-orange-600 dark:text-orange-400">
                {getWorkerWage(game, r.id)} Gold per round
              </span>
            </div>
          ))}
        </div>
        {/* Each hire button wears its own craft's hue. The old three color
            cycle put the same saturated green on the first, fourth and
            seventh artisan, so a row of seven read as one repeating stripe
            and the colour told you nothing about which artisan you were
            about to hire. */}
        <div className="flex flex-wrap justify-center gap-2">
          {roster.map((r) => (
            <Button
              key={r.id}
              size="sm"
              variant="secondary"
              className={cn(
                artisanTint(r.id),
                "pm-artisan-chip rounded-lg border font-medium gap-1.5",
              )}
              onClick={() => act((g, l) => hireWorker(g, r.id, l))}
            >
              <span className="text-sm">{r.icon}</span>
              Hire {r.label}
              <span className="inline-flex items-center gap-0.5 opacity-80">
                <Coins className="h-3 w-3" />
                {r.cost} Gold this round
              </span>
            </Button>
          ))}
        </div>
      </div>

      {/* === Worker status & tasks =================================== */}
      {nW > 0 ? (
        <div className="rounded-xl border border-teal-500/15 bg-teal-500/[0.03] p-4 mb-4">
          <h3 className="text-center font-semibold mb-2 flex items-center justify-center gap-1.5">
            <Hammer className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            Worker Status &amp; Tasks
          </h3>
          {roster.map((r) => (
            <WorkerList
              key={r.id}
              type={r.id}
              icon={r.icon}
              list={r.list}
              name={r.label}
              tasks={r.tasks}
              act={act}
              game={game}
              resolveColor={resolveColor}
            />
          ))}
        </div>
      ) : null}

      {/* === Production preview ====================================== */}
      {nW > 0 && inProduction.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3.5 mb-4">
          <button
            type="button"
            onClick={() => setShowPreview((s) => !s)}
            className="w-full flex items-center justify-between gap-2 text-left"
          >
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <PartyPopper className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              Production Preview · next round
            </span>
            <span className="text-[10px] text-muted-foreground">
              {showPreview ? "hide" : "show"}
            </span>
          </button>
          <AnimatePresence initial={false}>
            {showPreview && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {inProduction.map(([item, info]) => {
                    const color = resolveColor(item);
                    const current = game.inventory[item] || 0;
                    return (
                      <div
                        key={item}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 dark:border-white/10 bg-background/60 px-2 py-1 text-[11px]"
                      >
                        <ItemIcon item={item} className="h-3.5 w-3.5" />
                        <span style={{ color: color }} className="font-medium">
                          {item}
                        </span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">{current}</span>
                        <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                        <b className="text-emerald-600 dark:text-emerald-300">
                          {current + info.count}
                        </b>
                        <span
                          className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:text-emerald-300"
                          title={info.skilled ? "Includes skilled bonus" : ""}
                        >
                          +{info.count}
                          {info.skilled && (
                            <Star className="inline h-2 w-2 ml-0.5 fill-current" />
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Expected output includes active boon and module bonuses.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <ReadyFooter
        phaseSync={phaseSync}
        members={members}
        idleLabel="✅ Complete Management, Set Sail"
        onConfirm={() => void phaseSync.markReady()}
      />
    </div>
  );
}
