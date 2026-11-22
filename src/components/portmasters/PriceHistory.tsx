"use client";

// Tracks visible voyage prices in localStorage and renders their trends.

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart as LineChartIcon,
  Search,
  X,
  Check,
  TrendingUp,
  TrendingDown,
  Minus,
  Package,
  Boxes,
  Anchor,
  Ship,
  AlertCircle,
} from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { PRODUCTS, RESOURCES } from "@/lib/game/constants";
import type {
  PriceHistory as History,
  PricePoint,
  PriceSide,
} from "@/lib/use-price-history";
import { itemColorResolver } from "@/lib/use-color-preference";
import { cn } from "@/lib/utils";
import { ItemIcon } from "./shared";

// Types

type Props = {
  game: GameState;
  observations: Record<PriceSide, History>;
  className?: string;
  colorFor?: (item: string) => string | undefined;
};

type ItemSummary = {
  current: number;
  average: number;
  min: number;
  max: number;
  trend: "rising" | "falling" | "stable";
  points: PricePoint[];
};

// Constants

const TREND_THRESHOLD = 0.04;

// Helpers

function summarize(points: PricePoint[]): ItemSummary | null {
  if (points.length === 0) return null;
  const prices = points.map((p) => p.price);
  const current = prices[prices.length - 1];
  const sum = prices.reduce((a, b) => a + b, 0);
  const average = Math.round(sum / prices.length);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  let trend: ItemSummary["trend"] = "stable";
  if (prices.length >= 2) {
    const prev = prices[prices.length - 2];
    if (prev > 0) {
      const delta = (current - prev) / prev;
      if (delta > TREND_THRESHOLD) trend = "rising";
      else if (delta < -TREND_THRESHOLD) trend = "falling";
    }
  }
  return { current, average, min, max, trend, points };
}

function isResource(item: string): boolean {
  return (RESOURCES as readonly string[]).includes(item);
}

function itemCategory(item: string): "Raw Materials" | "Finished Goods" {
  return isResource(item) ? "Raw Materials" : "Finished Goods";
}

// Line chart
//
// Responsive SVG line chart. Uses a fixed viewBox (so the geometry math
// stays simple) and scales to the container via width="100%". Hovering
// anywhere on the plot area snaps a vertical guide to the nearest round
// and shows every visible item's price for that round in a tooltip.

const CHART_W = 760;
const CHART_H = 280;
const CHART_PAD = { top: 16, right: 16, bottom: 28, left: 40 };
const PLOT_W = CHART_W - CHART_PAD.left - CHART_PAD.right;
const PLOT_H = CHART_H - CHART_PAD.top - CHART_PAD.bottom;

