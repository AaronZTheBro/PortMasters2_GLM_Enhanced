// Realtime events share the app's HTTP server, origin, and port.
// This service manages sessions, presence, rooms, shared voyage events,
// messaging, and persistent voyage records.
import type { Server as HttpServer } from "http";
import type { Loan } from "../../generated/prisma";
import { Server, type Socket } from "socket.io";
import { db, PUBLIC_USER_SELECT } from "../lib/db";
import { leaveRoomForUser, roomMemberIds } from "../lib/rooms";
import { recordActivity } from "../lib/activity";
import {
  levelForRenownXP,
  parseStatsByDifficulty,
  recordVoyageInStats,
  renownTitleForLevel,
} from "../lib/game/legacy";
import {
  BROKERS_FAVOR_UNLOCK_LEVEL,
  TIDEWATCH_SURGE_THRESHOLD,
  WORD_ON_THE_DOCKS_LEDGER_ENTRY,
  WORD_ON_THE_DOCKS_REWARD,
  WORD_ON_THE_DOCKS_THRESHOLD,
} from "../lib/game/constants";
import { meritById, qualifyingMerits } from "../lib/game/merits";
import { checkSave, describeFindings } from "../lib/game/integrity";
import {
  normalizeDifficulty,
  renownMultiplierFor,
  roundsFor,
} from "../lib/game/difficulty";
import {
  parseVentureContributions,
  ventureAnnouncementFor,
  ventureTotal,
  type VentureOutcome,
  type VentureSettlement,
} from "../lib/game/convoy";
import { computeBackingResolution } from "../lib/game/backing";
import {
  computeHarborPulse,
  savedPurchaseTotals,
} from "../lib/game/harborPulse";
import {
  CURRENT_HARBOR_RULES,
  expanded,
  type VoyageRules,
} from "../lib/game/expansion";
import { buildCurrentVoyageRules, readVoyageRules } from "../lib/game/forecast";
import { unlockedResources } from "../lib/game/pools";
import type { GameState } from "../lib/game/types";
import type { BarterUpdate } from "../lib/game/barter-ledger";
import type { VoyageCompleteEvent } from "../lib/realtime";
import {
  closeBarter,
  modifyBarter,
  readBarter,
  type BarterAction,
} from "./barter";
import { contributeToConvoy, postConvoy, settleExpiredConvoys } from "./convoy";

// Types
type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  avatarHue: number;
};

type SocketState = {
  userId: string;
  user: PublicUser;
  roomId: string | null;
  authed: boolean;
};

// Cached captain status used by roster hydration and game:status broadcasts.
// Keep this server type independent from the browser Socket.IO client module.
type CaptainStatus = {
  roomId: string;
  voyageEpoch: number;
  user: PublicUser;
  round: number;
  phase: number | string;
  phaseLabel: string;
  gold: number;
  reputation: number;
  shipLevel: number;
  gameOver: boolean;
  at: number;
};

