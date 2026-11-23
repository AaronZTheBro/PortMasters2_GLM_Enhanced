"use client";

import { VoyageGlossary } from "./Term";

import { ShipIcon } from "./ShipVisualizer";
import { quoteDues } from "@/lib/game/engine";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { motion } from "framer-motion";
import type { Socket } from "socket.io-client";
import {
  api,
  type ChatMessage,
  type PublicUser,
  type RoomDetail,
} from "@/lib/api";
import type { VoyageCompleteEvent } from "@/lib/realtime";
import type { CaptainLegacySummary } from "@/lib/game/legacy";
import {
  BROKERS_FAVOR_UNLOCK_LEVEL,
  WORD_ON_THE_DOCKS_REWARD,
  WORD_ON_THE_DOCKS_THRESHOLD,
} from "@/lib/game/constants";
import { CLASSIC_HARBOR_RULES } from "@/lib/game/expansion";
import { meritById } from "@/lib/game/merits";
import { useRealtime } from "@/lib/use-realtime";
import type { GameState } from "@/lib/game/types";
import { usePriceHistory } from "@/lib/use-price-history";
import { useGameSession } from "@/lib/use-game-session";
import { usePhaseSync } from "@/lib/use-phase-sync";
import {
  usePlayerDetail,
  type PlayerDetailData,
} from "@/lib/use-player-detail";
import { useBarter } from "@/lib/use-barter";
import {
  useAid,
  type GrantedLoan,
  type RepaidLoan,
  type RedirectedLoanClosed,
} from "@/lib/use-aid";
import {
  useBacking,
  type BackingCovered,
  type BackingResolved,
  type OutstandingLoan,
} from "@/lib/use-backing";
import { useConvoy } from "@/lib/use-convoy";
import {
  ventureSettlementLine,
  type VentureOutcome,
  type VentureSettlement,
} from "@/lib/game/convoy";
import { useNotificationCenter } from "@/lib/use-notifications";
import { useSound } from "@/lib/use-sound";
import { PlayerDetailModal } from "./game/GameModals";
import { GameStatusPanel } from "./game/GameStatusPanel";
import { GamePhasePanel } from "./game/GamePhasePanel";
import { GameControlPanel } from "./game/GameControlPanel";
import {
  GuideModal,
  TipsModal,
  RumorBoardModal,
  TutorialModal,
  RestartConfirmModal,
  NotificationHistoryModal,
} from "./game/GameModals";
import { MembersPanel } from "./MembersPanel";
import { ChatPanel } from "./ChatPanel";
import { Avatar, MeritIcon, OnlineDot, Pill } from "./shared";
import { NotificationCenter } from "./NotificationCenter";
import { ThemeToggle } from "./ThemeToggle";
import { VoyageMilestones } from "./VoyageMilestones";
import {
  QuickActions,
  useQuickActionTrigger,
  type QuickAction,
} from "./QuickActions";
import { CaptainLogbook } from "./CaptainLogbook";
import { StrategyAdvisor } from "./StrategyAdvisor";
import { PriceHistory } from "./PriceHistory";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Anchor,
  Copy,
  Check,
  Users,
  MessageCircle,
  LifeBuoy,
  Bell,
  Palette,
  Crown,
  Compass,
  LogOut,
  Search,
  Save,
  Play,
  RotateCcw,
  BookOpen,
  GraduationCap,
  ScrollText,
  Package,
  LayoutGrid,
  Settings,
  Ellipsis,
} from "lucide-react";
import { cn, formatReputation, normalizeRoomName } from "@/lib/utils";
import { useColorPreference } from "@/lib/use-color-preference";
import {
  applyTidewatchSurge,
  claimWordOnTheDocksReward,
  clearRedirectedLoan,
  grantLoan,
  pledgeBacking,
  purchaseIntel,
  receiveBackedCoverage,
  receiveBackingOutcome,
  receiveLoan,
  receiveRepayment,
  repayLoan,
} from "@/lib/game/engine";

// Browser scoped: the onboarding guide is a "you have played this before"
// signal, not per room state, so joining a second harbor does not replay it.
const TUTORIAL_SEEN_KEY = "portmasters_tutorial_seen";

type WorkspaceTab =
  "status" | "crew" | "chat" | "milestones" | "advisor" | "prices" | "logbook";

type PrimaryWorkspaceTab = Extract<WorkspaceTab, "status" | "crew" | "chat">;
type MoreWorkspaceTab = Exclude<WorkspaceTab, PrimaryWorkspaceTab>;
type WorkspaceDestination = PrimaryWorkspaceTab | "more";

const PRIMARY_WORKSPACE_TABS: Array<{
  id: PrimaryWorkspaceTab;
  label: string;
  icon: typeof Anchor;
}> = [
  { id: "status", label: "Status", icon: Package },
  { id: "crew", label: "Crew", icon: Users },
  { id: "chat", label: "Chat", icon: MessageCircle },
];

const MORE_WORKSPACE_TABS: Array<{
  id: MoreWorkspaceTab;
  label: string;
  icon: typeof Anchor;
}> = [
  { id: "milestones", label: "Milestones", icon: Crown },
  { id: "advisor", label: "Advisor", icon: LifeBuoy },
  { id: "prices", label: "Price history", icon: Search },
  { id: "logbook", label: "Logbook", icon: ScrollText },
];

const DESKTOP_WORKSPACE_QUERY = "(min-width: 1024px) and (min-height: 600px)";

