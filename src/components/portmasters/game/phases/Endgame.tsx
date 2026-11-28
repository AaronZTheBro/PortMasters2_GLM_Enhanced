"use client";

import { displayLedgerLine } from "@/lib/game/engine/lifecycle";
import { ShipMark, ShipIcon, TextWithShipIcons } from "../../ShipVisualizer";

import { useMemo, useState } from "react";
import { motion, type Variants } from "framer-motion";
import {
  Trophy,
  Coins,
  Crown,
  Skull,
  Anchor,
  Compass,
  CircleDollarSign,
  Star,
  Package,
  TrendingUp,
  TrendingDown,
  ArrowUp,
  ArrowDown,
  Users,
  Boxes,
  Receipt,
  ScrollText,
  Layers,
  Share2,
  Waves,
  Sparkles,
  Hammer,
  Banknote,
  Scale,
  Check,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BROKERS_FAVOR_UNLOCK_LEVEL } from "@/lib/game/constants";
import { merchantRatingForScore } from "@/lib/game/engine";
import { meritById } from "@/lib/game/merits";
import type { GameState } from "@/lib/game/types";
import type { CaptainLegacySummary } from "@/lib/game/legacy";
import type { VoyageCompleteEvent } from "@/lib/realtime";
import { cn, formatReputation } from "@/lib/utils";
import { Avatar, MeritIcon } from "../../shared";
import { CaptainLegacyCard } from "../../CaptainLegacyCard";
import { AchievementCelebration } from "../../AchievementCelebration";

// Staggered fade animation for standings rows
const rowVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.35, ease: "easeOut" },
  }),
};

// Staggered pop animation for merit cards
const meritVariants: Variants = {
  hidden: { opacity: 0, scale: 0.85, y: 6 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { delay: 0.4 + i * 0.18, duration: 0.4, ease: "easeOut" },
  }),
};

// Staggered fade animation for stat cards
const statVariants: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.96 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: i * 0.05, duration: 0.3, ease: "easeOut" },
  }),
};

// Rank medals for top 3
const RANK_MEDALS = ["🥇", "🥈", "🥉"];

// Rank based row backgrounds for the standings table (gold/silver/bronze).
function rankRowClass(i: number) {
  if (i === 0)
    return "bg-gradient-to-r from-amber-400/25 via-amber-300/10 to-transparent border-l-2 border-amber-400";
  if (i === 1)
    return "bg-gradient-to-r from-slate-300/25 via-slate-300/10 to-transparent border-l-2 border-slate-400";
  if (i === 2)
    return "bg-gradient-to-r from-orange-400/20 via-orange-300/8 to-transparent border-l-2 border-orange-500";
  return "";
}

// Rank badge color tiers: gold (≥200), silver (≥100), bronze (≥0)
function rankBadgeColor(score: number) {
  if (score >= 200) return "text-amber-500 border-amber-400 bg-amber-400/15";
  if (score >= 100) return "text-slate-400 border-slate-300 bg-slate-300/15";
  return "text-orange-600 border-orange-400 bg-orange-400/15";
}

// Sparkle particle colors for the Sea Master crowning burst.
const SPARKLE_COLORS = [
  "bg-amber-400",
  "bg-amber-500",
  "bg-teal-400",
  "bg-yellow-300",
  "bg-emerald-400",
  "bg-violet-400",
];

type Sparkle = {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  duration: number;
  delay: number;
};

function generateSparkles(count: number): Sparkle[] {
  const out: Sparkle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 70 + Math.random() * 110;
    out.push({
      id: i,
      x: Math.cos(angle) * radius,
      // Bias slightly upward so the burst feels celebratory.
      y: Math.sin(angle) * radius - 30,
      color: SPARKLE_COLORS[i % SPARKLE_COLORS.length],
      size: 4 + Math.round(Math.random() * 6),
      duration: 1.4 + Math.random() * 0.8,
      delay: Math.random() * 0.6,
    });
  }
  return out;
}

