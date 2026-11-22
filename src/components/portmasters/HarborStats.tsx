"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Ship,
  Trophy,
  Crown,
  Waves,
  Activity as ActivityIcon,
  RefreshCw,
  Anchor,
  Medal,
  Gift,
  Sailboat,
  Flag,
  UserPlus,
  Filter,
  Clock,
} from "lucide-react";
import { api } from "@/lib/api";
import { difficultyConfig } from "@/lib/game/difficulty";
import { Avatar, Pill } from "./shared";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/lib/use-count-up";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Stats = Awaited<ReturnType<typeof api.stats>>;

// Current harbor condition (single badge instead of animated widgets)

// Icon and copy per activity type, so the feed reads naturally rather than
// showing a raw type string. The tone drives the icon background chip.
const ACTIVITY_META: Record<
  string,
  { icon: typeof Users; tone: string; label: (d: string | null) => string }
> = {
  register: {
    icon: UserPlus,
    tone: "bg-teal-500/15 text-teal-600 dark:text-teal-300",
    label: () => "joined the harbor",
  },
  check_in: {
    icon: Gift,
    tone: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
    label: (d) => `claimed check in${d ? ` (${d})` : ""}`,
  },
  room_create: {
    icon: Anchor,
    tone: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
    label: (d) => `charted ${d ?? "a harbor"}`,
  },
  voyage_start: {
    icon: Sailboat,
    tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    label: () => "set sail on a voyage",
  },
  voyage_complete: {
    icon: Flag,
    tone: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
    label: (d) => `completed a voyage${d ? ` with ${d}` : ""}`,
  },
  sea_master: {
    icon: Crown,
    tone: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
    label: (d) => `won the Sea Master crown${d ? ` (${d})` : ""}`,
  },
  merit_earned: {
    icon: Medal,
    tone: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
    label: (d) => `earned the ${d ?? "merit"}`,
  },
};

// Relative time formatter kept tiny: "just now", "3m", "2h", "5d".
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const STAT_CARDS = [
  {
    key: "captains" as const,
    label: "Captains",
    icon: Users,
    tone: "from-teal-500/15 to-teal-500/5",
    accent: "text-teal-600 dark:text-teal-300",
    glowColor: "hover:shadow-teal-300/30 dark:hover:shadow-teal-500/20",
    iconBg: "bg-teal-500/15 dark:bg-teal-400/20",
  },
  {
    key: "sailing" as const,
    label: "Sailing now",
    icon: Ship,
    tone: "from-emerald-500/15 to-emerald-500/5",
    accent: "text-emerald-600 dark:text-emerald-300",
    glowColor: "hover:shadow-emerald-300/30 dark:hover:shadow-emerald-500/20",
    iconBg: "bg-emerald-500/15 dark:bg-emerald-400/20",
  },
  {
    key: "voyages" as const,
    label: "Voyages run",
    icon: Waves,
    tone: "from-amber-500/15 to-amber-500/5",
    accent: "text-amber-600 dark:text-amber-300",
    glowColor: "hover:shadow-amber-300/30 dark:hover:shadow-amber-500/20",
    iconBg: "bg-white/70 dark:bg-slate-950/25",
  },
  {
    key: "crowns" as const,
    label: "Crowns won",
    icon: Crown,
    tone: "from-violet-500/15 to-violet-500/5",
    accent: "text-violet-600 dark:text-violet-300",
    glowColor: "hover:shadow-violet-300/30 dark:hover:shadow-violet-500/20",
    iconBg: "bg-violet-500/15 dark:bg-violet-400/20",
  },
];

