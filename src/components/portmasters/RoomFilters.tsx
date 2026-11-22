"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  type Difficulty,
} from "@/lib/game/difficulty";
import type { RoomSummary } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowUpDown, Check, SlidersHorizontal } from "lucide-react";

// Compact room filters. Preferences persist between visits.

const STORAGE_KEY = "pm_room_filters";

export type RoomFilterState = {
  difficulty: Difficulty | "all";
  status: "all" | "waiting" | "in_progress";
  hasSpace: boolean;
  sort: "newest" | "players" | "difficulty";
};

const DEFAULTS: RoomFilterState = {
  difficulty: "all",
  status: "all",
  hasSpace: false,
  sort: "newest",
};

function loadPersisted(): RoomFilterState {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<RoomFilterState>;
    return {
      difficulty: parsed.difficulty ?? DEFAULTS.difficulty,
      status: parsed.status ?? DEFAULTS.status,
      hasSpace: parsed.hasSpace ?? DEFAULTS.hasSpace,
      sort: parsed.sort ?? DEFAULTS.sort,
    };
  } catch {
    return DEFAULTS;
  }
}

function persist(state: RoomFilterState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

type Props = {
  rooms: RoomSummary[];
  onFilteredChange: (filtered: RoomSummary[]) => void;
  className?: string;
};

export function RoomFilters({ rooms, onFilteredChange, className }: Props) {
  const [filters, setFilters] = useState<RoomFilterState>(loadPersisted);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    persist(filters);
  }, [filters]);

  const update = useCallback(
    <K extends keyof RoomFilterState>(key: K, value: RoomFilterState[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const filtered = useMemo(() => {
    let result = rooms;
    if (filters.difficulty !== "all") {
      result = result.filter((r) => r.difficulty === filters.difficulty);
    }
    if (filters.status === "waiting") {
      result = result.filter((r) => !r.started);
    } else if (filters.status === "in_progress") {
      result = result.filter((r) => r.started);
    }
    if (filters.hasSpace) {
      result = result.filter((r) => !r.started);
    }
    const sorted = [...result];
    switch (filters.sort) {
      case "newest":
        sorted.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        break;
      case "players":
        sorted.sort((a, b) => b.memberCount - a.memberCount);
        break;
      case "difficulty": {
        const order: Record<string, number> = {
          fair_winds: 0,
          open_waters: 1,
          monsoon: 2,
        };
        sorted.sort(
          (a, b) => (order[a.difficulty] ?? 0) - (order[b.difficulty] ?? 0),
        );
        break;
      }
    }

    return sorted;
  }, [rooms, filters]);

  useEffect(() => {
    onFilteredChange(filtered);
  }, [filtered, onFilteredChange]);

  const activeCount =
    (filters.difficulty !== "all" ? 1 : 0) +
    (filters.status !== "all" ? 1 : 0) +
    (filters.hasSpace ? 1 : 0);

  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(7.5rem,0.8fr)] gap-2 sm:grid-cols-[auto_11rem] sm:justify-end",
        className,
      )}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setFilterOpen(true)}
        className="min-w-0 justify-between rounded-lg px-3 sm:w-auto"
      >
        <span className="flex min-w-0 items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 shrink-0" />
          <span className="truncate">
            {activeCount === 0
              ? "Filters"
              : `${activeCount} filter${activeCount === 1 ? "" : "s"}`}
          </span>
        </span>
        {activeCount > 0 && (
          <span className="ml-2 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {activeCount}
          </span>
        )}
      </Button>

      <label className="relative min-w-0">
        <span className="sr-only">Sort rooms</span>
        <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <select
          aria-label="Sort rooms"
          value={filters.sort}
          onChange={(event) =>
            update("sort", event.target.value as RoomFilterState["sort"])
          }
          className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="newest">Newest</option>
          <option value="players">Most captains</option>
          <option value="difficulty">Waters</option>
        </select>
      </label>

      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="p-4 sm:max-w-sm sm:p-6">
          <DialogHeader>
            <DialogTitle>Harbor filters</DialogTitle>
            <DialogDescription>
              Narrow the room list without crowding the lobby.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Waters
              </span>
              <select
                aria-label="Filter by waters"
                value={filters.difficulty}
                onChange={(event) =>
                  update(
                    "difficulty",
                    event.target.value as RoomFilterState["difficulty"],
                  )
                }
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">All waters</option>
                {DIFFICULTY_ORDER.map((key) => (
                  <option key={key} value={key}>
                    {DIFFICULTIES[key].badge}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Voyage state
              </span>
              <select
                aria-label="Filter by voyage state"
                value={filters.status}
                onChange={(event) =>
                  update(
                    "status",
                    event.target.value as RoomFilterState["status"],
                  )
                }
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">Any state</option>
                <option value="waiting">Waiting</option>
                <option value="in_progress">In progress</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => update("hasSpace", !filters.hasSpace)}
              aria-pressed={filters.hasSpace}
              className={cn(
                "flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 text-left text-sm font-medium transition-colors",
                filters.hasSpace
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background hover:bg-muted",
              )}
            >
              <span>
                Joinable rooms
                <span className="mt-0.5 block text-[11px] font-normal opacity-75">
                  Hide voyages already under way.
                </span>
              </span>
              <Check
                className={cn(
                  "h-4 w-4 shrink-0",
                  filters.hasSpace ? "opacity-100" : "opacity-0",
                )}
              />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={activeCount === 0}
              onClick={() => setFilters(DEFAULTS)}
            >
              Clear
            </Button>
            <Button type="button" onClick={() => setFilterOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
