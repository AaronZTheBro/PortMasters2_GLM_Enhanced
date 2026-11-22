"use client";

import { ShipIcon } from "./ShipVisualizer";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type PublicUser } from "@/lib/api";
import { Avatar, Pill, MeritIcon } from "./shared";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/lib/use-count-up";
import {
  Anchor,
  Award,
  CalendarDays,
  Crown,
  Gem,
  Medal,
  Sparkles,
  Trophy,
  Users,
  Waves,
  RefreshCw,
  Flag,
  Gift,
  UserPlus,
  Activity as ActivityIcon,
  Lock,
  Target,
  Compass,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { difficultyConfig } from "@/lib/game/difficulty";
import { meritById } from "@/lib/game/merits";

// Groups activity records into completed voyage summaries.
type VoyageLogEntry = {
  id: string;
  completedAt: string;
  startedAt: string | null;
  reputation: number | null;
  crowned: boolean;
  merits: Array<{ id: string; name: string; detail: string }>;
  difficulty: string | null;
};

// Missing start records produce summaries without a duration.
function buildVoyageLog(
  activities: Array<{
    id: string;
    type: string;
    detail: string | null;
    createdAt: string;
  }>,
): VoyageLogEntry[] {
  // Index by id for stable React keys and easy lookup.
  const log: VoyageLogEntry[] = [];
  // Process oldest first so events attach to the next voyage_complete record.
  const ascending = [...activities].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  let pendingStart: string | null = null;
  let pendingMerits: Array<{ id: string; name: string; detail: string }> = [];
  let pendingCrowned = false;
  let pendingDifficulty: string | null = null;

  for (const act of ascending) {
    if (act.type === "voyage_start") {
      // A new voyage begins. Reset the pending bucket; any earlier
      // voyage_start without a matching complete is orphaned (truncated by
      // the activity window).
      pendingStart = act.createdAt;
      pendingMerits = [];
      pendingCrowned = false;
      pendingDifficulty = act.detail;
    } else if (act.type === "merit_earned") {
      const merit = act.detail ? meritById(act.detail) : undefined;
      if (merit) {
        pendingMerits.push({
          id: act.detail!,
          name: merit.name,
          detail: merit.desc,
        });
      }
    } else if (act.type === "sea_master") {
      pendingCrowned = true;
    } else if (act.type === "voyage_complete") {
      // Extract the number from detail such as "with 1450 reputation".
      const repMatch = act.detail?.match(/(\d[\d,]*)/);
      const reputation = repMatch
        ? Number(repMatch[1].replace(/,/g, ""))
        : null;
      log.push({
        id: act.id,
        completedAt: act.createdAt,
        startedAt: pendingStart,
        reputation,
        crowned: pendingCrowned,
        merits: pendingMerits,
        difficulty: pendingDifficulty,
      });
      // Reset for the next voyage.
      pendingStart = null;
      pendingMerits = [];
      pendingCrowned = false;
      pendingDifficulty = null;
    }
  }
  // Newest first for display.
  return log.reverse();
}

function formatDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 0) return "No duration";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

// Labels omit the captain name because every row belongs to the viewer.
const ACTIVITY_META: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string }>;
    tone: string;
    label: (d: string | null) => string;
  }
