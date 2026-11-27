"use client";

import { TextWithShipIcons } from "./ShipVisualizer";
import { useEffect, useRef, useState } from "react";
import type { GameState } from "@/lib/game/types";
import { MILESTONES } from "@/lib/game/milestones";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";

type VoyageMilestonesProps = {
  game: GameState;
};

export function VoyageMilestones({ game }: VoyageMilestonesProps) {
  const previous = useRef(game.milestones);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    for (const milestone of MILESTONES) {
      if (
        game.milestones?.includes(milestone.id) &&
        !previous.current?.includes(milestone.id)
      ) {
        toast.success(
          <TextWithShipIcons>{`${milestone.emoji} ${milestone.name}`}</TextWithShipIcons>,
          { description: "Voyage milestone reached!", duration: 4000 },
        );
      }
    }
    previous.current = game.milestones;
  }, [game.milestones]);

  const achievedCount = game.milestones?.length ?? 0;
  const total = MILESTONES.length;

  return (
    <div className="pm-glass rounded-2xl overflow-hidden">
      {/* Header : always visible, click to toggle */}
      <button
        aria-expanded={!collapsed}
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
            const done = game.milestones?.includes(m.id);
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
                <span className="shrink-0">
                  <TextWithShipIcons>{m.emoji}</TextWithShipIcons>
                </span>
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