// Mini stat card for the dashboard.
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
  index,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "emerald" | "rose" | "amber" | "teal" | "violet";
  index: number;
}) {
  const valueTones: Record<string, string> = {
    default: "text-foreground",
    emerald: "text-emerald-600 dark:text-emerald-400",
    rose: "text-rose-600 dark:text-rose-400",
    amber: "text-amber-600 dark:text-amber-400",
    teal: "text-teal-600 dark:text-teal-400",
    violet: "text-violet-600 dark:text-violet-400",
  };
  const iconTones: Record<string, string> = {
    default: "bg-black/5 dark:bg-white/10 text-foreground/70",
    emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    teal: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
    violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  };
  return (
    <motion.div
      custom={index}
      variants={statVariants}
      initial="hidden"
      animate="visible"
      className="rounded-xl border border-black/5 dark:border-white/10 bg-white/50 dark:bg-white/[0.04] p-2.5"
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "h-7 w-7 shrink-0 rounded-lg flex items-center justify-center",
            iconTones[tone],
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[9px] tracking-wide text-muted-foreground leading-none">
            {label}
          </div>
          <div
            className={cn(
              "text-sm font-bold leading-tight mt-0.5 tabular-nums",
              valueTones[tone],
            )}
          >
            {value}
          </div>
        </div>
      </div>
      {sub && (
        <div className="text-[9px] text-muted-foreground mt-1 truncate">
          {sub}
        </div>
      )}
    </motion.div>
  );
}

// A single cost detail row inside the dashboard.
function CostRow({
  icon: Icon,
  label,
  amount,
}: {
  icon: LucideIcon;
  label: string;
  amount: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3 w-3 text-rose-400" />
        {label}
      </span>
      <span className="font-semibold tabular-nums">{amount} G</span>
    </div>
  );
}

