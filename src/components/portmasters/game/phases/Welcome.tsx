"use client";

import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/game/constants";
import { cn } from "@/lib/utils";
import {
  Ship,
  BookOpen,
  Rocket,
  Clock,
  Coins,
  Receipt,
  Skull,
  Compass,
  Store,
  Package,
  FileCheck2,
  Wrench,
  Anchor,
  type LucideIcon,
} from "lucide-react";
import type { PublicUser } from "@/lib/api";
import { Avatar } from "../../shared";
import type { PhaseSync } from "./PhaseShared";
import { roundsFor, type Difficulty } from "@/lib/game/difficulty";
import { DIFFICULTIES } from "@/lib/game/difficulty";
import { motion } from "framer-motion";

// === Animated Ship SVG Decoration ========================================
// A square rigged ship silhouette that gently bobs with a subtle teal
// glow, replacing the plain emoji anchors in the title.
function AnimatedShip() {
  return (
    <div className="pm-bob inline-block relative">
      {/* Glow halo */}
      <div
        className="absolute inset-0 blur-md opacity-40"
        style={{
          background:
            "radial-gradient(circle, oklch(0.7 0.14 195 / 0.6), transparent 70%)",
        }}
        aria-hidden
      />
      <svg
        width="72"
        height="52"
        viewBox="0 0 72 52"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative text-teal-600 dark:text-teal-400"
      >
        {/* Hull */}
        <path
          d="M6 32 L66 32 L62 44 Q36 48 10 44 Z"
          fill="currentColor"
          opacity="0.85"
        />
        {/* Keel line */}
        <path
          d="M18 44 Q36 48 54 44"
          stroke="currentColor"
          strokeWidth="1"
          fill="none"
          opacity="0.5"
        />
        {/* Mast */}
        <rect x="35" y="6" width="2" height="26" fill="currentColor" />
        {/* Main sail */}
        <path
          d="M37 8 L56 14 L54 30 L37 30 Z"
          fill="currentColor"
          opacity="0.7"
        />
        {/* Jib sail */}
        <path d="M37 10 L22 18 L37 24 Z" fill="currentColor" opacity="0.55" />
        {/* Flag */}
        <path d="M36 6 L42 4 L36 2" fill="currentColor" opacity="0.6" />
      </svg>
    </div>
  );
}

// === Wave Divider ========================================================
// A subtle animated sine wave SVG that scrolls horizontally between the
// title area and the roster, inspired by AuthScreen's wave technique but
// smaller and more compact.
function WaveDivider() {
  return (
    <div className="overflow-hidden h-5 w-full max-w-md mx-auto opacity-30 dark:opacity-20">
      <svg
        width="1440"
        height="20"
        viewBox="0 0 1440 20"
        preserveAspectRatio="none"
        className="text-teal-500"
      >
        <motion.path
          d="M0 10 Q 90 2 180 10 T 360 10 T 540 10 T 720 10 T 900 10 T 1080 10 T 1260 10 T 1440 10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          animate={{ x: [0, -360] }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      </svg>
    </div>
  );
}

// === Harbor Roster with staggered avatar entrance ========================
// The lobby roster before the voyage: just avatars and a headcount, no ready/not
// ready state since there's nothing to ready up for yet. Separate from
// ReadyBar (used everywhere else) on purpose, since reusing its check
// marks here would imply a vote that doesn't exist for this screen.
function HarborRoster({
  members,
  ids,
}: {
  members: PublicUser[];
  ids: string[];
}) {
  if (ids.length === 0) return null;
  const byId = new Map(members.map((m) => [m.id, m]));
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-1.5">
        {ids.map((id, i) => {
          const m = byId.get(id);
          return m ? (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.35,
                delay: i * 0.06,
                ease: "easeOut",
              }}
            >
              <Avatar hue={m.avatarHue} name={m.displayName} size={28} ring />
            </motion.div>
          ) : null;
        })}
      </div>
      <div className="text-xs text-muted-foreground">
        {ids.length} captain{ids.length !== 1 ? "s" : ""} in the harbor
      </div>
    </div>
  );
}