> = {
  register: {
    icon: UserPlus,
    tone: "bg-teal-500/15 text-teal-600 dark:text-teal-300",
    label: () => "Joined the harbor",
  },
  check_in: {
    icon: Gift,
    tone: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
    label: (d) => `Claimed check in${d ? ` (${d})` : ""}`,
  },
  room_create: {
    icon: Anchor,
    tone: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
    label: (d) => `Charted ${d ?? "a harbor"}`,
  },
  voyage_start: {
    icon: ShipIcon,
    tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    label: () => "Set sail on a voyage",
  },
  voyage_complete: {
    icon: Flag,
    tone: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
    label: (d) => `Completed a voyage${d ? ` with ${d}` : ""}`,
  },
  sea_master: {
    icon: Crown,
    tone: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
    label: (d) => `Won the Sea Master crown${d ? ` (${d})` : ""}`,
  },
  merit_earned: {
    icon: Medal,
    tone: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
    label: (d) => `Earned the ${d ?? "merit"}`,
  },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// The four headline stat cards on the profile's Overview tab. Each pulls
// its value from the legacy summary, so the cards stay in sync with the
// account's actual totals without a separate fetch.
const STAT_CARDS: Array<{
  key: "voyagesCompleted" | "seaMasterCrowns" | "bestScore" | "renownLevel";
  label: string;
  icon: LucideIcon;
  tone: string;
  accent: string;
}> = [
  {
    key: "voyagesCompleted",
    label: "Voyages",
    icon: Waves,
    tone: "from-teal-500/15 to-teal-500/5",
    accent: "text-teal-600 dark:text-teal-300",
  },
  {
    key: "seaMasterCrowns",
    label: "Crowns",
    icon: Crown,
    tone: "from-amber-500/15 to-amber-500/5",
    accent: "text-amber-600 dark:text-amber-300",
  },
  {
    key: "bestScore",
    label: "Best Score",
    icon: Trophy,
    tone: "from-violet-500/15 to-violet-500/5",
    accent: "text-violet-600 dark:text-violet-300",
  },
  {
    key: "renownLevel",
    label: "Renown Lv",
    icon: Gem,
    tone: "from-emerald-500/15 to-emerald-500/5",
    accent: "text-emerald-600 dark:text-emerald-300",
  },
];

// Numeric animation respects the current motion preference.
function StatCard({
  value,
  label,
  icon: Icon,
  tone,
  accent,
  delay,
}: {
  value: number;
  label: string;
  icon: LucideIcon;
  tone: string;
  accent: string;
  delay: number;
}) {
  const animated = useCountUp(value);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={cn(
        "relative overflow-hidden rounded-xl border border-black/5 dark:border-white/5 bg-gradient-to-br p-3",
        tone,
      )}
    >
      <Icon className={cn("h-4 w-4 mb-1.5", accent)} />
      <div className="text-xl font-bold leading-tight tabular-nums">
        {animated.toLocaleString()}
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </motion.div>
  );
}