export function Endgame({
  game,
  logs = [],
  isHost,
  onRestart,
  voyageResult,
  myLegacy,
  myUserId,
}: {
  game: GameState;
  logs?: string[];
  isHost: boolean;
  onRestart: () => void;
  voyageResult: VoyageCompleteEvent | null;
  myLegacy: CaptainLegacySummary | null;
  myUserId: string;
}) {
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  // Mirrors the same rank shown in the Captain's Ledger (see
  // merchantRatingForScore in engine.ts). Checks defaultedDebt first, the
  // one case a plain score lookup can't capture on its own.
  let rating: string;
  if (game.defaultedDebt) {
    rating = "💥 Bankrupt: Defaulted on a Loan";
  } else {
    const r = merchantRatingForScore(game.score);
    rating = `${r.icon} ${r.label}`;
  }
  const mine = voyageResult?.standings.find((s) => s.userId === myUserId);

  // First new merit for the achievement celebration overlay.
  const firstNewMeritId = mine?.newMerits[0] ?? null;
  const firstMeritDef = firstNewMeritId ? meritById(firstNewMeritId) : null;

  // Compute rank badge details
  const rankIconId = game.defaultedDebt
    ? "skull"
    : game.score >= 200
      ? "crown"
      : game.score >= 100
        ? "star"
        : "trophy";
  const badgeColor = game.defaultedDebt
    ? "text-rose-500 border-rose-400 bg-rose-400/15"
    : rankBadgeColor(game.score);

  // === Voyage stats computations (display only; no game state mutation) ===
  const netProfit = game.totalRevenue - game.totalCosts;
  const roundsSailed = Math.min(game.currentRound, game.maxRounds);
  const cargoCount = useMemo(
    () => Object.values(game.inventory).reduce((sum, n) => sum + (n || 0), 0),
    [game.inventory],
  );
  const workerCount = useMemo(
    () =>
      Object.values(game.workers).reduce(
        (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
        0,
      ),
    [game.workers],
  );

  // Sparkle particles for the crowning celebration. One batch per mount.
  const sparkles = useMemo(() => generateSparkles(24), []);
  const crowned = !!mine?.crowned;

  // === Voyage comparison vs. personal best ===
  const bestScore = mine?.previousBestScore ?? 0;
  const hasPriorVoyage = mine?.previousBestScore !== undefined;
  const beatBest = hasPriorVoyage && game.score > bestScore;
  const tiedBest = hasPriorVoyage && game.score === bestScore;
  const delta = game.score - bestScore;
  const cmpPct =
    hasPriorVoyage && bestScore > 0
      ? Math.min(100, Math.max(0, Math.round((game.score / bestScore) * 100)))
      : game.score > 0
        ? 100
        : 0;

  // Copies a plain text voyage summary.
  const handleShare = async () => {
    const lines: string[] = [];
    lines.push("⚓ PortMasters 2 Voyage Complete ⚓");
    lines.push("");
    lines.push(`Captain: ${mine?.displayName ?? "Unknown"}`);
    lines.push(`Final Reputation: ${formatReputation(game.score)}`);
    lines.push(`Merchant Rating: ${rating}`);
    lines.push(`Final Funds: ${game.money} Gold`);
    lines.push("");
    lines.push("=== Voyage Stats ===");
    lines.push(`Rounds Sailed: ${roundsSailed} / ${game.maxRounds}`);
    lines.push(`Ship Level: ${game.shipLevel}`);
    lines.push(`Orders Completed: ${game.totalOrdersCompleted}`);
    lines.push(
      `Trading ${netProfit < 0 ? "Loss" : "Profit"} Before Income Tax: ${Math.abs(netProfit)} Gold`,
    );
    lines.push(`Artisans Employed: ${workerCount}`);
    lines.push(`Cargo Remaining: ${cargoCount}`);
    if (crowned) {
      lines.push("");
      lines.push("👑 Crowned Sea Master!");
    }
    if (voyageResult && voyageResult.standings.length > 0) {
      lines.push("");
      lines.push("=== Final Standings ===");
      voyageResult.standings.forEach((s, i) => {
        const medal = i < 3 ? RANK_MEDALS[i] : `${i + 1}.`;
        lines.push(
          `${medal} ${s.displayName}: Reputation ${formatReputation(s.reputation)}, ${s.gold} Gold`,
        );
      });
    }
    const text = lines.join("\n");
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        window.isSecureContext
      ) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback when the Clipboard API is unavailable.
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2500);
    } catch {
      setShareState("failed");
      setTimeout(() => setShareState("idle"), 2500);
    }
  };

  const decisions = [
    logs.findLast((line) => /Completed Order at/.test(line)),
    logs.findLast((line) =>
      /Hired an escort|Clear seas|Pirates took|Pirates raided/.test(line),
    ),
    logs.findLast((line) =>
      /Installed |Swapped .* for .*|Ship Upgraded/.test(line),
    ),
  ].filter((line): line is string => Boolean(line));
  return (
    <div className="max-w-5xl mx-auto py-4 px-2">
      {/* === Dramatic Game Over header with decorative wave divider === */}
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mb-3 text-center"
      >
        <ShipMark
          level={game.shipLevel}
          className="mx-auto h-auto w-32 text-teal-700 dark:text-teal-300"
        />
        <div className="flex items-center justify-center gap-3">
          <Anchor className="h-5 w-5 text-teal-500/60 rotate-[-20deg] pm-bob" />
          <h2 className="text-3xl font-extrabold pm-text-gradient-sea tracking-wide">
            Voyage complete
          </h2>
          <Compass className="h-5 w-5 text-teal-500/60 rotate-[20deg]" />
        </div>
        {/* Decorative wave divider */}
        <div className="mt-1.5 flex items-center justify-center gap-2 text-amber-500/70">
          <Waves className="h-3 w-3" />
          <span className="h-px w-16 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
          <Sparkles className="h-3 w-3" />
          <span className="h-px w-16 bg-gradient-to-l from-transparent via-amber-500/40 to-transparent" />
          <Waves className="h-3 w-3" />
        </div>
      </motion.div>

      {decisions.length > 0 && (
        <section
          aria-label="Voyage recap"
          className="pm-brief mx-auto mb-4 max-w-xl rounded-xl border p-3 text-sm"
        >
          <h3 className="font-semibold">Voyage recap</h3>
          <ul className="mt-1 space-y-1">
            {decisions.map((line) => (
              <li key={line}>
                <TextWithShipIcons>{displayLedgerLine(line)}</TextWithShipIcons>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* === Rank Badge with animated rotating glow ring === */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          delay: 0.25,
          duration: 0.4,
          type: "spring",
          stiffness: 200,
        }}
        className="flex justify-center my-4 relative"
      >
        {!game.defaultedDebt && (
          <motion.div
            aria-hidden
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full pointer-events-none"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0deg, rgba(245, 158, 11, 0.5) 60deg, transparent 120deg, rgba(20, 184, 166, 0.5) 180deg, transparent 240deg, rgba(245, 158, 11, 0.4) 300deg, transparent 360deg)",
              maskImage:
                "radial-gradient(closest-side, transparent 76%, black 80%, black 100%)",
              WebkitMaskImage:
                "radial-gradient(closest-side, transparent 76%, black 80%, black 100%)",
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          />
        )}
        <div
          className={cn(
            "relative w-24 h-24 rounded-full border-2 flex flex-col items-center justify-center gap-0.5 backdrop-blur-sm",
            badgeColor,
            !game.defaultedDebt && "pm-glow-gold",
          )}
        >
          {rankIconId === "skull" && <Skull className="h-7 w-7" />}
          {rankIconId === "crown" && <Crown className="h-7 w-7 pm-bob" />}
          {rankIconId === "star" && <Star className="h-7 w-7" />}
          {rankIconId === "trophy" && <Trophy className="h-7 w-7" />}
          <span className="text-[10px] font-semibold leading-tight">
            {game.defaultedDebt ? "Bankrupt" : rating.replace(/^.\s/, "")}
          </span>
        </div>
      </motion.div>

      <div className="text-xl font-bold text-teal-700 dark:text-teal-300 my-2 flex items-center justify-center gap-2">
        <Trophy className="h-5 w-5" />
        Final Reputation: {formatReputation(game.score)}
      </div>
      <div className="text-lg text-emerald-600 dark:text-emerald-400 my-1 flex items-center justify-center gap-2">
        <Coins className="h-5 w-5" />
        Final Funds: {game.money} Gold
      </div>

      {/* === Two column layout: standings and merits on left, stats on right === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {/* == LEFT COLUMN: Standings + Merits == */}
        <div className="space-y-3">
          {voyageResult ? (
            <>
              {crowned && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3, type: "spring", stiffness: 220 }}
                  className="relative rounded-xl border-2 border-amber-400 bg-amber-400/10 px-4 py-3 text-center pm-glow-gold overflow-hidden"
                >
                  {/* Sparkle burst overlay */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    {sparkles.map((p) => (
                      <motion.span
                        key={p.id}
                        className={cn("absolute rounded-full", p.color)}
                        style={{ width: p.size, height: p.size }}
                        initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                        animate={{
                          x: p.x,
                          y: p.y,
                          opacity: [0, 1, 0],
                          scale: 1,
                        }}
                        transition={{
                          duration: p.duration,
                          delay: p.delay,
                          repeat: Infinity,
                          repeatDelay: 1.2,
                          ease: "easeOut",
                        }}
                      />
                    ))}
                  </div>
                  <div className="relative text-lg font-bold text-amber-600 dark:text-amber-300 flex items-center justify-center gap-2">
                    <Crown className="h-7 w-7 pm-bob text-amber-500" /> Crowned
                    Sea Master!
                  </div>
                  <div className="relative text-xs text-muted-foreground mt-0.5">
                    Highest Reputation in this harbor&apos;s voyage.
                  </div>
                </motion.div>
              )}

              {mine?.brokersFavorUnlocked && (
                <div className="rounded-xl border-2 border-violet-400 bg-violet-400/10 px-4 py-3 text-center">
                  <div className="text-lg font-bold text-violet-600 dark:text-violet-300 flex items-center justify-center gap-2">
                    🤝 Broker&apos;s Favor Unlocked!
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Renown Level {BROKERS_FAVOR_UNLOCK_LEVEL} reached. Starting
                    next voyage, call one in from the Trade Manifest to summon a
                    guaranteed buyer.
                  </div>
                </div>
              )}

              {mine?.newMerits.map((meritId, i) => {
                const merit = meritById(meritId);
                if (!merit) return null;
                return (
                  <motion.div
                    key={meritId}
                    custom={i}
                    variants={meritVariants}
                    initial="hidden"
                    animate="visible"
                    className="rounded-xl border-2 border-amber-400 bg-amber-400/10 px-4 py-3 text-center"
                  >
                    <div className="text-lg font-bold text-amber-600 dark:text-amber-300 flex items-center justify-center gap-2">
                      <MeritIcon id={merit.id} className="h-5 w-5" />{" "}
                      Captain&apos;s Merit: {merit.name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {merit.desc}
                    </div>
                  </motion.div>
                );
              })}

              {/* Standings table with rank based row backgrounds */}
              <div className="rounded-xl border border-black/5 dark:border-white/10 overflow-hidden">
                <div className="px-3 py-2 text-xs font-semibold bg-black/[0.03] dark:bg-white/[0.05] flex items-center gap-1.5">
                  <Trophy className="h-3.5 w-3.5 text-amber-500" /> Final
                  Standings
                </div>
                <div className="divide-y divide-black/5 dark:divide-white/10">
                  {voyageResult.standings.map((s, i) => (
                    <motion.div
                      key={s.userId}
                      custom={i}
                      variants={rowVariants}
                      initial="hidden"
                      animate="visible"
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 text-sm",
                        rankRowClass(i),
                        s.userId === myUserId &&
                          "ring-1 ring-inset ring-teal-500/40",
                      )}
                    >
                      <span
                        className={cn(
                          "w-5 shrink-0 text-center",
                          i < 3 ? "text-base" : "text-xs text-muted-foreground",
                        )}
                      >
                        {i < 3 ? RANK_MEDALS[i] : i + 1}
                      </span>
                      <Avatar
                        hue={s.avatarHue}
                        name={s.displayName}
                        size={24}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium flex items-center gap-1">
                          <span className="truncate">{s.displayName}</span>
                          {s.crowned && (
                            <Crown className="h-3 w-3 text-amber-500 shrink-0" />
                          )}
                          {s.bankrupt && (
                            <Skull className="h-3 w-3 text-rose-500 shrink-0" />
                          )}
                          {s.userId === myUserId && (
                            <span className="text-[9px] text-teal-600 dark:text-teal-400 font-semibold shrink-0">
                              (you)
                            </span>
                          )}
                        </div>
                        {/* Player stat badges: reputation, gold, and XP */}
                        <div className="flex items-center gap-1 mt-0.5 text-[10px]">
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-300 font-semibold">
                            <Trophy className="h-2.5 w-2.5" />
                            {formatReputation(s.reputation)}
                          </span>
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300 font-semibold">
                            <Coins className="h-2.5 w-2.5" />
                            {s.gold}
                          </span>
                          {s.xpGained > 0 && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-violet-700 dark:text-violet-300 font-semibold">
                              <Sparkles className="h-2.5 w-2.5" />+{s.xpGained}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {myLegacy && (
                <div>
                  {mine && (
                    <div className="text-xs text-center text-muted-foreground mb-1.5">
                      +{mine.xpGained} Renown XP this voyage
                      {mine.leveledUp ? " · Renown level up!" : ""}
                    </div>
                  )}
                  <CaptainLegacyCard legacy={myLegacy} />
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-muted-foreground mb-5 text-center py-8">
              ⏳ Waiting on the rest of the harbor to finish their voyage before
              Sea Master is crowned…
            </div>
          )}
        </div>

        {/* == RIGHT COLUMN: Voyage Statistics Dashboard == */}
        <div className="space-y-3">
          {/* Voyage Summary header */}
          <div className="flex items-center gap-2 px-1">
            <ScrollText className="h-4 w-4 text-teal-500" />
            <h3 className="text-sm font-bold tracking-wide text-muted-foreground">
              Voyage Summary
            </h3>
            <span className="flex-1 h-px bg-gradient-to-r from-teal-500/30 to-transparent" />
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              icon={CircleDollarSign}
              label="Total Revenue"
              value={`${game.totalRevenue} G`}
              tone="emerald"
              index={0}
            />
            <StatCard
              icon={Receipt}
              label="Trading Costs"
              value={`${game.totalCosts} G`}
              tone="rose"
              index={1}
            />
            <StatCard
              icon={netProfit >= 0 ? TrendingUp : TrendingDown}
              label="Trading Profit Before Income Tax"
              value={`${netProfit < 0 ? "Loss " : "Profit "}${Math.abs(netProfit)} Gold`}
              sub="Before Income Tax"
              tone={netProfit >= 0 ? "emerald" : "rose"}
              index={2}
            />
            <StatCard
              icon={ScrollText}
              label="Orders Completed"
              value={game.totalOrdersCompleted}
              tone="violet"
              index={3}
            />
            <StatCard
              icon={ShipIcon}
              label="Rounds Sailed"
              value={roundsSailed}
              sub={`of ${game.maxRounds}`}
              tone="teal"
              index={4}
            />
            <StatCard
              icon={Layers}
              label="Ship Level"
              value={game.shipLevel}
              tone="amber"
              index={5}
            />
            <StatCard
              icon={Boxes}
              label="Cargo Remaining"
              value={cargoCount}
              tone="default"
              index={6}
            />
            <StatCard
              icon={Users}
              label="Artisans Employed"
              value={workerCount}
              tone="default"
              index={7}
            />
          </div>

          {/* Cost breakdown */}
          <div className="rounded-xl border border-black/5 dark:border-white/10 bg-white/50 dark:bg-white/[0.04] p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Receipt className="h-3.5 w-3.5 text-rose-500" />
              <span className="text-xs font-semibold tracking-wide text-muted-foreground">
                Cost Breakdown
              </span>
            </div>
            <div className="space-y-1.5 text-xs">
              <CostRow
                icon={Package}
                label="Materials"
                amount={game.totalMaterialCosts ?? game.materialCosts}
              />
              <CostRow
                icon={Banknote}
                label="Artisan Wages"
                amount={game.totalWorkerWages ?? game.workerWages}
              />
              <CostRow
                icon={Hammer}
                label="Maintenance"
                amount={game.totalMaintenanceCosts ?? game.maintenanceCosts}
              />
              <CostRow icon={Scale} label="VAT Paid" amount={game.vatPaid} />
              <CostRow
                icon={ScrollText}
                label="Income Tax"
                amount={game.incomeTaxPaid}
              />
            </div>
          </div>

          {/* Voyage Comparison vs. Personal Best */}
          {hasPriorVoyage && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Star className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-semibold tracking-wide text-amber-700 dark:text-amber-300">
                  Best vs This Voyage
                </span>
              </div>
              <div className="flex items-end justify-between gap-2 mb-2">
                <div>
                  <div className="text-[10px] text-muted-foreground">
                    This Voyage
                  </div>
                  <div className="text-lg font-bold text-teal-600 dark:text-teal-400 tabular-nums">
                    {formatReputation(game.score)}
                  </div>
                </div>
                <div className="text-xl text-muted-foreground/50 italic">
                  vs
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground">
                    Personal Best
                  </div>
                  <div className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                    {bestScore}
                  </div>
                </div>
              </div>
              {/* Comparison progress bar */}
              <div className="relative h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-teal-400 to-amber-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${cmpPct}%` }}
                  transition={{ delay: 0.5, duration: 0.7, ease: "easeOut" }}
                />
              </div>
              {/* Delta indicator */}
              <div className="mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold">
                {beatBest ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <ArrowUp className="h-3.5 w-3.5" />
                    New Personal Best! +{delta} Rep
                  </span>
                ) : tiedBest ? (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <Star className="h-3.5 w-3.5" />
                    Tied your best!
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-500">
                    <ArrowDown className="h-3.5 w-3.5" />
                    {Math.abs(delta)} Rep below your best
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Compact voyage stats bar for a quick legacy summary */}
          <div className="flex items-center justify-center gap-4 flex-wrap text-xs text-muted-foreground pt-1">
            <div className="flex items-center gap-1.5">
              <ShipIcon className="h-3.5 w-3.5 text-teal-500" />
              <span className="font-semibold text-foreground">
                {roundsSailed}
              </span>{" "}
              Rounds
            </div>
            <div className="flex items-center gap-1.5">
              <CircleDollarSign className="h-3.5 w-3.5 text-emerald-500" />
              <span className="font-semibold text-foreground">
                {game.money}
              </span>{" "}
              Gold
            </div>
            <div className="flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5 text-amber-500" />
              <span className="font-semibold text-foreground">
                {formatReputation(game.score)}
              </span>{" "}
              Reputation
            </div>
            <div className="flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 text-violet-500" />
              <span className="font-semibold text-foreground">
                {game.totalOrdersCompleted}
              </span>{" "}
              Trades
            </div>
          </div>
        </div>
      </div>

      {/* === Share + Restart buttons === */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mt-5">
        <Button
          variant="outline"
          className="rounded-xl px-5 gap-1.5"
          onClick={handleShare}
        >
          {shareState === "copied" ? (
            <>
              <Check className="h-4 w-4 text-emerald-500" /> Copied!
            </>
          ) : shareState === "failed" ? (
            <>
              <Share2 className="h-4 w-4" /> Copy failed
            </>
          ) : (
            <>
              <Share2 className="h-4 w-4" /> Share Results
            </>
          )}
        </Button>
        {isHost ? (
          <Button
            className="pm-grad-primary text-white rounded-xl px-8"
            onClick={onRestart}
          >
            🔄 Restart Voyage
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Waiting for the host to restart the voyage…
          </p>
        )}
      </div>

      {/* Achievement celebration overlay: triggers when the first new
          merit appears and closes after 4 seconds or on click. */}
      <AchievementCelebration
        meritId={firstNewMeritId}
        meritName={firstMeritDef?.name ?? ""}
        meritDesc={firstMeritDef?.desc ?? ""}
      />
    </div>
  );
}
