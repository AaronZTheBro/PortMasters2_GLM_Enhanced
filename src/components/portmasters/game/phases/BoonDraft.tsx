"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sparkles,
  Compass,
  Coins,
  HelpCircle,
  Crown,
  Star,
  BookOpen,
  Check,
  RotateCw,
  Gem,
  Wand2,
  PartyPopper,
  Lock,
} from "lucide-react";
import {
  BOONS,
  BOONS_TIER0,
  BOONS_TIER1,
  BOONS_TIER2,
  PRODUCTS,
  type Boon,
} from "@/lib/game/constants";
import { swapBoonChoices } from "@/lib/game/engine";
import {
  needsStarterModule,
  selectStarterModule,
} from "@/lib/game/engine/boons";
import type { GameState } from "@/lib/game/types";
import type { PublicUser } from "@/lib/api";
import { NEW_BOONS, harborTrading, rebalanced } from "@/lib/game/expansion";
import { voyageBoon } from "@/lib/game/pools";
import { cn } from "@/lib/utils";
import { ReadyBar } from "../ReadyBar";
import { Term } from "../../Term";
import { TextWithShipIcons } from "../../ShipVisualizer";
import type { PhaseSync } from "./PhaseShared";

// Tier detection : boons are grouped into three tiers in constants.ts; we
// expose that grouping here as a "rarity" indicator. Purely decorative: it
// does not affect game logic or which boons can be drafted.
const TIER_INDEX: Record<string, "common" | "rare" | "legendary"> = {
  ...Object.fromEntries(
    NEW_BOONS.map((boon) => [
      boon.id,
      (["common", "rare", "legendary"] as const)[boon.tier],
    ]),
  ),
  ...Object.fromEntries(BOONS_TIER0.map((b) => [b.id, "common"])),
  ...Object.fromEntries(BOONS_TIER1.map((b) => [b.id, "rare"])),
  ...Object.fromEntries(BOONS_TIER2.map((b) => [b.id, "legendary"])),
};

const TIER_STYLE: Record<
  "common" | "rare" | "legendary",
  {
    label: string;
    chip: string;
    ring: string;
    aura: string;
    icon: React.ReactNode;
  }
> = {
  common: {
    label: "Common",
    chip: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30",
    ring: "hover:border-slate-400/40",
    aura: "pm-card-aura-teal",
    icon: <Star className="h-3 w-3" />,
  },
  rare: {
    label: "Rare",
    chip: "bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30",
    ring: "hover:border-sky-400/40",
    aura: "pm-card-aura-teal",
    icon: <Sparkles className="h-3 w-3" />,
  },
  legendary: {
    label: "Legendary",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/40",
    ring: "hover:border-amber-400/50",
    aura: "pm-card-aura-gold",
    icon: <Crown className="h-3 w-3" />,
  },
};

function tierOf(boon: Boon): "common" | "rare" | "legendary" {
  return TIER_INDEX[boon.id] ?? "common";
}

// Recommended badge : surfaces boons that synergize with the captain's
// current situation (low gold, a hold rich in Silk, skilled workers, etc.).
// Purely a hint; selecting any boon still works exactly as before.
function isRecommended(boon: Boon, game: GameState): boolean {
  const inv = game.inventory;
  const workerCount = Object.values(game.workers).flat().length;
  switch (boon.id) {
    case "emergency_loan":
      return game.money < 25;
    case "tax_shelter":
      return game.money > 80;
    case "hemp_monopoly":
      return game.money > 0 && (inv.Hemp ?? 0) < 5;
    case "silk_wind":
      return (inv["Silk"] ?? 0) >= 2;
    case "artisan_inspiration":
      return workerCount > 0;
    case "master_apprentice":
      return workerCount === 0 && game.money >= 4;
    case "farsight":
      return game.money < 40;
    case "kiln_and_forge_guild":
      return (inv["Celadon Ware"] ?? 0) > 0 || (inv["Bronze Mirror"] ?? 0) > 0;
    case "exotic_treasures":
      return (inv["Foreign Balm"] ?? 0) > 0 || (inv["Pearl String"] ?? 0) > 0;
    case "deep_sea_escort_pact":
      return game.money > 60;
    case "merchant_charm":
      return game.money >= 40;
    case "favorable_tides":
      return game.shipLevel >= 1;
    case "merchants_converge":
      return rebalanced(game) && PRODUCTS.some((item) => inv[item] > 0);
    case "frontier_tariff_relief":
      return PRODUCTS.some((item) => inv[item] > 0);
    default:
      return false;
  }
}