export function attachRealtime(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Presence state for the active process
  const sockets = new Map<string, SocketState>(); // Maps each socket id to state.
  // Maps each user id to all active sockets for that account.
  const userSockets = new Map<string, Set<string>>();

  function publicUser(u: {
    id: string;
    username: string;
    displayName: string;
    avatarHue: number;
  }): PublicUser {
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarHue: u.avatarHue,
    };
  }

  function onlineUsers(): Array<PublicUser & { roomId: string | null }> {
    const seen = new Map<string, PublicUser & { roomId: string | null }>();
    for (const s of sockets.values()) {
      if (!seen.has(s.userId))
        seen.set(s.userId, { ...s.user, roomId: s.roomId });
    }
    return Array.from(seen.values());
  }

  function broadcastPresence() {
    io.emit("presence:update", { users: onlineUsers() });
  }

  // One roster entry per user, never per socket. Multiple tabs and reconnects
  // may leave several live sockets for one captain, but they share one seat.
  function roomMembers(roomId: string) {
    const byUser = new Map<string, PublicUser & { socketId: string }>();
    // Reverse iteration lets the newest socket claim the user's roster slot.
    for (const [sid, s] of Array.from(sockets.entries()).reverse()) {
      if (s.roomId === roomId && !byUser.has(s.userId)) {
        byUser.set(s.userId, { ...s.user, socketId: sid });
      }
    }
    return Array.from(byUser.values());
  }

  // Broadcast the current database host, live roster, and room mutes.
  async function emitRoomMembers(roomId: string) {
    const members = roomMembers(roomId).map(
      ({ id, username, displayName, avatarHue }) => ({
        id,
        username,
        displayName,
        avatarHue,
      }),
    );
    const room = await db.room.findUnique({
      where: { id: roomId },
      select: { hostId: true },
    });
    io.to(`room:${roomId}`).emit("room:members", {
      roomId,
      members,
      hostId: room?.hostId ?? null,
      mutedUserIds: Array.from(roomMutedUsers.get(roomId) ?? []),
    });
  }

  // Room chat mutes are scoped to one voyage and stored in process memory.
  const roomMutedUsers = new Map<string, Set<string>>();

  // Cache the latest status per room and user for roster hydration.
  const roomStatuses = new Map<string, Map<string, CaptainStatus>>();

  function rememberStatus(roomId: string, payload: CaptainStatus) {
    let m = roomStatuses.get(roomId);
    if (!m) {
      m = new Map();
      roomStatuses.set(roomId, m);
    }
    m.set(payload.user.id, payload);
  }

  function sendStatusBatchTo(roomId: string, socketId: string) {
    const m = roomStatuses.get(roomId);
    if (!m) return;
    for (const st of m.values()) {
      io.to(socketId).emit("game:status", st);
    }
  }

  // Remove a departed user's status and reclaim empty room entries.
  function forgetStatus(roomId: string, userId: string) {
    const m = roomStatuses.get(roomId);
    if (!m) return;
    m.delete(userId);
    if (m.size === 0) roomStatuses.delete(roomId);
  }

  // Preserve status while another socket for the same user remains active.
  function forgetStatusIfLastSocket(roomId: string, userId: string) {
    const set = userSockets.get(userId);
    if (!set || set.size === 0) forgetStatus(roomId, userId);
  }

  // Departure cleanup
  // A grace timer preserves seats across refreshes and short disconnects.
  // Timers are keyed by room id and user id.
  const departureTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const DEPARTURE_GRACE_MS = 30_000;

  // Return true when an existing departure timer was canceled.
  function cancelDeparture(roomId: string, userId: string): boolean {
    const key = `${roomId}:${userId}`;
    const t = departureTimers.get(key);
    if (t) {
      clearTimeout(t);
      departureTimers.delete(key);
      return true;
    }
    return false;
  }

  function scheduleDeparture(roomId: string, userId: string) {
    const key = `${roomId}:${userId}`;
    cancelDeparture(roomId, userId);
    const t = setTimeout(async () => {
      departureTimers.delete(key);
      const seat = await db.roomMember.findUnique({
        where: { userId_roomId: { userId, roomId } },
        select: {
          room: { select: { started: true } },
          user: { select: { displayName: true } },
        },
      });
      if (!seat) return;
      const { room, user } = seat;
      const here = roomMembers(roomId);
      if (here.some((member) => member.id === userId)) return;
      // An unattended voyage waits at its checkpoint until the captains return.
      if (room.started && !here.length) return;
      await closeBarter(roomId, userId).catch(() => {});
      await broadcastBarter(roomId).catch(() => {});
      removeUserAidRequest(roomId, userId);
      const result = await leaveRoomForUser(userId, roomId).catch(() => null);
      if (!result) return;
      if (result.roomDeleted) {
        // Clear process state after the final member deletes the room.
        roomCheckpoints.delete(roomId);
        roomStatuses.delete(roomId);
        roomAidRequests.delete(roomId);
        // The database cascade already removed persistent Loan rows.
        roomOutstandingLoans.delete(roomId);
        concludedRooms.delete(roomId);
        roomMutedUsers.delete(roomId);
      } else {
        io.to(`room:${roomId}`).emit("room:system", {
          roomId,
          content: `${user.displayName} has left this harbor.`,
        });
        emitRoomMembers(roomId);
        if (room.started) {
          const checkpoint = await getCheckpoint(roomId);
          await broadcastReadyState(roomId, checkpoint);
          await maybeAdvance(roomId, checkpoint);
          await maybeConcludeVoyage(roomId);
        }
      }
    }, DEPARTURE_GRACE_MS);
    departureTimers.set(key, t);
  }

  // Shared phase readiness
  // The checkpoint records the expected round, phase, and readiness quorum.
  // Clients apply their own deterministic transition after release.
  type Checkpoint = {
    voyageEpoch: number;
    difficulty: string;
    rules: VoyageRules;
    round: number;
    phase: string;
    readyUserIds: Set<string>;
    advancing: boolean;
    releasing?: boolean;
    harborPulse?: Record<string, number>;
  };
  const roomCheckpoints = new Map<string, Checkpoint>();

  // Prevent duplicate room:start handling in this process.
  const startingRooms = new Set<string>();

  // Prevent duplicate room:restart handling in this process.
  const restartingRooms = new Set<string>();

  // Gate only the shared phases in one synchronized round.
  const CHECKPOINT_PHASE_ORDER = [
    "0",
    "5",
    "1",
    "barter",
    "worker_mgmt",
    "2",
    "3",
    "4",
  ];
  function checkpointRank(round: number, phase: string): number | null {
    const idx = CHECKPOINT_PHASE_ORDER.indexOf(phase);
    if (idx === -1) return null;
    return round * CHECKPOINT_PHASE_ORDER.length + idx;
  }

  async function getCheckpoint(roomId: string): Promise<Checkpoint> {
    let cp = roomCheckpoints.get(roomId);
    if (cp) return cp;
    const room = await db.room.findUnique({
      where: { id: roomId },
      select: {
        started: true,
        currentRound: true,
        currentPhase: true,
        phaseReleased: true,
        phasePulse: true,
        voyageEpoch: true,
        rulesVersion: true,
        forecastPlan: true,
        difficulty: true,
      },
    });
    if (room?.started) {
      const saves = await db.gameState.findMany({
        where: { roomId, user: { memberships: { some: { roomId } } } },
        select: { data: true, user: { select: PUBLIC_USER_SELECT } },
      });
      for (const { data, user } of saves) {
        if (roomStatuses.get(roomId)?.has(user.id)) continue;
        let saved: Partial<GameState> | null;
        try {
          saved = JSON.parse(data) as Partial<GameState> | null;
        } catch {
          continue;
        }
        if (
          !saved?.gameOver ||
          (saved.voyageEpoch ?? 0) !== room.voyageEpoch ||
          (saved.phase !== "endgame" && saved.phase !== "bankruptcy")
        )
          continue;
        const phase = saved.defaultedDebt ? "bankruptcy" : saved.phase;
        rememberStatus(roomId, {
          roomId,
          voyageEpoch: room.voyageEpoch,
          user,
          phase,
          phaseLabel: phase === "bankruptcy" ? "Bankrupt" : "Voyage Complete",
          round: Math.min(
            saved.currentRound ?? room.currentRound,
            saved.maxRounds ?? Infinity,
          ),
          gold: saved.money ?? 0,
          reputation: saved.score ?? 0,
          shipLevel: saved.shipLevel ?? 0,
          gameOver: true,
          at: Date.now(),
        });
      }
    }
    cp = roomCheckpoints.get(roomId);
    if (cp) return cp;
    cp = {
      voyageEpoch: room?.voyageEpoch ?? 0,
      difficulty: room?.difficulty ?? "fair_winds",
      rules: readVoyageRules(room),
      round: room?.currentRound ?? 1,
      phase: room?.currentPhase ?? "0",
      readyUserIds: new Set(),
      advancing: room?.phaseReleased ?? false,
      harborPulse: room ? JSON.parse(room.phasePulse) : undefined,
    };
    roomCheckpoints.set(roomId, cp);
    return cp;
  }

  // Build the readiness quorum from durable membership and exclude captains
  // already at bankruptcy or endgame. Brief disconnects do not shrink it.
  async function activeRosterSet(roomId: string): Promise<Set<string>> {
    const statuses = roomStatuses.get(roomId);
    const memberIds = await roomMemberIds(roomId);
    const out = new Set<string>();
    for (const id of memberIds) {
      const ph = statuses?.get(id)?.phase;
      if (ph !== "bankruptcy" && ph !== "endgame") out.add(id);
    }
    return out;
  }

  async function readyStatePayload(roomId: string, cp: Checkpoint) {
    const roster = Array.from(await activeRosterSet(roomId));
    return {
      roomId,
      voyageEpoch: cp.voyageEpoch,
      rules: cp.rules,
      round: cp.round,
      phase: cp.phase,
      advancing: cp.advancing,
      harborPulse: cp.harborPulse,
      readyUserIds: Array.from(cp.readyUserIds).filter((id) =>
        roster.includes(id),
      ),
      requiredUserIds: roster,
    };
  }

  async function broadcastReadyState(roomId: string, cp: Checkpoint) {
    io.to(`room:${roomId}`).emit(
      "phase:ready_update",
      await readyStatePayload(roomId, cp),
    );
  }

  async function maybeAdvance(roomId: string, cp: Checkpoint) {
    if (cp.advancing || cp.releasing) return;
    const roster = await activeRosterSet(roomId);
    if (cp.advancing || cp.releasing || roster.size === 0) return;
    for (const id of roster) {
      if (!cp.readyUserIds.has(id)) return;
    }
    cp.releasing = true;
    try {
      let harborPulse = cp.harborPulse;
      if (cp.phase === "5" && cp.round > 1) {
        const saves = await db.gameState.findMany({
          where: { roomId },
          select: { data: true },
        });
        harborPulse = computeHarborPulse(
          savedPurchaseTotals(
            saves.map(({ data }) => data),
            cp.voyageEpoch,
            cp.round - 1,
          ),
          expanded({ rulesVersion: cp.rules.version })
            ? unlockedResources(
                cp.difficulty,
                cp.round - 1,
                cp.rules.version,
                cp.rules.specialties,
              )
            : undefined,
        );
      }
      if (cp.phase === "barter") {
        await closeBarter(roomId);
        await broadcastBarter(roomId);
      } else {
        await db.room.update({
          where: { id: roomId },
          data: {
            phaseReleased: true,
            phasePulse: JSON.stringify(harborPulse ?? {}),
          },
        });
      }
      cp.harborPulse = harborPulse;
      cp.advancing = true;
      io.to(`room:${roomId}`).emit("phase:advance", {
        roomId,
        voyageEpoch: cp.voyageEpoch,
        rules: cp.rules,
        round: cp.round,
        phase: cp.phase,
        harborPulse,
      });
    } catch (error) {
      console.error("Could not release the room phase", error);
    } finally {
      cp.releasing = false;
    }
  }

  // Voyage conclusion and Captain's Legacy
  // Conclude after every member reports endgame or bankruptcy. Persist eligible
  // results once, then award the Sea Master crown to the highest Reputation.
  const concludedRooms = new Set<string>();
  type VoyageFinisher = {
    userId: string;
    user: PublicUser;
    reputation: number;
    gold: number;
    phase: string;
  };

  async function maybeConcludeVoyage(roomId: string) {
    if (concludedRooms.has(roomId)) return;
    const memberIds = await roomMemberIds(roomId);
    if (memberIds.length === 0 || concludedRooms.has(roomId)) return;
    const statuses = roomStatuses.get(roomId);
    if (!statuses) return;

    const voyageEpoch = statuses.get(memberIds[0])?.voyageEpoch;
    if (voyageEpoch === undefined) return;
    const finished: VoyageFinisher[] = [];
    for (const id of memberIds) {
      const st = statuses.get(id);
      // A member without a terminal cached status is still active.
      const phase = st ? String(st.phase) : "";
      if (
        st?.voyageEpoch !== voyageEpoch ||
        (phase !== "endgame" && phase !== "bankruptcy")
      )
        return;
      finished.push({
        userId: id,
        user: st.user,
        reputation: st.reputation ?? 0,
        gold: st.gold ?? 0,
        phase,
      });
    }

    // Serialize conclusion in this process until the result is persisted.
    concludedRooms.add(roomId);
    try {
      await concludeVoyage(roomId, voyageEpoch, finished);
    } finally {
      concludedRooms.delete(roomId);
    }
  }

  async function concludeVoyage(
    roomId: string,
    voyageEpoch: number,
    finished: VoyageFinisher[],
  ) {
    const room = await db.room.findUnique({
      where: { id: roomId, voyageEpoch, started: true },
      select: { difficulty: true, voyageResult: true },
    });
    if (!room || room.voyageResult) return;
    const roomDifficulty = normalizeDifficulty(room.difficulty);
    const renownMultiplier = renownMultiplierFor(roomDifficulty);

    // Older voyages may already have banked rewards before standings were saved.
    const previousAwards = new Set<string | null>();
    if (room.voyageResult === null) {
      const start = await db.activity.findFirst({
        where: { roomId, type: "voyage_start" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (start) {
        const awards = await db.activity.findMany({
          where: {
            roomId,
            type: "voyage_complete",
            createdAt: { gte: start.createdAt },
          },
          select: { userId: true },
        });
        for (const award of awards) previousAwards.add(award.userId);
      }
    }

    // Fail any venture still open when the voyage ends.
    await resolveExpiredVentures(roomId, voyageEpoch, 0, true);

    for (const loan of [...loanList(roomId)]) {
      if ((userSockets.get(loan.borrowerId)?.size ?? 0) > 0) continue;
      const saved = await db.gameState.findUnique({
        where: { userId_roomId: { userId: loan.borrowerId, roomId } },
      });
      const pending = saved
        ? (JSON.parse(saved.data) as GameState)._pendingDebtSettlements
        : undefined;
      const amount =
        pending?.find(({ debtId }) => debtId === loan.debtId)?.amount ?? 0;
      await closeLoan(roomId, loan.debtId, loan.borrowerId, amount);
    }

    // Combine final values with persistent integrity marks before progression.
    const forgedUsers = new Set<string>();
    for (const f of finished) {
      const verdict = checkSave(
        { money: f.gold, score: f.reputation },
        roundsFor(roomDifficulty),
      );
      if (verdict.severity !== "ok") {
        console.warn(
          `[integrity] ${verdict.severity} finish user=${f.userId} room=${roomId} ${describeFindings(verdict.findings)}`,
        );
      }
      if (verdict.severity === "impossible") forgedUsers.add(f.userId);
    }
    const marked = await db.gameState.findMany({
      where: { roomId, integritySeverity: "impossible" },
      select: { userId: true, integrityNote: true },
    });
    for (const row of marked) {
      if (!forgedUsers.has(row.userId)) {
        console.warn(
          `[integrity] finish disqualified by an earlier save user=${row.userId} room=${roomId} ${row.integrityNote ?? ""}`,
        );
      }
      forgedUsers.add(row.userId);
    }
    const isForged = (userId: string) => forgedUsers.has(userId);

    const crownable = finished.filter(
      (f) => f.phase === "endgame" && !isForged(f.userId),
    );
    const winnerId = crownable.length
      ? crownable.reduce((best, f) =>
          f.reputation > best.reputation ? f : best,
        ).userId
      : null;

    const result = await db.$transaction(async (tx) => {
      const claimed = await tx.room.updateMany({
        where: {
          id: roomId,
          voyageEpoch,
          started: true,
          voyageResult: room.voyageResult,
        },
        data: { voyageResult: "{}" },
      });
      if (claimed.count === 0) return null;
      const standings: VoyageCompleteEvent["standings"] = [];
      for (const f of finished) {
        // Impossible finishes remain visible but do not change account progress.
        const forged = isForged(f.userId);
        const awarded = !forged && !previousAwards.has(f.userId);
        const xpGained = forged
          ? 0
          : Math.round(Math.max(0, f.reputation) * renownMultiplier);
        const crowned = f.userId === winnerId;
        const bankrupt = f.phase === "bankruptcy";
        const prior = await tx.captainLegacy.findUnique({
          where: { userId: f.userId },
        });
        const priorLevel = prior?.renownLevel ?? 1;
        const newXP = (prior?.renownXP ?? 0) + (awarded ? xpGained : 0);
        const newLevel = levelForRenownXP(newXP);
        const leveledUp = newLevel > priorLevel;
        // Detect unlocks across the full level span gained this voyage.
        const brokersFavorUnlocked =
          priorLevel < BROKERS_FAVOR_UNLOCK_LEVEL &&
          newLevel >= BROKERS_FAVOR_UNLOCK_LEVEL;
        // Preserve persistent counters for impossible finishes.
        const newBestScore = !awarded
          ? (prior?.bestScore ?? 0)
          : Math.max(prior?.bestScore ?? 0, f.reputation);
        const newVoyagesCompleted =
          (prior?.voyagesCompleted ?? 0) + (awarded ? 1 : 0);
        // Bankruptcy resets the solvent streak. Impossible finishes do not alter it.
        const newConsecutiveSolventVoyages = !awarded
          ? (prior?.consecutiveSolventVoyages ?? 0)
          : bankrupt
            ? 0
            : (prior?.consecutiveSolventVoyages ?? 0) + 1;
        // Record crowns and scores for the room difficulty.
        const priorStats = parseStatsByDifficulty(prior?.statsByDifficulty);
        const newStatsByDifficulty = !awarded
          ? priorStats
          : recordVoyageInStats(priorStats, roomDifficulty, {
              crowned,
              reputation: f.reputation,
            });
        if (awarded)
          await tx.captainLegacy.upsert({
            where: { userId: f.userId },
            create: {
              userId: f.userId,
              renownXP: newXP,
              renownLevel: newLevel,
              // Use the integrity gated voyage total for a new legacy row.
              voyagesCompleted: newVoyagesCompleted,
              seaMasterCrowns: crowned ? 1 : 0,
              bestScore: newBestScore,
              consecutiveSolventVoyages: newConsecutiveSolventVoyages,
              statsByDifficulty: JSON.stringify(newStatsByDifficulty),
            },
            update: {
              renownXP: newXP,
              renownLevel: newLevel,
              // Increment atomically when the finish qualifies.
              voyagesCompleted: { increment: 1 },
              ...(crowned ? { seaMasterCrowns: { increment: 1 } } : {}),
              bestScore: newBestScore,
              consecutiveSolventVoyages: newConsecutiveSolventVoyages,
              statsByDifficulty: JSON.stringify(newStatsByDifficulty),
            },
          });

        // Compare qualifying Merits with persisted awards to find new ones.
        const existingMerits = await tx.captainMerit.findMany({
          where: { userId: f.userId },
          select: { meritId: true },
        });
        const existingMeritIds = new Set(existingMerits.map((m) => m.meritId));
        const qualifying = qualifyingMerits({
          newVoyagesCompleted,
          crowned,
          priorSeaMasterCrowns: prior?.seaMasterCrowns ?? 0,
          reputation: f.reputation,
          newRenownLevel: newLevel,
          consecutiveSolventVoyages: newConsecutiveSolventVoyages,
          difficulty: roomDifficulty,
          bankrupt,
        });
        // Impossible finishes cannot grant persistent merits.
        const newMerits = !awarded
          ? []
          : qualifying.filter((id) => !existingMeritIds.has(id));
        // Upsert each Merit because SQLite does not support skipDuplicates here.
        for (const meritId of newMerits) {
          await tx.captainMerit.upsert({
            where: { userId_meritId: { userId: f.userId, meritId } },
            create: { userId: f.userId, meritId },
            update: {},
          });
        }

        standings.push({
          userId: f.userId,
          displayName: f.user.displayName,
          avatarHue: f.user.avatarHue,
          reputation: f.reputation,
          gold: f.gold,
          crowned,
          bankrupt,
          renownLevel: newLevel,
          renownTitle: renownTitleForLevel(newLevel),
          xpGained,
          previousBestScore:
            awarded && prior?.voyagesCompleted ? prior.bestScore : undefined,
          leveledUp,
          brokersFavorUnlocked,
          newMerits,
        });
      }
      standings.sort((a, b) => b.reputation - a.reputation);
      const result: VoyageCompleteEvent = {
        roomId,
        voyageEpoch,
        winnerId,
        standings,
      };
      await tx.room.update({
        where: { id: roomId },
        data: { voyageResult: JSON.stringify(result) },
      });
      return result;
    });
    if (!result) return;

    for (const standing of result.standings) {
      const {
        userId,
        displayName,
        reputation,
        crowned,
        renownLevel,
        leveledUp,
        newMerits,
      } = standing;
      if (leveledUp) {
        io.to(`room:${roomId}`).emit("room:system", {
          roomId,
          content: `${displayName} reached Renown Level ${renownLevel}: ${renownTitleForLevel(renownLevel)}!`,
        });
      }
      for (const meritId of newMerits) {
        const merit = meritById(meritId);
        if (!merit) continue;
        io.to(`room:${roomId}`).emit("room:system", {
          roomId,
          content: `${displayName} earned the Captain's Merit: ${merit.name}!`,
        });
        // Record each merit in the harbor activity feed.
        void recordActivity({
          userId,
          type: "merit_earned",
          detail: merit.name,
          roomId,
        });
      }
      // Record the voyage completion (and a crown, if earned) in the feed.
      if (!isForged(userId) && !previousAwards.has(userId)) {
        void recordActivity({
          userId,
          type: "voyage_complete",
          detail: `${reputation} Reputation`,
          roomId,
        });
        if (crowned) {
          void recordActivity({
            userId,
            type: "sea_master",
            detail: `${reputation} Reputation`,
            roomId,
          });
        }
      }
    }
    const replayed = finished.every(
      (f) => isForged(f.userId) || previousAwards.has(f.userId),
    );
    io.to(`room:${roomId}`).emit(
      "room:voyage_complete",
      replayed ? { ...result, replayed } : result,
    );
  }

  // Bartering
  // Arbitrate the shared offer board while clients validate inventory and Gold.
  // Direct offers are visible only to their poster and named target.
  function sendBarter(
    sid: string,
    userId: string,
    roomId: string,
    ledger: NonNullable<Awaited<ReturnType<typeof readBarter>>>,
  ) {
    const update: BarterUpdate = {
      roomId,
      epoch: ledger.epoch,
      revision: ledger.entries.length,
      offers: ledger.offers.filter(
        (offer) =>
          !offer.targetUserId ||
          offer.targetUserId === userId ||
          offer.fromUserId === userId,
      ),
      entries: ledger.entries.filter((entry) => entry.userId === userId),
    };
    io.to(sid).emit("barter:update", update);
  }

  async function broadcastBarter(roomId: string) {
    const ledger = await readBarter(roomId);
    if (!ledger) return;
    for (const [sid, state] of sockets) {
      if (state.roomId === roomId)
        sendBarter(sid, state.userId, roomId, ledger);
    }
  }

  // Financial aid
  // Arbitrate loan requests while each client validates its own Gold.
  type AidRequest = {
    id: string;
    fromUserId: string;
    fromName: string;
    amount: number;
    round: number;
  };
  const roomAidRequests = new Map<string, AidRequest[]>();

  function aidList(roomId: string): AidRequest[] {
    return roomAidRequests.get(roomId) ?? [];
  }

  function broadcastAid(roomId: string) {
    io.to(`room:${roomId}`).emit("aid:update", {
      roomId,
      requests: aidList(roomId),
    });
  }

  function clearAid(roomId: string) {
    if (!roomAidRequests.has(roomId)) return;
    roomAidRequests.delete(roomId);
    broadcastAid(roomId);
  }

  // Remove an aid request when its captain leaves the room.
  function removeUserAidRequest(roomId: string, userId: string) {
    const list = roomAidRequests.get(roomId);
    if (!list) return;
    const next = list.filter((r) => r.fromUserId !== userId);
    if (next.length === list.length) return;
    if (next.length) roomAidRequests.set(roomId, next);
    else roomAidRequests.delete(roomId);
    broadcastAid(roomId);
  }

  // Backing
  // Track granted loans across the room so a third captain can back them.
  // They persist until repayment or the start of a fresh voyage.
  type LoanRecord = {
    debtId: string;
    borrowerId: string;
    borrowerName: string;
    lenderId: string;
    lenderName: string;
    amount: number;
    round: number;
    backerId?: string;
    backerName?: string;
    backedAmount?: number;
    // A lender redirect changes where repayment lands, not who owns the loan.
    redirectToUserId?: string;
    redirectToName?: string;
  };
  // Keep a synchronous process cache backed by the persistent Loan table.
  const roomOutstandingLoans = new Map<string, LoanRecord[]>();

  function loanList(roomId: string): LoanRecord[] {
    return roomOutstandingLoans.get(roomId) ?? [];
  }

  function broadcastLoans(roomId: string) {
    io.to(`room:${roomId}`).emit("loans:update", {
      roomId,
      loans: loanList(roomId),
    });
  }

  // Chain persistence per room after updating the process cache.
  const loanWriteChain = new Map<string, Promise<unknown>>();

  function persistLoanWrite(
    roomId: string,
    what: string,
    work: () => Promise<unknown>,
  ) {
    const previous = loanWriteChain.get(roomId) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(work)
      .catch((err) => {
        console.error(`[loans] failed to persist ${what}:`, err);
      });
    loanWriteChain.set(roomId, next);
    void next.then(() => {
      if (loanWriteChain.get(roomId) === next) loanWriteChain.delete(roomId);
    });
  }

  // Read the voyage epoch inside persistence while the process cache stays current.
  function rememberLoan(roomId: string, loan: LoanRecord) {
    roomOutstandingLoans.set(roomId, [...loanList(roomId), loan]);
    persistLoanWrite(roomId, `loan ${loan.debtId}`, async () => {
      const room = await db.room.findUnique({
        where: { id: roomId },
        select: { voyageEpoch: true },
      });
      if (!room) return;
      await db.loan.create({
        data: {
          id: loan.debtId,
          roomId,
          voyageEpoch: room.voyageEpoch,
          borrowerId: loan.borrowerId,
          borrowerName: loan.borrowerName,
          lenderId: loan.lenderId,
          lenderName: loan.lenderName,
          amount: loan.amount,
          round: loan.round,
        },
      });
    });
  }

  // Persist a backing or repayment redirect added to an existing loan.
  function updateLoan(roomId: string, loan: LoanRecord) {
    persistLoanWrite(roomId, `loan ${loan.debtId}`, () =>
      db.loan.update({
        where: { id: loan.debtId },
        data: {
          backerId: loan.backerId ?? null,
          backerName: loan.backerName ?? null,
          backedAmount: loan.backedAmount ?? null,
          redirectToUserId: loan.redirectToUserId ?? null,
          redirectToName: loan.redirectToName ?? null,
        },
      }),
    );
  }

  function clearLoans(roomId: string) {
    if (!roomOutstandingLoans.has(roomId)) return;
    roomOutstandingLoans.delete(roomId);
    persistLoanWrite(roomId, `clear for room ${roomId}`, () =>
      db.loan.deleteMany({ where: { roomId } }),
    );
    broadcastLoans(roomId);
  }

  function sendLoanSettlement(sid: string, userId: string, loan: Loan) {
    const {
      roomId,
      amount,
      backerId,
      lenderId,
      redirectToUserId,
      repaidAmount,
    } = loan;
    if (repaidAmount === null) return;
    const debtId = loan.id;
    const { calledAmount, refundAmount } = computeBackingResolution(
      amount,
      repaidAmount,
      loan.backedAmount ?? 0,
    );
    if (userId === (redirectToUserId ?? lenderId)) {
      io.to(sid).emit("aid:repaid", {
        roomId,
        debtId,
        amount: repaidAmount,
        fromUserId: loan.borrowerId,
        fromName: loan.borrowerName,
      });
    }
    if (redirectToUserId && userId === lenderId) {
      io.to(sid).emit("aid:redirected", {
        roomId,
        debtId,
        redirectedToName: loan.redirectToName ?? "another captain",
      });
    }
    if (userId === backerId) {
      io.to(sid).emit("backing:resolved", {
        roomId,
        debtId,
        calledAmount,
        refundAmount,
      });
    }
    if (userId === lenderId && calledAmount > 0) {
      io.to(sid).emit("backing:covered", {
        roomId,
        debtId,
        amount: calledAmount,
        backerName: loan.backerName,
        borrowerName: loan.borrowerName,
      });
    }
  }

  async function replayLoanSettlements(
    sid: string,
    userId: string,
    roomId: string,
  ) {
    const settled = await db.loan
      .findMany({
        where: {
          roomId,
          repaidAmount: { not: null },
          OR: [
            { lenderId: userId },
            { backerId: userId },
            { redirectToUserId: userId },
          ],
        },
        include: { room: { select: { voyageEpoch: true } } },
      })
      .catch(() => []);
    for (const loan of settled) {
      if (loan.voyageEpoch === loan.room.voyageEpoch)
        sendLoanSettlement(sid, userId, loan);
    }
  }

  async function closeLoan(
    roomId: string,
    debtId: string,
    borrowerId: string,
    amount: number,
  ) {
    await loanWriteChain.get(roomId);
    const room = await db.room.findUnique({
      where: { id: roomId },
      select: { voyageEpoch: true },
    });
    const loan = await db.loan.findUnique({ where: { id: debtId } });
    if (
      !room ||
      !loan ||
      loan.roomId !== roomId ||
      loan.voyageEpoch !== room.voyageEpoch ||
      loan.borrowerId !== borrowerId ||
      amount > loan.amount
    )
      return false;

    const changed = await db.loan.updateMany({
      where: { id: debtId, repaidAmount: null },
      data: { repaidAmount: amount },
    });
    if (changed.count === 0) return true;

    const open = loanList(roomId).filter((item) => item.debtId !== debtId);
    if (open.length) roomOutstandingLoans.set(roomId, open);
    else roomOutstandingLoans.delete(roomId);
    for (const [sid, member] of sockets) {
      if (member.roomId === roomId)
        sendLoanSettlement(sid, member.userId, {
          ...loan,
          repaidAmount: amount,
        });
    }
    broadcastLoans(roomId);
    return true;
  }

  // Restore current voyage loans and remove records from earlier voyages.
  async function hydrateLoans() {
    try {
      const rows = await db.loan.findMany({
        include: { room: { select: { voyageEpoch: true } } },
      });
      let restored = 0;
      const stale: string[] = [];
      for (const row of rows) {
        if (row.voyageEpoch !== row.room.voyageEpoch) {
          stale.push(row.id);
          continue;
        }
        if (row.repaidAmount !== null) continue;
        const record: LoanRecord = {
          debtId: row.id,
          borrowerId: row.borrowerId,
          borrowerName: row.borrowerName,
          lenderId: row.lenderId,
          lenderName: row.lenderName,
          amount: row.amount,
          round: row.round,
          ...(row.backerId ? { backerId: row.backerId } : {}),
          ...(row.backerName ? { backerName: row.backerName } : {}),
          ...(row.backedAmount !== null
            ? { backedAmount: row.backedAmount }
            : {}),
          ...(row.redirectToUserId
            ? { redirectToUserId: row.redirectToUserId }
            : {}),
          ...(row.redirectToName ? { redirectToName: row.redirectToName } : {}),
        };
        roomOutstandingLoans.set(row.roomId, [
          ...(roomOutstandingLoans.get(row.roomId) ?? []),
          record,
        ]);
        restored++;
      }
      if (stale.length) {
        await db.loan.deleteMany({ where: { id: { in: stale } } });
      }
      if (restored || stale.length) {
        console.log(
          `[loans] restored ${restored} outstanding loan(s), dropped ${stale.length} from an earlier voyage`,
        );
      }
    } catch (err) {
      console.error("[loans] failed to restore the ledger on startup:", err);
    }
  }
  void hydrateLoans();

  function combinedReputation(roomId: string): number {
    const statuses = roomStatuses.get(roomId);
    if (!statuses) return 0;
    let total = 0;
    for (const st of statuses.values()) total += st.reputation ?? 0;
    return total;
  }

  // Convoy Ventures
  // Convoy ventures are persisted and scoped by roomId plus voyageEpoch so
  // contributed Gold survives process restarts but never crosses voyages.
  function ventureSummary(v: {
    id: string;
    posterId: string;
    posterName: string;
    targetGold: number;
    deadlineRound: number;
    payoutMultiplier: number;
    contributions: string;
    status: string;
  }) {
    const contributions = parseVentureContributions(v.contributions);
    return {
      id: v.id,
      posterId: v.posterId,
      posterName: v.posterName,
      targetGold: v.targetGold,
      deadlineRound: v.deadlineRound,
      payoutMultiplier: v.payoutMultiplier,
      status: v.status,
      total: ventureTotal(contributions),
      contributions: Object.entries(contributions).map(([userId, c]) => ({
        userId,
        name: c.name,
        amount: c.amount,
      })),
    };
  }

  async function broadcastVentures(
    roomId: string,
    voyageEpoch: number,
    destination = `room:${roomId}`,
  ) {
    const ventures = await db.convoyVenture.findMany({
      where: { roomId, voyageEpoch, status: { in: ["open", "filled"] } },
      orderBy: { createdAt: "asc" },
    });
    io.to(destination).emit("venture:update", {
      roomId,
      ventures: ventures
        .filter(({ status }) => status === "open")
        .map(ventureSummary),
      locked: ventures.some(({ status }) => status === "filled"),
    });
  }

  async function publishVentureChanges(
    roomId: string,
    voyageEpoch: number,
    outcomes: {
      ventureId: string;
      outcome: VentureOutcome;
      settlements: VentureSettlement[];
    }[],
  ) {
    await broadcastBarter(roomId);
    for (const result of outcomes) {
      io.to(`room:${roomId}`).emit("venture:resolved", { roomId, ...result });
      if (result.settlements.length)
        io.to(`room:${roomId}`).emit("room:system", {
          roomId,
          content: ventureAnnouncementFor(result.outcome),
        });
    }
    await broadcastVentures(roomId, voyageEpoch);
  }

  async function resolveExpiredVentures(
    roomId: string,
    voyageEpoch: number,
    currentRound: number,
    forceAll: boolean,
  ) {
    const outcomes = await settleExpiredConvoys(
      roomId,
      voyageEpoch,
      currentRound,
      forceAll,
    );
    if (outcomes.length)
      await publishVentureChanges(roomId, voyageEpoch, outcomes);
  }

  // Helpers
  async function validateToken(token: string): Promise<PublicUser | null> {
    const session = await db.session.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!session) return null;
    if (session.expiresAt.getTime() < Date.now()) {
      await db.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }
    return publicUser(session.user);
  }

  // Parse the pm_session cookie from a raw cookie header.
  function readSessionCookie(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(";")) {
      const [k, ...rest] = part.trim().split("=");
      if (k === "pm_session") return decodeURIComponent(rest.join("="));
    }
    return null;
  }

  // Authenticate a socket from its handshake cookie (auto) or an explicit token.
  async function authenticate(socket: Socket, explicitToken?: string) {
    const token =
      explicitToken ?? readSessionCookie(socket.handshake?.headers?.cookie);
    if (!token) {
      socket.emit("auth:fail", { error: "Missing session" });
      return null;
    }
    const user = await validateToken(token);
    if (!user) {
      socket.emit("auth:fail", { error: "Invalid or expired session" });
      return null;
    }
    const state = sockets.get(socket.id);
    if (!state) return null;
    // Clear old presence when this socket authenticates as another user.
    if (state.authed && state.userId && state.userId !== user.id) {
      const oldSet = userSockets.get(state.userId);
      if (oldSet) {
        oldSet.delete(socket.id);
        if (oldSet.size === 0) userSockets.delete(state.userId);
      }
      if (state.roomId) {
        socket.leave(`room:${state.roomId}`);
        forgetStatusIfLastSocket(state.roomId, state.userId);
        emitRoomMembers(state.roomId);
      }
    }
    state.userId = user.id;
    state.user = user;
    state.authed = true;
    let set = userSockets.get(user.id);
    if (!set) {
      set = new Set();
      userSockets.set(user.id, set);
    }
    set.add(socket.id);
    socket.emit("auth:ok", { user });
    socket.emit("presence:update", { users: onlineUsers() });
    broadcastPresence();
    return user;
  }

  // Connection handling
  io.on("connection", (socket) => {
    sockets.set(socket.id, {
      userId: "",
      user: { id: "", username: "", displayName: "", avatarHue: 0 },
      roomId: null,
      authed: false,
    });

    // Authenticate automatically from the handshake cookie.
    authenticate(socket);

    socket.on("auth", async (payload: { token?: string } | undefined) => {
      await authenticate(socket, payload?.token);
    });

    const requireAuth = (): SocketState | null => {
      const s = sockets.get(socket.id);
      if (!s || !s.authed) {
        socket.emit("auth:fail", { error: "Authenticate first" });
        return null;
      }
      return s;
    };

    socket.on("room:join", async (payload: { roomId?: string }) => {
      const s = requireAuth();
      if (!s) return;
      const roomId = payload?.roomId;
      if (!roomId) return;

      // Verify durable room membership.
      const member = await db.roomMember.findUnique({
        where: { userId_roomId: { userId: s.userId, roomId } },
        select: {
          room: {
            select: {
              voyageResult: true,
              voyageEpoch: true,
              tidewatchSurge: true,
              docksWinnerId: true,
            },
          },
        },
      });
      if (!member) {
        socket.emit("room:error", {
          roomId,
          error: "Not a member of that room",
        });
        return;
      }

      // Leave the previous room channel before joining the next one.
      if (s.roomId) {
        const previousRoomId = s.roomId;
        socket.leave(`room:${previousRoomId}`);
        // Clear this socket before broadcasting the previous room roster.
        s.roomId = null;
        forgetStatusIfLastSocket(previousRoomId, s.userId);
        io.to(`room:${previousRoomId}`).emit("room:system", {
          roomId: previousRoomId,
          content: `${s.user.displayName} set sail for another port`,
        });
        // The roster snapshot observes the cleared room id immediately.
        emitRoomMembers(previousRoomId);
      }

      // Cancel pending departure and suppress duplicate join notices on reconnect.
      const wasReconnecting = cancelDeparture(roomId, s.userId);

      s.roomId = roomId;
      socket.join(`room:${roomId}`);
      if (!wasReconnecting) {
        io.to(`room:${roomId}`).emit("room:system", {
          roomId,
          content: `${s.user.displayName} entered the harbor`,
        });
      }
      emitRoomMembers(roomId);
      const { voyageEpoch, tidewatchSurge, docksWinnerId } = member.room;
      if (tidewatchSurge)
        socket.emit("tidewatch:surge", { roomId, voyageEpoch });
      if (docksWinnerId === s.userId)
        socket.emit("docks:won", { roomId, voyageEpoch, winnerId: s.userId });
      // Hydrate status, readiness, barter, and aid state for every join.
      sendStatusBatchTo(roomId, socket.id);
      const cp = await getCheckpoint(roomId);
      const barter = await readBarter(roomId);
      if (barter) sendBarter(socket.id, s.userId, roomId, barter);
      await broadcastVentures(roomId, voyageEpoch, socket.id);
      io.to(socket.id).emit(
        "phase:ready_update",
        await readyStatePayload(roomId, cp),
      );
      io.to(socket.id).emit("aid:update", {
        roomId,
        requests: aidList(roomId),
      });
      void replayLoanSettlements(socket.id, s.userId, roomId);
      if (member.room.voyageResult) {
        const result = JSON.parse(
          member.room.voyageResult,
        ) as VoyageCompleteEvent;
        socket.emit("room:voyage_complete", { ...result, replayed: true });
      }
      broadcastPresence();
    });

    // Synchronize a deliberate REST room departure with this socket connection.
    socket.on("room:leave", async (payload: { roomId?: string }) => {
      const s = requireAuth();
      if (!s) return;
      const roomId = payload?.roomId ?? s.roomId;
      if (!roomId) return;
      socket.leave(`room:${roomId}`);
      // Clear the room id before broadcasting the updated roster.
      if (s.roomId === roomId) s.roomId = null;
      forgetStatus(roomId, s.userId);
      await closeBarter(roomId, s.userId).catch(() => {});
      await broadcastBarter(roomId).catch(() => {});
      removeUserAidRequest(roomId, s.userId);
      io.to(`room:${roomId}`).emit("room:system", {
        roomId,
        content: `${s.user.displayName} left the harbor`,
      });
      emitRoomMembers(roomId);
      broadcastPresence();
    });

    socket.on(
      "game:status",
      async (payload: {
        roomId?: string;
        round?: number;
        phase?: number | string;
        phaseLabel?: string;
        voyageEpoch?: number;
        gold?: number;
        reputation?: number;
        shipLevel?: number;
        gameOver?: boolean;
      }) => {
        const s = requireAuth();
        if (!s) return;
        if (!s.roomId) return;
        const roomId = payload?.roomId ?? s.roomId;
        if (roomId !== s.roomId) return;

        // Only the newest socket for a user may update and broadcast status;
        // older sockets can remain alive briefly during reconnects.
        {
          let newest = false;
          for (const [sid, st] of Array.from(sockets.entries()).reverse()) {
            if (st.userId === s.userId) {
              newest = sid === socket.id;
              break;
            }
          }
          if (!newest) return;
        }

        const room = await db.room.findUnique({
          where: { id: roomId },
          select: {
            started: true,
            voyageEpoch: true,
            voyageResult: true,
            tidewatchSurge: true,
          },
        });
        if (
          !room ||
          (payload.voyageEpoch !== undefined &&
            payload.voyageEpoch !== room.voyageEpoch)
        )
          return;

        const broadcast = {
          roomId,
          voyageEpoch: room.voyageEpoch,
          user: s.user,
          round: payload?.round ?? 0,
          phase: payload?.phase ?? 0,
          phaseLabel: payload?.phaseLabel ?? "",
          gold: payload?.gold ?? 0,
          reputation: payload?.reputation ?? 0,
          shipLevel: payload?.shipLevel ?? 0,
          gameOver: Boolean(payload?.gameOver),
          at: Date.now(),
        };
        rememberStatus(roomId, broadcast);
        io.to(`room:${roomId}`).emit("game:status", broadcast);

        // Check Tidewatch against the latest room total once per voyage.
        if (
          room.started &&
          !room.tidewatchSurge &&
          combinedReputation(roomId) >= TIDEWATCH_SURGE_THRESHOLD
        ) {
          const { count } = await db.room.updateMany({
            where: {
              id: roomId,
              voyageEpoch: room.voyageEpoch,
              tidewatchSurge: false,
            },
            data: { tidewatchSurge: true },
          });
          if (count) {
            io.to(`room:${roomId}`).emit("tidewatch:surge", {
              roomId,
              voyageEpoch: room.voyageEpoch,
            });
            io.to(`room:${roomId}`).emit("room:system", {
              roomId,
              content:
                "🌊 Tidewatch Alert: the harbor takes notice of a bustling crew! One more cargo lot joins every captain's Port Merchant Exchange for the rest of this voyage.",
            });
          }
        }

        // Resolve open ventures whose deadline is behind the reported round.
        if (room.started && !room.voyageResult) {
          await resolveExpiredVentures(
            roomId,
            room.voyageEpoch,
            broadcast.round,
            false,
          );
        }
        const cp = await getCheckpoint(roomId);
        const phaseStr = String(broadcast.phase);
        const newRank = checkpointRank(broadcast.round, phaseStr);
        const curRank = checkpointRank(cp.round, cp.phase);
        if (
          room?.started &&
          newRank !== null &&
          (curRank === null || newRank > curRank)
        ) {
          if (cp.round !== broadcast.round) cp.harborPulse = undefined;
          cp.round = broadcast.round;
          cp.phase = phaseStr;
          cp.readyUserIds.clear();
          cp.advancing = false;
          await db.room
            .updateMany({
              where: {
                id: roomId,
                voyageEpoch: room.voyageEpoch,
                started: true,
              },
              data: {
                currentRound: cp.round,
                currentPhase: cp.phase,
                phaseReleased: false,
                phasePulse: JSON.stringify(cp.harborPulse ?? {}),
              },
            })
            .catch(() => {});
          // Clear aid requests outside Phase 3.
          if (cp.phase !== "3") clearAid(roomId);
        }
        await broadcastReadyState(roomId, cp);
        await maybeAdvance(roomId, cp);
        // A terminal status report may complete the room's voyage.
        if (broadcast.gameOver && !room.voyageResult)
          await maybeConcludeVoyage(roomId);
      },
    );

    socket.on(
      "phase:ready",
      async (payload: {
        roomId?: string;
        round?: number;
        phase?: string | number;
        voyageEpoch?: number;
      }) => {
        const s = requireAuth();
        if (!s) return;
        const roomId = payload?.roomId ?? s.roomId;
        if (!roomId || roomId !== s.roomId) return;
        const cp = await getCheckpoint(roomId);
        // Phase 0 advances only through the host room:start event.
        if (cp.phase === "0") return;
        if (
          (payload?.voyageEpoch !== undefined &&
            payload.voyageEpoch !== cp.voyageEpoch) ||
          payload?.round !== cp.round ||
          String(payload?.phase) !== cp.phase
        ) {
          // Return authoritative readiness when a client votes on stale state.
          io.to(socket.id).emit(
            "phase:ready_update",
            await readyStatePayload(roomId, cp),
          );
          return;
        }
        cp.readyUserIds.add(s.userId);
        const ready = await readyStatePayload(roomId, cp);
        io.to(`room:${roomId}`).emit("phase:ready_update", ready);
        // Resume the departure window for missing seats when play resumes.
        const present = new Set(roomMembers(roomId).map(({ id }) => id));
        for (const id of ready.requiredUserIds) {
          if (!present.has(id) && !departureTimers.has(`${roomId}:${id}`))
            scheduleDeparture(roomId, id);
        }
        await maybeAdvance(roomId, cp);
      },
    );

    socket.on(
      "phase:unready",
      async (
        payload: {
          roomId?: string;
          round?: number;
          phase?: string | number;
          voyageEpoch?: number;
        },
        ack?: (accepted: boolean) => void,
      ) => {
        const s = requireAuth();
        if (!s) return ack?.(false);
        const roomId = payload?.roomId ?? s.roomId;
        if (!roomId || roomId !== s.roomId) return ack?.(false);
        const cp = await getCheckpoint(roomId);
        if (
          cp.advancing ||
          cp.releasing ||
          (payload?.voyageEpoch !== undefined &&
            payload.voyageEpoch !== cp.voyageEpoch) ||
          cp.round !== payload?.round ||
          cp.phase !== String(payload?.phase)
        )
          return ack?.(false);
        cp.readyUserIds.delete(s.userId);
        ack?.(true);
        await broadcastReadyState(roomId, cp);
      },
    );

    // Accept the first completed orders threshold claim for each voyage.
    socket.on(
      "docks:claim",
      async (
        payload: { roomId?: string; voyageEpoch?: number },
        ack?: (accepted: boolean) => void,
      ) => {
        const s = requireAuth();
        const { roomId, voyageEpoch } = payload ?? {};
        if (!s || !roomId || roomId !== s.roomId || voyageEpoch === undefined)
          return ack?.(false);
        try {
          const result = await db.$transaction(async (tx) => {
            const room = await tx.room.findUnique({
              where: { id: roomId, voyageEpoch, started: true },
              select: { docksWinnerId: true },
            });
            if (!room) return null;
            if (room.docksWinnerId)
              return { winnerId: room.docksWinnerId, announced: false };
            const saved = await tx.gameState.findUnique({
              where: { userId_roomId: { userId: s.userId, roomId } },
              select: { data: true },
            });
            const game = saved && JSON.parse(saved.data);
            if (
              game?.voyageEpoch !== voyageEpoch ||
              !(game.totalOrdersCompleted >= WORD_ON_THE_DOCKS_THRESHOLD)
            )
              return null;
            const previous = await tx.gameState.findFirst({
              where: {
                roomId,
                data: { contains: WORD_ON_THE_DOCKS_LEDGER_ENTRY },
              },
              select: { userId: true },
            });
            const winnerId = previous?.userId ?? s.userId;
            await tx.room.update({
              where: { id: roomId },
              data: { docksWinnerId: winnerId },
            });
            return { winnerId, announced: !previous };
          });
          if (!result) return ack?.(false);
          const event = {
            roomId,
            voyageEpoch,
            winnerId: result.winnerId,
            winnerName: s.user.displayName,
            reward: WORD_ON_THE_DOCKS_REWARD,
          };
          if (result.announced) {
            io.to(`room:${roomId}`).emit("docks:won", event);
            io.to(`room:${roomId}`).emit("room:system", {
              roomId,
              content: `📣 Word on the Docks: ${s.user.displayName} was first to complete ${WORD_ON_THE_DOCKS_THRESHOLD} trade orders this voyage and earns ${WORD_ON_THE_DOCKS_REWARD} Gold!`,
            });
          } else if (result.winnerId === s.userId) {
            socket.emit("docks:won", event);
          }
          ack?.(true);
        } catch (error) {
          console.error("Could not settle the completed orders race", error);
          ack?.(false);
        }
      },
    );

    // Return a fresh snapshot of open ventures.
    socket.on("venture:state:request", async (payload: { roomId?: string }) => {
      const s = requireAuth();
      if (!s) return;
      const roomId = payload?.roomId ?? s.roomId;
      if (!roomId || roomId !== s.roomId) return;
      const room = await db.room.findUnique({
        where: { id: roomId },
        select: { voyageEpoch: true },
      });
      if (!room) return;
      await broadcastVentures(roomId, room.voyageEpoch, socket.id);
    });

    // A filled venture locks further posts for this voyage. Failed ventures do
    // not consume that opportunity. Posting does not debit Gold.
    socket.on(
      "venture:post",
      async (payload: {
        roomId?: string;
        targetGold?: number;
        deadlineRound?: number;
      }) => {
        const s = requireAuth();
        if (!s) return;
        const roomId = payload?.roomId ?? s.roomId;
        if (!roomId || roomId !== s.roomId) return;
        const targetGold = Number(payload?.targetGold);
        const deadlineRound = Number(payload?.deadlineRound);
        try {
          const result = await postConvoy(
            roomId,
            s.user,
            targetGold,
            deadlineRound,
          );
          if (result.error !== undefined) {
            socket.emit("venture:error", { roomId, error: result.error });
            return;
          }
          await broadcastVentures(roomId, result.epoch);
          io.to(`room:${roomId}`).emit("room:system", {
            roomId,
            content: `⚓ ${s.user.displayName} posted a Convoy Venture: ${targetGold} Gold needed by Round ${deadlineRound}.`,
          });
        } catch (error) {
          console.error("Could not post a Convoy Venture", error);
          socket.emit("venture:error", {
            roomId,
            error:
              "Could not confirm the Convoy Venture. Check the board before posting again.",
          });
        }
      },
    );

    socket.on(
      "venture:contribute",
      async (
        payload: { roomId?: string; ventureId?: string; amount?: number },
        ack?: (result: { error: string | null }) => void,
      ) => {
        const s = requireAuth();
        if (!s)
          return ack?.({ error: "Join the harbor before backing a convoy." });
        const roomId = payload?.roomId ?? s.roomId;
        if (!roomId || roomId !== s.roomId)
          return ack?.({ error: "Join the harbor before backing a convoy." });
        const sendResult = (error: string | null) => {
          if (ack) ack({ error });
          else if (error) socket.emit("venture:error", { roomId, error });
        };
        const ventureId = payload?.ventureId;
        const amount = Number(payload?.amount);
        if (!ventureId || !Number.isSafeInteger(amount) || amount <= 0) {
          sendResult("Invalid contribution.");
          return;
        }
        try {
          const result = await contributeToConvoy(
            roomId,
            s.user,
            ventureId,
            amount,
          );
          if (result.epoch === undefined) {
            sendResult(result.error);
            return;
          }
          await publishVentureChanges(roomId, result.epoch, result.outcomes);
          sendResult(null);
        } catch (error) {
          console.error(
            "Could not confirm a Convoy Venture contribution",
            error,
          );
          sendResult(
            "Could not confirm the contribution. Check the Convoy Venture board before trying again.",
          );
        }
      },
    );

    socket.on("barter:state:request", async (payload: { roomId?: string }) => {
      const s = requireAuth();
      if (!s || !s.roomId || payload?.roomId !== s.roomId) return;
      const ledger = await readBarter(s.roomId).catch(() => null);
      if (ledger && s.roomId === payload.roomId)
        sendBarter(socket.id, s.userId, s.roomId, ledger);
    });

    socket.on(
      "barter:action",
      async (
        payload: BarterAction & { roomId: string },
        ack?: (result: { error: string | null }) => void,
      ) => {
        const s = requireAuth();
        if (!s || !s.roomId || payload?.roomId !== s.roomId) {
          ack?.({ error: "Reconnect to the harbor before trading." });
          return;
        }
        const roomId = s.roomId;
        try {
          const error = await modifyBarter(roomId, s.user, payload);
          if (!error) await broadcastBarter(roomId);
          ack?.({ error });
        } catch (error) {
          console.error("Barter action failed", error);
          ack?.({
            error:
              "Could not confirm the trade. Check the offer board and try again.",
          });
        }
      },
    );

    // Financial aid events
    socket.on("aid:state:request", (payload: { roomId?: string }) => {
      const s = requireAuth();
      if (!s) return;
      const roomId = payload?.roomId ?? s.roomId;
      if (!roomId || roomId !== s.roomId) return;
      socket.emit("aid:update", { roomId, requests: aidList(roomId) });
    });

    // Structural validation only (a positive integer). Whether the
    // requester actually needs this much, and whether a helper can really
    // afford to fund it, are both decided on each client's own GameState;
    // this server has no authoritative wallet state. One open request
    // per captain: posting a new one replaces whatever they had open.
    socket.on("aid:post", (payload: { roomId?: string; amount?: number }) => {
      const s = requireAuth();
      if (!s) return;
      const roomId = payload?.roomId ?? s.roomId;
      if (!roomId || roomId !== s.roomId) return;
      const amount = payload?.amount;
      if (!Number.isInteger(amount) || (amount as number) < 1) {
        socket.emit("aid:error", { roomId, error: "Invalid aid request" });
        return;
      }
      const cp = roomCheckpoints.get(roomId);
      const request: AidRequest = {
        id: `${roomId}:${s.userId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        fromUserId: s.userId,
        fromName: s.user.displayName,
        amount: amount as number,
        round: cp?.round ?? 1,
      };
      const others = aidList(roomId).filter((r) => r.fromUserId !== s.userId);
      roomAidRequests.set(roomId, [...others, request]);
      broadcastAid(roomId);
    });

    socket.on("aid:cancel", (payload: { roomId?: string }) => {
      const s = requireAuth();
      if (!s) return;
      const roomId = payload?.roomId ?? s.roomId;
      if (!roomId || roomId !== s.roomId) return;
      removeUserAidRequest(roomId, s.userId);
    });

    // Remove the request before notifying the first captain who funds it.
    socket.on(
      "aid:help",
      (payload: { roomId?: string; requestId?: string }) => {
        const s = requireAuth();
        if (!s) return;
        const roomId = payload?.roomId ?? s.roomId;
        if (!roomId || roomId !== s.roomId || !payload?.requestId) return;
        const list = aidList(roomId);
        const request = list.find((r) => r.id === payload.requestId);
        if (!request) {
          socket.emit("aid:help:fail", {
            roomId,
            requestId: payload.requestId,
            reason: "That request is no longer open.",
          });
          return;
        }
        if (request.fromUserId === s.userId) {
          socket.emit("aid:help:fail", {
            roomId,
            requestId: payload.requestId,
            reason: "You can't fund your own request.",
          });
          return;
        }
        const next = list.filter((r) => r.id !== request.id);
        if (next.length) roomAidRequests.set(roomId, next);
        else roomAidRequests.delete(roomId);
        broadcastAid(roomId);
        const granted = {
          roomId,
          requestId: request.id,
          borrowerId: request.fromUserId,
          borrowerName: request.fromName,
          helperId: s.userId,
          helperName: s.user.displayName,
          amount: request.amount,
          round: request.round,
        };
        // The request is now a debt tracked across the room, so a third captain
        // can back it (see backing:offer below).
        rememberLoan(roomId, {
          debtId: request.id,
          borrowerId: request.fromUserId,
          borrowerName: request.fromName,
          lenderId: s.userId,
          lenderName: s.user.displayName,
          amount: request.amount,
          round: request.round,
        });
        broadcastLoans(roomId);
        socket.emit("aid:granted", granted);
        const borrowerSockets = userSockets.get(request.fromUserId);
        if (borrowerSockets) {
          for (const sid of borrowerSockets)
            io.to(sid).emit("aid:granted", granted);
        }
      },
    );

    socket.on(
      "aid:repay",
      async (
        payload: { roomId?: string; amount?: number; debtId?: string },
        ack?: (result: { ok: boolean }) => void,
      ) => {
        const s = requireAuth();
        const { roomId, amount, debtId } = payload ?? {};
        if (
          !s ||
          !roomId ||
          s.roomId !== roomId ||
          !debtId ||
          amount === undefined ||
          !Number.isInteger(amount) ||
          amount < 0
        ) {
          ack?.({ ok: false });
          return;
        }
        const ok = await closeLoan(roomId, debtId, s.userId, amount).catch(
          () => false,
        );
        ack?.({ ok });
      },
    );

    socket.on("aid:settlements:request", (payload: { roomId?: string }) => {
      const s = requireAuth();
      if (!s || !payload?.roomId || s.roomId !== payload.roomId) return;
      void replayLoanSettlements(socket.id, s.userId, s.roomId);
    });

    // Let the lender redirect repayment to another active room member.
    // An empty target clears the redirect.
    socket.on(
      "loan:redirect",
      (payload: {
        roomId?: string;
        debtId?: string;
        targetUserId?: string;
      }) => {
        const s = requireAuth();
        if (!s) return;
        const roomId = payload?.roomId ?? s.roomId;
        const debtId = payload?.debtId;
        const targetUserId = payload?.targetUserId ?? "";
        if (!roomId || roomId !== s.roomId || !debtId) return;
        const loan = loanList(roomId).find((l) => l.debtId === debtId);
        if (!loan || loan.lenderId !== s.userId) return;
        if (!targetUserId) {
          delete loan.redirectToUserId;
          delete loan.redirectToName;
          updateLoan(roomId, loan);
          broadcastLoans(roomId);
          return;
        }
        if (targetUserId === loan.lenderId || targetUserId === loan.borrowerId)
          return;
        const target = roomMembers(roomId).find((m) => m.id === targetUserId);
        if (!target) return;
        loan.redirectToUserId = target.id;
        loan.redirectToName = target.displayName;
        updateLoan(roomId, loan);
        broadcastLoans(roomId);
      },
    );

    socket.on("loans:state:request", (payload: { roomId?: string }) => {
      const s = requireAuth();
      if (!s) return;
      const roomId = payload?.roomId ?? s.roomId;
      if (!roomId || roomId !== s.roomId) return;
      socket.emit("loans:update", { roomId, loans: loanList(roomId) });
    });

    // Allow one unrelated captain to back an outstanding loan up to its value.
    socket.on(
      "backing:offer",
      (payload: { roomId?: string; debtId?: string; amount?: number }) => {
        const s = requireAuth();
        if (!s) return;
        const roomId = payload?.roomId ?? s.roomId;
        const debtId = payload?.debtId;
        const amount = payload?.amount;
        if (
          !roomId ||
          roomId !== s.roomId ||
          !debtId ||
          !Number.isInteger(amount) ||
          (amount as number) < 1
        )
          return;
        const loan = loanList(roomId).find((l) => l.debtId === debtId);
        if (!loan) {
          socket.emit("backing:fail", {
            roomId,
            debtId,
            reason: "That loan is no longer outstanding.",
          });
          return;
        }
        if (loan.borrowerId === s.userId || loan.lenderId === s.userId) {
          socket.emit("backing:fail", {
            roomId,
            debtId,
            reason: "You can't back a loan you're already part of.",
          });
          return;
        }
        if (loan.backerId) {
          socket.emit("backing:fail", {
            roomId,
            debtId,
            reason: "That loan already has a backer.",
          });
          return;
        }
        const accepted = Math.min(amount as number, loan.amount);
        loan.backerId = s.userId;
        loan.backerName = s.user.displayName;
        loan.backedAmount = accepted;
        updateLoan(roomId, loan);
        broadcastLoans(roomId);
        const acceptedEvent = { ...loan, roomId };
        const backerSockets = userSockets.get(s.userId);
        if (backerSockets) {
          for (const sid of backerSockets)
            io.to(sid).emit("backing:accepted", acceptedEvent);
        }
      },
    );

    // Player detail relay
    // Request cargo, workers, and logs only for the captain detail popup.
    socket.on(
      "player:detail:request",
      (payload: { roomId?: string; targetUserId?: string }) => {
        const s = requireAuth();
        if (!s) return;
        const roomId = payload?.roomId ?? s.roomId;
        const targetUserId = payload?.targetUserId;
        if (!roomId || !targetUserId || roomId !== s.roomId) return;
        const targetSockets = userSockets.get(targetUserId);
        if (!targetSockets || targetSockets.size === 0) {
          socket.emit("player:detail:response", {
            roomId,
            targetUserId,
            data: null,
          });
          return;
        }
        for (const sid of targetSockets) {
          io.to(sid).emit("player:detail:request", {
            roomId,
            targetUserId,
            requesterId: s.userId,
          });
        }
      },
    );

    socket.on(
      "player:detail:response",
      (payload: {
        roomId?: string;
        targetUserId?: string;
        requesterId?: string;
        data?: unknown;
      }) => {
        const s = requireAuth();
        if (!s) return;
        const roomId = payload?.roomId;
        const requesterId = payload?.requesterId;
        // Only the player being asked about may answer for themselves.
        if (!roomId || !requesterId || payload?.targetUserId !== s.userId)
          return;
        const reqSockets = userSockets.get(requesterId);
        if (!reqSockets) return;
        for (const sid of reqSockets) {
          io.to(sid).emit("player:detail:response", {
            roomId,
            targetUserId: s.userId,
            data: payload?.data ?? null,
          });
        }
      },
    );

    socket.on(
      "chat:room",
      async (payload: { roomId?: string; content?: string }) => {
        const s = requireAuth();
        if (!s) return;
        const roomId = payload?.roomId ?? s.roomId;
        const content = (payload?.content ?? "").trim();
        if (!roomId || !content) return;
        if (content.length > 1000) return;
        // A muted captain keeps playing but cannot persist room chat messages
        // until the voyage ends.
        if (roomMutedUsers.get(roomId)?.has(s.userId)) {
          socket.emit("chat:muted", { roomId });
          return;
        }

        const msg = await db.message.create({
          data: { roomId, senderId: s.userId, recipientId: null, content },
          include: {
            sender: {
              select: PUBLIC_USER_SELECT,
            },
          },
        });
        io.to(`room:${roomId}`).emit("chat:room", {
          roomId,
          message: {
            id: msg.id,
            content: msg.content,
            createdAt: msg.createdAt,
            sender: publicUser(msg.sender),
          },
        });
      },
    );

    socket.on(
      "chat:dm",
      async (payload: { recipientId?: string; content?: string }) => {
        const s = requireAuth();
        if (!s) return;
        const recipientId = payload?.recipientId;
        const content = (payload?.content ?? "").trim();
        if (!recipientId || !content || recipientId === s.userId) return;
        if (content.length > 1000) return;

        const msg = await db.message.create({
          data: { roomId: null, senderId: s.userId, recipientId, content },
          include: {
            sender: {
              select: PUBLIC_USER_SELECT,
            },
            recipient: {
              select: PUBLIC_USER_SELECT,
            },
          },
        });

        const messagePayload = {
          id: msg.id,
          content: msg.content,
          createdAt: msg.createdAt,
          sender: publicUser(msg.sender),
          recipient: publicUser(msg.recipient!),
          mine: false,
        };

        // Echo back to sender (as "mine: true").
        socket.emit("chat:dm", { ...messagePayload, mine: true });

        // Deliver to all of the recipient's sockets.
        const recSet = userSockets.get(recipientId);
        if (recSet) {
          for (const sid of recSet) {
            io.to(sid).emit("chat:dm", messagePayload);
          }
        }
      },
    );

    // Authorize mute changes against the current database host and rebroadcast
    // the roster so every client receives the new mute state.
    socket.on(
      "chat:mute",
      async (payload: { roomId?: string; targetUserId?: string }) => {
        const s = requireAuth();
        if (!s) return;
        const roomId = payload?.roomId ?? s.roomId;
        const targetUserId = payload?.targetUserId;
        if (!roomId || roomId !== s.roomId || !targetUserId) return;
        const room = await db.room.findUnique({
          where: { id: roomId },
          select: { hostId: true },
        });
        if (!room || room.hostId !== s.userId) {
          socket.emit("room:error", {
            roomId,
            error: "Only the host can mute a captain.",
          });
          return;
        }
        // Keep the host's room chat controls available.
        if (targetUserId === room.hostId) return;
        let set = roomMutedUsers.get(roomId);
        if (!set) {
          set = new Set();
          roomMutedUsers.set(roomId, set);
        }
        set.add(targetUserId);
        await emitRoomMembers(roomId);
      },
    );

    socket.on(
      "chat:unmute",
      async (payload: { roomId?: string; targetUserId?: string }) => {
        const s = requireAuth();
        if (!s) return;
        const roomId = payload?.roomId ?? s.roomId;
        const targetUserId = payload?.targetUserId;
        if (!roomId || roomId !== s.roomId || !targetUserId) return;
        const room = await db.room.findUnique({
          where: { id: roomId },
          select: { hostId: true },
        });
        if (!room || room.hostId !== s.userId) return;
        const set = roomMutedUsers.get(roomId);
        if (!set || !set.delete(targetUserId)) return;
        if (set.size === 0) roomMutedUsers.delete(roomId);
        await emitRoomMembers(roomId);
      },
    );

    socket.on("presence:request", () => {
      const s = requireAuth();
      if (!s) return;
      socket.emit("presence:update", { users: onlineUsers() });
    });

    // Return a fresh checkpoint and readiness snapshot on request.
    socket.on("phase:state:request", async (payload: { roomId?: string }) => {
      const s = requireAuth();
      if (!s) return;
      const roomId = payload?.roomId ?? s.roomId;
      if (!roomId || roomId !== s.roomId) return;
      const cp = await getCheckpoint(roomId);
      const ledger = await readBarter(roomId);
      if (ledger) sendBarter(socket.id, s.userId, roomId, ledger);
      socket.emit("phase:ready_update", await readyStatePayload(roomId, cp));
    });

    // Starting the voyage
    // The host starts a room with at least two captains. Each client begins
    // Boon drafting from the room:started event.
    type StartRoom = { roomId?: string };
    socket.on("room:start", async (payload: StartRoom) => {
      const s = requireAuth();
      if (!s) return;
      const roomId = payload?.roomId ?? s.roomId;
      if (!roomId || roomId !== s.roomId) return;
      if (startingRooms.has(roomId)) return;

      const room = await db.room.findUnique({
        where: { id: roomId },
        select: {
          hostId: true,
          started: true,
          voyageEpoch: true,
          difficulty: true,
        },
      });
      if (!room) return;
      if (room.started) {
        socket.emit("room:error", {
          roomId,
          error: "This voyage has already set sail.",
        });
        return;
      }
      if (room.hostId !== s.userId) {
        socket.emit("room:error", {
          roomId,
          error: "Only the host can start the voyage.",
        });
        return;
      }
      const roster = await roomMemberIds(roomId);
      if (roster.length < 2) {
        socket.emit("room:error", {
          roomId,
          error: "Need at least 2 captains in the harbor to set sail.",
        });
        return;
      }

      if (startingRooms.has(roomId)) return;
      startingRooms.add(roomId);
      try {
        const rules = buildCurrentVoyageRules(
          roomId,
          room.voyageEpoch,
          room.difficulty,
        );
        await db.room.update({
          where: { id: roomId },
          data: {
            started: true,
            currentRound: 1,
            currentPhase: "5",
            phaseReleased: false,
            phasePulse: "{}",
            voyageResult: "",
            rulesVersion: rules.version,
            forecastPlan: JSON.stringify(rules),
            tidewatchSurge: false,
            docksWinnerId: null,
          },
        });
        const cp = await getCheckpoint(roomId);
        cp.rules = rules;
        cp.round = 1;
        cp.phase = "5";
        cp.readyUserIds.clear();
        cp.advancing = false;
        io.to(`room:${roomId}`).emit("room:started", {
          roomId,
          voyageEpoch: room.voyageEpoch,
          rules,
        });
        await broadcastReadyState(roomId, cp);
        // Record the voyage start in the harbor activity feed.
        void recordActivity({
          userId: s.userId,
          type: "voyage_start",
          detail: room.difficulty,
          roomId,
        });
      } finally {
        startingRooms.delete(roomId);
      }
    });

    // Restarting the voyage
    // Host only and valid whether or not the room has started. A restart
    // reopens joining, clears every member's persisted GameState, advances the
    // voyage epoch, and broadcasts a synchronized reset to connected clients.
    socket.on("room:restart", async (payload: { roomId?: string }) => {
      const s = requireAuth();
      if (!s) return;
      const roomId = payload?.roomId ?? s.roomId;
      if (!roomId || roomId !== s.roomId) return;
      if (restartingRooms.has(roomId)) return;

      const room = await db.room.findUnique({
        where: { id: roomId },
        select: { hostId: true, voyageEpoch: true },
      });
      if (!room) return;
      if (room.hostId !== s.userId) {
        socket.emit("room:error", {
          roomId,
          error: "Only the host can restart the voyage.",
        });
        return;
      }

      restartingRooms.add(roomId);
      try {
        // Resolve open ventures before advancing the voyage epoch, because
        // subsequent queries are scoped to the new epoch.
        await resolveExpiredVentures(roomId, room.voyageEpoch, 0, true);

        // Advance the voyage epoch so every captain derives a fresh shared seed.
        const [restarted] = await db.$transaction([
          db.room.update({
            where: { id: roomId },
            data: {
              started: false,
              currentRound: 1,
              currentPhase: "0",
              phaseReleased: false,
              phasePulse: "{}",
              barterLedger: "{}",
              voyageResult: null,
              rulesVersion: CURRENT_HARBOR_RULES,
              forecastPlan: "[]",
              tidewatchSurge: false,
              docksWinnerId: null,
              voyageEpoch: { increment: 1 },
            },
          }),
          db.gameState.deleteMany({ where: { roomId } }),
        ]);

        roomCheckpoints.delete(roomId);
        roomStatuses.delete(roomId);
        clearAid(roomId);
        // Clear debts together with the previous voyage's GameState.
        clearLoans(roomId);
        // Mutes last only for the current voyage.
        if (roomMutedUsers.delete(roomId)) emitRoomMembers(roomId);

        io.to(`room:${roomId}`).emit("room:restarted", {
          roomId,
          voyageEpoch: restarted.voyageEpoch,
          difficulty: restarted.difficulty,
          rules: readVoyageRules(restarted),
        });
        const cp = await getCheckpoint(roomId);
        await broadcastReadyState(roomId, cp);
        await broadcastVentures(roomId, restarted.voyageEpoch);
      } finally {
        restartingRooms.delete(roomId);
      }
    });

    socket.on("disconnect", () => {
      const s = sockets.get(socket.id);
      sockets.delete(socket.id);
      if (s && s.authed && s.userId) {
        const set = userSockets.get(s.userId);
        if (set) {
          set.delete(socket.id);
          if (set.size === 0) userSockets.delete(s.userId);
        }
        if (s.roomId) {
          // Preserve status while another socket for this user remains active.
          forgetStatusIfLastSocket(s.roomId, s.userId);
          io.to(`room:${s.roomId}`).emit("room:system", {
            roomId: s.roomId,
            content: `${s.user.displayName} has gone ashore`,
          });
          emitRoomMembers(s.roomId);
          // Start departure grace only after the user's final socket closes.
          if (!set || set.size === 0) scheduleDeparture(s.roomId, s.userId);
        }
        broadcastPresence();
      }
    });

    socket.on("error", (err) => {
      console.error("[realtime] socket error", socket.id, err);
    });
  });

  // Membership reconciliation at startup
  // Empty lobbies expire after a restart. Started voyages keep their seats.
  async function reconcileMembershipAfterBoot() {
    const members = await db.roomMember.findMany({
      where: { room: { started: false } },
      select: {
        roomId: true,
        userId: true,
      },
    });
    for (const m of members) {
      scheduleDeparture(m.roomId, m.userId);
    }
  }
  reconcileMembershipAfterBoot().catch((err) => {
    console.error("[realtime] boot reconciliation failed", err);
  });

  return io;
}
