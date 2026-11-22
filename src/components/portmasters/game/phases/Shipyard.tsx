"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Anchor,
  Ship,
  Wrench,
  Coins,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Crown,
  Star,
  ArrowRight,
  Check,
  Package,
  Users,
  Gauge,
  Hammer,
  Ruler,
  Lock,
  Unlock,
  ChevronRight,
} from "lucide-react";
import {
  finalizeModuleSwap,
  handleModuleSelect,
  startModuleDrafting,
  swapModuleChoices,
  upgradeShip,
} from "@/lib/game/engine";
import {
  MODULES_TIER0,
  MODULES_TIER1,
  MODULES_TIER2,
  type Module,
  type Boon,
  BOONS_TIER0,
  BOONS_TIER1,
  BOONS_TIER2,
} from "@/lib/game/constants";
import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import type { PublicUser } from "@/lib/api";
import { Term } from "../../Term";
import { ShipVisualizer } from "../../ShipVisualizer";
import { ReadyBar } from "../ReadyBar";
import type { PhaseSync } from "./PhaseShared";

// Module tier detection : same pattern as the BoonDraft tier helper. The
// three MODULES_TIER* arrays in constants.ts group modules by when they
// unlock; we expose that grouping here as a "rarity" indicator.
const MODULE_TIER_INDEX: Record<string, "common" | "rare" | "legendary"> = {
  ...Object.fromEntries(MODULES_TIER0.map((m) => [m.id, "common"])),
  ...Object.fromEntries(MODULES_TIER1.map((m) => [m.id, "rare"])),
  ...Object.fromEntries(MODULES_TIER2.map((m) => [m.id, "legendary"])),
};

const MODULE_TIER_STYLE: Record<
  "common" | "rare" | "legendary",
  {
    label: string;
    chip: string;
    aura: string;
    icon: React.ReactNode;
  }
> = {
  common: {
    label: "Common",
    chip: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30",
    aura: "pm-card-aura-teal",
    icon: <Star className="h-3 w-3" />,
  },
  rare: {
    label: "Rare",
    chip: "bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30",
    aura: "pm-card-aura-teal",
    icon: <Sparkles className="h-3 w-3" />,
  },
  legendary: {
    label: "Legendary",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/40",
    aura: "pm-card-aura-gold",
    icon: <Crown className="h-3 w-3" />,
  },
};

function moduleTierOf(mod: Module): "common" | "rare" | "legendary" {
  return MODULE_TIER_INDEX[mod.id] ?? "common";
}

// Module ↔ Boon synergy map. Curated, decorative only: surfaces boons that
// pair well with a given module so the player can plan across phases. Does
// not touch game logic.
const ALL_BOONS: Boon[] = [...BOONS_TIER0, ...BOONS_TIER1, ...BOONS_TIER2];

const MODULE_SYNERGIES: Record<string, string[]> = {
  silk_monopoly: ["silk_wind"],
  tax_evasion: ["tax_shelter", "frontier_tariff_relief"],
  artisans_workshop: ["artisan_inspiration", "master_apprentice"],
  bulk_hauler: ["favorable_tides"],
  brokers_network: ["farsight"],
  kiln_cellar: ["kiln_and_forge_guild"],
  foreign_quarter_pass: ["exotic_treasures"],
  fleet_of_treasures: ["exotic_treasures"],
  persian_dome_compass: ["deep_sea_escort_pact"],
  salvage_crane: ["favorable_tides"],
  overdrive_engine: ["favorable_tides"],
  bureau_token: ["kiln_and_forge_guild"],
  ocean_relay: ["farsight"],
  smugglers_hold: ["tax_shelter", "merchant_charm"],
};

function synergisticBoons(mod: Module): Boon[] {
  const ids = MODULE_SYNERGIES[mod.id] ?? [];
  return ids
    .map((id) => ALL_BOONS.find((b) => b.id === id))
    .filter((b): b is Boon => Boolean(b));
}

