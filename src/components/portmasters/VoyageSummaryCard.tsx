"use client";

import { ShipIcon } from "./ShipVisualizer";
import { Crown, Trophy, Star } from "lucide-react";
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  type Difficulty,
} from "@/lib/game/difficulty";
import { renownProgress, type CaptainLegacySummary } from "@/lib/game/legacy";
import { Pill } from "./shared";
import { cn } from "@/lib/utils";

// VoyageSummaryCard renders aggregate voyage history in Harbor Overview.
// It shows best reputation, sea master crowns, renown level, and the
// difficulty breakdown when available. Data comes from the legacy summary
// already fetched by the lobby, with no additional API call.
type Props = {
  legacy: CaptainLegacySummary;
  className?: string;
};

export function VoyageSummaryCard({ legacy, className }: Props) {
  if (legacy.voyagesCompleted === 0) return null;

  const rp = renownProgress(legacy.renownXP);

  // Build compact difficulty stats from statsByDifficulty.
  // Only show difficulties that have at least one voyage recorded.
  const diffEntries = DIFFICULTY_ORDER.filter((key) => {
    const stats = legacy.statsByDifficulty[key];
    return stats && (stats.crowns > 0 || stats.bestScore > 0);
  });

  return (
    <div className={cn("pm-glass-warm rounded-xl overflow-hidden", className)}>
      {/* Amber accent bar for the voyage theme */}
      <div className="h-1 w-full bg-gradient-to-r from-amber-400/60 via-amber-500/80 to-amber-400/60" />

      <div className="px-3 py-2.5 space-y-2">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ShipIcon className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            <span className="text-[11px] font-semibold tracking-wide text-amber-700 dark:text-amber-300">
              Voyage Record
            </span>
          </div>
          <Pill tone="amber" className="!text-[9px]">
            <ShipIcon className="h-2.5 w-2.5" /> {legacy.voyagesCompleted}
          </Pill>
        </div>

        {/* Compact key stats */}
        <div className="flex items-center gap-3">
          {/* Best Reputation */}
          <div className="flex items-center gap-1">
            <Trophy className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-bold tabular-nums leading-none">
              {legacy.bestScore}
            </span>
            <span className="text-[9px] text-muted-foreground leading-none">
              best
            </span>
          </div>

          {/* Sea Master Crowns */}
          {legacy.seaMasterCrowns > 0 && (
            <div className="flex items-center gap-1">
              <Crown className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-sm font-bold tabular-nums leading-none">
                {legacy.seaMasterCrowns}
              </span>
            </div>
          )}

          {/* Renown Level */}
          <div className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-bold tabular-nums leading-none">
              Lv {rp.level}
            </span>
          </div>
        </div>

        {/* Difficulty chips shown when data exists */}
        {diffEntries.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {diffEntries.map((key: Difficulty) => {
              const stats = legacy.statsByDifficulty[key];
              if (!stats) return null;
              const cfg = DIFFICULTIES[key];
              const diffTone = {
                fair_winds: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
                open_waters:
                  "bg-slate-500/10 text-slate-700 dark:text-slate-300",
                monsoon:
                  "bg-violet-500/10 text-violet-700 dark:text-violet-300",
              }[key];
              return (
                <span
                  key={key}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    diffTone,
                  )}
                >
                  {cfg.icon} {stats.bestScore}
                  {stats.crowns > 0 && (
                    <Crown className="h-2.5 w-2.5 text-amber-500 inline" />
                  )}
                </span>
              );
            })}
          </div>
        )}

        {/* Subtle progress bar for renown */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between text-[9px] text-muted-foreground/70">
            <span>Renown progress</span>
            <span className="tabular-nums">
              {rp.xpIntoLevel}/{rp.xpForNextLevel} XP
            </span>
          </div>
          <div className="h-1 rounded-full bg-black/8 dark:bg-white/8 overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-500/50 dark:bg-amber-400/50 transition-all duration-500"
              style={{
                width: `${rp.xpForNextLevel > 0 ? (rp.xpIntoLevel / rp.xpForNextLevel) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
