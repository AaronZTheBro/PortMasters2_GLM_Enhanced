"use client";

import { ShipMark, ShipIcon } from "./ShipVisualizer";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, type PublicUser, type RoomSummary } from "@/lib/api";
import { useRealtime } from "@/lib/use-realtime";
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  difficultyConfig,
  type Difficulty,
} from "@/lib/game/difficulty";
import { Avatar, OnlineDot, Pill } from "./shared";
import { useDirectMessages } from "@/lib/use-direct-messages";
import { ChatPanel } from "./ChatPanel";
import { CaptainLegacyCard } from "./CaptainLegacyCard";
import { ThemeToggle } from "./ThemeToggle";
import { HarborStats } from "./HarborStats";
import { DailyRewardBanner } from "./DailyRewardBanner";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { SettingsDialog } from "./SettingsDialog";
import { CaptainsDirectoryDialog } from "./CaptainsDirectoryDialog";
import {
  ConnectionStatus,
  deriveConnectionState,
  SessionNotice,
} from "./ConnectionStatus";
import { RoomFilters } from "./RoomFilters";
import { VoyageSummaryCard } from "./VoyageSummaryCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Anchor,
  LogOut,
  Plus,
  Star,
  Users,
  KeyRound,
  Loader2,
  ArrowRight,
  MessageCircle,
  RefreshCw,
  Gift,
  Keyboard,
  UserCircle,
  Settings,
  Compass,
  Waves,
  Copy,
  Check,
  CloudLightning,
} from "lucide-react";
import { toast } from "sonner";
import { cn, normalizeRoomName } from "@/lib/utils";
import { APP_NAME } from "@/lib/game/constants";
import {
  DEFAULT_LEGACY_SUMMARY,
  renownProgress,
  type CaptainLegacySummary,
} from "@/lib/game/legacy";
import { checkInStatus, type CheckInStatus } from "@/lib/game/checkin";
import { CaptainProfileDialog } from "./CaptainProfileDialog";
import { useSound } from "@/lib/use-sound";

// Keeps room code copy state outside the room map.
function RoomCodeCopy({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 font-mono hover:text-foreground transition-colors pm-pressable group/code"
      title="Copy room code"
    >
      {code}
      {copied ? (
        <Check className="h-2.5 w-2.5 text-emerald-500" />
      ) : (
        <Copy className="h-2.5 w-2.5 opacity-0 group-hover/code:opacity-60 transition-opacity" />
      )}
    </button>
  );
}