// Derived ship metrics : cargo fill is a soft heuristic (no hard capacity in
// the game state), capped at 1.0 for the ShipVisualizer. Crew = total
// workers across all artisan types.
function cargoFillOf(game: GameState): number {
  const total = Object.values(game.inventory).reduce(
    (sum, n) => sum + (typeof n === "number" ? n : 0),
    0,
  );
  return Math.min(1, total / 20);
}

function crewCountOf(game: GameState): number {
  return Object.values(game.workers).flat().length;
}

// Decorative shipyard background : rope + anchor SVG silhouettes. Sits
// behind the panel at low opacity with pointer input disabled.
function ShipyardBackdrop() {
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl"
      aria-hidden
    >
      {/* Anchor in the upper left */}
      <Anchor
        className="absolute -top-3 -left-3 h-20 w-20 text-teal-500/5 dark:text-teal-400/8 rotate-12"
        strokeWidth={1.2}
      />
      {/* Wrench in the upper right */}
      <Wrench
        className="absolute -top-2 right-2 h-16 w-16 text-amber-500/5 dark:text-amber-400/8 -rotate-12"
        strokeWidth={1.2}
      />
      {/* Rope in the lower left */}
      <svg
        className="absolute bottom-0 left-0 w-1/3 h-16 text-amber-500/5 dark:text-amber-400/8"
        viewBox="0 0 200 40"
        fill="none"
      >
        <path
          d="M0 20 Q25 5 50 20 T100 20 T150 20 T200 20"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="4 3"
          fill="none"
        />
      </svg>
      {/* Anchor in the lower right */}
      <Anchor
        className="absolute -bottom-3 -right-3 h-20 w-20 text-amber-500/5 dark:text-amber-400/8 -rotate-12"
        strokeWidth={1.2}
      />
    </div>
  );
}

// Ship stats panel : current vs (optionally) upgraded stats, with a module
// slot fill progress bar. Purely informational; reads only from game state.
function StatChip({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-black/5 dark:border-white/10 bg-background/50 px-2.5 py-1.5">
      <span className={cn("shrink-0", accent)}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[9px] tracking-wide text-muted-foreground/70">
          {label}
        </div>
        <div className={cn("text-xs font-semibold", accent)}>{value}</div>
      </div>
    </div>
  );
}

function ShipStatsPanel({ game }: { game: GameState }) {
  const canUpgrade = game.shipLevel < 3;
  const cargoFill = cargoFillOf(game);
  const crew = crewCountOf(game);
  const slotsUsed = game.equippedModules.length;
  const slotsMax = game.shipLevel;
  const slotPct = slotsMax > 0 ? (slotsUsed / slotsMax) * 100 : 0;
  return (
    <div className="rounded-xl border border-teal-500/20 bg-teal-500/[0.04] p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatChip
          icon={<Ship className="h-4 w-4" />}
          label="Ship Level"
          value={`Lvl ${game.shipLevel}`}
          accent="text-teal-600 dark:text-teal-400"
        />
        <StatChip
          icon={<Coins className="h-4 w-4" />}
          label="Discount"
          value={`${game.shipLevel * 5}g`}
          accent="text-amber-600 dark:text-amber-400"
        />
        <StatChip
          icon={<Package className="h-4 w-4" />}
          label="Cargo"
          value={`${Math.round(cargoFill * 100)}%`}
          accent="text-violet-600 dark:text-violet-400"
        />
        <StatChip
          icon={<Users className="h-4 w-4" />}
          label="Crew"
          value={`${crew}`}
          accent="text-emerald-600 dark:text-emerald-400"
        />
      </div>

      {/* Module slot fill bar */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[10px]">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Gauge className="h-3 w-3" />
            Module Slots
          </span>
          <span className="font-mono font-semibold text-teal-700 dark:text-teal-300">
            {slotsUsed} / {slotsMax}
            {canUpgrade && (
              <span className="ml-1 text-emerald-600 dark:text-emerald-400">
                → {Math.min(slotsUsed + 1, slotsMax + 1)} / {slotsMax + 1} after
                upgrade
              </span>
            )}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <motion.div
            className={cn(
              "h-full rounded-full",
              slotPct >= 100
                ? "bg-gradient-to-r from-amber-400 to-rose-500"
                : "bg-gradient-to-r from-teal-400 to-teal-600",
            )}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, slotPct)}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
      </div>
    </div>
  );
}