// === InfoCard with icon, accent bar, and hover lift ======================
// Each card has a lucide icon, a 4px colored accent bar on the left,
// and a gentle hover lift.
function InfoCard({
  tone,
  title,
  rows,
  icon: Icon,
}: {
  tone: "emerald" | "amber" | "sea" | "rose";
  title: string;
  rows: Array<
    | string
    | {
        text: string;
        icon?: LucideIcon;
        iconClassName?: string;
      }
  >;
  icon: LucideIcon;
}) {
  const tones: Record<string, { bg: string; bar: string; iconCls: string }> = {
    emerald: {
      bg: "bg-emerald-500/[0.06] border-emerald-500/20",
      bar: "bg-emerald-500/60",
      iconCls: "text-emerald-600 dark:text-emerald-400",
    },
    amber: {
      bg: "bg-amber-500/[0.06] border-amber-500/20",
      bar: "bg-amber-500/60",
      iconCls: "text-amber-600 dark:text-amber-400",
    },
    sea: {
      bg: "bg-teal-500/[0.06] border-teal-500/20",
      bar: "bg-teal-500/60",
      iconCls: "text-teal-600 dark:text-teal-400",
    },
    rose: {
      bg: "bg-rose-500/[0.06] border-rose-500/20",
      bar: "bg-rose-500/60",
      iconCls: "text-rose-600 dark:text-rose-400",
    },
  };
  const t = tones[tone];
  return (
    <div
      className={cn(
        "pm-card-lift relative rounded-lg border p-3 pl-5 overflow-hidden",
        t.bg,
      )}
    >
      {/* Left accent bar */}
      <div
        className={cn("absolute left-0 top-0 bottom-0 w-1", t.bar)}
        aria-hidden
      />
      <div className="flex items-center gap-1.5 font-semibold text-sm mb-1">
        <Icon className={cn("h-3.5 w-3.5", t.iconCls)} />
        {title}
      </div>
      <div className="space-y-1">
        {rows.map((row, i) => {
          if (typeof row === "string") {
            return (
              <div key={i} className="text-xs leading-relaxed">
                {row}
              </div>
            );
          }
          const RowIcon = row.icon;
          return (
            <div
              key={i}
              className="flex items-center gap-2 text-xs leading-relaxed"
            >
              {RowIcon && (
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-md bg-background text-foreground shadow-sm ring-1 ring-black/[0.06] dark:bg-slate-950/35 dark:ring-white/[0.08]",
                    row.iconClassName,
                  )}
                >
                  <RowIcon className="h-3 w-3" />
                </span>
              )}
              <span>{row.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// === Phase Timeline ======================================================
// Horizontal step indicator for the 4 phases of each round, connected by
// dotted lines. Each step has a small icon and a distinct color.
const PHASE_STEPS: Array<{
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
  color: string;
  dotColor: string;
}> = [
  {
    label: "Port Market",
    icon: Store,
    color: "text-teal-600 dark:text-teal-400",
    dotColor: "bg-teal-500",
  },
  {
    label: "Trade Orders",
    shortLabel: "Orders",
    icon: FileCheck2,
    color: "text-emerald-600 dark:text-emerald-400",
    dotColor: "bg-emerald-500",
  },
  {
    label: "Settlement",
    icon: Wrench,
    color: "text-amber-600 dark:text-amber-400",
    dotColor: "bg-amber-500",
  },
  {
    label: "Shipyard",
    icon: Anchor,
    color: "text-violet-600 dark:text-violet-400",
    dotColor: "bg-violet-500",
  },
];

function PhaseTimeline() {
  return (
    <div className="flex items-center justify-center gap-0 max-w-md mx-auto">
      {PHASE_STEPS.map((step, i) => {
        const Icon = step.icon;
        return (
          <div key={step.label} className="flex items-center">
            {/* Step node */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center border border-current/20",
                  step.color,
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span
                className={cn(
                  "text-[10px] leading-tight text-center whitespace-nowrap font-medium",
                  step.color,
                )}
              >
                {i + 1}. <span className="hidden sm:inline">{step.label}</span>
                <span className="sm:hidden">
                  {step.shortLabel ?? step.label}
                </span>
              </span>
            </div>
            {/* Dotted connector */}
            {i < PHASE_STEPS.length - 1 && (
              <div
                className="w-6 h-0 border-t-2 border-dashed border-muted-foreground/25 mx-1 mt-[-12px]"
                aria-hidden
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// === Difficulty Badge ====================================================
function DifficultyBadge({ difficulty }: { difficulty?: Difficulty }) {
  if (!difficulty) return null;
  const cfg = DIFFICULTIES[difficulty];
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-700 dark:text-teal-300 ml-2 align-middle">
      <span>{cfg.icon}</span>
      {cfg.badge}
    </span>
  );
}

// === Main Welcome Component =============================================
export function Welcome({
  phaseSync,
  members,
  isHost,
  onShowTutorial,
  difficulty,
}: {
  phaseSync: PhaseSync;
  members: PublicUser[];
  isHost: boolean;
  onShowTutorial: () => void;
  difficulty?: Difficulty;
}) {
  const harborIds = phaseSync.ready?.requiredUserIds ?? [];
  const canStart = harborIds.length >= 2;
  return (
    <div className="max-w-3xl mx-auto text-center py-4">
      {/* == Animated ship + title == */}
      <div className="flex justify-center mb-1">
        <AnimatedShip />
      </div>
      <div className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-1">
        <span className="pm-text-sea">{APP_NAME}</span>
        <DifficultyBadge difficulty={difficulty} />
      </div>
      <p className="text-sm text-muted-foreground mb-2">
        Sail {roundsFor(difficulty)} rounds with your crew and compete to become
        Sea Master.
      </p>

      {/* == Wave divider == */}
      <WaveDivider />

      {/* == Roster + start controls == */}
      <div className="flex flex-col items-center gap-3 mb-6 mt-3">
        <HarborRoster members={members} ids={harborIds} />
        {isHost ? (
          <>
            <Button
              size="lg"
              className={cn(
                "rounded-xl h-12 px-8 text-base",
                canStart && "pm-grad-primary text-white",
              )}
              variant={canStart ? "default" : "secondary"}
              disabled={!canStart}
              onClick={() => phaseSync.startGame()}
            >
              <Ship className="h-5 w-5 mr-2" />
              {canStart
                ? "Start the Voyage"
                : `Need at least 2 captains (${harborIds.length}/2)`}
            </Button>
            {phaseSync.startError && (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {phaseSync.startError}
              </p>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <motion.span
              animate={{ rotate: 360 }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "linear",
              }}
              className="inline-flex text-teal-600 dark:text-teal-400"
            >
              <Compass className="h-4 w-4" />
            </motion.span>
            <motion.span
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              Waiting for the host to start the voyage… ({harborIds.length} in
              harbor)
            </motion.span>
          </div>
        )}
        <Button variant="ghost" className="rounded-xl" onClick={onShowTutorial}>
          <BookOpen className="h-4 w-4 mr-2" />
          New Player Tutorial
        </Button>
      </div>

      {/* == Info cards == */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left max-w-2xl mx-auto">
        <InfoCard
          tone="emerald"
          title="Starting Resources"
          rows={[
            {
              text: "Hemp x 8, Silk x 5, Tea x 3",
              icon: Package,
              iconClassName: "text-teal-700 dark:text-teal-300",
            },
            {
              text: "100 Gold starting funds",
              icon: Coins,
              iconClassName: "text-amber-700 dark:text-amber-300",
            },
          ]}
          icon={Rocket}
        />
        <InfoCard
          tone="amber"
          title="Production Delay"
          rows={[
            "Assign work now. Goods arrive in Phase 3.",
            "Workers don't produce instantly!",
          ]}
          icon={Clock}
        />
        <InfoCard
          tone="sea"
          title="Round end costs"
          rows={[
            "Maintenance: 15 Gold every round",
            "Wages settle at Phase 3, not on hire",
          ]}
          icon={Coins}
        />
        <InfoCard
          tone="rose"
          title="Taxes Explained"
          rows={[
            "Value tax: 5 percent of finished good margin",
            "Income tax: 10 percent of round net profit",
          ]}
          icon={Receipt}
        />
        <InfoCard
          tone="amber"
          title="Pirates & Borrowing"
          rows={[
            "20% chance of losing all Gold each round",
            "Hire an escort, or ask the harbor for a loan",
          ]}
          icon={Skull}
        />
      </div>

      {/* == Phase timeline == */}
      <div className="max-w-2xl mx-auto mt-4">
        <PhaseTimeline />
      </div>

      {/* == Tips == */}
      <div className="max-w-2xl mx-auto mt-3 space-y-2">
        <div className="rounded-lg bg-teal-500/[0.06] border border-teal-500/15 px-3.5 py-2.5 text-xs">
          <strong>Four phases per voyage:</strong> buy at ports, fill trade
          orders, settle risks and costs, then upgrade the ship.
        </div>
        <div className="rounded-lg bg-amber-500/[0.06] border border-amber-500/15 px-3.5 py-2.5 text-xs">
          <strong>New player tip:</strong> Rely on raw material orders early.
          Hire artisans only when you can sustain at least 2 rounds of wages.
          Keep funds above maintenance plus all wages.
        </div>
      </div>
    </div>
  );
}
