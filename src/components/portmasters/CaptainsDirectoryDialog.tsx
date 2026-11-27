"use client";

// Searchable public captain directory backed by GET /api/captains.
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, Pill } from "./shared";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Search,
  Users,
  Crown,
  Trophy,
  Medal,
  Gem,
  Waves,
  Loader2,
  RefreshCw,
  ChevronDown,
  X,
} from "lucide-react";

type SortKey = "renown" | "voyages" | "crowns" | "best" | "joined" | "name";

type CaptainRow = {
  id: string;
  username: string;
  displayName: string;
  avatarHue: number;
  createdAt: string;
  renownLevel: number;
  renownXP: number;
  renownTitle: string;
  voyages: number;
  crowns: number;
  bestScore: number;
  merits: number;
  isMe: boolean;
};

const SORT_OPTIONS: Array<{
  key: SortKey;
  label: string;
}> = [
  { key: "renown", label: "Renown" },
  { key: "voyages", label: "Voyages" },
  { key: "crowns", label: "Crowns" },
  { key: "best", label: "Best Reputation" },
  { key: "joined", label: "Joined" },
  { key: "name", label: "Name" },
];

function sortToApi(
  sort: SortKey,
): "renown" | "voyages" | "crowns" | "best" | "joined" | "name" {
  return sort;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d < 1) return "today";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

// Inline skeleton for the captain row, shown on the first load. Mirrors the
// shape of a real row so the layout doesn't shift when the data arrives.
function CaptainRowSkeleton({ rank }: { rank: number }) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg">
      <div className="w-7 text-right text-xs text-muted-foreground/40 tabular-nums">
        {rank}
      </div>
      <Skeleton className="h-9 w-9 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-2.5 w-20" />
      </div>
      <div className="hidden sm:flex items-center gap-3">
        <Skeleton className="h-3 w-8" />
        <Skeleton className="h-3 w-8" />
        <Skeleton className="h-3 w-8" />
      </div>
    </div>
  );
}