// Upgrade preview : small animated badge showing what changes after upgrade.
function UpgradePreview() {
  return (
    <motion.div
      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
      animate={{ y: [0, -2, 0] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
    >
      <Sparkles className="h-3 w-3" />
      +1 Slot · +5 Discount
    </motion.div>
  );
}

// Cost breakdown tooltip content for the upgrade button.
function CostBreakdown({
  base,
  penalty,
  total,
  affordable,
  balance,
}: {
  base: number;
  penalty: number;
  total: number;
  affordable: boolean;
  balance: number;
}) {
  return (
    <div className="space-y-1.5 text-xs">
      <div className="font-semibold border-b border-black/10 dark:border-white/10 pb-1 mb-1">
        Upgrade Cost Breakdown
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Base cost</span>
        <span className="font-mono">{base}💰</span>
      </div>
      {penalty > 0 && (
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <TrendingDown className="h-3 w-3" />
            Bulk Hauler penalty
          </span>
          <span className="font-mono text-rose-600 dark:text-rose-400">
            +{penalty}💰
          </span>
        </div>
      )}
      <div className="flex justify-between gap-4 border-t border-black/10 dark:border-white/10 pt-1 font-semibold">
        <span>Total</span>
        <span className="font-mono">{total}💰</span>
      </div>
      <div
        className={cn(
          "flex justify-between gap-4 pt-0.5",
          affordable
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-rose-600 dark:text-rose-400",
        )}
      >
        <span className="inline-flex items-center gap-1">
          {affordable ? (
            <Check className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          Your balance
        </span>
        <span className="font-mono">{balance}💰</span>
      </div>
    </div>
  );
}

// ===========================================================================
// Shipyard : main export. Logic untouched; presentation enhanced.
// ===========================================================================

export function Shipyard({
  game,
  act,
  phaseSync,
  members,
}: {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  phaseSync: PhaseSync;
  members: PublicUser[];
}) {
  const canUpgrade = game.shipLevel < 3;
  const upgCost = canUpgrade
    ? game.shipUpgradeCost[game.shipLevel] + game.shipUpgradePenalty
    : 0;
  const affordable = game.money >= upgCost;
  const canDraft = game.shipLevel > 0;
  const slotsFull =
    game.equippedModules.length >= game.shipLevel && game.shipLevel > 0;
  const cargoFill = cargoFillOf(game);
  const crew = crewCountOf(game);

  return (
    <div className="max-w-3xl mx-auto relative">
      <ShipyardBackdrop />
      <div className="relative z-10">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Anchor className="h-5 w-5 text-teal-500" />
          <h2 className="text-2xl font-bold pm-text-gradient">
            Shipyard &amp; Module Rigging
          </h2>
          <Anchor className="h-5 w-5 text-amber-500" />
        </div>

        {/* Ship preview + stats panel */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-3 mb-4">
          <div className="rounded-xl border-2 border-teal-500/20 bg-teal-500/[0.04] p-3 flex items-center justify-center relative overflow-hidden">
            {/* Upgrade preview badge */}
            {canUpgrade && (
              <div className="absolute top-2 right-2 z-10">
                <UpgradePreview />
              </div>
            )}
            {/* Level crown for level >= 2 */}
            {game.shipLevel >= 2 && (
              <motion.div
                className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300"
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 2.4, repeat: Infinity }}
              >
                <Crown className="h-3 w-3" />
                Veteran
              </motion.div>
            )}
            <ShipVisualizer
              shipLevel={game.shipLevel}
              equippedModules={game.equippedModules}
              cargoFill={cargoFill}
              crewCount={crew}
              compact
            />
          </div>
          <div>
            <ShipStatsPanel game={game} />
            {/* Equipped modules list with connection visualization */}
            <div className="mt-3 rounded-xl border border-teal-500/15 bg-teal-500/[0.03] p-3">
              <div className="text-[10px] tracking-wide text-muted-foreground/70 mb-1.5 flex items-center gap-1">
                <Hammer className="h-3 w-3" />
                Equipped Modules
              </div>
              {game.equippedModules.length ? (
                <div className="space-y-1.5">
                  {game.equippedModules.map((m, i) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="flex items-start gap-2 text-xs"
                    >
                      <span className="shrink-0 text-base leading-tight">
                        {m.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <strong className="text-foreground">
                          <Term term={m.name}>{m.name}</Term>
                        </strong>
                        <div className="text-muted-foreground leading-snug">
                          {m.desc}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground italic">
                  No modules installed. Upgrade ship to unlock slots!
                </div>
              )}
            </div>
          </div>
        </div>

        {phaseSync.waiting ? (
          <div className="text-center space-y-3">
            <div className="text-sm font-medium text-amber-700 dark:text-amber-300">
              ⏳ Waiting for the rest of the crew…
            </div>
            <ReadyBar
              ready={phaseSync.ready}
              members={members}
              className="justify-center"
            />
            <Button
              variant="secondary"
              className="rounded-xl"
              onClick={phaseSync.cancelReady}
            >
              ↩️ Not ready yet
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {canUpgrade && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Button
                      size="lg"
                      variant={affordable ? "default" : "secondary"}
                      className={cn(
                        "rounded-xl w-full group relative",
                        affordable && "pm-grad-primary text-white",
                      )}
                      disabled={!affordable}
                      onClick={() => act((g, l) => upgradeShip(g, l))}
                    >
                      <Ship className="h-4 w-4 mr-1.5 inline-block transition-transform group-hover:scale-110" />
                      Upgrade Ship to Lvl {game.shipLevel + 1}
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-black/15 dark:bg-white/15 px-2 py-0.5 text-xs">
                        <Coins className="h-3 w-3" />
                        {upgCost}
                      </span>
                      {/* Affordability indicator */}
                      <span
                        className={cn(
                          "ml-2 inline-flex h-2.5 w-2.5 rounded-full",
                          affordable
                            ? "bg-emerald-400 shadow-[0_0_6px_2px_oklch(0.7_0.15_155/0.5)]"
                            : "bg-rose-400 shadow-[0_0_6px_2px_oklch(0.65_0.2_25/0.5)]",
                        )}
                      />
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <CostBreakdown
                    base={game.shipUpgradeCost[game.shipLevel]}
                    penalty={game.shipUpgradePenalty}
                    total={upgCost}
                    affordable={affordable}
                    balance={game.money}
                  />
                </TooltipContent>
              </Tooltip>
            )}
            <Button
              size="lg"
              variant={canDraft ? "default" : "secondary"}
              className={cn(
                "rounded-xl w-full group",
                canDraft && "pm-grad-gold text-amber-950",
              )}
              disabled={!canDraft}
              onClick={() =>
                act((g) => {
                  startModuleDrafting(g);
                })
              }
            >
              <Wrench
                className={cn(
                  "h-4 w-4 mr-1.5 inline-block transition-transform",
                  canDraft && "group-hover:rotate-90",
                )}
              />
              {slotsFull
                ? "Draft & Swap Module (Slots Full)"
                : "Draft & Install Module"}
              {canDraft && (
                <ChevronRight className="h-4 w-4 ml-1.5 inline-block transition-transform group-hover:translate-x-1" />
              )}
            </Button>
            <Button
              size="lg"
              className="pm-grad-emerald text-white rounded-xl w-full group"
              onClick={() => void phaseSync.markReady()}
            >
              <span className="inline-flex items-center">
                Continue Voyage
                <motion.span
                  className="ml-1.5 inline-block"
                  animate={{ x: [0, 4, 0] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                >
                  <ArrowRight className="h-4 w-4" />
                </motion.span>
              </span>
            </Button>

            {/* Summary of changes this visit */}
            <div className="mt-1 rounded-lg border border-black/5 dark:border-white/10 bg-background/40 px-3 py-2 text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
              <Ruler className="h-3 w-3" />
              Ship Level {game.shipLevel} · {game.equippedModules.length} module
              {game.equippedModules.length === 1 ? "" : "s"} equipped ·{" "}
              {game.shipLevel * 5}g discount active
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// ModuleDraft : enhanced with tier indicators, synergy badges, 3D tilt, and
// a Compare tooltip. Logic untouched.
// ===========================================================================

export function ModuleDraft({
  game,
  act,
}: {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
}) {
  const picks = game._draftChoices ?? [];
  const canSwap = !game.moduleSwapUsed && picks.length > 0;
  const slotsAvailable = game.equippedModules.length < game.shipLevel;
  return (
    <div className="max-w-4xl mx-auto text-center relative">
      <ShipyardBackdrop />
      <div className="relative z-10">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Wrench className="h-5 w-5 text-amber-500" />
          <h2 className="text-2xl font-bold pm-text-gradient">
            Module Drafting
          </h2>
          <Wrench className="h-5 w-5 text-teal-500" />
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Choose a module to install or swap.
        </p>
        {picks.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            You&apos;ve used all module choices this round. New options arrive
            next round.
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="rounded-lg group"
                      disabled={!canSwap}
                      onClick={() => act((g, l) => swapModuleChoices(g, l))}
                    >
                      {game.moduleSwapUsed ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Check className="h-3.5 w-3.5" />
                          Choices Swapped This Round
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <motion.span
                            animate={{ rotate: [0, 360] }}
                            transition={{
                              duration: 2,
                              repeat: Infinity,
                              ease: "linear",
                            }}
                            className="inline-block"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                          </motion.span>
                          Swap Choices
                          <span className="text-[10px] text-muted-foreground">
                            (once per round)
                          </span>
                        </span>
                      )}
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {game.moduleSwapUsed
                    ? "Already rerolled this round's module pool."
                    : "Reroll all three modules for free once per round."}
                </TooltipContent>
              </Tooltip>
            </div>
            <motion.div
              className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-4"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.08 } },
              }}
            >
              {picks.map((m, i) => (
                <ModuleCard
                  key={m.id}
                  mod={m}
                  index={i}
                  game={game}
                  slotsAvailable={slotsAvailable}
                  onPick={() => act((g, l) => handleModuleSelect(g, i, l))}
                />
              ))}
            </motion.div>
          </>
        )}
        <div className="mt-5">
          <Button
            variant="secondary"
            className="rounded-xl group"
            onClick={() =>
              act((g) => {
                g.phase = 4;
              })
            }
          >
            <ArrowRight className="h-4 w-4 mr-1.5 inline-block rotate-180 transition-transform group-hover:-translate-x-1" />
            Back to Shipyard
          </Button>
        </div>
      </div>
    </div>
  );
}

// ModuleCard : enhanced card with tier ribbon, synergy badges, 3D tilt hover,
// animated icon rotation, and a Compare tooltip.
function ModuleCard({
  mod,
  index,
  game,
  slotsAvailable,
  onPick,
}: {
  mod: Module;
  index: number;
  game: GameState;
  slotsAvailable: boolean;
  onPick: () => void;
}) {
  const tier = moduleTierOf(mod);
  const style = MODULE_TIER_STYLE[tier];
  const synergies = synergisticBoons(mod);
  const similar = game.equippedModules.filter(
    (eq) =>
      eq.id !== mod.id &&
      synergisticBoons(eq).some((b) => synergies.some((s) => s.id === b.id)),
  );

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, rotateY: -45, y: 30, scale: 0.85 },
        visible: {
          opacity: 1,
          rotateY: 0,
          y: 0,
          scale: 1,
          transition: {
            duration: 0.45,
            ease: "easeOut",
            delay: index * 0.04,
          },
        },
      }}
      whileHover={{ y: -8, rotateZ: -1, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      style={{ transformStyle: "preserve-3d", perspective: 1000 }}
      className={cn(
        "pm-glass rounded-2xl p-5 flex flex-col items-center text-center relative",
        "border border-teal-500/20 transition-colors hover:border-teal-400/40",
        style.aura,
      )}
    >
      {/* Tier ribbon */}
      <div className="absolute top-2.5 right-2.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold tracking-wider",
            style.chip,
          )}
        >
          {style.icon}
          {style.label}
        </span>
      </div>

      {/* Synergy badges */}
      {synergies.length > 0 && (
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1">
          {synergies.slice(0, 2).map((b) => (
            <Tooltip key={b.id}>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/15 px-1.5 py-0.5 text-[8px] font-medium text-violet-700 dark:text-violet-300">
                  <Sparkles className="h-2.5 w-2.5" />
                  {b.icon} {b.name}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-[200px]">
                Synergizes with the <strong>{b.name}</strong> boon: {b.desc}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}

      {/* Icon with rotation on hover + glow */}
      <div className="relative my-3 mt-6">
        <motion.div
          className="pm-particle-orbit inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-teal-500/10 to-amber-500/10 border border-teal-500/30"
          animate={{
            boxShadow: [
              "0 0 10px 2px oklch(0.6 0.13 200 / 0.2)",
              "0 0 20px 6px oklch(0.6 0.13 200 / 0.35)",
              "0 0 10px 2px oklch(0.6 0.13 200 / 0.2)",
            ],
          }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <motion.span
            className="text-4xl"
            whileHover={{ rotate: 15, scale: 1.1 }}
            transition={{ type: "spring", stiffness: 200 }}
          >
            {mod.icon}
          </motion.span>
        </motion.div>
      </div>

      <div className="font-semibold mb-1.5">
        <Term term={mod.name}>{mod.name}</Term>
      </div>
      <div className="text-xs text-muted-foreground leading-relaxed flex-1 mb-3">
        {mod.desc}
      </div>

      {/* Compare row : shows what this module would replace or coexist with */}
      <div className="w-full mb-3 min-h-[1.25rem]">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="text-[10px] text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-2 inline-flex items-center gap-1"
            >
              <Ruler className="h-3 w-3" />
              {slotsAvailable
                ? "Adds to empty slot"
                : similar.length > 0
                  ? `Compare with ${similar.length} similar`
                  : "Compare with equipped"}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[240px] text-xs">
            <ComparePanel
              newMod={mod}
              equipped={game.equippedModules}
              slotsAvailable={slotsAvailable}
            />
          </TooltipContent>
        </Tooltip>
      </div>

      <Button
        className="pm-grad-gold text-amber-950 font-semibold rounded-xl w-full group"
        onClick={onPick}
      >
        {slotsAvailable ? (
          <>
            <Unlock className="h-3.5 w-3.5 mr-1 inline-block transition-transform group-hover:scale-110" />
            Install
          </>
        ) : (
          <>
            <ArrowRight className="h-3.5 w-3.5 mr-1 inline-block transition-transform group-hover:translate-x-1" />
            Swap
          </>
        )}
      </Button>
    </motion.div>
  );
}

// ComparePanel : shown in the ModuleCard tooltip. Lists equipped modules
// with a small "kept" vs "would replace" hint. Decorative.
function ComparePanel({
  newMod,
  equipped,
  slotsAvailable,
}: {
  newMod: Module;
  equipped: Module[];
  slotsAvailable: boolean;
}) {
  if (slotsAvailable) {
    return (
      <div className="space-y-1">
        <div className="font-semibold inline-flex items-center gap-1">
          <TrendingUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          Install preview
        </div>
        <p className="text-muted-foreground">
          Goes into an empty slot : no existing module affected.
        </p>
        <div className="mt-1.5 rounded border border-amber-500/20 bg-amber-500/[0.06] px-2 py-1">
          <strong>
            {newMod.icon} {newMod.name}
          </strong>
          <div className="text-[11px] text-muted-foreground">{newMod.desc}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="font-semibold inline-flex items-center gap-1">
        <TrendingDown className="h-3 w-3 text-amber-600 dark:text-amber-400" />
        Swap preview
      </div>
      <p className="text-muted-foreground">
        Slots are full : picking this module lets you choose which to replace:
      </p>
      <div className="mt-1 space-y-1">
        {equipped.map((eq) => (
          <div
            key={eq.id}
            className="flex items-center gap-1.5 rounded border border-black/10 dark:border-white/10 bg-background/60 px-1.5 py-1"
          >
            <span className="text-base">{eq.icon}</span>
            <div className="flex-1 text-left min-w-0">
              <div className="font-medium truncate">{eq.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">
                {eq.desc}
              </div>
            </div>
            <Lock className="h-3 w-3 text-muted-foreground/60 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// ModuleSwap : enhanced with visual comparison between the new module and
// each equipped one. Logic untouched.
// ===========================================================================

export function ModuleSwap({
  game,
  act,
}: {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
}) {
  const newMod = game._newModule;
  return (
    <div className="max-w-2xl mx-auto text-center relative">
      <ShipyardBackdrop />
      <div className="relative z-10">
        <div className="flex items-center justify-center gap-2 mb-1">
          <ArrowRight className="h-5 w-5 text-rose-500" />
          <h2 className="text-2xl font-bold pm-text-gradient">
            Select Module to Replace
          </h2>
          <ArrowRight className="h-5 w-5 text-amber-500" />
        </div>
        {newMod && (
          <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-1.5 text-xs">
            <motion.span
              className="text-xl"
              animate={{ rotate: [0, -8, 8, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              {newMod.icon}
            </motion.span>
            <div className="text-left">
              <strong className="text-amber-700 dark:text-amber-300">
                New: {newMod.name}
              </strong>
              <div className="text-muted-foreground text-[11px]">
                {newMod.desc}
              </div>
            </div>
          </div>
        )}
        <div className="rounded-xl border border-teal-500/15 bg-teal-500/[0.03] p-4 my-4 space-y-2 text-left">
          {game.equippedModules.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className="flex justify-between items-center bg-background/60 rounded-md p-2.5 border border-black/5 dark:border-white/10 group hover:border-rose-500/30 transition-colors"
            >
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-base leading-tight shrink-0">
                  {m.icon}
                </span>
                <div className="min-w-0">
                  <strong>
                    <Term term={m.name}>{m.name}</Term>
                  </strong>
                  <div className="text-[11px] text-muted-foreground">
                    {m.desc}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="destructive"
                className="rounded-lg shrink-0 group-hover:scale-105 transition-transform"
                onClick={() => act((g, l) => finalizeModuleSwap(g, i, l))}
              >
                <ArrowRight className="h-3 w-3 mr-1 inline-block" />
                Replace
              </Button>
            </motion.div>
          ))}
        </div>
        <Button
          variant="secondary"
          className="rounded-xl group"
          onClick={() =>
            act((g) => {
              g.phase = "module_draft";
            })
          }
        >
          <ArrowRight className="h-4 w-4 mr-1.5 inline-block rotate-180 transition-transform group-hover:-translate-x-1" />
          Back to Draft
        </Button>
      </div>
    </div>
  );
}