function subscribeToDesktopWorkspace(onChange: () => void) {
  const media = window.matchMedia(DESKTOP_WORKSPACE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getDesktopWorkspaceSnapshot() {
  return window.matchMedia(DESKTOP_WORKSPACE_QUERY).matches;
}

function getDesktopWorkspaceServerSnapshot() {
  return false;
}

function isMoreWorkspaceTab(tab: WorkspaceTab): tab is MoreWorkspaceTab {
  return !["status", "crew", "chat"].includes(tab);
}

export function GameRoom({
  me,
  room,
  onLeave,
}: {
  me: PublicUser;
  room:
    | RoomDetail
    | (PublicUser & {
        id: string;
        code: string;
        name: string;
        isPublic: boolean;
        host: PublicUser;
        memberCount: number;
        members: Array<PublicUser & { joinedAt: string }>;
      });
  onLeave: () => void;
}) {
  const { socket, connected, authed, onlineUsers } = useRealtime(me);
  // Sound effects are wired early so any later hook (the voyage complete
  // listener below) can reference `play` without running into a TDZ error
  // from accessing it before initialization.
  const { play } = useSound();
  const { state, act, ctx, flush, getGame, retryLoad, startingGoldBonus } =
    useGameSession(room.id, socket, true, me.id);
  const priceObservations = usePriceHistory(
    state.game,
    room.id,
    me.id,
    state.loaded,
  );
  const barter = useBarter(
    socket,
    room.id,
    authed && state.loaded,
    state.game.voyageEpoch,
    getGame,
    act,
    flush,
  );
  const convoySpending = useRef(false);
  const phaseSync = usePhaseSync(
    room.id,
    socket,
    state.loaded,
    state.game,
    getGame,
    act,
    ctx,
    flush,
    authed,
    me.id,
    startingGoldBonus,
    retryLoad,
    convoySpending,
  );

  const actInPhase: typeof act = useCallback(
    (change) => {
      if (!getGame().readyVote && !convoySpending.current) act(change);
    },
    [act, getGame],
  );

  // A loan involving me just resolved, on either side: as the helper
  // (debit my Gold, the request I funded is now gone) or as the borrower
  // (credit my Gold, record the debt).
  const onAidGranted = useCallback(
    (loan: GrantedLoan, role: "borrower" | "helper") => {
      if (role === "borrower") {
        act((g, l) =>
          receiveLoan(
            g,
            {
              id: loan.requestId,
              fromUserId: loan.helperId,
              fromName: loan.helperName,
              amount: loan.amount,
            },
            l,
          ),
        );
      } else {
        act((g, l) =>
          grantLoan(
            g,
            {
              id: loan.requestId,
              borrowerId: loan.borrowerId,
              borrowerName: loan.borrowerName,
              amount: loan.amount,
            },
            l,
          ),
        );
      }
    },
    [act],
  );
  const applyLoanSettlement = useCallback(
    (key: string, apply: (game: GameState, logs: string[]) => void) => {
      if (getGame().processedLoanSettlements?.includes(key)) return;
      act((game, logs) => {
        apply(game, logs);
        (game.processedLoanSettlements ??= []).push(key);
      });
    },
    [act, getGame],
  );

  const onAidRepaid = useCallback(
    (loan: RepaidLoan) => {
      applyLoanSettlement(`repay:${loan.debtId}`, (game, logs) =>
        receiveRepayment(game, loan.debtId, loan.amount, loan.fromName, logs),
      );
    },
    [applyLoanSettlement],
  );

  const onAidRedirectedClosed = useCallback(
    (closed: RedirectedLoanClosed) => {
      applyLoanSettlement(`redirect:${closed.debtId}`, (game, logs) =>
        clearRedirectedLoan(game, closed.debtId, closed.redirectedToName, logs),
      );
    },
    [applyLoanSettlement],
  );
  const aid = useAid(
    socket,
    room.id,
    me.id,
    onAidGranted,
    onAidRepaid,
    onAidRedirectedClosed,
  );
  const repayAid = aid.repay;

  // The server just accepted my own pledge to back
  // someone else's loan (see backing:offer in src/server/realtime.ts);
  // escrow it immediately, like any other commitment between players.
  const onBackingAccepted = useCallback(
    (loan: OutstandingLoan) => {
      if (loan.backedAmount)
        act((g, l) => pledgeBacking(g, loan.backedAmount!, l));
    },
    [act],
  );
  const onBackingResolved = useCallback(
    (resolved: BackingResolved) => {
      applyLoanSettlement(`refund:${resolved.debtId}`, (game, logs) =>
        receiveBackingOutcome(
          game,
          resolved.refundAmount,
          resolved.calledAmount,
          logs,
        ),
      );
    },
    [applyLoanSettlement],
  );

  const onBackingCovered = useCallback(
    (covered: BackingCovered) => {
      applyLoanSettlement(`coverage:${covered.debtId}`, (game, logs) =>
        receiveBackedCoverage(
          game,
          covered.amount,
          covered.backerName,
          covered.borrowerName,
          logs,
        ),
      );
    },
    [applyLoanSettlement],
  );
  const backing = useBacking(
    socket,
    room.id,
    me.id,
    onBackingAccepted,
    onBackingResolved,
    onBackingCovered,
  );

  // The harbor ledger applies the Gold even if a captain missed this toast.
  const onVentureSettled = useCallback(
    (outcome: VentureOutcome, settlements: VentureSettlement[]) => {
      const mine = settlements.find(
        (settlement) => settlement.userId === me.id,
      );
      if (mine) toast(ventureSettlementLine(outcome, mine.amount));
    },
    [me.id],
  );
  const convoy = useConvoy(
    socket,
    room.id,
    getGame,
    flush,
    convoySpending,
    onVentureSettled,
  );

  // Join this room's Socket.IO channel every time `authed` becomes true,
  // not just on mount. The socket singleton survives reconnects, but the server
  // gives every reconnect a brand new connection with no room recorded
  // against it. Without joining again here, a captain whose connection so
  // much as blips keeps looking connected, but every room scoped event
  // they send afterward (ready votes, status, barter, aid) is silently
  // dropped by the server. The room ends up with everyone "ready" and no
  // way to actually advance, with no error to explain why. authed (from
  // useRealtime) flips false then back to true on every reconnect, which
  // is exactly the signal this needs, rather than the raw socket
  // "connect" event firing before authentication has actually completed.
  useEffect(() => {
    if (!socket || !authed) return;
    socket.emit("room:join", { roomId: room.id });
  }, [socket, authed, room.id]);

  // Fires once, the moment every captain still seated in the room has
  // reached either the endgame screen or bankruptcy (see
  // maybeConcludeVoyage in src/server/realtime.ts): who was crowned Sea
  // Master, and everyone's final standing. It fetches my own Captain's
  // Legacy right after, since that's the one place its Renown XP,
  // level, and Sea Master crown count actually change. Cleared on
  // "room:restarted" so a fresh voyage's Endgame screen doesn't show the
  // previous one's standings while waiting on the new one to conclude.
  const [voyageResult, setVoyageResult] = useState<VoyageCompleteEvent | null>(
    null,
  );
  const [myLegacy, setMyLegacy] = useState<CaptainLegacySummary | null>(null);
  useEffect(() => {
    if (!socket) return;
    const onVoyageComplete = (data: VoyageCompleteEvent) => {
      if (data.roomId !== room.id) return;
      setVoyageResult(data);
      api
        .getLegacy()
        .then(({ legacy }) => setMyLegacy(legacy))
        .catch(() => {});
      if (data.replayed) return;
      const mine = data.standings.find((s) => s.userId === me.id);
      // Sound design: a crown fanfare plays first if the captain won Sea
      // Master, then the longer voyage complete chord sequence. A captain
      // who didn't win still gets the completion sound, just without the
      // fanfare. Played in sequence so they don't muddle each other.
      if (mine?.crowned) {
        play("crown");
        setTimeout(() => play("voyage_complete"), 350);
        toast.success("Crowned Sea Master!", {
          description: `Highest Reputation in the harbor this voyage: ${formatReputation(mine.reputation)}.`,
        });
      } else {
        play("voyage_complete");
      }
      if (mine?.brokersFavorUnlocked) {
        setTimeout(() => play("level_up"), 700);
        toast.success("🤝 Broker's Favor unlocked!", {
          description: `Renown Level ${BROKERS_FAVOR_UNLOCK_LEVEL} reached. The Broker owes you one, starting next voyage.`,
        });
      }
      for (const meritId of mine?.newMerits ?? []) {
        const merit = meritById(meritId);
        if (!merit) continue;
        setTimeout(() => play("notify"), 1000);
        toast.success(`Captain's Merit earned: ${merit.name}`, {
          description: merit.desc,
          icon: <MeritIcon id={merit.id} className="h-4 w-4" />,
        });
      }
    };
    const onRestarted = (data: { roomId: string }) => {
      if (data.roomId !== room.id) return;
      setVoyageResult(null);
    };
    socket.on("room:voyage_complete", onVoyageComplete);
    socket.on("room:restarted", onRestarted);
    return () => {
      socket.off("room:voyage_complete", onVoyageComplete);
      socket.off("room:restarted", onRestarted);
    };
  }, [socket, room.id, me.id, play]);

  const sendingSettlements = useRef(false);
  useEffect(() => {
    if (!authed || !socket || !state.loaded) return;
    socket.emit("aid:settlements:request", { roomId: room.id });
  }, [authed, room.id, socket, state.loaded]);

  useEffect(() => {
    if (!authed || !state.game._pendingDebtSettlements?.length) return;
    const deliver = async () => {
      if (sendingSettlements.current) return;
      sendingSettlements.current = true;
      try {
        await flush();
        const snapshot = getGame();
        for (const payment of snapshot._pendingDebtSettlements ?? []) {
          if (!(await repayAid(payment.amount, payment.debtId))) continue;
          act((game) => {
            if (game.voyageEpoch !== snapshot.voyageEpoch) return;
            game._pendingDebtSettlements = game._pendingDebtSettlements?.filter(
              ({ debtId }) => debtId !== payment.debtId,
            );
          });
        }
      } catch {
        // A later attempt can send the saved payment.
      } finally {
        sendingSettlements.current = false;
      }
    };
    void deliver();
    const retry = setInterval(() => void deliver(), 4000);
    return () => clearInterval(retry);
  }, [
    act,
    authed,
    flush,
    getGame,
    repayAid,
    state.game._pendingDebtSettlements,
  ]);

  const docksPending = Boolean(state.game._pendingDocksClaim);
  const voyageEpoch = state.game.voyageEpoch;

  useEffect(() => {
    if (!docksPending || !state.loaded || !socket || !connected || !authed)
      return;
    let active = true;
    let busy = false;
    const claim = async () => {
      if (!active || busy || !socket.connected) return;
      const game = getGame();
      if (!game._pendingDocksClaim || game.voyageEpoch !== voyageEpoch) return;
      busy = true;
      try {
        await flush();
        if (!active || getGame().voyageEpoch !== voyageEpoch) return;
        const accepted: boolean = await socket
          .timeout(4000)
          .emitWithAck("docks:claim", { roomId: room.id, voyageEpoch });
        if (active && accepted)
          act((latest) => {
            if (latest.voyageEpoch === voyageEpoch)
              latest._pendingDocksClaim = undefined;
          });
      } catch {
        // The saved claim stays pending until the server acknowledges it.
      } finally {
        busy = false;
      }
    };
    void claim();
    const retry = setInterval(() => void claim(), 4000);
    return () => {
      active = false;
      clearInterval(retry);
    };
  }, [
    act,
    authed,
    connected,
    docksPending,
    flush,
    getGame,
    room.id,
    socket,
    state.loaded,
    voyageEpoch,
  ]);

  useEffect(() => {
    if (!socket || !state.loaded) return;
    const onDocksWon = (data: {
      roomId: string;
      voyageEpoch: number;
      winnerId: string;
      winnerName?: string;
    }) => {
      const game = getGame();
      if (data.roomId !== room.id || data.voyageEpoch !== game.voyageEpoch)
        return;
      if (data.winnerId === me.id) {
        if (game.docksRewardClaimed) return;
        act((g, logs) => claimWordOnTheDocksReward(g, logs));
        toast.success("📣 Word on the Docks!", {
          description: `First to complete ${WORD_ON_THE_DOCKS_THRESHOLD} trade orders this voyage. +${WORD_ON_THE_DOCKS_REWARD} Gold.`,
        });
      } else if (data.winnerName) {
        toast("📣 Word on the Docks", {
          description: `${data.winnerName} was first to complete ${WORD_ON_THE_DOCKS_THRESHOLD} trade orders this voyage.`,
        });
      }
    };
    const onSurge = (data: { roomId: string; voyageEpoch: number }) => {
      const game = getGame();
      if (
        data.roomId !== room.id ||
        data.voyageEpoch !== game.voyageEpoch ||
        game.tidewatchSurge
      )
        return;
      act((g, logs) => applyTidewatchSurge(g, logs));
      toast("🌊 Tidewatch Alert", {
        description:
          "One more cargo lot joins the Port Merchant Exchange for the rest of this voyage.",
      });
    };
    socket.on("docks:won", onDocksWon);
    socket.on("tidewatch:surge", onSurge);
    return () => {
      socket.off("docks:won", onDocksWon);
      socket.off("tidewatch:surge", onSurge);
    };
  }, [act, getGame, me.id, room.id, socket, state.loaded]);

  const handleRepayLoan = useCallback(
    (debtId: string) => {
      actInPhase((game, logs) => repayLoan(game, debtId, logs));
    },
    [actInPhase],
  );

  const notifications = useNotificationCenter();
  const pushNotification = notifications.push;
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // colorFor threads down to every
  // panel that colors a good's name; see useColorPreference for why this
  // stays client only.
  const { colorblindSafe, setColorblindSafe, colorFor } = useColorPreference();

  const myDetail = useCallback(
    (): PlayerDetailData => ({
      money: state.game.money,
      score: state.game.score,
      shipLevel: state.game.shipLevel,
      round: state.game.currentRound,
      phase: state.game.phase,
      gameOver: state.game.gameOver,
      inventory: state.game.inventory,
      workers: state.game.workers,
      equippedModules: state.game.equippedModules,
      logs: state.logs.slice(-30),
    }),
    [state.game, state.logs],
  );
  const playerDetail = usePlayerDetail(socket, room.id, myDetail);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const [guideOpen, setGuideOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);
  const [rumorOpen, setRumorOpen] = useState(false);
  const [tutOpen, setTutOpen] = useState(false);
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);

  const [roomMessages, setRoomMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<
    Array<PublicUser & { joinedAt?: string }>
  >(room.members ?? []);

  // The host can change (the original one left before the voyage even
  // started, say), so this is kept live from the room:members broadcast
  // rather than frozen at whatever it was when this component mounted.
  // The member list is also kept live here so the DM candidate list and
  // player detail modal always see the current roster, not just the
  // snapshot that arrived via REST on mount.
  const [hostId, setHostId] = useState<string>(room.host.id);
  // The mute state rides the same room:members broadcast
  // hostId already reads live from; whether I'm muted only ever matters to
  // my own client, which is why this derives amIMuted below rather than
  // exposing the whole list past what MembersPanel needs to render it.
  const [mutedUserIds, setMutedUserIds] = useState<string[]>([]);
  useEffect(() => {
    if (!socket) return;
    const onMembers = (data: {
      roomId: string;
      members?: Array<PublicUser & { joinedAt?: string }>;
      hostId: string | null;
      mutedUserIds?: string[];
    }) => {
      if (data.roomId !== room.id) return;
      if (data.hostId) setHostId(data.hostId);
      if (data.members) setMembers(data.members);
      if (data.mutedUserIds) setMutedUserIds(data.mutedUserIds);
    };
    socket.on("room:members", onMembers);
    return () => {
      socket.off("room:members", onMembers);
    };
  }, [socket, room.id]);
  const isHost = hostId === me.id;
  const amIMuted = mutedUserIds.includes(me.id);

  // DM state
  const [dmTarget, setDmTarget] = useState<PublicUser | null>(null);
  const [dmHistory, setDmHistory] = useState<ChatMessage[]>([]);
  const dmRequest = useRef(0);

  // Which chat tab is showing, lifted out of the Tabs component itself so
  // a notification click can jump the user straight to the right one.
  const [roomDraft, setRoomDraft] = useState("");
  const [directDrafts, setDirectDrafts] = useState<Record<string, string>>({});
  const [chatTab, setChatTab] = useState<"room" | "dm">("room");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("status");
  const [moreWorkspaceTab, setMoreWorkspaceTab] =
    useState<MoreWorkspaceTab>("milestones");
  const [mobileWorkspaceOpen, setMobileWorkspaceOpen] = useState(false);
  const [desktopWorkspaceOpen, setDesktopWorkspaceOpen] = useState(true);
  const isDesktopWorkspace = useSyncExternalStore(
    subscribeToDesktopWorkspace,
    getDesktopWorkspaceSnapshot,
    getDesktopWorkspaceServerSnapshot,
  );
  const workspaceRef = useRef<HTMLElement | null>(null);
  const workspaceButtonRef = useRef<HTMLButtonElement | null>(null);
  const workspaceOpen = isDesktopWorkspace
    ? desktopWorkspaceOpen
    : mobileWorkspaceOpen;
  const [roomOptionsOpen, setRoomOptionsOpen] = useState(false);

  const openWorkspace = useCallback(
    (tab: WorkspaceTab) => {
      setWorkspaceTab(tab);
      if (isMoreWorkspaceTab(tab)) setMoreWorkspaceTab(tab);

      if (isDesktopWorkspace) {
        setMobileWorkspaceOpen(false);
        setDesktopWorkspaceOpen(true);
        requestAnimationFrame(() => {
          workspaceRef.current?.focus({ preventScroll: true });
        });
      } else {
        setMobileWorkspaceOpen(true);
      }
    },
    [isDesktopWorkspace],
  );

  const openDm = useCallback(
    async (user: PublicUser) => {
      if (user.id === me.id) return;
      setWorkspaceTab("chat");
      const request = ++dmRequest.current;
      setDmHistory([]);
      setDmTarget(user);
      try {
        const { messages } = await api.getDmHistory(user.id);
        if (dmRequest.current === request) setDmHistory(messages);
      } catch {
        if (dmRequest.current === request) setDmHistory([]);
      }
    },
    [me.id],
  );

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_WORKSPACE_QUERY);
    const closeMobileWorkspace = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileWorkspaceOpen(false);
    };
    media.addEventListener("change", closeMobileWorkspace);
    return () => {
      media.removeEventListener("change", closeMobileWorkspace);
    };
  }, []);

  // Load room detail (members + chat history) on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { room: detail, messages } = await api.getRoom(room.id);
        if (!alive) return;
        setRoomMessages(messages);
        setMembers(detail.members);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [room.id]);

  // Pop up a 15 second notification for every action's worth of new ledger
  // entries, grouped together. A single action like ending a round can
  // write out half a dozen lines at once, and that should read as one
  // event, not a flood of separate popups. It mirrors into the ledger
  // itself at the same time since state.logs already holds the full
  // history. Rendered as separate stacked lines (not one string joined
  // with "\n") since a toast's default CSS collapses literal newlines.
  //
  // Driven by state.newLines (the lines the reducer's own APPLY case just
  // added) rather than diffing state.logs.length against a remembered
  // count. The length diff used to be how this worked, and it quietly broke
  // for good the moment a voyage's ledger reached its 500 entry cap. Once
  // logs.length pins at 500, trimming one entry off the front for every one
  // pushed onto the back, the length never grows again, so every action
  // from then on read as "nothing new" and stopped popping a toast at all
  // (the permanent ledger panel kept recording them the whole time, since
  // it just renders state.logs directly). newLines already knows exactly
  // what a given action added, independent of how the array is trimmed.
  useEffect(() => {
    if (!state.loaded) return;
    const lines = state.newLines.filter((l) => l.trim().length > 0);
    if (lines.length === 0) return;
    pushNotification({
      icon: "📜",
      title: "Captain's Ledger",
      lines,
      fromLedger: true,
    });
  }, [state.newLines, state.loaded, pushNotification]);

  // Every room or direct message gets its own 15 second notification too,
  // regardless of which chat tab is currently open, so it's never missed.
  // Clicking it jumps straight to the conversation it came from.
  useEffect(() => {
    if (!socket) return;
    const onRoomMsg = (data: { roomId: string; message: ChatMessage }) => {
      if (data.roomId !== room.id) return;
      setRoomMessages((previous) =>
        previous.some((message) => message.id === data.message.id)
          ? previous
          : [
              ...previous,
              {
                ...data.message,
                mine: data.message.sender.id === me.id,
              },
            ],
      );
      if (data.message.sender.id === me.id) return;
      pushNotification({
        icon: "⚓",
        title: `${data.message.sender.displayName} · Harbor`,
        lines: [data.message.content],
        onActivate: () => {
          setChatTab("room");
          openWorkspace("chat");
        },
      });
    };
    const onDm = (message: ChatMessage) => {
      const peerId =
        message.sender.id === me.id ? message.recipient?.id : message.sender.id;
      if (peerId && peerId === dmTarget?.id) {
        setDmHistory((previous) =>
          previous.some((item) => item.id === message.id)
            ? previous
            : [
                ...previous,
                {
                  ...message,
                  mine: message.sender.id === me.id,
                },
              ],
        );
      }
      if (message.sender.id === me.id) return;
      pushNotification({
        icon: "✉️",
        title: `${message.sender.displayName} · Direct`,
        lines: [message.content],
        onActivate: () => {
          setChatTab("dm");
          openDm(message.sender);
          openWorkspace("chat");
        },
      });
    };
    socket.on("chat:room", onRoomMsg);
    socket.on("chat:dm", onDm);
    return () => {
      socket.off("chat:room", onRoomMsg);
      socket.off("chat:dm", onDm);
    };
  }, [
    socket,
    room.id,
    me.id,
    dmTarget?.id,
    pushNotification,
    openDm,
    openWorkspace,
  ]);

  // First time tutorial hint.
  //
  // This flag was read but never written anywhere in the app, so the guard was
  // always false and the guide reopened every time the room returned to phase
  // 0. A restart does exactly that (restartGame calls showWelcome, which sets
  // phase 0), which is why the guide replayed mid session. Recording the flag
  // the moment the guide is dismissed is what actually makes it "first time".
  // The ref is a second guard so it can fire at most once per mount even
  // before the write lands.
  const autoTutorialFired = useRef(false);
  useEffect(() => {
    if (autoTutorialFired.current) return;
    const seen =
      typeof window !== "undefined"
        ? localStorage.getItem(TUTORIAL_SEEN_KEY)
        : null;
    if (!seen && state.loaded && state.game.phase === 0) {
      autoTutorialFired.current = true;
      const t = setTimeout(() => setTutOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, [state.loaded, state.game.phase]);

  // Dismissing the guide, however it was opened, is what marks it seen.
  // Wrapped in try/catch because localStorage throws outright in private
  // browsing on some engines, and a storage failure must not break the modal.
  const handleTutorialOpenChange = useCallback((open: boolean) => {
    setTutOpen(open);
    if (!open && typeof window !== "undefined") {
      try {
        localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
      } catch {
        /* storage unavailable; the guide simply offers itself again */
      }
    }
  }, []);

  const handleSave = useCallback(async () => {
    try {
      await flush();
      play("success");
      toast.success("Progress saved", {
        description: "Your voyage is recorded on the server.",
      });
    } catch (error) {
      play("error");
      toast.error("Save failed", {
        description:
          error instanceof Error ? error.message : "Could not save the voyage.",
      });
    }
  }, [flush, play]);

  const handleNext = useCallback(() => {
    play("click");
    if (!barter.busy && !convoySpending.current) void phaseSync.markReady();
  }, [barter.busy, phaseSync, play]);

  const handleSetSail = useCallback(() => {
    play("voyage_start");
    phaseSync.startGame();
  }, [phaseSync, play]);

  const handleRestart = useCallback(() => {
    if (!isHost) {
      toast.error("Only the host can restart the voyage");
      return;
    }
    setRestartConfirmOpen(true);
  }, [isHost]);

  const confirmRestart = useCallback(() => {
    phaseSync.restartVoyage();
  }, [phaseSync]);

  // Keyboard shortcuts (preserved from original).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        handleSave();
      } else if (e.ctrlKey && e.key === "n") {
        e.preventDefault();
        handleNext();
      } else if (e.ctrlKey && e.key === "r") {
        e.preventDefault();
        handleRestart();
      } else if (e.key === "F1") {
        e.preventDefault();
        setGuideOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave, handleNext, handleRestart]);

  const [codeCopied, setCodeCopied] = useState(false);

  function copyCode() {
    navigator.clipboard?.writeText(room.code).then(
      () => {
        toast.success("Room code copied", { description: room.code });
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 1500);
      },
      () => {},
    );
  }

  // Map game phase to a CSS tint class for the phase panel background.
  function phaseTintClass(phase: number | string): string {
    if (phase === "endgame") return "pm-phase-tint-endgame";
    if (phase === "bankruptcy") return "pm-phase-tint-bankruptcy";
    if (phase === 0) return ""; // lobby state
    if (phase === 1) return "pm-phase-tint-purchase";
    if (phase === 2) return "pm-phase-tint-settlement";
    if (phase === 3) return "pm-phase-tint-production";
    if (phase === 4) return "pm-phase-tint-settlement"; // barter phase
    if (phase === 5) return "pm-phase-tint-settlement"; // settlement phase
    return "";
  }

  async function handleLeave() {
    try {
      await flush();
    } catch {
      /* ignore */
    }
    try {
      await api.leaveRoom(room.id);
      // Only once membership is genuinely gone. The REST route above runs in a
      // Next request and cannot reach the socket server, so this is what tells
      // the harbor to drop this captain from the live roster and clear their
      // open barter offers and aid request; without it they linger on everyone
      // else's roster until their socket happens to drop.
      //
      // Deliberately inside the try, after the await: if the leave failed, the
      // captain is still a member and the room's ready check still counts them,
      // so announcing a departure that did not happen would be worse than
      // staying quiet.
      socket?.emit("room:leave", { roomId: room.id });
    } catch {
      /* ignore */
    }
    onLeave();
  }

  // Renown (Captain's Legacy) is server side, account wide data, unlike
  // the rest of the detail popup (cargo, workers, log), which is relayed
  // peer to peer and only available while that captain's own client is
  // connected and responsive. Fetched fresh on every click rather than
  // cached indefinitely, same as playerDetail.requestDetail below, so a
  // captain who just finished another voyage elsewhere shows their
  // current standing.
  const [otherLegacy, setOtherLegacy] = useState<
    Record<string, CaptainLegacySummary>
  >({});
  const handleSelectPlayer = useCallback(
    (userId: string) => {
      setSelectedPlayerId(userId);
      playerDetail.requestDetail(userId);
      api
        .getLegacyFor(userId)
        .then(({ legacy }) =>
          setOtherLegacy((prev) => ({ ...prev, [userId]: legacy })),
        )
        .catch(() => {});
    },
    [playerDetail],
  );

  const onlineInLobby = onlineUsers.filter((u) => u.id !== me.id);

  // Quick actions remain available from the keyboard and room options.
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const quickActions: QuickAction[] = useMemo(
    () => [
      {
        id: "guide",
        label: "Game guide",
        icon: BookOpen,
        group: "Help",
        shortcut: "F1",
        action: () => setGuideOpen(true),
      },
      {
        id: "tutorial",
        label: "New player tutorial",
        icon: GraduationCap,
        group: "Help",
        action: () => setTutOpen(true),
      },
      {
        id: "tips",
        label: "Strategy tips",
        icon: LifeBuoy,
        group: "Help",
        action: () => setTipsOpen(true),
      },
      {
        id: "rumors",
        label: "Rumor board",
        icon: Compass,
        group: "Help",
        action: () => setRumorOpen(true),
      },
      {
        id: "save",
        label: "Save progress",
        icon: Save,
        group: "Voyage",
        shortcut: "Ctrl+S",
        action: handleSave,
      },
      {
        id: "next",
        label: "Advance phase",
        icon: Play,
        group: "Voyage",
        shortcut: "Ctrl+N",
        action: handleNext,
        disabled: state.game.phase === 0 || state.game.gameOver,
      },
      {
        id: "restart",
        label: "Restart voyage",
        icon: RotateCcw,
        group: "Voyage",
        shortcut: "Ctrl+R",
        action: handleRestart,
        disabled: !isHost,
      },
      {
        id: "status",
        label: "Captain status",
        icon: Package,
        group: "Workspace",
        action: () => openWorkspace("status"),
      },
      {
        id: "crew",
        label: "Harbor crew",
        icon: Users,
        group: "Workspace",
        action: () => openWorkspace("crew"),
      },
      {
        id: "chat",
        label: "Harbor chat",
        icon: MessageCircle,
        group: "Workspace",
        action: () => {
          setChatTab("room");
          openWorkspace("chat");
        },
      },
      {
        id: "direct",
        label: "Direct messages",
        icon: Compass,
        group: "Workspace",
        action: () => {
          setChatTab("dm");
          openWorkspace("chat");
        },
      },
      {
        id: "milestones",
        label: "Voyage milestones",
        icon: Crown,
        group: "Workspace",
        action: () => openWorkspace("milestones"),
      },
      {
        id: "advisor",
        label: "Strategy advisor",
        icon: LifeBuoy,
        group: "Workspace",
        action: () => openWorkspace("advisor"),
      },
      {
        id: "prices",
        label: "Price history",
        icon: Search,
        group: "Workspace",
        action: () => openWorkspace("prices"),
      },
      {
        id: "logbook",
        label: "Captain logbook",
        icon: ScrollText,
        group: "Workspace",
        action: () => openWorkspace("logbook"),
      },
    ],
    [
      handleNext,
      handleRestart,
      handleSave,
      isHost,
      openWorkspace,
      state.game.gameOver,
      state.game.phase,
    ],
  );
  const openQuickActions = useCallback(
    () => setQuickActionsOpen(true),
    [setQuickActionsOpen],
  );
  useQuickActionTrigger(openQuickActions);

  if (state.loadError && !state.loaded) {
    return (
      <main className="pm-canvas grid min-h-dvh place-items-center p-4 text-center">
        <div role="alert" className="space-y-3">
          <p>Could not load your voyage.</p>
          <div className="flex justify-center gap-2">
            <Button onClick={retryLoad}>Try again</Button>
            <Button variant="outline" onClick={onLeave}>
              Return to harbor list
            </Button>
          </div>
        </div>
      </main>
    );
  }
  if (!state.loaded) {
    return (
      <div className="pm-canvas min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground flex items-center gap-2">
          <ShipIcon className="h-5 w-5 animate-pulse text-teal-500" /> Weighing
          anchor…
        </div>
      </div>
    );
  }

  const workspaceDestination: WorkspaceDestination = isMoreWorkspaceTab(
    workspaceTab,
  )
    ? "more"
    : workspaceTab;
  const selectedMoreWorkspace =
    MORE_WORKSPACE_TABS.find(({ id }) => id === moreWorkspaceTab) ??
    MORE_WORKSPACE_TABS[0];
  const MoreWorkspaceIcon = selectedMoreWorkspace.icon;

  const workspacePanel = (
    <Tabs
      value={workspaceDestination}
      onValueChange={(value) => {
        const destination = value as WorkspaceDestination;
        if (destination === "more") {
          setWorkspaceTab(moreWorkspaceTab);
          return;
        }
        setWorkspaceTab(destination);
      }}
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-2xl p-2",
        isDesktopWorkspace
          ? "pm-glass ring-1 ring-black/[0.03] dark:ring-white/[0.06]"
          : "border border-border/70 bg-muted/20",
      )}
    >
      <TabsList className="grid h-11 w-full shrink-0 grid-cols-4 gap-1">
        {PRIMARY_WORKSPACE_TABS.map(({ id, label, icon: Icon }) => (
          <TabsTrigger
            key={id}
            value={id}
            className="h-9 min-w-0 gap-1 px-1 text-[11px]"
            aria-label={label}
            title={label}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="max-w-full truncate">{label}</span>
          </TabsTrigger>
        ))}
        <TabsTrigger
          value="more"
          className="h-9 min-w-0 gap-1 px-1 text-[11px]"
          aria-label="More workspace tools"
          title="More workspace tools"
        >
          <Ellipsis className="h-3.5 w-3.5" />
          <span>More</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent
        value="status"
        className="mt-0 min-h-0 flex-1 overflow-hidden"
      >
        <div className="h-full p-1">
          <GameStatusPanel
            game={state.game}
            logs={state.logs}
            onRepayLoan={handleRepayLoan}
            waiting={phaseSync.waiting}
            convoy={convoy}
            myUserId={me.id}
            colorFor={colorFor}
          />
        </div>
      </TabsContent>

      <TabsContent value="crew" className="mt-0 min-h-0 flex-1 overflow-hidden">
        <div className="h-full p-1">
          <MembersPanel
            socket={socket}
            roomId={room.id}
            me={me}
            initialMembers={members}
            hostId={hostId}
            onSelectPlayer={handleSelectPlayer}
          />
        </div>
      </TabsContent>

      <TabsContent value="chat" className="mt-0 min-h-0 flex-1 overflow-hidden">
        <Tabs
          value={chatTab}
          onValueChange={(value) => setChatTab(value as "room" | "dm")}
          className="h-full min-h-0"
        >
          <TabsList className="mx-1 mt-1 grid h-9 w-auto shrink-0 grid-cols-2">
            <TabsTrigger value="room" className="text-xs">
              <MessageCircle className="h-3.5 w-3.5" /> Harbor
            </TabsTrigger>
            <TabsTrigger value="dm" className="text-xs">
              <Compass className="h-3.5 w-3.5" /> Direct
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="room"
            className="mt-0 min-h-0 flex-1 overflow-hidden"
          >
            <ChatPanel
              socket={socket}
              me={me}
              mode="room"
              roomId={room.id}
              initialMessages={roomMessages}
              disabled={amIMuted}
              draft={roomDraft}
              onDraftChange={setRoomDraft}
            />
          </TabsContent>
          <TabsContent
            value="dm"
            className="mt-0 min-h-0 flex-1 overflow-hidden"
          >
            <DmTab
              socket={socket}
              me={me}
              target={dmTarget}
              history={dmHistory}
              draft={dmTarget ? (directDrafts[dmTarget.id] ?? "") : ""}
              onDraftChange={(value) => {
                if (dmTarget)
                  setDirectDrafts((drafts) => ({
                    ...drafts,
                    [dmTarget.id]: value,
                  }));
              }}
              candidates={[
                ...members.map((member) => ({
                  ...member,
                  roomId: room.id,
                })),
                ...onlineInLobby,
              ]}
              onPick={openDm}
              onClear={() => {
                dmRequest.current++;
                setDmHistory([]);
                setDmTarget(null);
              }}
            />
          </TabsContent>
        </Tabs>
      </TabsContent>

      <TabsContent
        value="more"
        className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="shrink-0 p-1 pb-2">
          <label htmlFor="workspace-more-view" className="sr-only">
            Choose another workspace view
          </label>
          <div className="flex items-center rounded-lg border border-border/70 bg-background/70">
            <MoreWorkspaceIcon
              className="ml-3 h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <select
              id="workspace-more-view"
              value={moreWorkspaceTab}
              onChange={(event) => {
                const tab = event.target.value as MoreWorkspaceTab;
                setMoreWorkspaceTab(tab);
                setWorkspaceTab(tab);
              }}
              className="h-10 min-w-0 flex-1 cursor-pointer bg-transparent px-2 text-sm outline-none"
              aria-label="More workspace view"
            >
              {MORE_WORKSPACE_TABS.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="pm-scroll min-h-0 flex-1 overflow-y-auto p-1">
          {moreWorkspaceTab === "milestones" && (
            <VoyageMilestones game={state.game} />
          )}
          {moreWorkspaceTab === "advisor" && (
            <StrategyAdvisor
              game={state.game}
              userId={me.id}
              roomId={room.id}
            />
          )}
          {moreWorkspaceTab === "prices" && (
            <PriceHistory
              game={state.game}
              observations={priceObservations}
              colorFor={colorFor}
            />
          )}
          {moreWorkspaceTab === "logbook" && (
            <CaptainLogbook
              userId={me.id}
              roomId={room.id}
              voyageEpoch={state.game.voyageEpoch}
            />
          )}
        </div>
      </TabsContent>
    </Tabs>
  );

  const helpRules =
    state.game.phase === 0 ? CLASSIC_HARBOR_RULES : state.game.rulesVersion;
  const helpSpecialties = state.game.specialties;

  const view = (
    <div className="pm-canvas flex h-dvh min-h-0 w-full flex-col overflow-hidden">
      <header className="z-30 shrink-0 px-2 py-2 sm:px-4 sm:py-3">
        <div className="pm-glass-strong mx-auto flex max-w-[1440px] items-center justify-between gap-2 rounded-2xl px-2.5 py-2 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <div className="pm-grad-primary hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm shadow-teal-500/20 min-[380px]:flex sm:h-10 sm:w-10">
              <Anchor className="h-4 w-4 text-white sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="min-w-0 flex-1 truncate text-base font-bold leading-tight tracking-tight">
                  {normalizeRoomName(room.name)}
                </h1>
                <Pill tone="sea" className="hidden shrink-0 sm:inline-flex">
                  <Users className="h-3 w-3" /> {members.length}
                </Pill>
                {isHost && (
                  <Pill tone="gold" className="hidden shrink-0 md:inline-flex">
                    <Crown className="h-3 w-3" /> Host
                  </Pill>
                )}
              </div>
              <button
                type="button"
                onClick={copyCode}
                className={cn(
                  "pm-pressable text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 px-1.5 py-0.5 -mx-1.5 rounded-md transition-colors",
                  codeCopied &&
                    "pm-copy-flash text-teal-600 dark:text-teal-400",
                )}
              >
                <span className="font-mono tracking-widest">{room.code}</span>
                {codeCopied ? (
                  <Check className="h-3 w-3 text-teal-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>
          {state.game.phase !== 0 && !state.game.gameOver && (
            <div
              className="hidden min-w-0 flex-wrap gap-x-4 gap-y-1 px-2 text-xs md:flex"
              aria-label="Round status"
            >
              <span>
                Round <strong>{state.game.currentRound}</strong> of{" "}
                {state.game.maxRounds}
              </span>
              <span>
                <strong>{state.game.money}</strong> Gold
              </span>
              {[1, "barter", "worker_mgmt", 2, 3].includes(
                state.game.phase,
              ) && (
                <span>
                  Due <strong>{quoteDues(state.game).total}</strong> Gold
                </span>
              )}
            </div>
          )}
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <Pill tone="emerald" className="hidden lg:inline-flex">
              <OnlineDot online={connected && authed} size={8} />{" "}
              {connected && authed ? "Live" : "Linking…"}
            </Pill>
            <Button
              variant="ghost"
              size="sm"
              className="relative h-9 w-9 rounded-lg p-0"
              onClick={() => {
                setNotificationsOpen(true);
                notifications.markAllRead();
              }}
              aria-label="Open notifications"
              title="Notifications"
            >
              <Bell className="h-4 w-4" />
              {notifications.unreadCount > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white">
                  {notifications.unreadCount > 9
                    ? "9+"
                    : notifications.unreadCount}
                </span>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              ref={workspaceButtonRef}
              className="size-11 rounded-lg p-0"
              onClick={() => {
                if (isDesktopWorkspace)
                  setDesktopWorkspaceOpen((open) => !open);
                else openWorkspace(workspaceTab);
              }}
              aria-expanded={workspaceOpen}
              aria-controls={workspaceOpen ? "roomWorkspace" : undefined}
              aria-label={workspaceOpen ? "Hide workspace" : "Show workspace"}
              title={workspaceOpen ? "Hide workspace" : "Show workspace"}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 rounded-lg p-0"
              onClick={() => setRoomOptionsOpen(true)}
              aria-label="Open room options"
              title="Room options"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="pm-room-bg mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col px-2 pb-4 sm:px-4">
        <div className="pm-room-grid grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-3">
          <div
            className={cn(
              "order-1 flex min-h-0 min-w-0 flex-col gap-3 transition-colors duration-300",
              phaseTintClass(state.game.phase),
            )}
          >
            <GamePhasePanel
              flush={flush}
              logs={state.logs}
              game={state.game}
              context={ctx}
              act={actInPhase}
              members={members}
              myUserId={me.id}
              isHost={isHost}
              phaseSync={phaseSync}
              barter={barter}
              aid={aid}
              backing={backing}
              voyageResult={
                voyageResult?.voyageEpoch === state.game.voyageEpoch
                  ? voyageResult
                  : null
              }
              myLegacy={myLegacy}
              onRestart={handleRestart}
              onShowRumors={() => setRumorOpen(true)}
              onShowTutorial={() => setTutOpen(true)}
              colorFor={colorFor}
            />
            <div className="shrink-0">
              {state.game.phase !== 0 && phaseSync.startError && (
                <p
                  role="alert"
                  className="px-3 py-1 text-sm text-rose-700 dark:text-rose-300"
                >
                  {phaseSync.startError}
                </p>
              )}
              <GameControlPanel
                game={state.game}
                saveStatus={state.saveStatus}
                nextBusy={barter.busy || convoy.busy}
                isHost={isHost}
                onSetSail={handleSetSail}
                onNextPhase={handleNext}
                onGuide={() => setGuideOpen(true)}
                onSave={handleSave}
                onRestart={handleRestart}
                onShowTutorial={() => setTutOpen(true)}
                waiting={phaseSync.waiting}
                readyCount={phaseSync.readyCount}
                requiredCount={phaseSync.requiredCount}
                onCancelReady={phaseSync.cancelReady}
              />
            </div>
          </div>

          {isDesktopWorkspace && desktopWorkspaceOpen && (
            <aside
              id="roomWorkspace"
              ref={workspaceRef}
              className="order-2 min-h-0 min-w-0"
              aria-label="Room workspace"
              tabIndex={-1}
            >
              {workspacePanel}
            </aside>
          )}
        </div>
      </main>

      {!isDesktopWorkspace && (
        <Dialog
          open={mobileWorkspaceOpen}
          onOpenChange={setMobileWorkspaceOpen}
        >
          <DialogContent
            id="roomWorkspace"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              workspaceButtonRef.current?.focus();
            }}
            className="h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] rounded-2xl p-3 sm:h-[min(48rem,calc(100dvh-2rem))] sm:max-w-2xl sm:p-4 [&>div]:flex [&>div]:min-h-0 [&>div]:flex-col [&>div]:gap-3 [&>div]:overflow-hidden"
          >
            <DialogHeader className="shrink-0 pr-8 text-left">
              <DialogTitle>Room workspace</DialogTitle>
              <DialogDescription>
                Status, crew, chat, and voyage tools.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1">{workspacePanel}</div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={roomOptionsOpen} onOpenChange={setRoomOptionsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Room options</DialogTitle>
            <DialogDescription>
              Manage appearance and session controls for this room.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-black/5 p-3 dark:border-white/10">
              <Avatar hue={me.avatarHue} name={me.displayName} size={36} ring />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{me.displayName}</p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <OnlineDot online={connected && authed} size={7} />
                  {connected && authed ? "Connected" : "Connecting"}
                  {isHost ? " · Host" : ""}
                </p>
              </div>
              <Pill tone="sea">
                <Users className="h-3 w-3" /> {members.length}
              </Pill>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-black/5 p-3 dark:border-white/10">
              <div>
                <p className="text-sm font-medium">Theme</p>
                <p className="text-xs text-muted-foreground">
                  Choose a comfortable display.
                </p>
              </div>
              <ThemeToggle />
            </div>

            <Button
              variant="outline"
              className={cn(
                "h-auto w-full justify-start gap-3 rounded-xl px-3 py-3 text-left",
                colorblindSafe &&
                  "border-teal-500/30 bg-teal-500/5 text-teal-700 dark:text-teal-300",
              )}
              onClick={() => setColorblindSafe(!colorblindSafe)}
            >
              <Palette className="h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  Accessible goods colors
                </span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {colorblindSafe ? "Currently enabled" : "Currently disabled"}
                </span>
              </span>
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start gap-3 rounded-xl"
              onClick={() => {
                setRoomOptionsOpen(false);
                requestAnimationFrame(openQuickActions);
              }}
            >
              <Search className="h-4 w-4" /> Open commands
            </Button>

            <Button
              variant="ghost"
              className="w-full justify-start gap-3 rounded-xl text-rose-600 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-400"
              onClick={() => {
                setRoomOptionsOpen(false);
                void handleLeave();
              }}
            >
              <LogOut className="h-4 w-4" /> Leave room
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <GuideModal
        open={guideOpen}
        onOpenChange={setGuideOpen}
        difficulty={state.game.difficulty}
        rulesVersion={helpRules}
        specialties={helpSpecialties}
      />
      <TipsModal
        open={tipsOpen}
        onOpenChange={setTipsOpen}
        difficulty={state.game.difficulty}
        rulesVersion={helpRules}
        specialties={helpSpecialties}
      />
      <RumorBoardModal
        open={rumorOpen}
        onOpenChange={setRumorOpen}
        game={state.game}
        locked={phaseSync.waiting}
        onBuy={(item) => actInPhase((g, l) => purchaseIntel(g, l, item))}
      />
      <TutorialModal
        open={tutOpen}
        onOpenChange={handleTutorialOpenChange}
        difficulty={state.game.difficulty}
        rulesVersion={helpRules}
        specialties={helpSpecialties}
      />
      <RestartConfirmModal
        open={restartConfirmOpen}
        onOpenChange={setRestartConfirmOpen}
        onConfirm={confirmRestart}
      />
      <NotificationHistoryModal
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        items={notifications.items}
      />
      <NotificationCenter
        current={notifications.current}
        dismiss={notifications.dismissCurrent}
      />
      <PlayerDetailModal
        open={selectedPlayerId !== null}
        onOpenChange={(v) => {
          if (!v) setSelectedPlayerId(null);
        }}
        player={
          selectedPlayerId
            ? (members.find((m) => m.id === selectedPlayerId) ?? null)
            : null
        }
        isMe={selectedPlayerId === me.id}
        difficulty={state.game.difficulty}
        rulesVersion={state.game.rulesVersion}
        specialties={state.game.specialties}
        colorFor={colorFor}
        detail={
          selectedPlayerId ? playerDetail.detail[selectedPlayerId] : undefined
        }
        loading={
          selectedPlayerId
            ? Boolean(playerDetail.loading[selectedPlayerId])
            : false
        }
        legacy={selectedPlayerId ? otherLegacy[selectedPlayerId] : undefined}
      />

      {/* Quick Actions command palette (Ctrl+K) */}
      <QuickActions
        open={quickActionsOpen}
        onClose={() => setQuickActionsOpen(false)}
        actions={quickActions}
      />

      {/* Floating help when bankrupt / endgame */}
      {(state.game.phase === "bankruptcy" ||
        state.game.phase === "endgame") && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => setTipsOpen(true)}
          className="fixed bottom-5 right-5 pm-grad-amber text-white rounded-full h-12 w-12 flex items-center justify-center shadow-lg z-40"
          title="Strategy tips"
        >
          <LifeBuoy className="h-5 w-5" />
        </motion.button>
      )}
    </div>
  );
  return (
    <VoyageGlossary value={state.game.rulesVersion}>{view}</VoyageGlossary>
  );
}