export function Lobby({
  me,
  onEnterRoom,
  onLogout,
}: {
  me: PublicUser;
  onEnterRoom: (room: RoomSummary) => void;
  onLogout: () => void;
}) {
  const { socket, connected, authed, onlineUsers, authError } = useRealtime(me);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [resumeRoom, setResumeRoom] = useState<RoomSummary | null>(null);
  useEffect(() => {
    let visible = true;
    api
      .getActiveRoom()
      .then(({ room }) => {
        if (visible) setResumeRoom(room);
      })
      .catch(() => {});
    return () => {
      visible = false;
    };
  }, [me.id]);
  const [legacy, setLegacy] = useState(DEFAULT_LEGACY_SUMMARY);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);
  const [hubTab, setHubTab] = useState<"overview" | "captains" | "messages">(
    "overview",
  );
  const [accountOpen, setAccountOpen] = useState(false);
  const [checkIn, setCheckIn] = useState<CheckInStatus>(() =>
    checkInStatus({ checkInCount: 0, lastCheckInDate: null }),
  );
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const { play } = useSound();
  const openAccountPanel = useCallback((openPanel: () => void) => {
    setAccountOpen(false);
    window.setTimeout(openPanel, 0);
  }, []);
  const [newName, setNewName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  // The host picks one tier for the whole harbor (see src/lib/game/difficulty.ts).
  // It is fixed at creation; changing it afterwards means restarting the voyage.
  const [difficulty, setDifficulty] = useState<Difficulty>("fair_winds");
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Filtered rooms driven by RoomFilters; starts as the raw rooms array
  // and is replaced by the filter callback whenever filters change.
  const [filteredRooms, setFilteredRooms] = useState<RoomSummary[]>([]);
  const handleFilteredChange = useCallback(
    (filtered: RoomSummary[]) => setFilteredRooms(filtered),
    [],
  );

  // DM state
  const [dmTarget, setDmTarget] = useState<PublicUser | null>(null);
  const { messages: dmHistory, loading: dmLoading } = useDirectMessages(
    socket,
    me.id,
    dmTarget?.id,
  );

  const refreshRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const { rooms } = await api.listRooms();
      setRooms(rooms);
    } catch {
      /* ignore */
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  useEffect(() => {
    // Defer the first refresh until after the effect body.
    const kickoff = setTimeout(refreshRooms, 0);
    const t = setInterval(refreshRooms, 8000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(t);
    };
  }, [refreshRooms]);

  // F1 opens the keyboard shortcuts dialog. Prevent default so the browser's
  // own help page never opens over the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A captain's Renown only ever changes when a voyage concludes (see
  // maybeConcludeVoyage in src/server/realtime.ts), which never happens
  // while sitting in the lobby, so a plain fetch on mount is enough; no
  // polling needed like the room list above.
  useEffect(() => {
    let alive = true;
    api
      .getLegacy()
      .then(({ legacy, checkIn }) => {
        if (alive) {
          setLegacy(legacy);
          setCheckIn(checkIn);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Claim today's Daily check in. The server is the source of truth for the
  // day math and the guard against a second claim, so we just render whatever
  // state it returns, claimed or not, and surface the reward as a toast.
  const claimCheckIn = useCallback(async () => {
    try {
      const res = await api.checkIn();
      setLegacy(res.legacy);
      setCheckIn(res.checkIn);
      if (res.claimed) {
        play(res.leveledUp ? "level_up" : "check_in");
        toast.success(`Day ${res.day} claimed: +${res.xpGained} Renown XP`, {
          description: res.leveledUp
            ? "Renown level up! A bigger starting Gold bonus awaits."
            : "Fair winds. Come back tomorrow for the next reward.",
        });
      } else {
        play("toggle");
        toast("Already checked in today", {
          description: "Come back tomorrow for the next reward.",
        });
      }
    } catch (error) {
      play("error");
      toast.error("Check in failed", {
        description: "Could not reach the harbor. Try again.",
      });
      throw error;
    }
  }, [play]);

  // Renown for every other captain currently shown in "Captains Online"
  // below, fetched as one batch rather than one request per captain (see
  // POST /api/legacy/batch). Keyed on the *set* of online ids, not the
  // onlineUsers array itself, since that array gets a new reference on
  // every presence:update broadcast (anyone, anywhere, connecting or
  // switching rooms), most of which don't actually add or remove anyone
  // from this list.
  const [otherLegacies, setOtherLegacies] = useState<
    Record<string, CaptainLegacySummary>
  >({});
  const onlineIdsKey = useMemo(
    () =>
      onlineUsers
        .map((u) => u.id)
        .sort()
        .join(","),
    [onlineUsers],
  );
  useEffect(() => {
    const ids = onlineIdsKey ? onlineIdsKey.split(",") : [];
    if (ids.length === 0) return;
    let alive = true;
    api
      .getLegaciesFor(ids)
      .then(({ legacies }) => {
        if (alive) setOtherLegacies(legacies);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [onlineIdsKey]);

  async function createRoom() {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { room } = await api.createRoom({
        name: newName.trim(),
        isPublic,
        difficulty,
      });
      play("success");
      setNewName("");
      setCreateOpen(false);
      onEnterRoom(room);
    } catch (e) {
      play("error");
      setError(e instanceof Error ? e.message : "Failed to create room");
    } finally {
      setBusy(false);
    }
  }

  async function joinByCode() {
    if (joinCode.trim().length !== 6) {
      setError("Room codes are 6 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { room } = await api.joinRoomByCode(joinCode.trim().toUpperCase());
      play("success");
      setJoinCode("");
      setJoinOpen(false);
      onEnterRoom(room);
    } catch (e) {
      play("error");
      setError(e instanceof Error ? e.message : "Failed to join room");
    } finally {
      setBusy(false);
    }
  }

  async function enterRoom(room: RoomSummary) {
    setJoining(room.id);
    try {
      // Ensure membership (idempotent) then enter.
      const { room: joined } = await api.joinRoomById(room.id);
      onEnterRoom(joined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enter room");
    } finally {
      setJoining(null);
    }
  }

  function openDm(user: PublicUser) {
    if (user.id === me.id) return;
    setDmTarget(user);
    setHubTab("messages");
  }

  const totalOnline = onlineUsers.length;

  return (
    <div className="pm-canvas min-h-dvh w-full">
      <header className="sticky top-0 z-30 px-2 py-2 sm:px-5 sm:py-3">
        <div className="pm-glass-strong mx-auto flex max-w-6xl items-center justify-between gap-2 rounded-2xl px-2.5 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="pm-grad-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm sm:h-10 sm:w-10">
              <Anchor className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight">
                {APP_NAME}
              </h1>
              <p className="truncate text-[11px] text-muted-foreground">
                Maritime trading with friends
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {authError ? (
              <SessionNotice reason={authError} />
            ) : (
              <ConnectionStatus
                state={deriveConnectionState(connected, authed)}
                className="hidden sm:inline-flex"
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              className="relative rounded-lg px-2.5"
              onClick={() => setHubOpen(true)}
              aria-label="Open Harbor"
            >
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Harbor</span>
              {checkIn.canClaimToday && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500" />
              )}
            </Button>
            <button
              type="button"
              onClick={() => setAccountOpen(true)}
              className="rounded-full p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Open captain menu"
            >
              <Avatar hue={me.avatarHue} name={me.displayName} size={32} ring />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-2 pb-10 sm:px-5">
        <div className="mt-2">
          <section className="space-y-4">
            <div className="pm-harbor-banner flex min-w-0 items-center gap-3 rounded-2xl border p-4 sm:px-7">
              <div className="min-w-0 flex-1">
                <h2 className="text-balance text-xl font-semibold sm:text-3xl">
                  {resumeRoom ? resumeRoom.name : "Chart a voyage"}
                </h2>
                <p className="mt-1 text-sm">
                  {resumeRoom
                    ? `${difficultyConfig(resumeRoom.difficulty).name} · ${resumeRoom.memberCount} captains`
                    : "Choose your waters and trade with other captains."}
                </p>
                {resumeRoom && (
                  <Button
                    className="mt-3 min-h-11"
                    onClick={() => onEnterRoom(resumeRoom)}
                  >
                    Resume voyage
                  </Button>
                )}
              </div>
              <ShipMark
                level={2}
                className="h-auto w-24 shrink-0 text-[#C0E1D6] sm:w-36"
              />
            </div>
            <div className="pm-glass rounded-2xl p-3 sm:p-5">
              <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <ShipIcon className="h-5 w-5 text-primary" />
                    Open harbors
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Choose a voyage or invite friends to a new one.
                  </p>
                </div>
                <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:flex">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-10 rounded-lg"
                    onClick={refreshRooms}
                    disabled={loadingRooms}
                    aria-label="Refresh harbors"
                  >
                    <RefreshCw
                      className={cn("h-4 w-4", loadingRooms && "animate-spin")}
                    />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="min-h-11 min-w-0 rounded-lg"
                    onClick={() => {
                      setError(null);
                      setJoinOpen(true);
                    }}
                    aria-label="Join a harbor"
                  >
                    <KeyRound className="h-4 w-4" />
                    <span>Join by code</span>
                  </Button>
                  <Button
                    size="sm"
                    className="min-h-11 min-w-0 rounded-lg"
                    onClick={() => {
                      setError(null);
                      setCreateOpen(true);
                    }}
                    aria-label="Create a harbor"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create harbor</span>
                  </Button>
                </div>
              </div>

              <Dialog
                open={createOpen}
                onOpenChange={(open) => {
                  setCreateOpen(open);
                  if (!open) setError(null);
                }}
              >
                <DialogContent className="p-4 sm:max-w-2xl sm:p-6">
                  <DialogHeader>
                    <DialogTitle>New harbor</DialogTitle>
                    <DialogDescription>
                      Name the room, choose the waters, then invite another
                      captain.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Plus className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                      <span className="text-sm font-medium">
                        Harbor details
                      </span>
                    </div>
                    <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_auto_auto]">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="newRoomName"
                          className="text-xs text-muted-foreground"
                        >
                          Room name
                        </Label>
                        <div className="relative">
                          <Waves className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-teal-500/50 dark:text-teal-400/50" />
                          <Input
                            id="newRoomName"
                            value={newName}
                            onChange={(e) => {
                              setNewName(e.target.value);
                              setError(null);
                            }}
                            placeholder="e.g. Silk Run · Voyage 1"
                            maxLength={40}
                            className="h-10 pl-9"
                            onKeyDown={(e) => e.key === "Enter" && createRoom()}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 h-10 px-3 rounded-lg bg-background/60">
                        <Switch
                          checked={isPublic}
                          onCheckedChange={setIsPublic}
                          id="newRoomPublic"
                        />
                        <Label
                          htmlFor="newRoomPublic"
                          className="text-xs cursor-pointer"
                        >
                          Public
                        </Label>
                      </div>
                      <Button
                        onClick={createRoom}
                        disabled={busy || !newName.trim()}
                        className="h-10 pm-grad-primary text-white rounded-lg shadow-md shadow-teal-500/20 dark:shadow-teal-400/15 hover:shadow-lg hover:shadow-teal-500/30 dark:hover:shadow-teal-400/25 transition-shadow"
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-1" /> Create
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="mt-3">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Compass className="h-3 w-3" /> Waters
                      </Label>
                      <div
                        role="radiogroup"
                        aria-label="Waters"
                        className="mt-1.5 grid grid-cols-3 gap-1.5"
                      >
                        {DIFFICULTY_ORDER.map((key) => {
                          const cfg = DIFFICULTIES[key];
                          const active = difficulty === key;
                          const diffColors = {
                            fair_winds: {
                              bg: "bg-teal-500/10 dark:bg-teal-400/15",
                              border:
                                "border-teal-500/30 dark:border-teal-400/30",
                              glow: "pm-glow-teal",
                              grad: "from-teal-500 to-teal-600",
                              icon: <ShipIcon className="h-3.5 w-3.5" />,
                            },
                            open_waters: {
                              bg: "bg-slate-500/10 dark:bg-slate-400/15",
                              border:
                                "border-slate-500/30 dark:border-slate-400/30",
                              glow: "pm-glow-slate",
                              grad: "from-slate-500 to-slate-600",
                              icon: <Waves className="h-3.5 w-3.5" />,
                            },
                            monsoon: {
                              bg: "bg-violet-500/10 dark:bg-violet-400/15",
                              border:
                                "border-violet-500/30 dark:border-violet-400/30",
                              glow: "pm-glow-violet",
                              grad: "from-violet-500 to-violet-600",
                              icon: <CloudLightning className="h-3.5 w-3.5" />,
                            },
                          };
                          const dc = diffColors[key];
                          return (
                            <button
                              key={key}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => setDifficulty(key)}
                              className={cn(
                                "relative min-w-0 cursor-pointer rounded-xl border px-1.5 py-2.5 text-xs font-medium transition-all duration-200 sm:px-2",
                                active
                                  ? cn(dc.bg, dc.border, dc.glow)
                                  : "border-border/60 bg-background/55 hover:bg-black/5 dark:hover:bg-white/5",
                              )}
                            >
                              {active && (
                                <motion.span
                                  layoutId="difficultyThumb"
                                  className={cn(
                                    "absolute inset-0 rounded-xl bg-gradient-to-br",
                                    dc.grad,
                                    "opacity-15",
                                  )}
                                  transition={{
                                    type: "spring",
                                    stiffness: 380,
                                    damping: 32,
                                  }}
                                />
                              )}
                              <span
                                className={cn(
                                  "relative z-10 flex flex-col items-center justify-center gap-1",
                                  active
                                    ? "text-foreground"
                                    : "text-muted-foreground",
                                )}
                              >
                                <span className="text-base">{cfg.icon}</span>
                                <span className="truncate text-[11px]">
                                  {cfg.badge}
                                </span>
                                <span
                                  className={cn(
                                    "mt-0.5",
                                    active ? "opacity-80" : "opacity-50",
                                  )}
                                >
                                  {dc.icon}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        {DIFFICULTIES[difficulty].tagline}{" "}
                        <span className="text-foreground/70">
                          {DIFFICULTIES[difficulty].rounds} rounds.
                        </span>
                      </p>
                    </div>
                    {error && (
                      <div
                        role="alert"
                        className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300"
                      >
                        {error}
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog
                open={joinOpen}
                onOpenChange={(open) => {
                  setJoinOpen(open);
                  if (!open) setError(null);
                }}
              >
                <DialogContent className="p-4 sm:max-w-md sm:p-6">
                  <DialogHeader>
                    <DialogTitle>Join harbor</DialogTitle>
                    <DialogDescription>
                      Enter the six character room code from another captain.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <Label
                      htmlFor="joinRoomCode"
                      className="text-xs text-muted-foreground"
                    >
                      Room code
                    </Label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="joinRoomCode"
                        value={joinCode}
                        onChange={(e) => {
                          setJoinCode(e.target.value.toUpperCase().slice(0, 6));
                          setError(null);
                        }}
                        placeholder="Six character code"
                        maxLength={6}
                        autoCapitalize="characters"
                        className="h-11 pl-9 font-mono tracking-[0.2em]"
                        onKeyDown={(e) => e.key === "Enter" && joinByCode()}
                      />
                    </div>
                    <Button
                      onClick={joinByCode}
                      disabled={busy || joinCode.trim().length !== 6}
                      className="h-11 w-full rounded-lg"
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          Join harbor <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                    {error && (
                      <div
                        role="alert"
                        className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300"
                      >
                        {error}
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              <AnimatePresence>
                {error && !createOpen && !joinOpen && (
                  <motion.div
                    role="alert"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-300 text-xs px-3 py-2 mb-3"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              {rooms.length > 0 && (
                <RoomFilters
                  rooms={rooms}
                  onFilteredChange={handleFilteredChange}
                  className="mb-3"
                />
              )}

              <div className="mb-4 border-t border-border/70" />

              {/* Room list */}
              <div className="space-y-2">
                {loadingRooms && rooms.length === 0 ? (
                  <div className="py-10 flex items-center justify-center text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Scanning
                    the horizon…
                  </div>
                ) : rooms.length === 0 ? (
                  <div className="py-10 text-center">
                    <div className="flex justify-center mb-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                        <ShipIcon className="h-6 w-6 text-muted-foreground" />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">
                      No harbors open yet
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Be the first to chart a new harbor above.
                    </p>
                  </div>
                ) : (
                  filteredRooms.map((room) => {
                    const isMember = room.members.some((m) => m.id === me.id);
                    const locked = room.started && !isMember;
                    const shownMembers = room.members.slice(0, 4);
                    const extraMembers = room.memberCount - shownMembers.length;
                    const diffColors = {
                      fair_winds: {
                        card: "bg-gradient-to-br from-teal-500/[0.04] to-teal-600/[0.02] dark:from-teal-400/[0.06] dark:to-teal-500/[0.02]",
                        icon: "pm-grad-primary",
                        badge:
                          "bg-teal-500/15 text-teal-700 dark:text-teal-300",
                      },
                      open_waters: {
                        card: "bg-gradient-to-br from-slate-500/[0.04] to-slate-600/[0.02] dark:from-slate-400/[0.06] dark:to-slate-500/[0.02]",
                        icon: "bg-gradient-to-br from-slate-500 to-slate-600",
                        badge:
                          "bg-slate-500/15 text-slate-700 dark:text-slate-300",
                      },
                      monsoon: {
                        card: "bg-gradient-to-br from-violet-500/[0.04] to-violet-600/[0.02] dark:from-violet-400/[0.06] dark:to-violet-500/[0.02]",
                        icon: "bg-gradient-to-br from-violet-500 to-violet-600",
                        badge:
                          "bg-violet-500/15 text-violet-700 dark:text-violet-300",
                      },
                    };
                    const dc =
                      diffColors[room.difficulty] ?? diffColors.fair_winds;
                    return (
                      <motion.div
                        key={room.id}
                        layout
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className={cn(
                          "group grid grid-cols-[auto_minmax(0,1fr)] gap-2.5 rounded-xl border border-border/70 bg-background/65 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-3 sm:p-3.5 md:grid-cols-[auto_minmax(0,1fr)_auto_auto]",
                          dc.card,
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-sm",
                            dc.icon,
                          )}
                        >
                          <ShipMark
                            level={room.started ? 1 : 0}
                            className="h-auto w-9 text-white"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="min-w-0 flex-1 break-words font-medium">
                              {normalizeRoomName(room.name)}
                            </span>
                            <span
                              className={cn(
                                "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
                                dc.badge,
                              )}
                            >
                              {difficultyConfig(room.difficulty).icon}{" "}
                              {difficultyConfig(room.difficulty).badge}
                            </span>
                          </div>
                          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="min-w-0 break-words">
                              Hosted by {room.host.displayName}
                            </span>
                            <span>·</span>
                            <RoomCodeCopy code={room.code} />
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" /> {room.memberCount}
                            </span>
                            {room.host.id === me.id && (
                              <Pill tone="gold" className="shrink-0 !px-1.5">
                                Host
                              </Pill>
                            )}
                            {!room.isPublic && (
                              <Pill tone="amber" className="shrink-0 !px-1.5">
                                Private
                              </Pill>
                            )}
                            {room.started && (
                              <Pill tone="sea" className="shrink-0 !px-1.5">
                                <span className="relative flex h-2 w-2">
                                  <span className="absolute inline-flex h-full w-full rounded-full bg-teal-400 pm-pulse-ring" />
                                  <span className="inline-flex h-2 w-2 rounded-full bg-teal-400" />
                                </span>
                                Sailing
                              </Pill>
                            )}
                          </div>
                        </div>
                        {shownMembers.length > 0 && (
                          <div className="hidden shrink-0 items-center -space-x-2 md:flex">
                            {shownMembers.map((m) => (
                              <div
                                key={m.id}
                                className="ring-2 ring-background rounded-full"
                                title={m.displayName}
                              >
                                <Avatar
                                  hue={m.avatarHue}
                                  name={m.displayName}
                                  size={26}
                                />
                              </div>
                            ))}
                            {extraMembers > 0 && (
                              <div className="ring-2 ring-background rounded-full bg-black/10 dark:bg-white/15 h-[26px] min-w-[26px] px-1 flex items-center justify-center text-[10px] font-semibold text-foreground/70">
                                +{extraMembers}
                              </div>
                            )}
                          </div>
                        )}
                        <Button
                          size="sm"
                          onClick={() => enterRoom(room)}
                          disabled={joining === room.id || locked}
                          title={
                            locked
                              ? "This voyage has already set sail"
                              : undefined
                          }
                          className="col-span-2 w-full rounded-lg sm:col-span-1 sm:w-auto"
                        >
                          {joining === room.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : locked ? (
                            "Locked"
                          ) : (
                            <>
                              Enter <ArrowRight className="h-4 w-4 ml-1" />
                            </>
                          )}
                        </Button>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </div>
          </section>

          <Dialog open={hubOpen} onOpenChange={setHubOpen}>
            <DialogContent className="p-4 sm:max-w-3xl sm:p-6">
              <DialogHeader>
                <DialogTitle>Harbor</DialogTitle>
                <DialogDescription>
                  Review activity, find captains, and continue conversations.
                </DialogDescription>
              </DialogHeader>
              <Tabs
                value={hubTab}
                onValueChange={(value) =>
                  setHubTab(value as "overview" | "captains" | "messages")
                }
                className="min-h-0"
              >
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="captains">Captains</TabsTrigger>
                  <TabsTrigger value="messages">Messages</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-3 pt-3">
                  <DailyRewardBanner
                    status={checkIn}
                    onClaim={claimCheckIn}
                    className="w-full"
                  />
                  <HarborStats meId={me.id} className="w-full" />
                  <VoyageSummaryCard legacy={legacy} className="w-full" />
                </TabsContent>

                <TabsContent value="captains" className="pt-2">
                  <div className="pm-glass rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Users className="h-4 w-4 text-teal-600 dark:text-teal-400" />{" "}
                        Captains Online
                      </h3>
                      <Pill tone="emerald">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 pm-pulse-ring" />
                          <OnlineDot online size={8} />
                        </span>{" "}
                        {totalOnline}
                      </Pill>
                    </div>
                    <ScrollArea className="h-56 pr-2">
                      {onlineUsers.length === 0 ? (
                        <div className="py-6 text-center">
                          <div className="h-12 w-12 rounded-full bg-teal-500/8 dark:bg-teal-400/10 mx-auto mb-2 flex items-center justify-center">
                            <Users className="h-5 w-5 text-teal-600/50 dark:text-teal-400/50" />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {connected
                              ? "No other captains online yet."
                              : "Connecting to the harbor…"}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {onlineUsers.map((u) => {
                            const isMe = u.id === me.id;
                            const otherLegacy = otherLegacies[u.id];
                            return (
                              <button
                                key={u.id}
                                onClick={() => !isMe && openDm(u)}
                                disabled={isMe}
                                className={cn(
                                  "w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-all duration-150",
                                  isMe
                                    ? "opacity-60 cursor-default"
                                    : "hover:bg-black/5 dark:hover:bg-white/5 hover:translate-x-0.5",
                                )}
                              >
                                <div className="relative">
                                  <Avatar
                                    hue={u.avatarHue}
                                    name={u.displayName}
                                    size={30}
                                  />
                                  <OnlineDot
                                    online
                                    size={8}
                                    className="absolute -bottom-0.5 -right-0.5 ring-2 ring-background"
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate flex items-center gap-1.5">
                                    {u.displayName}{" "}
                                    {isMe && (
                                      <span className="text-[10px] text-muted-foreground">
                                        (you)
                                      </span>
                                    )}
                                    {u.roomId && (
                                      <span className="inline-flex items-center gap-0.5 text-[9px] text-teal-600 dark:text-teal-400">
                                        <ShipIcon className="h-2.5 w-2.5" />
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground truncate">
                                    {u.roomId ? "In a harbor" : "In the lobby"}
                                  </div>
                                </div>
                                {otherLegacy && (
                                  <Pill tone="gold" className="shrink-0">
                                    <Star className="h-3 w-3" />{" "}
                                    {renownProgress(otherLegacy.renownXP).level}
                                  </Pill>
                                )}
                                {!isMe && (
                                  <MessageCircle className="h-4 w-4 text-muted-foreground/60" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                </TabsContent>

                <TabsContent value="messages" className="pt-2">
                  <div className="pm-glass flex h-[min(32rem,62dvh)] min-h-72 flex-col overflow-hidden rounded-2xl">
                    <div className="px-4 py-3 border-b border-black/5 dark:border-white/10 flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-sm font-medium">
                        {dmTarget
                          ? `Direct · ${dmTarget.displayName}`
                          : "Direct Messages"}
                      </span>
                    </div>
                    {dmTarget ? (
                      dmLoading ? (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />{" "}
                          Loading…
                        </div>
                      ) : (
                        <ChatPanel
                          socket={socket}
                          me={me}
                          mode="dm"
                          other={dmTarget}
                          key={dmTarget.id}
                          messages={dmHistory}
                        />
                      )
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-center px-6">
                        <p className="text-xs text-muted-foreground/80 leading-relaxed">
                          Pick a captain from the list above to start a private
                          conversation.
                        </p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        </div>
      </main>

      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent className="p-4 sm:max-w-md sm:p-6">
          <DialogHeader>
            <DialogTitle>Captain menu</DialogTitle>
            <DialogDescription>
              Account, appearance, progression, and help.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 p-3">
            <Avatar hue={me.avatarHue} name={me.displayName} size={44} ring />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{me.displayName}</div>
              <div className="truncate text-xs text-muted-foreground">
                @{me.username}
              </div>
            </div>
            <Pill tone="gold">
              <Star className="h-3 w-3" />
              {renownProgress(legacy.renownXP).level}
            </Pill>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/70 p-3">
            <span className="text-sm font-medium">Appearance</span>
            <ThemeToggle />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => openAccountPanel(() => setProfileOpen(true))}
            >
              <UserCircle className="h-4 w-4" />
              Profile
            </Button>
            <Button
              variant="outline"
              onClick={() => openAccountPanel(() => setLegacyOpen(true))}
            >
              <Star className="h-4 w-4" />
              Legacy
            </Button>
            <Button
              variant="outline"
              onClick={() => openAccountPanel(() => setSettingsOpen(true))}
            >
              <Settings className="h-4 w-4" />
              Settings
            </Button>
            <Button
              variant="outline"
              onClick={() => openAccountPanel(() => setDirectoryOpen(true))}
            >
              <Compass className="h-4 w-4" />
              Directory
            </Button>
            <Button
              variant="outline"
              onClick={() => openAccountPanel(() => setShortcutsOpen(true))}
            >
              <Keyboard className="h-4 w-4" />
              Shortcuts
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                openAccountPanel(() => {
                  setHubTab("overview");
                  setHubOpen(true);
                })
              }
            >
              <Gift className="h-4 w-4" />
              Check in
            </Button>
          </div>

          <Button
            variant="outline"
            className="text-rose-600 hover:text-rose-600 dark:text-rose-400"
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={legacyOpen} onOpenChange={setLegacyOpen}>
        <DialogContent className="p-4 sm:max-w-lg sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-500" />
              Captain's Legacy
            </DialogTitle>
            <DialogDescription>
              Renown carries across every voyage this account ever sails, in any
              harbor.
            </DialogDescription>
          </DialogHeader>
          <CaptainLegacyCard legacy={legacy} className="p-5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Every Renown level grants a small Gold bonus at the start of your
            next fresh voyage. It grows from the Reputation you bank on the way
            to the final round, so it only ever goes up, even on a voyage that
            ends in bankruptcy.
          </p>
        </DialogContent>
      </Dialog>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <CaptainsDirectoryDialog
        open={directoryOpen}
        onOpenChange={setDirectoryOpen}
      />

      <CaptainProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        me={me}
        onEnterRoom={(roomId) => {
          setProfileOpen(false);
          // Resolve a complete RoomSummary before calling onEnterRoom.
          api
            .joinRoomById(roomId)
            .then(({ room }) => onEnterRoom(room))
            .catch(() => {
              toast.error("Could not rejoin that harbor", {
                description:
                  "It may have been dissolved. Refresh the lobby and try again.",
              });
            });
        }}
      />
    </div>
  );
}