// Description syntax highlighting : wraps gameplay keywords in colored spans
// so the player can scan what each boon actually touches at a glance.
const HIGHLIGHT_RULES: { word: string; className: string }[] = [
  {
    word: "Income Tax",
    className: "text-rose-600 dark:text-rose-400 font-semibold",
  },
  { word: "VAT", className: "text-rose-600 dark:text-rose-400 font-semibold" },
  {
    word: "Pirate",
    className: "text-rose-600 dark:text-rose-400 font-semibold",
  },
  {
    word: "Gold",
    className: "text-amber-600 dark:text-amber-400 font-semibold",
  },
  {
    word: "Reputation",
    className: "text-violet-600 dark:text-violet-400 font-semibold",
  },
  {
    word: "Module",
    className: "text-teal-600 dark:text-teal-400 font-semibold",
  },
  {
    word: "Silk",
    className: "text-fuchsia-600 dark:text-fuchsia-400 font-semibold",
  },
  { word: "Hemp", className: "text-lime-600 dark:text-lime-400 font-semibold" },
  { word: "Escort", className: "text-sky-600 dark:text-sky-400 font-semibold" },
  {
    word: "Worker",
    className: "text-emerald-600 dark:text-emerald-400 font-semibold",
  },
  {
    word: "Transport",
    className: "text-cyan-600 dark:text-cyan-400 font-semibold",
  },
  {
    word: "Discount",
    className: "text-amber-600 dark:text-amber-400 font-semibold",
  },
  {
    word: "Charter",
    className: "text-indigo-600 dark:text-indigo-400 font-semibold",
  },
  {
    word: "Order",
    className: "text-indigo-600 dark:text-indigo-400 font-semibold",
  },
];

const HIGHLIGHT_WORDS = HIGHLIGHT_RULES.map((r) =>
  r.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
);
// Build the regex source via plain string concatenation rather than a
// template literal: the character class above contains ${} which a
// template literal would misread as interpolation.
const HIGHLIGHT_PATTERN = new RegExp(
  "(" + HIGHLIGHT_WORDS.join("|") + ")",
  "g",
);

function highlightDesc(desc: string): React.ReactNode[] {
  const parts = desc.split(HIGHLIGHT_PATTERN);
  return parts.map((part, i) => {
    const rule = HIGHLIGHT_RULES.find((r) => r.word === part);
    if (rule)
      return (
        <span key={i} className={rule.className}>
          {part}
        </span>
      );
    return <span key={i}>{part}</span>;
  });
}