function DmTab({
  socket,
  me,
  target,
  history,
  candidates,
  onPick,
  onClear,
  draft,
  onDraftChange,
}: {
  socket: Socket | null;
  me: PublicUser;
  target: PublicUser | null;
  history: ChatMessage[];
  candidates: Array<PublicUser & { roomId?: string | null }>;
  onPick: (u: PublicUser) => void;
  onClear: () => void;
  draft: string;
  onDraftChange: (value: string) => void;
}) {
  // Deduplicate candidates by id, exclude self.
  const seen = new Map<string, PublicUser & { roomId?: string | null }>();
  for (const c of candidates)
    if (c.id !== me.id && !seen.has(c.id)) seen.set(c.id, c);
  const list = Array.from(seen.values());

  if (target) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-3 py-2 border-b border-black/5 dark:border-white/10 flex items-center gap-2">
          <Avatar hue={target.avatarHue} name={target.displayName} size={24} />
          <span className="text-xs font-medium truncate">
            {target.displayName}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-[11px]"
            onClick={onClear}
          >
            Switch
          </Button>
        </div>
        <div className="flex-1 min-h-0">
          <ChatPanel
            key={target.id}
            socket={socket}
            me={me}
            mode="dm"
            other={target}
            initialMessages={history}
            draft={draft}
            onDraftChange={onDraftChange}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-black/5 dark:border-white/10 text-[11px] text-muted-foreground">
        Pick a captain to message privately
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {list.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-6 px-4">
              No other captains available right now. They'll appear here once
              they're online.
            </p>
          ) : (
            list.map((u) => (
              <button
                key={u.id}
                onClick={() => onPick(u)}
                className="pm-pressable w-full flex items-center gap-2.5 p-2 rounded-lg text-left hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Avatar hue={u.avatarHue} name={u.displayName} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {u.displayName}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    @{u.username}
                  </div>
                </div>
                <MessageCircle className="h-4 w-4 text-muted-foreground/60" />
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
