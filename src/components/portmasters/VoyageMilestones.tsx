"use client";

import { useEffect, useRef, useState } from "react";
import type { GameState } from "@/lib/game/types";
import { PRODUCTS } from "@/lib/game/constants";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";

// Milestone definitions
type MilestoneId =
  | "gold_100"
  | "gold_500"
  | "gold_1000"
  | "rep_100"
  | "rep_500"
  | "rep_1000"
  | "first_artisan"
  | "first_product"
  | "first_module";

type Milestone = {
  id: MilestoneId;
  name: string;
  emoji: string;
  check: (game: GameState) => boolean;
};

const MILESTONES: Milestone[] = [
  {
    id: "gold_100",
    name: "First 100 Gold",
    emoji: "💰",
    check: (g) => g.money >= 100,
  },
  {
    id: "gold_500",
    name: "Merchant's Purse",
    emoji: "👛",
    check: (g) => g.money >= 500,
  },
  {
    id: "gold_1000",
    name: "Chest of Riches",
    emoji: "👑",
    check: (g) => g.money >= 1000,
  },
  {
    id: "rep_100",
    name: "Known Trader",
    emoji: "⭐",
    check: (g) => g.score >= 100,
  },
  {
    id: "rep_500",
    name: "Respected Captain",
    emoji: "🌟",
    check: (g) => g.score >= 500,
  },
  {
    id: "rep_1000",
    name: "Legend of the Silk Road",
    emoji: "🏆",
    check: (g) => g.score >= 1000,
  },
  {
    id: "first_artisan",
    name: "Master Craftsman",
    emoji: "🛠️",
    check: (g) =>
      Object.values(g.workers).some(
        (arr) => Array.isArray(arr) && arr.length > 0,
      ),
  },
  {
    id: "first_product",
    name: "First Goods",
    emoji: "📦",
    check: (g) => PRODUCTS.some((p) => (g.inventory[p] ?? 0) > 0),
  },
  {
    id: "first_module",
    name: "Ship Upgrade",
    emoji: "🚢",
    check: (g) => g.equippedModules.length > 0,
  },
];

// Component
type VoyageMilestonesProps = {
  game: GameState;
};

export function VoyageMilestones({ game }: VoyageMilestonesProps) {
  // Track which milestones were already achieved on the *previous* render,
  // so we only toast when a milestone changes from unachieved to achieved.
  const achievedRef = useRef<Set<MilestoneId>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  // Compute a stable serialisation of achieved milestone IDs so the effect
  // only runs again when the set changes because Sets are new every render.
  const achievedKey = MILESTONES.filter((m) => m.check(game))
    .map((m) => m.id)
    .join(",");

  // Fire toasts for any milestone that is newly achieved.
  useEffect(() => {
    const nowAchieved = new Set<MilestoneId>(
      achievedKey ? (achievedKey.split(",") as MilestoneId[]) : [],
    );
    const prev = achievedRef.current;
    for (const id of nowAchieved) {
      if (!prev.has(id)) {
        const m = MILESTONES.find((m) => m.id === id);
        if (m) {
          toast.success(`${m.emoji} ${m.name}`, {
            description: "Voyage milestone reached!",
            duration: 4000,
          });
        }
      }
    }
    achievedRef.current = nowAchieved;
  }, [achievedKey]);

  const nowAchieved = new Set<MilestoneId>(
    achievedKey ? (achievedKey.split(",") as MilestoneId[]) : [],
  );

  const achievedCount = nowAchieved.size;
  const total = MILESTONES.length;

  return (
    <div className="pm-glass rounded-2xl overflow-hidden">
      {/* Header : always visible, click to toggle */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="text-xs font-semibold tracking-wide">Milestones</span>
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
          {achievedCount}/{total}
        </span>
      </button>

      {/* List : collapsible */}
      {!collapsed && (
        <div className="px-3 pb-2 space-y-1 max-h-64 overflow-y-auto">
          {MILESTONES.map((m) => {
            const done = nowAchieved.has(m.id);
            return (
              <div
                key={m.id}
                className={`flex items-center gap-1.5 text-[11px] leading-tight py-0.5 ${
                  done ? "text-foreground" : "text-muted-foreground/40"
                }`}
              >
                <span className="shrink-0 w-3.5 text-center">
                  {done ? "✓" : "○"}
                </span>
                <span className="shrink-0">{m.emoji}</span>
                <span
                  className={
                    done ? "" : "line-through decoration-muted-foreground/20"
                  }
                >
                  {m.name}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
