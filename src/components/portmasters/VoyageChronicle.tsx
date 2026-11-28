"use client";

import { ShipIcon, TextWithShipIcons } from "./ShipVisualizer";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Anchor,
  ScrollText,
  ShoppingCart,
  ClipboardCheck,
  Wrench,
  SkullIcon,
  ArrowUpCircle,
  Cpu,
  Sparkles,
  HandCoins,
  ArrowLeftRight,
  OctagonX,
  Flag,
  Search,
  X,
  Filter,
  Users,
  Swords,
  Wallet,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Types

export type ChronicleEventType =
  | "note"
  | "round_start"
  | "purchase"
  | "order"
  | "wages"
  | "maintenance"
  | "pirate"
  | "upgrade"
  | "module"
  | "boon"
  | "loan"
  | "barter"
  | "bankruptcy";

export type ChronicleEvent = {
  round: number;
  type: ChronicleEventType;
  description: string;
};

type VoyageChronicleProps = {
  events: ChronicleEvent[];
  currentRound: number;
  className?: string;
};

// Filter categories

type FilterKey = "all" | "purchases" | "trades" | "combat" | "finance";

type FilterDef = {
  key: FilterKey;
  label: string;
  icon: LucideIcon;
  match: (t: ChronicleEventType) => boolean;
};

const FILTERS: FilterDef[] = [
  {
    key: "all",
    label: "All",
    icon: LayoutGrid,
    match: () => true,
  },
  {
    key: "purchases",
    label: "Purchases",
    icon: ShoppingCart,
    match: (t) => t === "purchase" || t === "module" || t === "upgrade",
  },
  {
    key: "trades",
    label: "Trades",
    icon: ArrowLeftRight,
    match: (t) => t === "order" || t === "barter",
  },
  {
    key: "combat",
    label: "Combat",
    icon: Swords,
    match: (t) => t === "pirate" || t === "bankruptcy",
  },
  {
    key: "finance",
    label: "Finance",
    icon: Wallet,
    match: (t) =>
      t === "wages" || t === "maintenance" || t === "loan" || t === "boon",
  },
];

// Event type visual configuration

type EventStyle = {
  icon: LucideIcon;
  /** Tailwind text color class */
  color: string;
  /** Tailwind bg color class for the dot */
  dotBg: string;
  /** Tailwind ring color class for the dot */
  dotRing: string;
  /** Readable label */
  label: string;
};

const EVENT_STYLES: Record<ChronicleEventType, EventStyle> = {
  note: {
    icon: ScrollText,
    color: "text-muted-foreground",
    dotBg: "bg-muted-foreground",
    dotRing: "ring-muted-foreground/20",
    label: "Ledger entry",
  },
  round_start: {
    icon: Flag,
    color: "text-teal-600 dark:text-teal-400",
    dotBg: "bg-teal-500",
    dotRing: "ring-teal-500/20",
    label: "Round Start",
  },
  purchase: {
    icon: ShoppingCart,
    color: "text-sky-600 dark:text-sky-400",
    dotBg: "bg-sky-500",
    dotRing: "ring-sky-500/20",
    label: "Purchase",
  },
  order: {
    icon: ClipboardCheck,
    color: "text-emerald-600 dark:text-emerald-400",
    dotBg: "bg-emerald-500",
    dotRing: "ring-emerald-500/20",
    label: "Order",
  },
  wages: {
    icon: Users,
    color: "text-amber-600 dark:text-amber-400",
    dotBg: "bg-amber-500",
    dotRing: "ring-amber-500/20",
    label: "Wages",
  },
  maintenance: {
    icon: Wrench,
    color: "text-orange-600 dark:text-orange-400",
    dotBg: "bg-orange-500",
    dotRing: "ring-orange-500/20",
    label: "Maintenance",
  },
  pirate: {
    icon: SkullIcon,
    color: "text-rose-600 dark:text-rose-400",
    dotBg: "bg-rose-500",
    dotRing: "ring-rose-500/20",
    label: "Pirate Raid",
  },
  upgrade: {
    icon: ArrowUpCircle,
    color: "text-violet-600 dark:text-violet-400",
    dotBg: "bg-violet-500",
    dotRing: "ring-violet-500/20",
    label: "Ship Upgrade",
  },
  module: {
    icon: Cpu,
    color: "text-fuchsia-600 dark:text-fuchsia-400",
    dotBg: "bg-fuchsia-500",
    dotRing: "ring-fuchsia-500/20",
    label: "Module",
  },
  boon: {
    icon: Sparkles,
    color: "text-pink-600 dark:text-pink-400",
    dotBg: "bg-pink-500",
    dotRing: "ring-pink-500/20",
    label: "Favor or Boon",
  },
  loan: {
    icon: HandCoins,
    color: "text-lime-600 dark:text-lime-400",
    dotBg: "bg-lime-500",
    dotRing: "ring-lime-500/20",
    label: "Loan",
  },
  barter: {
    icon: ArrowLeftRight,
    color: "text-cyan-600 dark:text-cyan-400",
    dotBg: "bg-cyan-500",
    dotRing: "ring-cyan-500/20",
    label: "Barter",
  },
  bankruptcy: {
    icon: OctagonX,
    color: "text-red-600 dark:text-red-400",
    dotBg: "bg-red-500",
    dotRing: "ring-red-500/20",
    label: "Bankruptcy",
  },
};