// Compass rose watermark : large faded SVG sitting behind the picker.
function CompassWatermark() {
  return (
    <div className="pm-compass-watermark" aria-hidden>
      <svg
        width="420"
        height="420"
        viewBox="0 0 200 200"
        fill="none"
        className="text-foreground"
      >
        <circle
          cx="100"
          cy="100"
          r="92"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle
          cx="100"
          cy="100"
          r="74"
          stroke="currentColor"
          strokeWidth="1"
        />
        <circle cx="100" cy="100" r="6" fill="currentColor" />
        {Array.from({ length: 16 }).map((_, i) => {
          const a = (i * Math.PI) / 8;
          const inner = i % 2 === 0 ? 74 : 80;
          const x1 = 100 + Math.cos(a) * inner;
          const y1 = 100 + Math.sin(a) * inner;
          const x2 = 100 + Math.cos(a) * 92;
          const y2 = 100 + Math.sin(a) * 92;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeWidth={i % 2 === 0 ? 1.2 : 0.6}
            />
          );
        })}
        {/* N / E / S / W fleur */}
        <polygon
          points="100,18 108,100 100,92 92,100"
          fill="currentColor"
          opacity="0.85"
        />
        <polygon
          points="100,182 108,100 100,108 92,100"
          fill="currentColor"
          opacity="0.5"
        />
        <polygon
          points="18,100 100,92 92,100 100,108"
          fill="currentColor"
          opacity="0.5"
        />
        <polygon
          points="182,100 100,108 92,100 100,92"
          fill="currentColor"
          opacity="0.5"
        />
      </svg>
    </div>
  );
}

// Decorative wave divider : small SVG wave between title and cards.
function WaveDivider() {
  return (
    <div className="flex items-center justify-center gap-2 my-3" aria-hidden>
      <span className="h-px w-12 bg-gradient-to-r from-transparent to-amber-500/40" />
      <svg width="56" height="10" viewBox="0 0 56 10" fill="none">
        <path
          d="M0 5 Q7 0 14 5 T28 5 T42 5 T56 5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          className="text-amber-500/60 dark:text-amber-400/60"
          fill="none"
        />
        <circle
          cx="28"
          cy="5"
          r="1.6"
          className="fill-amber-500/70 dark:fill-amber-400/70"
        />
      </svg>
      <span className="h-px w-12 bg-gradient-to-l from-transparent to-amber-500/40" />
    </div>
  );
}