// Loads expanded captain details from /api/legacy/:userId on demand.
function CaptainDetail({
  captain,
  onClose,
}: {
  captain: CaptainRow;
  onClose: () => void;
}) {
  // Keep the loaded breakdown while this detail remains mounted.
  const [breakdown, setBreakdown] = useState<{
    byDifficulty: Array<{
      key: string;
      name: string;
      icon: string;
      crowns: number;
      bestScore: number;
    }>;
    meritIds: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    // Defer the loading update until after the effect body.
    const startT = setTimeout(() => setLoading(true), 0);
    api
      .getLegacyFor(captain.id)
      .then(({ legacy }) => {
        if (!alive) return;
        setBreakdown({
          byDifficulty: Object.entries(legacy.statsByDifficulty)
            .filter(([, s]) => s.crowns > 0 || s.bestScore > 0)
            .map(([key, s]) => ({
              key,
              name: key,
              icon: "",
              crowns: s.crowns,
              bestScore: s.bestScore,
            })),
          meritIds: legacy.meritIds,
        });
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      clearTimeout(startT);
    };
  }, [captain.id]);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="mb-2 mt-1 space-y-2.5 rounded-xl border border-black/5 bg-black/[0.02] p-3 sm:ml-10 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold tracking-wide text-muted-foreground">
            Captain Detail
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground/60 hover:text-foreground transition-colors"
            aria-label="Collapse detail"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div className="rounded-lg bg-background/60 p-2">
            <div className="text-[10px] text-muted-foreground">Renown</div>
            <div className="text-sm font-bold flex items-center justify-center gap-1">
              <Gem className="h-3 w-3 text-emerald-500" /> {captain.renownLevel}
            </div>
          </div>
          <div className="rounded-lg bg-background/60 p-2">
            <div className="text-[10px] text-muted-foreground">Title</div>
            <div className="text-xs font-semibold truncate">
              {captain.renownTitle}
            </div>
          </div>
          <div className="rounded-lg bg-background/60 p-2">
            <div className="text-[10px] text-muted-foreground">Joined</div>
            <div className="text-xs font-semibold">
              {formatDate(captain.createdAt)}
            </div>
          </div>
          <div className="rounded-lg bg-background/60 p-2">
            <div className="text-[10px] text-muted-foreground">Merits</div>
            <div className="text-sm font-bold flex items-center justify-center gap-1">
              <Medal className="h-3 w-3 text-rose-500" /> {captain.merits}
            </div>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-2 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Loading
            breakdown…
          </div>
        ) : breakdown && breakdown.byDifficulty.length > 0 ? (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold tracking-wide text-muted-foreground">
              By Waters
            </div>
            {breakdown.byDifficulty.map((d) => (
              <div
                key={d.key}
                className="flex items-center justify-between text-[11px] py-1 px-2 rounded bg-background/40"
              >
                <span className="capitalize">{d.key.replace(/_/g, " ")}</span>
                <span className="flex items-center gap-2 tabular-nums">
                  <span className="text-amber-600 dark:text-amber-300 flex items-center gap-0.5">
                    <Crown className="h-3 w-3" /> {d.crowns}
                  </span>
                  <span className="text-violet-600 dark:text-violet-300 flex items-center gap-0.5">
                    <Trophy className="h-3 w-3" />{" "}
                    {d.bestScore.toLocaleString()}
                  </span>
                </span>
              </div>
            ))}
            {breakdown.meritIds.length > 0 && (
              <div className="text-[10px] text-muted-foreground pt-1">
                {breakdown.meritIds.length} merit
                {breakdown.meritIds.length === 1 ? "" : "s"} earned across all
                voyages.
              </div>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground text-center py-1">
            No voyages logged on any waters yet.
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function CaptainsDirectoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [captains, setCaptains] = useState<CaptainRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("renown");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const nextOffset = useRef(0);
  const PAGE_SIZE = 30;

  // Fetch the first page 250ms after typing stops.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setExpandedId(null);
  };

  const handleSortChange = (value: string) => {
    setSort(value as SortKey);
    setExpandedId(null);
  };

  const fetchPage = useCallback(
    async (opts: { append: boolean }) => {
      const requestId = ++requestSequence.current;
      const requestOffset = opts.append ? nextOffset.current : 0;
      if (opts.append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await api.listCaptains({
          q: debouncedQuery || undefined,
          sort: sortToApi(sort),
          limit: PAGE_SIZE,
          offset: requestOffset,
        });
        if (requestId !== requestSequence.current) return;
        setTotal(res.total);
        setCaptains((prev) =>
          opts.append ? [...prev, ...res.captains] : res.captains,
        );
        nextOffset.current = requestOffset + res.captains.length;
      } catch (e) {
        if (requestId !== requestSequence.current) return;
        setError(e instanceof Error ? e.message : "Could not load captains.");
      } finally {
        if (requestId !== requestSequence.current) return;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedQuery, sort],
  );

  // Initial load and reload on query or sort change. Every response carries a
  // sequence number so a slower request cannot replace newer search results.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      nextOffset.current = 0;
      void fetchPage({ append: false });
    }, 0);
    return () => {
      clearTimeout(t);
      requestSequence.current += 1;
    };
  }, [open, debouncedQuery, sort, fetchPage]);

  const hasMore = captains.length < total;

  // Render the list of captains, with skeletons on the first load, an empty
  // state when the search yields nothing, and a "Load more" button when the
  // total exceeds the page size.
  const visibleCaptains = captains;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-4 sm:max-w-2xl sm:p-6"
        onEscapeKeyDown={(e) => {
          if (!query) return;
          e.preventDefault();
          handleQueryChange("");
        }}
      >
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle className="flex min-w-0 items-center gap-2 leading-snug">
            <Users className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            Captains Directory
          </DialogTitle>
          <DialogDescription className="break-words leading-relaxed">
            Find captains by name, then open a row for their record.
          </DialogDescription>
        </DialogHeader>

        {/* Search + sort bar. */}
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDownCapture={(e) => {
                if (e.key === "Escape" && query) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                  handleQueryChange("");
                }
              }}
              placeholder="Search captains"
              aria-label="Search captains"
              className="h-9 pl-9 pr-9"
            />
            {query && (
              <button
                type="button"
                onClick={() => handleQueryChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors p-1"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <select
            value={sort}
            onChange={(e) => handleSortChange(e.target.value)}
            aria-label="Sort captains"
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Result count + refresh. */}
        <div className="flex min-w-0 items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span className="min-w-0 break-words">
            {loading
              ? "Searching the harbor…"
              : `${total} captain${total === 1 ? "" : "s"}${debouncedQuery ? ` matching "${debouncedQuery}"` : ""}`}
          </span>
          <button
            onClick={() => fetchPage({ append: false })}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            aria-label="Refresh directory"
            title="Refresh"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", loading && "animate-spin")}
            />
          </button>
        </div>

        {/* Captains list. */}
        {error ? (
          <div className="text-center py-8">
            <p className="text-xs text-muted-foreground mb-2">{error}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fetchPage({ append: false })}
            >
              Try again
            </Button>
          </div>
        ) : (
          <div className="min-w-0">
            <div className="space-y-0.5">
              {loading && visibleCaptains.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <CaptainRowSkeleton key={i} rank={i + 1} />
                ))
              ) : visibleCaptains.length === 0 ? (
                <div className="py-10 text-center">
                  <Users className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {debouncedQuery
                      ? `No captains match "${debouncedQuery}".`
                      : "No captains registered yet."}
                  </p>
                </div>
              ) : (
                visibleCaptains.map((captain, i) => {
                  const rank = i + 1;
                  const expanded = expandedId === captain.id;
                  return (
                    <div key={captain.id}>
                      <button
                        onClick={() =>
                          setExpandedId(expanded ? null : captain.id)
                        }
                        className={cn(
                          "group flex w-full items-center gap-2 rounded-lg p-2 text-left transition-colors sm:gap-3 sm:p-2.5",
                          captain.isMe
                            ? "bg-teal-500/[0.07] hover:bg-teal-500/10"
                            : "hover:bg-black/5 dark:hover:bg-white/5",
                          expanded && "bg-black/[0.04] dark:bg-white/[0.07]",
                        )}
                      >
                        {/* Rank or medal for top 3. */}
                        <div className="w-5 shrink-0 text-right sm:w-7">
                          {rank <= 3 ? (
                            <span
                              className={cn(
                                "inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold",
                                rank === 1
                                  ? "bg-amber-400/20 text-amber-700 dark:text-amber-300"
                                  : rank === 2
                                    ? "bg-zinc-300/30 text-zinc-700 dark:text-zinc-200"
                                    : "bg-orange-700/15 text-orange-700 dark:text-orange-300",
                              )}
                            >
                              {rank}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {rank}
                            </span>
                          )}
                        </div>
                        <Avatar
                          hue={captain.avatarHue}
                          name={captain.displayName}
                          size={36}
                          ring={captain.isMe ? "gold" : false}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="min-w-0 max-w-full truncate text-sm font-medium">
                              {captain.displayName}
                            </span>
                            {captain.isMe && <Pill tone="sea">You</Pill>}
                            <Pill tone="gold">
                              <Gem className="h-3 w-3" /> {captain.renownTitle}
                            </Pill>
                          </div>
                          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span className="min-w-0 truncate font-mono">
                              @{captain.username}
                            </span>
                            <span>·</span>
                            <span>Joined {timeAgo(captain.createdAt)}</span>
                          </div>
                        </div>
                        {/* Stat triplet (hidden on mobile to save space). */}
                        <div className="hidden sm:flex items-center gap-3 shrink-0 text-[11px] tabular-nums">
                          <span
                            className="flex items-center gap-0.5 text-teal-600 dark:text-teal-300"
                            title="Voyages completed"
                          >
                            <Waves className="h-3 w-3" />
                            {captain.voyages}
                          </span>
                          <span
                            className="flex items-center gap-0.5 text-amber-600 dark:text-amber-300"
                            title="Sea Master crowns"
                          >
                            <Crown className="h-3 w-3" />
                            {captain.crowns}
                          </span>
                          <span
                            className="flex items-center gap-0.5 text-violet-600 dark:text-violet-300"
                            title="Best Reputation"
                          >
                            <Trophy className="h-3 w-3" />
                            {captain.bestScore.toLocaleString()}
                          </span>
                          <span
                            className="flex items-center gap-0.5 text-rose-600 dark:text-rose-300"
                            title="Merits earned"
                          >
                            <Medal className="h-3 w-3" />
                            {captain.merits}
                          </span>
                        </div>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-muted-foreground/50 transition-transform shrink-0",
                            expanded && "rotate-180",
                          )}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {expanded && (
                          <CaptainDetail
                            captain={captain}
                            onClose={() => setExpandedId(null)}
                          />
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })
              )}
            </div>

            {/* Load more, shown when there are additional pages. */}
            {hasMore && !loading && visibleCaptains.length > 0 && (
              <div className="pt-2 pb-1 flex justify-center">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fetchPage({ append: true })}
                  disabled={loadingMore}
                  className="rounded-full"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      Loading…
                    </>
                  ) : (
                    <>
                      Load more ({total - visibleCaptains.length} remaining)
                      <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