// Helpers

/** Group events by round, sorted descending (latest round first). */
function groupByRound(events: ChronicleEvent[]): Map<number, ChronicleEvent[]> {
  const map = new Map<number, ChronicleEvent[]>();
  for (const ev of events) {
    const arr = map.get(ev.round);
    if (arr) arr.push(ev);
    else map.set(ev.round, [ev]);
  }
  const sorted = new Map<number, ChronicleEvent[]>();
  const keys = [...map.keys()].sort((a, b) => b - a);
  for (const k of keys) {
    sorted.set(k, map.get(k)!);
  }
  return sorted;
}

// Supporting components

function FilterBar({
  active,
  onChange,
  counts,
}: {
  active: FilterKey;
  onChange: (k: FilterKey) => void;
  counts: Record<FilterKey, number>;
}) {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto pm-scroll border-b border-black/[0.04] dark:border-white/[0.06]">
      <Filter
        className="h-3 w-3 text-muted-foreground/50 shrink-0 mr-0.5"
        aria-hidden
      />
      {FILTERS.map((f) => {
        const isActive = active === f.key;
        const Icon = f.icon;
        const count = counts[f.key] ?? 0;
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => onChange(f.key)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors shrink-0",
              isActive
                ? "bg-teal-500/15 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300"
                : "text-muted-foreground/70 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
            )}
            aria-pressed={isActive}
          >
            <Icon className="h-3 w-3" aria-hidden />
            {f.label}
            {count > 0 && (
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-[1rem] h-3.5 px-0.5 rounded-full text-[8px] font-semibold tabular-nums",
                  isActive
                    ? "bg-teal-500/20 text-teal-700 dark:text-teal-300"
                    : "bg-black/[0.06] dark:bg-white/[0.1] text-muted-foreground/70",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  resultCount,
}: {
  value: string;
  onChange: (v: string) => void;
  resultCount: number;
}) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-black/[0.04] dark:border-white/[0.06]">
      <Search
        className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0"
        aria-hidden
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search the chronicle…"
        className="flex-1 min-w-0 h-6 bg-transparent border-0 outline-none text-[11px] placeholder:text-muted-foreground/50"
        aria-label="Search chronicle events"
        autoComplete="off"
        spellCheck={false}
      />
      {value !== "" && (
        <>
          <span className="text-[9px] text-muted-foreground/50 tabular-nums shrink-0">
            {resultCount}
          </span>
          <button
            type="button"
            onClick={() => onChange("")}
            className="inline-flex items-center justify-center h-4 w-4 rounded-full text-muted-foreground/60 hover:bg-black/[0.06] dark:hover:bg-white/[0.1] hover:text-foreground transition-colors shrink-0"
            aria-label="Clear search"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </>
      )}
    </div>
  );
}