// Animated stat card for the harbor totals grid. Pulled into its own
// component so the useCountUp hook runs at the right level (hooks can't
// be called inside .map callbacks). The count animates each time the
// value changes, so a silent background refresh that bumped "Sailing
// now" from 2 to 3 visibly ticks the digit instead of snapping.
function HarborStatCard({
  value,
  label,
  icon: Icon,
  tone,
  accent,
  glowColor,
  iconBg,
  delay,
}: {
  value: number;
  label: string;
  icon: typeof Users;
  tone: string;
  accent: string;
  glowColor: string;
  iconBg: string;
  delay: number;
}) {
  const animated = useCountUp(value);
  // Track value changes to show a sparkle indicator
  const prevValue = useRef(value);
  const [showSparkle, setShowSparkle] = useState(false);

  useEffect(() => {
    if (prevValue.current !== value) {
      prevValue.current = value;
      setShowSparkle(true);
      const t = setTimeout(() => setShowSparkle(false), 900);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={cn(
        "relative overflow-hidden rounded-xl border border-black/5 dark:border-white/5 bg-gradient-to-br p-3",
        "pm-card-lift cursor-default",
        "transition-shadow duration-200 hover:shadow-md",
        glowColor,
        tone,
      )}
    >
      {/* Glow overlay on hover */}
      <div className="absolute inset-0 rounded-xl opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none bg-gradient-to-br from-white/5 to-transparent" />
      <div className="flex items-center justify-between mb-1">
        <div
          className={cn(
            "h-6 w-6 rounded-lg flex items-center justify-center",
            iconBg,
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", accent)} />
        </div>
        {/* Sparkle indicator when value changes */}
        <AnimatePresence>
          {showSparkle && (
            <motion.span
              initial={{ opacity: 0, scale: 0, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ duration: 0.35 }}
              className="inline-block text-[10px]"
            >
              ✨
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <motion.div
        className="text-xl font-bold leading-tight tabular-nums"
        key={value}
        initial={showSparkle ? { scale: 1.15 } : { scale: 1 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        {animated.toLocaleString()}
      </motion.div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </motion.div>
  );
}

export function HarborStats({
  meId,
  className,
}: {
  meId?: string;
  className?: string;
} = {}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "all" shows the harbor feed; "mine" filters to just the current
  // captain's own events. Defaults to "all" so a captain who hasn't
  // done anything yet still sees the harbor is alive.
  const [activityFilter, setActivityFilter] = useState<"all" | "mine">("all");
  // Track newly arrived activity IDs for pulse highlight effect
  const [newActivityIds, setNewActivityIds] = useState<Set<string>>(new Set());
  const newActivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The ref keeps load stable while still comparing against the latest stats.
  const statsRef = useRef<Stats | null>(null);
  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const s = await api.stats();
        // Detect newly arrived activities for pulse effect
        if (statsRef.current) {
          const currentIds = new Set(
            statsRef.current.activities.map((a) => a.id),
          );
          const freshIds = new Set(
            s.activities.filter((a) => !currentIds.has(a.id)).map((a) => a.id),
          );
          if (freshIds.size > 0) {
            setNewActivityIds(freshIds);
            if (newActivityTimer.current) {
              clearTimeout(newActivityTimer.current);
            }
            newActivityTimer.current = setTimeout(
              () => setNewActivityIds(new Set()),
              2000,
            );
          }
        }
        setStats(s);
        setError(null);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not load harbor stats.",
        );
        if (silent) toast.error("Stats refresh failed");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [], // stable: no dependencies (stats read via ref)
  );

  useEffect(() => {
    const kickoff = setTimeout(() => load(), 0);
    // Refresh every 30 seconds so totals stay live without overwhelming the
    // server. Silent so the cards never flash.
    const interval = setInterval(() => load(true), 30000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(interval);
      if (newActivityTimer.current) clearTimeout(newActivityTimer.current);
    };
  }, [load]);

  if (loading) {
    return (
      <div className={cn("pm-glass rounded-2xl p-4 space-y-3", className)}>
        <div className="h-4 w-24 rounded bg-black/5 dark:bg-white/10 animate-pulse" />
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-black/5 dark:bg-white/10 animate-pulse"
            />
          ))}
        </div>
        <div className="h-20 rounded-xl bg-black/5 dark:bg-white/10 animate-pulse" />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className={cn("pm-glass rounded-2xl p-4 text-center", className)}>
        <p className="text-xs text-muted-foreground mb-2">{error}</p>
        <button
          onClick={() => load()}
          className="text-xs text-teal-600 dark:text-teal-300 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!stats) return null;

  // Apply the "Mine / All" filter on the client. The server already
  // returns the 20 most recent harbor activities, so filtering to
  // the current captain's own events is a simple Array.filter; no second
  // request is needed, and the filter toggle is instant.
  const visibleActivities =
    activityFilter === "mine" && meId
      ? stats.activities.filter((a) => a.user?.id === meId)
      : stats.activities;

  return (
    <div
      className={cn(
        "space-y-4 rounded-2xl border border-black/[0.06] bg-background/70 p-3.5 shadow-sm dark:border-white/10 dark:bg-white/[0.03] sm:p-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ActivityIcon className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            Harbor Pulse
          </h3>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Waves className="h-3 w-3 text-teal-600/60 dark:text-teal-400/50" />
            <span>Fair winds across the harbor</span>
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]"
          title="Refresh stats"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
          />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STAT_CARDS.map((card, i) => (
          <HarborStatCard
            key={card.key}
            value={stats.totals[card.key]}
            label={card.label}
            icon={card.icon}
            tone={card.tone}
            accent={card.accent}
            glowColor={card.glowColor}
            iconBg={card.iconBg}
            delay={i * 0.05}
          />
        ))}
      </div>

      <Tabs defaultValue="activity" className="gap-2">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="activity" className="gap-1 px-1.5 text-xs">
            <ActivityIcon className="h-3.5 w-3.5" /> Activity
          </TabsTrigger>
          <TabsTrigger value="leaders" className="gap-1 px-1.5 text-xs">
            <Trophy className="h-3.5 w-3.5" /> Leaders
          </TabsTrigger>
          <TabsTrigger value="harbors" className="gap-1 px-1.5 text-xs">
            <Anchor className="h-3.5 w-3.5" /> Harbors
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-0 min-h-36">
          <div className="mb-2 flex items-center justify-end">
            {meId && (
              <div className="inline-flex shrink-0 items-center rounded-md bg-black/5 p-0.5 dark:bg-white/10">
                <button
                  onClick={() => setActivityFilter("all")}
                  className={cn(
                    "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
                    activityFilter === "all"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-pressed={activityFilter === "all"}
                >
                  All
                </button>
                <button
                  onClick={() => setActivityFilter("mine")}
                  className={cn(
                    "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
                    activityFilter === "mine"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-pressed={activityFilter === "mine"}
                >
                  Mine
                </button>
              </div>
            )}
          </div>
          <div className="pm-scroll -mr-1 max-h-52 space-y-0.5 overflow-y-auto pr-1">
            <AnimatePresence>
              {visibleActivities.map((a, i) => {
                const meta = ACTIVITY_META[a.type] ?? {
                  icon: ActivityIcon,
                  tone: "bg-black/5 dark:bg-white/10 text-muted-foreground",
                  label: () => a.type.replace(/_/g, " "),
                };
                const Icon = meta.icon;
                const isNew = newActivityIds.has(a.id);
                return (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: Math.min(i * 0.04, 0.5),
                      duration: 0.3,
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/5",
                      isNew && "bg-teal-500/5 dark:bg-teal-400/10",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-sm",
                        meta.tone,
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    {activityFilter === "all" && a.user && (
                      <Avatar
                        hue={a.user.avatarHue}
                        name={a.user.displayName}
                        size={20}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] leading-tight">
                        {activityFilter === "all" && (
                          <span className="font-medium">
                            {a.user?.displayName ?? "Someone"}
                          </span>
                        )}{" "}
                        <span className="text-muted-foreground">
                          {meta.label(a.detail)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {isNew && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="relative flex h-1.5 w-1.5"
                        >
                          <span className="pm-pulse-ring absolute inline-flex h-full w-full rounded-full bg-teal-400" />
                          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-teal-500" />
                        </motion.span>
                      )}
                      <span className="flex items-center gap-0.5 text-[9px] tabular-nums text-muted-foreground/70">
                        <Clock className="h-2.5 w-2.5 opacity-50" />
                        {timeAgo(a.createdAt)}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {visibleActivities.length === 0 && (
              <div className="py-8 text-center">
                <Filter className="mx-auto mb-1.5 h-6 w-6 text-muted-foreground/40" />
                <p className="text-[11px] text-muted-foreground">
                  No matching activity yet.
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="leaders" className="mt-0 min-h-36">
          {stats.leaderboard.length > 0 ? (
            <div className="pm-scroll max-h-56 space-y-1 overflow-y-auto pr-1">
              <AnimatePresence>
                {stats.leaderboard.map((entry, i) => {
                  const isTop = i === 0;
                  const isTop3 = i < 3;
                  const rankRingColors = [
                    "ring-amber-400/50 dark:ring-amber-300/40",
                    "ring-zinc-300/50 dark:ring-zinc-400/40",
                    "ring-orange-400/50 dark:ring-orange-300/40",
                  ];
                  return (
                    <motion.div
                      key={entry.user.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className={cn(
                        "flex items-center gap-2 rounded-lg p-1.5",
                        isTop && "pm-gold-glow-bg border border-amber-400/25",
                        isTop3 &&
                          !isTop &&
                          "border border-amber-400/15 bg-gradient-to-r from-amber-400/8 via-amber-400/4 to-transparent",
                        !isTop3 && "hover:bg-black/5 dark:hover:bg-white/5",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                          i === 0 && "bg-amber-400 text-amber-950",
                          i === 1 && "bg-zinc-300 text-zinc-700",
                          i === 2 && "bg-orange-400 text-orange-950",
                          i > 2 &&
                            "bg-black/10 text-muted-foreground dark:bg-white/10",
                        )}
                      >
                        {i + 1}
                      </div>
                      <div
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                          isTop3 && `ring-2 ${rankRingColors[i]}`,
                        )}
                      >
                        <Avatar
                          hue={entry.user.avatarHue}
                          name={entry.user.displayName}
                          size={22}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">
                          {entry.user.displayName}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Medal className="h-2.5 w-2.5" /> Level{" "}
                          {entry.renownLevel}
                          {entry.crowns > 0 && (
                            <>
                              <span>·</span>
                              <Crown className="h-2.5 w-2.5 text-amber-500" />
                              {entry.crowns}
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          ) : (
            <p className="py-8 text-center text-[11px] text-muted-foreground">
              No voyage leaders yet.
            </p>
          )}
        </TabsContent>

        <TabsContent value="harbors" className="mt-0 min-h-36">
          {stats.recentRooms.length > 0 ? (
            <div className="pm-scroll max-h-56 space-y-1 overflow-y-auto pr-1">
              {stats.recentRooms.map((room) => {
                const cfg = difficultyConfig(room.difficulty);
                return (
                  <div
                    key={room.id}
                    className="flex items-center gap-2 rounded-lg p-2 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <div className="shrink-0 text-sm">{cfg.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">
                        {room.name}
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        Hosted by {room.host.displayName}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Pill tone="sea" className="!px-1.5 !py-0">
                        <Users className="h-2.5 w-2.5" /> {room.memberCount}
                      </Pill>
                      {room.started && (
                        <Pill tone="emerald" className="!px-1.5 !py-0">
                          Live
                        </Pill>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-8 text-center text-[11px] text-muted-foreground">
              No recent harbors yet.
            </p>
          )}
        </TabsContent>
      </Tabs>

      {/* Updated timestamp with clock icon */}
      <div className="flex items-center justify-center gap-1.5 text-[9px] text-muted-foreground/70 pt-1 border-t border-black/5 dark:border-white/5">
        <Clock className="h-3 w-3" />
        <span>Updated</span>
        <span className="tabular-nums font-medium">
          {new Date(stats.generatedAt).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}