// Locked merit card: shows a merit the captain has NOT yet earned, with a
// progress bar (current / target) when progress is measurable from the
// legacy summary. Renders as a goal card so a captain can see at a glance
// what to aim for next, rather than the earned merits being the only thing
// in the trophy case.
function LockedMeritCard({
  merit,
  delay,
}: {
  merit: {
    id: string;
    name: string;
    desc: string;
    current: number;
    target: number;
    unit: string;
  };
  delay: number;
}) {
  const pct =
    merit.target > 0 ? Math.min(100, (merit.current / merit.target) * 100) : 0;
  // Keep completed merits out of the near completion treatment.
  const almostDone = pct >= 75 && pct < 100;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay }}
      className={cn(
        "relative overflow-hidden rounded-xl border p-3",
        almostDone
          ? "border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent"
          : "border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03]",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="h-9 w-9 rounded-lg bg-black/5 dark:bg-white/10 flex items-center justify-center shrink-0">
          <Lock className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold leading-tight">
              {merit.name}
            </span>
            {almostDone && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-700 dark:text-amber-300 tracking-wide">
                <Target className="h-2.5 w-2.5" />
                Almost
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
            {merit.desc}
          </div>
        </div>
      </div>
      <div className="mt-2.5">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
          <span className="tabular-nums">
            <span
              className={cn(
                "font-semibold",
                almostDone && "text-amber-700 dark:text-amber-300",
              )}
            >
              {merit.current.toLocaleString()}
            </span>
            {" / "}
            {merit.target.toLocaleString()} {merit.unit}
          </span>
          <span className="tabular-nums">{Math.round(pct)}%</span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>
    </motion.div>
  );
}

export function CaptainProfileDialog({
  open,
  onOpenChange,
  me,
  onEnterRoom,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  me: PublicUser;
  // The lobby resolves this partial room reference before entry.
  onEnterRoom: (roomId: string) => void;
}) {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof api.getProfile>
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const d = await api.getProfile();
      setData(d);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load captain profile.",
      );
      if (silent) toast.error("Profile refresh failed");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Load on open and allow explicit refreshes.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-4 sm:max-w-2xl sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            Captain's Logbook
          </DialogTitle>
          <DialogDescription>
            Your full record across every harbor: Renown, merits, voyages, and
            recent activity.
          </DialogDescription>
        </DialogHeader>

        {loading && !data ? (
          // Skeleton loading state: mirrors the layout of ProfileBody so the
          // dialog doesn't shift when the data arrives. The identity header
          // skeleton (avatar + name + title) sits above the tab list skeleton,
          // then a 2x2 stat card grid skeleton, then a content block skeleton.
          // Reads as "content is on its way" rather than "something broke".
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-xl border border-black/5 dark:border-white/10">
              <Skeleton className="h-14 w-14 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-1.5 w-full mt-2" />
              </div>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-7 flex-1" />
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
            <Skeleton className="h-32" />
            <p className="text-[11px] text-muted-foreground text-center">
              Fetching your logbook…
            </p>
          </div>
        ) : error && !data ? (
          <div className="text-center py-10">
            <p className="text-xs text-muted-foreground mb-2">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => load()}>
              Try again
            </Button>
          </div>
        ) : data ? (
          <ProfileBody
            data={data}
            me={me}
            refreshing={refreshing}
            onRefresh={() => load(true)}
            onEnterRoom={onEnterRoom}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ProfileBody({
  data,
  me,
  refreshing,
  onRefresh,
  onEnterRoom,
}: {
  data: Awaited<ReturnType<typeof api.getProfile>>;
  me: PublicUser;
  refreshing: boolean;
  onRefresh: () => void;
  onEnterRoom: (roomId: string) => void;
}) {
  // The first tab is "Logbook" (overview + stats). The "Merits" and
  // "Activity" tabs only render when there's something to show; if a new
  // captain has earned nothing yet, the dialog stays focused on the
  // overview rather than presenting two empty tabs.
  const hasMerits = data.merits.length > 0;
  const hasActivity = data.activities.length > 0;
  const hasRooms = data.rooms.length > 0;
  // Memoize voyage cards for the current activity response.
  const voyageLog = useMemo(
    () => buildVoyageLog(data.activities),
    [data.activities],
  );
  const defaultTab = "logbook";

  return (
    <div className="space-y-4">
      {/* Identity header: avatar, name, title, joined date. Always
          visible above the tabs regardless of which tab is active. */}
      <div className="flex items-start gap-3 p-3 rounded-xl bg-gradient-to-br from-teal-500/10 to-emerald-500/5 border border-teal-500/15">
        <Avatar
          hue={data.user.avatarHue}
          name={data.user.displayName}
          size={56}
          ring="gold"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold leading-tight">
              {data.user.displayName}
            </h3>
            <Pill tone="gold">
              <Sparkles className="h-3 w-3" /> {data.renown.title}
            </Pill>
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-1 flex-wrap">
            <span className="font-mono">@{data.user.username}</span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              Joined{" "}
              {new Date(data.user.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
          {/* Renown progress bar: how far into the current level. */}
          <div className="mt-2.5">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
              <span className="flex items-center gap-1">
                <Gem className="h-3 w-3" /> Level {data.renown.level}
              </span>
              <span className="tabular-nums">
                {data.renown.xpIntoLevel} / {data.renown.xpForNextLevel} XP
              </span>
            </div>
            <Progress
              value={
                data.renown.xpForNextLevel > 0
                  ? (data.renown.xpIntoLevel / data.renown.xpForNextLevel) * 100
                  : 0
              }
              className="h-1.5"
            />
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-1"
          title="Refresh profile"
          aria-label="Refresh profile"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </button>
      </div>

      <Tabs defaultValue={defaultTab} className="gap-3">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-3 lg:grid-cols-5">
          <TabsTrigger
            value="logbook"
            className="h-auto min-w-0 justify-center gap-1.5 whitespace-normal px-2 py-1.5 text-xs"
          >
            <ShipIcon className="h-3.5 w-3.5" /> Logbook
          </TabsTrigger>
          <TabsTrigger
            value="voyages"
            className="h-auto min-w-0 justify-center gap-1.5 whitespace-normal px-2 py-1.5 text-xs"
          >
            <Compass className="h-3.5 w-3.5" /> Voyages
            {voyageLog.length > 0 && (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-500/15 px-1 text-[10px] font-semibold text-sky-700 dark:text-sky-300">
                {voyageLog.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="merits"
            className="h-auto min-w-0 justify-center gap-1.5 whitespace-normal px-2 py-1.5 text-xs"
          >
            <Medal className="h-3.5 w-3.5" /> Merits
            {hasMerits && (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500/15 px-1 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                {data.merits.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="activity"
            className="h-auto min-w-0 justify-center gap-1.5 whitespace-normal px-2 py-1.5 text-xs"
          >
            <ActivityIcon className="h-3.5 w-3.5" /> Activity
          </TabsTrigger>
          <TabsTrigger
            value="harbors"
            className="h-auto min-w-0 justify-center gap-1.5 whitespace-normal px-2 py-1.5 text-xs"
          >
            <Anchor className="h-3.5 w-3.5" /> Harbors
          </TabsTrigger>
        </TabsList>

        {/* Logbook overview */}
        <TabsContent value="logbook" className="mt-0 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {STAT_CARDS.map((card, i) => {
              const value = data.legacy[card.key];
              return (
                <StatCard
                  key={card.key}
                  value={value}
                  label={card.label}
                  icon={card.icon}
                  tone={card.tone}
                  accent={card.accent}
                  delay={i * 0.05}
                />
              );
            })}
          </div>

          {/* Difficulty records */}
          <div className="rounded-xl border border-black/5 dark:border-white/10 p-3.5">
            <h4 className="text-xs font-semibold mb-2.5 flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5 text-amber-500" /> By Waters
            </h4>
            {data.difficulties.length === 0 ? (
              <p className="text-[11px] text-muted-foreground py-2 text-center">
                No voyages completed yet. Set sail on any waters to start your
                record.
              </p>
            ) : (
              <div className="space-y-1.5">
                {data.difficulties.map((d) => (
                  <div
                    key={d.key}
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.04]"
                  >
                    <span className="text-base shrink-0">{d.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium">{d.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        Best score: {d.bestScore.toLocaleString()}
                      </div>
                    </div>
                    {d.crowns > 0 && (
                      <Pill tone="gold">
                        <Crown className="h-3 w-3" /> {d.crowns}
                      </Pill>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Daily check in status */}
          <div className="rounded-xl border border-black/5 dark:border-white/10 p-3.5">
            <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <Gift className="h-3.5 w-3.5 text-violet-500" /> Daily check in
            </h4>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">
                Day {data.checkIn.currentDay} of 7 cycle
              </span>
              <Pill tone={data.checkIn.canClaimToday ? "emerald" : "default"}>
                {data.checkIn.canClaimToday
                  ? "Reward waiting"
                  : "Claimed today"}
              </Pill>
            </div>
          </div>
        </TabsContent>

        {/* Voyages tab: a timeline of completed voyages, derived from the
            activity feed by grouping related events around each
            voyage_complete. Each card shows the completion date, the
            reputation banked (parsed from the activity's detail), whether
            the captain was crowned Sea Master that voyage, and any merits
            earned during it. The timeline reads top (newest) to bottom
            (oldest), with a vertical connector so it feels like a
            ship's log. */}
        <TabsContent value="voyages" className="mt-0">
          {voyageLog.length > 0 ? (
            <div className="max-h-[55dvh] overflow-y-auto pm-scroll -mr-1 pr-1">
              <ol className="relative space-y-2.5 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-black/10 dark:before:bg-white/10">
                {voyageLog.map((voyage, i) => {
                  const date = new Date(voyage.completedAt);
                  const dateLabel = date.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });
                  const timeLabel = date.toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  });
                  return (
                    <motion.li
                      key={voyage.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.05, 0.5) }}
                      className="relative pl-10"
                    >
                      {/* Timeline node: a circular icon at the left rail.
                          Crowned voyages get a gold crown icon; others get
                          a flag. The ring tone also changes to draw the
                          eye to crown wins. */}
                      <div
                        className={cn(
                          "absolute left-0 top-1.5 h-8 w-8 rounded-full flex items-center justify-center ring-2 ring-background",
                          voyage.crowned
                            ? "bg-gradient-to-br from-amber-400/30 to-amber-500/10 text-amber-600 dark:text-amber-300"
                            : "bg-sky-500/15 text-sky-600 dark:text-sky-300",
                        )}
                      >
                        {voyage.crowned ? (
                          <Crown className="h-3.5 w-3.5" />
                        ) : (
                          <Flag className="h-3.5 w-3.5" />
                        )}
                      </div>
                      <div
                        className={cn(
                          "rounded-xl border p-3 transition-colors",
                          voyage.crowned
                            ? "border-amber-500/30 bg-gradient-to-br from-amber-500/[0.07] to-transparent"
                            : "border-black/5 dark:border-white/10 bg-background/60 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]",
                        )}
                      >
                        {/* Date + time + duration row. */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-semibold">{dateLabel}</span>
                            <span className="text-muted-foreground text-[10px]">
                              {timeLabel}
                            </span>
                          </div>
                          {voyage.startedAt && (
                            <span className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-1">
                              <ShipIcon className="h-3 w-3" />
                              {formatDuration(
                                voyage.startedAt,
                                voyage.completedAt,
                              )}
                            </span>
                          )}
                        </div>
                        {/* Voyage highlights: reputation, crown, merits. */}
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          {voyage.reputation != null && (
                            <Pill tone="violet">
                              <Trophy className="h-3 w-3" />
                              {voyage.reputation.toLocaleString()} rep
                            </Pill>
                          )}
                          {voyage.crowned && (
                            <Pill tone="gold">
                              <Crown className="h-3 w-3" /> Sea Master
                            </Pill>
                          )}
                          {voyage.difficulty && (
                            <Pill tone="sea">
                              {voyage.difficulty.replace(/_/g, " ")}
                            </Pill>
                          )}
                          {voyage.merits.map((m) => (
                            <Pill key={m.id} tone="rose">
                              <MeritIcon
                                id={
                                  m.id as Parameters<typeof MeritIcon>[0]["id"]
                                }
                                className="h-3 w-3"
                              />
                              {m.name}
                            </Pill>
                          ))}
                        </div>
                      </div>
                    </motion.li>
                  );
                })}
              </ol>
              {voyageLog.length >= 5 && (
                <p className="text-[10px] text-muted-foreground/70 text-center mt-3">
                  Showing the {voyageLog.length} most recent voyages in your
                  activity window.
                </p>
              )}
            </div>
          ) : (
            <div className="py-10 text-center">
              <Compass className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">
                No completed voyages yet. Set sail from a harbor and reach the
                endgame to log your first journey.
              </p>
            </div>
          )}
        </TabsContent>

        {/* Merits tab: trophy case. */}
        <TabsContent value="merits" className="mt-0">
          {hasMerits ? (
            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-semibold tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Trophy className="h-3 w-3 text-amber-500" />
                  Earned ({data.merits.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {data.merits.map((merit, i) => (
                    <motion.div
                      key={merit.id}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-start gap-2.5 p-3 rounded-xl border border-black/5 dark:border-white/10 bg-gradient-to-br from-rose-500/5 to-transparent"
                    >
                      <div className="h-9 w-9 rounded-lg bg-rose-500/15 flex items-center justify-center shrink-0">
                        <MeritIcon
                          id={merit.id as Parameters<typeof MeritIcon>[0]["id"]}
                          className="h-4.5 w-4.5 text-rose-600 dark:text-rose-300"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold leading-tight">
                          {merit.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                          {merit.desc}
                        </div>
                        <div className="text-[10px] text-muted-foreground/70 mt-1">
                          {timeAgo(merit.earnedAt)}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Goals: locked merits with measurable progress. Sits below
                  the earned grid so a captain can see what to aim for
                  next, rather than the earned merits being the only thing
                  in the trophy case. Cards with >= 75% progress get an
                  amber "Almost" treatment to make near term goals pop. */}
              {data.lockedMerits.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Target className="h-3 w-3 text-muted-foreground" />
                    Goals ({data.lockedMerits.length})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {data.lockedMerits.map((merit, i) => (
                      <LockedMeritCard
                        key={merit.id}
                        merit={merit}
                        delay={i * 0.04}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : data.lockedMerits.length > 0 ? (
            // Captain has no earned merits yet, but there ARE measurable
            // goals to show: present the goals grid up front rather than
            // a bare empty state, so a brand new captain sees what to aim
            // for from their very first profile open.
            <div className="space-y-2">
              <div className="py-4 text-center border-b border-black/5 dark:border-white/10">
                <Medal className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">
                  No merits earned yet. Here&apos;s what to aim for on your
                  first voyages.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.lockedMerits.map((merit, i) => (
                  <LockedMeritCard
                    key={merit.id}
                    merit={merit}
                    delay={i * 0.04}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <Medal className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">
                No merits earned yet. Complete voyages, win Sea Master crowns,
                and brave rougher waters to fill your trophy case.
              </p>
            </div>
          )}
        </TabsContent>

        {/* Activity tab: the captain's own recent activity feed. */}
        <TabsContent value="activity" className="mt-0">
          {hasActivity ? (
            <div className="max-h-[50dvh] overflow-y-auto pm-scroll -mr-1 pr-1 space-y-0.5">
              {data.activities.map((a, i) => {
                const meta = ACTIVITY_META[a.type] ?? {
                  icon: ActivityIcon,
                  tone: "bg-black/5 dark:bg-white/10 text-muted-foreground",
                  label: () => a.type.replace(/_/g, " "),
                };
                const Icon = meta.icon;
                return (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.4) }}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-black/[0.03] dark:hover:bg-white/5 transition-colors"
                  >
                    <div
                      className={cn(
                        "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
                        meta.tone,
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11.5px] leading-tight">
                        {meta.label(a.detail)}
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 shrink-0 tabular-nums">
                      {timeAgo(a.createdAt)}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center">
              <ActivityIcon className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">
                No activity yet. Check in, chart a harbor, or set sail to start
                filling your log.
              </p>
            </div>
          )}
        </TabsContent>

        {/* Harbors tab: rooms the captain is currently a member of, with
            a single click rejoin. Useful when you reload the page during a voyage
            and need to find your way back. */}
        <TabsContent value="harbors" className="mt-0">
          {hasRooms ? (
            <div className="space-y-1.5">
              {data.rooms.map((room) => {
                const cfg = difficultyConfig(room.difficulty);
                const isHost = room.host.id === me.id;
                return (
                  <div
                    key={room.id}
                    className="flex items-center gap-2.5 p-2.5 rounded-lg border border-black/5 dark:border-white/10 bg-background/60"
                  >
                    <div className="pm-grad-primary h-8 w-8 rounded-lg flex items-center justify-center shrink-0">
                      <ShipIcon className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium truncate">
                          {room.name}
                        </span>
                        {isHost && <Pill tone="gold">Host</Pill>}
                        {room.started && <Pill tone="sea">Sailing</Pill>}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                        <span>
                          {cfg.icon} {cfg.badge}
                        </span>
                        <span>·</span>
                        <span className="font-mono">{room.code}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="pm-grad-primary text-white rounded-lg h-8"
                      onClick={() => onEnterRoom(room.id)}
                    >
                      Rejoin
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center">
              <Users className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">
                Not currently aboard any harbor. Chart one from the lobby to set
                sail.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