function RoundHeader({
  round,
  isCurrent,
}: {
  round: number;
  isCurrent: boolean;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 py-1.5 px-2 bg-inherit">
      <Anchor className="h-3.5 w-3.5 text-teal-500 shrink-0" aria-hidden />
      <span
        className={cn(
          "text-[11px] font-semibold tracking-wide",
          isCurrent
            ? "text-teal-600 dark:text-teal-400"
            : "text-muted-foreground",
        )}
      >
        Round {round}
      </span>
      {isCurrent && (
        <span className="ml-auto inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-teal-500/15 text-teal-700 dark:text-teal-300">
          current
        </span>
      )}
    </div>
  );
}

function TimelineEvent({
  event,
  index,
  isLast,
}: {
  event: ChronicleEvent;
  index: number;
  isLast: boolean;
}) {
  const style = EVENT_STYLES[event.type];
  const Icon = style.icon;
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.28,
        delay: Math.min(index * 0.04, 0.32),
        ease: "easeOut",
      }}
      className="group relative flex items-start gap-2.5 pl-1 py-1"
    >
      {/* Timeline dot + animated connector */}
      <div className="relative flex flex-col items-center shrink-0 pt-0.5">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.32) }}
          className={cn(
            "relative h-2.5 w-2.5 rounded-full ring-2 ring-background",
            style.dotBg,
          )}
        >
          {/* Pulsing halo */}
          <motion.span
            className={cn(
              "absolute inset-0 rounded-full",
              style.dotBg,
              "opacity-40",
            )}
            animate={{ scale: [1, 1.8, 1], opacity: [0.4, 0, 0.4] }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: "easeInOut",
              delay: index * 0.1,
            }}
            aria-hidden
          />
        </motion.div>
        {/* Animated connector line to next event */}
        {!isLast && (
          <div className="relative w-px flex-1 min-h-3 bg-black/[0.08] dark:bg-white/[0.08] overflow-hidden">
            <motion.div
              className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-teal-500/40 to-transparent"
              animate={{ y: ["-100%", "300%"] }}
              transition={{
                duration: 2.2,
                repeat: Infinity,
                ease: "linear",
                delay: index * 0.15,
              }}
              aria-hidden
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex items-start gap-1.5">
        <Icon
          className={cn("h-3.5 w-3.5 shrink-0 mt-0.5", style.color)}
          aria-hidden
        />
        <span className="min-w-0 flex-1 break-words text-[11px] font-medium leading-tight text-foreground/90">
          <TextWithShipIcons>{event.description}</TextWithShipIcons>
        </span>
      </div>
    </motion.div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative mb-3"
      >
        {/* Compass illustration with a ship on gentle waves */}
        <motion.div
          animate={{ y: [0, -3, 0], rotate: [-2, 2, -2] }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="relative"
        >
          <ShipIcon className="h-10 w-10 text-teal-500/60" aria-hidden />
        </motion.div>
        {/* Wave decoration */}
        <motion.div
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-full bg-teal-500/15 blur-sm"
          animate={{ scaleX: [0.8, 1.1, 0.8] }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          aria-hidden
        />
      </motion.div>
      <p className="text-[11px] font-medium text-muted-foreground/80 mb-0.5">
        No chronicle entries yet
      </p>
      <p className="text-[10px] italic text-muted-foreground/50 max-w-[180px]">
        Set sail to begin your voyage. Every purchase, trade, and trial will be
        recorded here.
      </p>
    </div>
  );
}

function NoResultsState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center text-muted-foreground/60">
      <Search className="h-6 w-6 mb-2 opacity-40" aria-hidden />
      <p className="text-[11px]">No events match &ldquo;{query}&rdquo;</p>
      <p className="text-[10px] text-muted-foreground/40 mt-0.5">
        Try a different search term or filter.
      </p>
    </div>
  );
}

// Main component