// Boon Synergy Guide tooltip trigger : explains how boons interact with
// modules and the round's economy. Purely educational copy.
function SynergyGuideBadge({ game }: { game: GameState }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          Boon Synergy Guide
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        className="max-w-xs text-xs leading-relaxed"
      >
        <div className="space-y-1.5">
          <div className="font-semibold flex items-center gap-1.5">
            <Wand2 className="h-3.5 w-3.5" /> How boons work
          </div>
          <p>
            Boons bend the rules of <em>this round only</em> : transport costs,
            taxes, worker output, intel, and more.
          </p>
          <p>
            <span className="text-teal-600 dark:text-teal-400 font-medium">
              Modules
            </span>{" "}
            {harborTrading(game)
              ? "stay equipped across rounds. Silk Market Charter and Buyer's Festival both add to the same eligible reward and their percentages do not compound."
              : "stay equipped across rounds until replaced. Silk Winds and Silk Road Monopoly can both reduce freight on an order."}
          </p>
          <p>
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              ⭐ Recommended
            </span>{" "}
            badges mark boons that fit your current ship &amp; cargo.
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// Boon card : the visual heart of the picker. Each card animates in with a
// subtle 3D flip and scale motion, glows on hover, and shows tier, recommended, and active
// particles around the icon.
function BoonCard({
  boon,
  index,
  game,
  onLockIn,
}: {
  boon: Boon;
  index: number;
  game: GameState;
  onLockIn: (boon: Boon) => void;
}) {
  const tier = tierOf(boon);
  const style = TIER_STYLE[tier];
  const recommended = isRecommended(boon, game);
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
      whileHover={{ y: -8, scale: 1.02, rotateZ: -0.5 }}
      whileTap={{ scale: 0.98 }}
      style={{ transformStyle: "preserve-3d", perspective: 1000 }}
      className={cn(
        "pm-glass rounded-2xl p-4 flex flex-col items-center text-center relative pm-decision-card",
        "border border-amber-500/20 transition-colors",
        style.ring,
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

      {/* Recommended badge */}
      {recommended && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{
            delay: 0.4 + index * 0.05,
            type: "spring",
            stiffness: 200,
          }}
          className="absolute top-2.5 left-2.5"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-400/20 px-2 py-0.5 text-[9px] font-bold tracking-wider text-amber-700 dark:text-amber-300">
                <Gem className="h-3 w-3" />
                Recommended
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Synergizes with your current ship, cargo, or crew.
            </TooltipContent>
          </Tooltip>
        </motion.div>
      )}

      {/* Icon with particle orbit + glow */}
      <div className="relative my-3 mt-5">
        <motion.div
          className="pm-particle-orbit inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-500/10 to-teal-500/10 border border-amber-500/30"
          animate={{
            boxShadow: [
              "0 0 12px 2px oklch(0.78 0.14 85 / 0.25)",
              "0 0 22px 6px oklch(0.78 0.14 85 / 0.4)",
              "0 0 12px 2px oklch(0.78 0.14 85 / 0.25)",
            ],
          }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <motion.span
            className="text-4xl"
            animate={{ y: [0, -2, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          >
            {boon.icon}
          </motion.span>
        </motion.div>
      </div>

      <div className="font-semibold text-foreground mb-1.5">
        <Term term={boon.name}>{boon.name}</Term>
      </div>

      <div className="text-xs text-muted-foreground leading-relaxed flex-1 mb-4">
        {highlightDesc(boon.desc)}
      </div>

      <Button
        className="pm-grad-gold text-amber-950 font-semibold rounded-xl w-full group"
        onClick={() => onLockIn(boon)}
      >
        <Lock className="h-3.5 w-3.5 mr-1 inline-block transition-transform group-hover:scale-110" />
        Lock In Boon
      </Button>
    </motion.div>
  );
}

function BoonHistory({ game }: { game: GameState }) {
  const saved = BOONS.find((boon) => boon.id === game.lastBoonId);
  const last = saved && voyageBoon(saved, game.rulesVersion);
  if (!last) {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-black/5 dark:border-white/10 bg-background/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5" />
        <span>
          <strong className="text-foreground/70">Boon History:</strong> No
          previous round recorded.
        </span>
      </div>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="inline-flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-1.5 text-[11px] cursor-help">
          <BookOpen className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          <span>
            <strong className="text-amber-700 dark:text-amber-300">
              Last Round:
            </strong>{" "}
            <span className="text-foreground">
              {last.icon} {last.name}
            </span>
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs max-w-xs">
        {last.desc}
      </TooltipContent>
    </Tooltip>
  );
}

// ===========================================================================
// BoonDraft : main export. Logic untouched; presentation enhanced.
// ===========================================================================

export function BoonDraft({
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
  const picks = game.boonChoices;
  // This is the screen the user specifically called out for a visible
  // ready indicator: once a captain locks in a boon, swap the picker for
  // the same "x/y ready" readout everyone else gets, rather than leaving
  // a meaningless set of cards on screen.
  if (phaseSync.waiting) {
    return (
      <div className="max-w-md mx-auto text-center py-10 relative">
        <CompassWatermark />
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 180, damping: 12 }}
          className="relative z-10"
        >
          {/* Celebration confetti burst */}
          <div className="relative inline-block">
            <motion.div
              className="text-5xl mb-2"
              animate={{
                rotate: [0, -8, 8, -4, 0],
                scale: [1, 1.15, 1],
              }}
              transition={{ duration: 0.9, ease: "easeInOut" }}
            >
              🧭
            </motion.div>
            <AnimatePresence>
              {[...Array(8)].map((_, i) => (
                <motion.span
                  key={i}
                  className="absolute top-1/2 left-1/2 text-lg pointer-events-none"
                  initial={{ opacity: 1, x: 0, y: 0, scale: 0.5 }}
                  animate={{
                    opacity: 0,
                    x: Math.cos((i / 8) * Math.PI * 2) * 60,
                    y: Math.sin((i / 8) * Math.PI * 2) * 60,
                    scale: 1.2,
                    rotate: i * 45,
                  }}
                  transition={{ duration: 1.1, ease: "easeOut" }}
                >
                  {i % 3 === 0 ? "✨" : i % 3 === 1 ? "💰" : "⭐"}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
          <div className="text-2xl font-bold mb-1 pm-text-gradient inline-flex items-center gap-2">
            <PartyPopper className="h-6 w-6" />
            Boon Locked In
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            The voyage begins once every captain has chosen.
          </p>
        </motion.div>
        <div className="relative z-10">
          <ReadyBar
            ready={phaseSync.ready}
            members={members}
            className="justify-center mb-5"
          />
          <Button
            variant="secondary"
            className="rounded-xl"
            onClick={phaseSync.cancelReady}
          >
            ↩️ Choose a different Boon
          </Button>
        </div>
      </div>
    );
  }
  if (needsStarterModule(game))
    return (
      <section className="grid min-w-0 gap-3">
        <div>
          <h2 className="text-xl font-semibold">Choose a starting module</h2>
          <p className="text-sm text-muted-foreground">
            Your ship has one open slot. You can change modules at the Shipyard
            later.
          </p>
        </div>
        <div className="pm-decision-grid">
          {game._draftChoices?.map((module) => (
            <article
              key={module.id}
              className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4"
            >
              <h3 className="font-semibold">
                <span aria-hidden>
                  <TextWithShipIcons>{module.icon}</TextWithShipIcons>
                </span>{" "}
                {module.name}
              </h3>
              <p className="grow text-sm text-muted-foreground">
                {module.desc}
              </p>
              <Button
                className="w-full"
                onClick={() =>
                  act((g, logs) => selectStarterModule(g, module.id, logs))
                }
              >
                Install {module.name}
              </Button>
            </article>
          ))}
        </div>
      </section>
    );
  const canSwap = !game.boonSwapUsed && game.money >= 10;
  return (
    <div className="max-w-4xl mx-auto text-center py-2 relative">
      <CompassWatermark />
      <div className="relative z-10">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Compass className="h-5 w-5 text-amber-500 animate-pulse" />
          <h2 className="text-2xl font-bold pm-text-gradient">
            The Navigator&apos;s Compass
          </h2>
          <Compass className="h-5 w-5 text-teal-500 animate-pulse" />
        </div>
        <p className="text-sm text-muted-foreground mb-2">
          Draft a Boon to synergize with your strategy
        </p>
        <WaveDivider />

        <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
          <ReadyBar
            ready={phaseSync.ready}
            members={members}
            className="justify-center"
          />
          <SynergyGuideBadge game={game} />
        </div>

        {/* Swap button with coin animation */}
        <div className="flex justify-center mb-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="rounded-lg group relative overflow-hidden"
                  disabled={!canSwap}
                  onClick={() => act((g, l) => swapBoonChoices(g, l))}
                >
                  {game.boonSwapUsed ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5" />
                      Boons Swapped This Round
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
                        <RotateCw className="h-3.5 w-3.5" />
                      </motion.span>
                      Swap Boons
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                        <motion.span
                          animate={{ y: [0, -2, 0] }}
                          transition={{
                            duration: 1.4,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                          className="inline-block"
                        >
                          <Coins className="h-3 w-3" />
                        </motion.span>
                        10
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        (once per round)
                      </span>
                    </span>
                  )}
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {game.boonSwapUsed
                ? "You've already rerolled this round's boons."
                : game.money < 10
                  ? "Need 10 Gold to reroll the boon pool."
                  : "Pay 10 Gold to reroll all three boons once per round."}
            </TooltipContent>
          </Tooltip>
        </div>

        <motion.div
          className="pm-decision-grid"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.08 } },
          }}
        >
          {picks.map((b, i) => (
            <BoonCard
              key={b.id}
              boon={b}
              index={i}
              game={game}
              onLockIn={(boon) => void phaseSync.markReady(boon.id)}
            />
          ))}
        </motion.div>

        <div className="mt-5">
          <BoonHistory game={game} />
        </div>
      </div>
    </div>
  );
}