function LineChart({
  history,
  selectedItems,
  resolveColor,
}: {
  history: History;
  selectedItems: Set<string>;
  resolveColor: (item: string) => string | undefined;
}) {
  // Collect the visible series: one per selected item that actually has
  // at least one recorded point.
  const series = useMemo(() => {
    const out: {
      item: string;
      color: string;
      points: { round: number; price: number }[];
    }[] = [];
    for (const item of selectedItems) {
      const pts = history[item];
      if (!pts || pts.length === 0) continue;
      out.push({
        item,
        color: resolveColor(item) ?? "#64748b",
        points: pts.map((p) => ({ round: p.round, price: p.price })),
      });
    }
    // Stable item ordering keeps the legend and series layer order
    // from reshuffling as the user toggles items on and off.
    out.sort((a, b) => a.item.localeCompare(b.item));
    return out;
  }, [history, selectedItems, resolveColor]);

  // Determine the round and price extents across every visible series so
  // they share one set of axes.
  const { minRound, maxRound, minPrice, maxPrice, rounds } = useMemo(() => {
    let minRound = Infinity;
    let maxRound = -Infinity;
    let minPrice = Infinity;
    let maxPrice = 0;
    const roundSet = new Set<number>();
    for (const s of series) {
      for (const p of s.points) {
        if (p.round < minRound) minRound = p.round;
        if (p.round > maxRound) maxRound = p.round;
        if (p.price < minPrice) minPrice = p.price;
        if (p.price > maxPrice) maxPrice = p.price;
        roundSet.add(p.round);
      }
    }
    if (!Number.isFinite(minRound)) {
      minRound = 0;
      maxRound = 1;
    }
    if (!Number.isFinite(minPrice)) {
      minPrice = 0;
      maxPrice = 1;
    }
    // Pad the price axis a touch so the topmost line doesn't kiss the edge.
    const pad = Math.max(1, Math.round((maxPrice - minPrice) * 0.12));
    return {
      minRound,
      maxRound,
      minPrice: Math.max(0, minPrice - pad),
      maxPrice: maxPrice + pad,
      rounds: [...roundSet].sort((a, b) => a - b),
    };
  }, [series]);

  // Hover state: which round is the cursor closest to?
  const [hoverRound, setHoverRound] = useState<number | null>(null);

  const xFor = useCallback(
    (round: number) => {
      const span = Math.max(1, maxRound - minRound);
      // Clamp round into [minRound, maxRound] so a round outside the range
      // (shouldn't happen, but defensive) doesn't escape the plot.
      const clamped = Math.min(maxRound, Math.max(minRound, round));
      return CHART_PAD.left + ((clamped - minRound) / span) * PLOT_W;
    },
    [minRound, maxRound],
  );

  const yFor = useCallback(
    (price: number) => {
      const span = Math.max(1, maxPrice - minPrice);
      const clamped = Math.min(maxPrice, Math.max(minPrice, price));
      return CHART_PAD.top + (1 - (clamped - minPrice) / span) * PLOT_H;
    },
    [minPrice, maxPrice],
  );

  function pickChartRound(event: ReactMouseEvent<SVGSVGElement>) {
    if (!rounds.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * CHART_W) / rect.width;
    const nearest = rounds.reduce((best, round) =>
      Math.abs(xFor(round) - x) < Math.abs(xFor(best) - x) ? round : best,
    );
    setHoverRound(nearest);
  }

  const selectedRound =
    hoverRound !== null && rounds.includes(hoverRound)
      ? hoverRound
      : rounds.at(-1);
  const hoverX = selectedRound === undefined ? null : xFor(selectedRound);

  // Y axis tick marks use four evenly spaced price values.
  const yTicks = useMemo(() => {
    const ticks: { value: number; y: number }[] = [];
    const n = 4;
    for (let i = 0; i <= n; i++) {
      const v = minPrice + ((maxPrice - minPrice) * i) / n;
      ticks.push({ value: Math.round(v), y: yFor(v) });
    }
    return ticks;
  }, [minPrice, maxPrice, yFor]);

  // Compute path "d" strings for animation. The animation library
  // animation needs the path's full length to work, but it derives that
  // automatically; we just need a stable "d".
  const paths = useMemo(
    () =>
      series.map((s) => {
        const sorted = [...s.points].sort((a, b) => a.round - b.round);
        const d = sorted
          .map((p, i) => {
            const x = xFor(p.round);
            const y = yFor(p.price);
            return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(" ");
        // Also build the points array for the dots overlay.
        const dots = sorted.map((p) => ({
          round: p.round,
          price: p.price,
          x: xFor(p.round),
          y: yFor(p.price),
        }));
        return { ...s, d, dots };
      }),
    [series, xFor, yFor],
  );

  // Tooltip content: for each visible series, its price at the hover round.
  const tooltipRows = useMemo(() => {
    if (selectedRound === undefined) return [];
    const rows: { item: string; color: string; price: number | null }[] = [];
    for (const s of series) {
      const pt = s.points.find((p) => p.round === selectedRound);
      rows.push({ item: s.item, color: s.color, price: pt ? pt.price : null });
    }
    rows.sort((a, b) => {
      if (a.price == null && b.price == null)
        return a.item.localeCompare(b.item);
      if (a.price == null) return 1;
      if (b.price == null) return -1;
      return b.price - a.price;
    });
    return rows;
  }, [selectedRound, series]);

  // When there is no data, let the parent show the empty state. We still
  // render an empty plot area so the chart structure remains visible.
  const hasData = series.length > 0;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        className="block w-full select-none"
        style={{ aspectRatio: `${CHART_W} / ${CHART_H}` }}
        onPointerMove={(event) => {
          if (event.pointerType === "mouse") pickChartRound(event);
        }}
        onClick={pickChartRound}
        role="img"
        aria-label="Price history chart across rounds"
      >
        {/* Plot frame */}
        <rect
          x={CHART_PAD.left}
          y={CHART_PAD.top}
          width={PLOT_W}
          height={PLOT_H}
          className="fill-teal-600/5 dark:fill-teal-300/5"
          stroke="oklch(0.7 0.06 195 / 0.18)"
          strokeWidth={0.5}
          rx={6}
        />

        {/* Y axis gridlines and labels */}
        {yTicks.map((t, i) => (
          <g key={`y-${i}`}>
            <line
              x1={CHART_PAD.left}
              x2={CHART_PAD.left + PLOT_W}
              y1={t.y}
              y2={t.y}
              stroke="oklch(0.6 0.04 195 / 0.18)"
              strokeWidth={0.5}
              strokeDasharray="2 3"
            />
            <text
              x={CHART_PAD.left - 6}
              y={t.y + 3}
              textAnchor="end"
              fontSize={9}
              fill="currentColor"
              className="text-muted-foreground/70"
            >
              {t.value}
            </text>
          </g>
        ))}

        {/* X axis round labels show every round if there are few, otherwise
            thin out so the labels don't collide. */}
        {rounds.map((r) => {
          const x = xFor(r);
          return (
            <g key={`x-${r}`}>
              <line
                x1={x}
                x2={x}
                y1={CHART_PAD.top + PLOT_H}
                y2={CHART_PAD.top + PLOT_H + 4}
                stroke="oklch(0.6 0.04 195 / 0.3)"
                strokeWidth={0.5}
              />
              <text
                x={x}
                y={CHART_PAD.top + PLOT_H + 16}
                textAnchor="middle"
                fontSize={9}
                fill="currentColor"
                className="text-muted-foreground/70"
              >
                R{r}
              </text>
            </g>
          );
        })}

        {/* Axis labels */}
        <text
          x={CHART_PAD.left + PLOT_W / 2}
          y={CHART_H - 2}
          textAnchor="middle"
          fontSize={9}
          fill="currentColor"
          className="text-muted-foreground/60"
        >
          Round
        </text>
        <text
          x={-(CHART_PAD.top + PLOT_H / 2)}
          y={11}
          textAnchor="middle"
          fontSize={9}
          fill="currentColor"
          className="text-muted-foreground/60"
          transform="rotate(-90)"
        >
          Price (Gold)
        </text>

        {/* Series lines */}
        {paths.map((p) => (
          <g key={`line-${p.item}`}>
            <motion.path
              d={p.d}
              fill="none"
              stroke={p.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.9, ease: "easeInOut" }}
            />
            {/* Endpoint dots on every recorded point so a sparse series
                still reads as data, not a flat line. */}
            {p.dots.map((d, i) => (
              <motion.circle
                key={i}
                cx={d.x}
                cy={d.y}
                r={2.4}
                fill={p.color}
                stroke="white"
                strokeWidth={0.8}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  delay: 0.4 + i * 0.05,
                  duration: 0.25,
                  ease: "easeOut",
                }}
              />
            ))}
          </g>
        ))}

        {/* Hover guide + crosshair dots */}
        {hasData && hoverX != null && selectedRound !== undefined && (
          <g pointerEvents="none">
            <line
              x1={hoverX}
              x2={hoverX}
              y1={CHART_PAD.top}
              y2={CHART_PAD.top + PLOT_H}
              stroke="oklch(0.5 0.06 195 / 0.4)"
              strokeWidth={0.75}
              strokeDasharray="3 3"
            />
            {series.map((s) => {
              const pt = s.points.find((p) => p.round === selectedRound);
              if (!pt) return null;
              return (
                <circle
                  key={`hov-${s.item}`}
                  cx={xFor(pt.round)}
                  cy={yFor(pt.price)}
                  r={3.5}
                  fill={s.color}
                  stroke="white"
                  strokeWidth={1.25}
                />
              );
            })}
          </g>
        )}

        {!hasData && (
          <text
            x={CHART_PAD.left + PLOT_W / 2}
            y={CHART_PAD.top + PLOT_H / 2}
            textAnchor="middle"
            fontSize={11}
            fill="currentColor"
            className="text-muted-foreground/50"
          >
            No items selected
          </text>
        )}
      </svg>

      {selectedRound !== undefined && tooltipRows.length > 0 && (
        <div className="mt-2 min-w-0 rounded-lg border border-border bg-background px-2.5 py-2 text-xs">
          <label className="mb-2 flex items-center justify-between gap-2 font-semibold">
            Round details
            <select
              className="rounded border border-border bg-background px-2 py-1"
              value={selectedRound}
              onChange={(event) => setHoverRound(Number(event.target.value))}
            >
              {rounds.map((round) => (
                <option key={round} value={round}>
                  Round {round}
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-0.5">
            {tooltipRows.map((row) => (
              <div
                key={row.item}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                    aria-hidden
                  />
                  <ItemIcon item={row.item} className="h-3 w-3" />
                  <span className="truncate" style={{ color: row.color }}>
                    {row.item}
                  </span>
                </span>
                <span
                  className={cn(
                    "tabular-nums font-medium",
                    row.price == null
                      ? "text-muted-foreground/50"
                      : "text-foreground",
                  )}
                >
                  {row.price == null ? "No price" : `${row.price}g`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Sparkline
//
// Mini line chart for the summary cards. No axes, no hover : just a
// shape that conveys the trend at a glance.

function Sparkline({
  points,
  color,
  width = 80,
  height = 24,
}: {
  points: PricePoint[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) {
    // Not enough data to draw a line : show a flat baseline hint instead.
    return (
      <svg
        width={width}
        height={height}
        className="inline-block opacity-40"
        aria-hidden
      >
        <line
          x1={2}
          x2={width - 2}
          y1={height / 2}
          y2={height / 2}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      </svg>
    );
  }
  const sorted = [...points].sort((a, b) => a.round - b.round);
  const prices = sorted.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const path = sorted
    .map((p, i) => {
      const x = pad + (i / (sorted.length - 1)) * w;
      const y = pad + (1 - (p.price - min) / range) * h;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const last = sorted[sorted.length - 1];
  const lastX = pad + w;
  const lastY = pad + (1 - (last.price - min) / range) * h;
  return (
    <svg
      width={width}
      height={height}
      className="inline-block align-middle"
      aria-hidden
    >
      <motion.path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.7, ease: "easeInOut" }}
      />
      <motion.circle
        cx={lastX}
        cy={lastY}
        r={1.6}
        fill={color}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.5, duration: 0.2 }}
      />
    </svg>
  );
}

// Summary card

function TrendChip({ trend }: { trend: ItemSummary["trend"] }) {
  if (trend === "rising") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
        <TrendingUp className="h-2.5 w-2.5" /> Rising
      </span>
    );
  }
  if (trend === "falling") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-300">
        <TrendingDown className="h-2.5 w-2.5" /> Falling
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      <Minus className="h-2.5 w-2.5" /> Stable
    </span>
  );
}

function SummaryCard({
  item,
  summary,
  color,
  visible,
  onToggle,
}: {
  item: string;
  summary: ItemSummary;
  color: string;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn(
        "rounded-xl border p-3 transition-colors",
        visible
          ? "border-black/10 bg-white/40 dark:border-white/10 dark:bg-white/[0.03]"
          : "border-black/5 bg-black/[0.02] opacity-60 dark:border-white/5 dark:bg-white/[0.01]",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 items-center gap-1.5 text-left"
          aria-pressed={visible}
          aria-label={`${visible ? "Hide" : "Show"} ${item} on chart`}
        >
          <span
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
            style={{
              backgroundColor: visible ? color : "transparent",
              borderColor: color,
            }}
          >
            {visible && <Check className="h-2.5 w-2.5 text-white" />}
          </span>
          <ItemIcon item={item} className="h-3.5 w-3.5" />
          <span
            className="truncate text-xs font-semibold"
            style={{ color }}
            title={item}
          >
            {item}
          </span>
        </button>
        <TrendChip trend={summary.trend} />
      </div>
      <div className="mb-2 flex items-end justify-between gap-2">
        <div>
          <div className="text-[9px] tracking-wide text-muted-foreground/60">
            Current
          </div>
          <div className="text-lg font-bold tabular-nums leading-none text-foreground">
            {summary.current}
            <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">
              g
            </span>
          </div>
        </div>
        <Sparkline points={summary.points} color={color} />
      </div>
      <div className="grid grid-cols-3 gap-1 text-[10px]">
        <div className="rounded-md bg-black/[0.03] px-1.5 py-1 text-center dark:bg-white/[0.04]">
          <div className="text-muted-foreground/60">Avg</div>
          <div className="font-semibold tabular-nums text-foreground">
            {summary.average}
          </div>
        </div>
        <div className="rounded-md bg-black/[0.03] px-1.5 py-1 text-center dark:bg-white/[0.04]">
          <div className="text-muted-foreground/60">Min</div>
          <div className="font-semibold tabular-nums text-foreground">
            {summary.min}
          </div>
        </div>
        <div className="rounded-md bg-black/[0.03] px-1.5 py-1 text-center dark:bg-white/[0.04]">
          <div className="text-muted-foreground/60">Max</div>
          <div className="font-semibold tabular-nums text-foreground">
            {summary.max}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Item selector

function ItemSelector({
  items,
  selected,
  onToggle,
  onSetAll,
  search,
  onSearchChange,
  resolveColor,
}: {
  items: string[];
  selected: Set<string>;
  onToggle: (item: string) => void;
  onSetAll: (value: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
  resolveColor: (item: string) => string | undefined;
}) {
  // Group filtered items by category, preserving the canonical RESOURCES /
  // PRODUCTS order within each group.
  const { raw, finished, totalSelected, totalVisible } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filter = (item: string) =>
      q.length === 0 || item.toLowerCase().includes(q);
    const raw = (RESOURCES as readonly string[]).filter(
      (i) => items.includes(i) && filter(i),
    );
    const finished = (PRODUCTS as readonly string[]).filter(
      (i) => items.includes(i) && filter(i),
    );
    const totalVisible = raw.length + finished.length;
    const totalSelected = items.filter((i) => selected.has(i)).length;
    return { raw, finished, totalSelected, totalVisible };
  }, [items, selected, search]);

  function renderRow(item: string) {
    const color = resolveColor(item) ?? "#64748b";
    const checked = selected.has(item);
    return (
      <button
        key={item}
        type="button"
        onClick={() => onToggle(item)}
        aria-pressed={checked}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] transition-colors",
          checked
            ? "bg-black/[0.04] hover:bg-black/[0.07] dark:bg-white/[0.06] dark:hover:bg-white/[0.09]"
            : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]",
        )}
      >
        <span
          className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border"
          style={{
            backgroundColor: checked ? color : "transparent",
            borderColor: color,
          }}
        >
          {checked && <Check className="h-2.5 w-2.5 text-white" />}
        </span>
        <ItemIcon item={item} className="h-3 w-3" />
        <span className="truncate" style={{ color }}>
          {item}
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-black/5 bg-black/[0.02] p-2 dark:border-white/10 dark:bg-white/[0.02]">
      {/* Search row */}
      <div className="mb-2 flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/60" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter goods…"
            className="h-7 w-full rounded-md border border-black/10 bg-background/70 pl-7 pr-6 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 dark:border-white/15"
            aria-label="Filter items by name"
          />
          {search.length > 0 && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground/60 hover:text-foreground"
              aria-label="Clear filter"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => onSetAll(true)}
          className="rounded-md border border-black/10 bg-background/70 px-2 py-1 text-[10px] font-medium hover:bg-black/[0.04] dark:border-white/15 dark:hover:bg-white/[0.06]"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={() => onSetAll(false)}
          className="rounded-md border border-black/10 bg-background/70 px-2 py-1 text-[10px] font-medium hover:bg-black/[0.04] dark:border-white/15 dark:hover:bg-white/[0.06]"
        >
          Clear
        </button>
      </div>
      <div className="mb-1 flex items-center justify-between px-1 text-[9px] tracking-wide text-muted-foreground/60">
        <span>
          {totalSelected} of {items.length} tracked
        </span>
        {totalVisible === 0 && (
          <span className="text-amber-600 dark:text-amber-400">No matches</span>
        )}
      </div>
      <div className="max-h-48 overflow-y-auto pm-scroll pr-0.5">
        {raw.length > 0 && (
          <div className="mb-1.5">
            <div className="flex items-center gap-1 px-1.5 pb-1 text-[9px] font-semibold tracking-wide text-muted-foreground/60">
              <Package className="h-2.5 w-2.5" />
              Raw Materials
            </div>
            <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
              {raw.map(renderRow)}
            </div>
          </div>
        )}
        {finished.length > 0 && (
          <div>
            <div className="flex items-center gap-1 px-1.5 pb-1 text-[9px] font-semibold tracking-wide text-muted-foreground/60">
              <Boxes className="h-2.5 w-2.5" />
              Finished Goods
            </div>
            <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
              {finished.map(renderRow)}
            </div>
          </div>
        )}
        {totalVisible === 0 && (
          <div className="px-2 py-4 text-center text-[11px] text-muted-foreground/60">
            No goods match “{search}”.
          </div>
        )}
      </div>
    </div>
  );
}

// Empty state

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center"
    >
      <motion.div
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className="relative"
      >
        <div className="absolute inset-0 -z-10 rounded-full bg-teal-500/20 blur-xl" />
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-teal-500/30 bg-teal-500/10">
          <LineChartIcon className="h-7 w-7 text-teal-600 dark:text-teal-400" />
        </div>
      </motion.div>
      <div>
        <div className="text-sm font-semibold text-foreground">
          No price history yet
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Start trading to build price history. The chart fills in as you sail
          from round to round.
        </div>
      </div>
      <div className="flex items-center gap-1.5 rounded-full bg-teal-500/10 px-2.5 py-1 text-[10px] text-teal-700 dark:text-teal-300">
        <Anchor className="h-3 w-3" />
        Prices recorded per round · max 20 snapshots per good
      </div>
    </motion.div>
  );
}

// Main component

export function PriceHistory({
  game,
  observations,
  className,
  colorFor,
}: Props) {
  const [side, setSide] = useState<PriceSide>("buy");
  const history = observations[side];
  const resolveColor = itemColorResolver(colorFor);

  // The set of items that have any recorded history.
  const trackedItems = useMemo(
    () => Object.keys(history).filter((k) => history[k]?.length > 0),
    [history],
  );

  // Default to all tracked items selected. We initialize lazily so the
  // first paint doesn't toggle anything off; subsequent renders respect
  // the user's choices.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // When new items appear in history for the first time, default them on
  // so the chart starts drawing immediately. Items already in `selected`
  // are left alone.
  useEffect(() => {
    // Defer the update until after the effect body.
    const id = setTimeout(() => {
      setSelected((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const item of trackedItems) {
          if (!next.has(item)) {
            next.add(item);
            changed = true;
          }
        }
        // Also prune any items that have vanished (epoch change wiped them).
        for (const item of prev) {
          if (!trackedItems.includes(item)) {
            next.delete(item);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 0);
    return () => clearTimeout(id);
  }, [trackedItems]);

  const toggleItem = useCallback((item: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  }, []);

  const setAll = useCallback(
    (value: boolean) => {
      setSelected((prev) => {
        if (value) return new Set(trackedItems);
        // "Clear" only clears the currently visible (filtered) items so
        // the user can thin out a category without nuking their full
        // selection.
        const q = search.trim().toLowerCase();
        const visible = trackedItems.filter(
          (i) => q.length === 0 || i.toLowerCase().includes(q),
        );
        const next = new Set(prev);
        for (const item of visible) next.delete(item);
        return next;
      });
    },
    [trackedItems, search],
  );

  // Compute summaries for the card grid.
  const summaries = useMemo(() => {
    const out: {
      item: string;
      category: "Raw Materials" | "Finished Goods";
      summary: ItemSummary;
    }[] = [];
    for (const item of trackedItems) {
      const s = summarize(history[item]);
      if (!s) continue;
      out.push({ item, category: itemCategory(item), summary: s });
    }
    out.sort((a, b) => {
      // Group by category first (raw materials before finished goods),
      // then alphabetical within each group.
      if (a.category !== b.category) {
        return a.category === "Raw Materials" ? -1 : 1;
      }
      return a.item.localeCompare(b.item);
    });
    return out;
  }, [trackedItems, history]);

  const hasAnyHistory = trackedItems.length > 0;
  const visibleSelected = useMemo(
    () =>
      new Set([...selected].filter((i) => history[i] && history[i].length > 0)),
    [selected, history],
  );

  return (
    <section
      className={cn(
        "pm-glass-cool relative overflow-hidden rounded-2xl ring-1 ring-teal-500/10",
        className,
      )}
      aria-label="Price history"
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-2 border-b border-teal-500/10 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/15">
            <LineChartIcon className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold leading-tight text-foreground">
              Price History
            </h3>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
              <Ship className="h-2.5 w-2.5" />
              Voyage epoch {game.voyageEpoch}
              <span aria-hidden>·</span>
              <span>
                {trackedItems.length} good{trackedItems.length === 1 ? "" : "s"}{" "}
                tracked
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-300">
          <Anchor className="h-2.5 w-2.5" />
          Round {game.currentRound}/{game.maxRounds}
        </div>
      </header>

      <div className="space-y-3 p-3.5">
        <label className="flex flex-wrap items-center gap-2 text-xs font-medium">
          Price measure
          <select
            className="rounded border border-border bg-background px-2 py-1"
            value={side}
            onChange={(event) => setSide(event.target.value as PriceSide)}
          >
            <option value="buy">Market listings</option>
            <option value="sell">Buyer orders</option>
          </select>
        </label>
        <p className="text-xs text-muted-foreground">
          {side === "buy"
            ? "Average listed Gold per unit across the market ports. Lot discounts appear on the buying board."
            : "Average quoted Gold per cargo unit after VAT and freight, before random audits or refunds. Includes ordinary buyer orders."}
        </p>
        <AnimatePresence mode="wait" initial={false}>
          {hasAnyHistory ? (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              {/* Chart */}
              <div className="rounded-xl border border-teal-500/10 bg-teal-500/[0.03] p-2.5">
                <LineChart
                  history={history}
                  selectedItems={visibleSelected}
                  resolveColor={resolveColor}
                />
              </div>

              {/* Item selector */}
              <ItemSelector
                items={trackedItems}
                selected={selected}
                onToggle={toggleItem}
                onSetAll={setAll}
                search={search}
                onSearchChange={setSearch}
                resolveColor={resolveColor}
              />

              {/* Summary cards */}
              <div>
                <div className="mb-1.5 flex items-center gap-1 px-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground/70">
                  <AlertCircle className="h-3 w-3" />
                  Price summary
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {summaries.map(({ item, summary }) => (
                    <SummaryCard
                      key={item}
                      item={item}
                      summary={summary}
                      color={resolveColor(item) ?? "#64748b"}
                      visible={visibleSelected.has(item)}
                      onToggle={() => toggleItem(item)}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <EmptyState />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

export default PriceHistory;