export function VoyageChronicle({
  events,
  currentRound,
  className,
}: VoyageChronicleProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

  // Group events by round (latest round first).
  const grouped = useMemo(() => groupByRound(events), [events]);

  // Compute filter counts (per filter, ignoring search query so the badges
  // stay stable while the user types).
  const filterCounts = useMemo(() => {
    const counts: Record<FilterKey, number> = {
      all: events.length,
      purchases: 0,
      trades: 0,
      combat: 0,
      finance: 0,
    };
    for (const ev of events) {
      for (const f of FILTERS) {
        if (f.key !== "all" && f.match(ev.type)) counts[f.key]++;
      }
    }
    return counts;
  }, [events]);

  // Apply the active filter + text search.
  const filteredEvents = useMemo(() => {
    const filterDef = FILTERS.find((f) => f.key === activeFilter);
    const q = query.trim().toLowerCase();
    return events.filter((ev) => {
      if (filterDef && !filterDef.match(ev.type)) return false;
      if (q) {
        const haystack = `${ev.description} ${ev.type}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [events, activeFilter, query]);

  // Group the filtered events by round for rendering.
  const filteredGrouped = useMemo(
    () => groupByRound(filteredEvents),
    [filteredEvents],
  );

  // Scroll to the latest round when new events arrive and the
  // user is not actively searching.
  useEffect(() => {
    if (events.length > prevCountRef.current && query === "") {
      const el = scrollRef.current;
      if (el) {
        el.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
    prevCountRef.current = events.length;
  }, [events.length, query]);

  const totalEvents = events.length;
  const roundKeys = [...filteredGrouped.keys()];

  return (
    <div
      className={cn(
        "pm-glass rounded-2xl overflow-hidden flex flex-col",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 shrink-0 border-b border-black/[0.04] dark:border-white/[0.06]">
        <span className="text-[11px] font-semibold text-muted-foreground tracking-wide flex items-center gap-1.5">
          <Flag className="h-3.5 w-3.5" aria-hidden />
          Voyage chronicle
        </span>
        <span className="text-[10px] text-muted-foreground/60 tabular-nums">
          {filteredEvents.length}
          {filteredEvents.length !== totalEvents
            ? ` / ${totalEvents}`
            : ""}{" "}
          event{filteredEvents.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Search + filters (only show if there are events) */}
      {totalEvents > 0 && (
        <>
          <SearchBox
            value={query}
            onChange={setQuery}
            resultCount={filteredEvents.length}
          />
          <FilterBar
            active={activeFilter}
            onChange={setActiveFilter}
            counts={filterCounts}
          />
        </>
      )}

      {/* Timeline body */}
      <div
        ref={scrollRef}
        className="pm-scroll overflow-y-auto px-2 py-1.5 min-h-0 flex-1"
      >
        {totalEvents === 0 ? (
          <EmptyState />
        ) : filteredEvents.length === 0 ? (
          <NoResultsState query={query} />
        ) : (
          <AnimatePresence initial={false}>
            {roundKeys.map((round) => {
              const roundEvents = filteredGrouped.get(round)!;
              const isCurrent = round === currentRound;

              return (
                <motion.div
                  key={round}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className="mb-1 last:mb-0"
                >
                  {/* Round section header */}
                  <RoundHeader round={round} isCurrent={isCurrent} />

                  {/* Events within this round */}
                  <div className="relative ml-1 pl-3 border-l-2 border-black/[0.06] dark:border-white/[0.08]">
                    {roundEvents.map((ev, i) => (
                      <TimelineEvent
                        key={`${round}-${i}-${ev.type}`}
                        event={ev}
                        index={i}
                        isLast={i === roundEvents.length - 1}
                      />
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Footer: round indicator */}
      {totalEvents > 0 && (
        <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-t border-black/[0.04] dark:border-white/[0.06]">
          <span className="text-[10px] text-muted-foreground/60">
            Round {currentRound} of voyage
          </span>
          <div className="flex items-center gap-1">
            {[...grouped.keys()].slice(0, 8).map((r) => (
              <div
                key={r}
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  r === currentRound ? "bg-teal-500" : "bg-muted-foreground/25",
                )}
              />
            ))}
            {grouped.size > 8 && (
              <span className="text-[9px] text-muted-foreground/40 ml-0.5">
                +{grouped.size - 8}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
