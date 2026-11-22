"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { GameContext, GameState } from "@/lib/game/types";
import {
  restartGame,
  startBoonDrafting,
  tallyPurchasesByResource,
} from "@/lib/game/engine";
import { canAdvancePhase, nextPhase } from "@/lib/game/engine/lifecycle";
import { renownStartingGoldBonus } from "@/lib/game/legacy";
import { normalizeDifficulty } from "@/lib/game/difficulty";
import { api } from "@/lib/api";

export type ReadyState = {
  round: number;
  phase: string;
  advancing: boolean;
  harborPulse?: Record<string, number>;
  readyUserIds: string[];
  requiredUserIds: string[];
};

const PHASES = ["0", "5", "1", "barter", "worker_mgmt", "2", "3", "4"];

function rank(round: number, phase: string) {
  const index = PHASES.indexOf(phase);
  return index < 0 ? Infinity : round * PHASES.length + index;
}

export function usePhaseSync(
  roomId: string,
  socket: Socket | null,
  loaded: boolean,
  game: GameState,
  getGame: () => GameState,
  act: (fn: (g: GameState, logs: string[]) => void) => void,
  ctx: GameContext,
  flush: () => Promise<void>,
  authed: boolean,
  myUserId: string,
  startingGoldBonus: number,
) {
  const [ready, setReady] = useState<ReadyState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const voteInFlight = useRef(false);

  const advance = useCallback(
    (
      data: {
        round: number;
        phase: string;
        harborPulse?: Record<string, number>;
      },
      released: boolean,
    ) => {
      const current = getGame();
      const target = rank(data.round, data.phase) + Number(released);
      const currentRank = rank(current.currentRound, String(current.phase));
      if (currentRank >= target) return;
      if (current.phase !== 0 && !canAdvancePhase(current)) return;

      if (current.phase === 1 && currentRank < target) {
        socket?.emit("harbor:pulse:report", {
          roomId,
          round: current.currentRound,
          tally: tallyPurchasesByResource(current),
        });
      }
      act((state, logs) => {
        while (rank(state.currentRound, String(state.phase)) < target) {
          if (state.phase === 0) {
            startBoonDrafting(state, logs);
            continue;
          }
          if (!canAdvancePhase(state)) break;
          if (state.phase === 5 && data.harborPulse)
            state.harborPulse = data.harborPulse;
          nextPhase(state, ctx, logs);
        }
      });
      void flush().catch(() => {});
    },
    [act, ctx, flush, getGame, roomId, socket],
  );

  useEffect(() => {
    if (!socket || !loaded) return;
    const onReady = (data: ReadyState & { roomId: string }) => {
      if (data.roomId !== roomId) return;
      setReady(data);
      advance(data, data.advancing);
      const current = getGame();
      const vote = current.readyVote;
      if (
        !data.advancing &&
        vote?.round === data.round &&
        String(vote.phase) === data.phase &&
        !data.readyUserIds.includes(myUserId) &&
        socket.connected &&
        !voteInFlight.current
      ) {
        socket.emit("phase:ready", { roomId, ...vote });
      }
    };
    const onAdvance = (data: ReadyState & { roomId: string }) => {
      if (data.roomId === roomId) advance(data, true);
    };
    const onStarted = ({ roomId: startedRoom }: { roomId: string }) => {
      if (startedRoom === roomId) advance({ round: 1, phase: "5" }, false);
    };
    const onError = (data: { roomId: string; error: string }) => {
      if (data.roomId === roomId) setStartError(data.error);
    };
    const onRestarted = async (data: {
      roomId: string;
      voyageEpoch?: number;
      difficulty?: string;
    }) => {
      if (data.roomId !== roomId) return;
      setStartError(null);
      const result = await api.getLegacy().catch(() => null);
      const level = result?.legacy.renownLevel;
      act((state, logs) => {
        if (
          data.voyageEpoch !== undefined &&
          data.voyageEpoch <= state.voyageEpoch
        )
          return;
        restartGame(
          state,
          logs,
          level ? renownStartingGoldBonus(level) : startingGoldBonus,
          level ?? state.renownLevel,
          data.voyageEpoch ?? state.voyageEpoch + 1,
          normalizeDifficulty(data.difficulty ?? state.difficulty),
        );
      });
    };

    socket.on("phase:ready_update", onReady);
    socket.on("phase:advance", onAdvance);
    socket.on("room:started", onStarted);
    socket.on("room:restarted", onRestarted);
    socket.on("room:error", onError);
    if (authed) socket.emit("phase:state:request", { roomId });

    return () => {
      socket.off("phase:ready_update", onReady);
      socket.off("phase:advance", onAdvance);
      socket.off("room:started", onStarted);
      socket.off("room:restarted", onRestarted);
      socket.off("room:error", onError);
    };
  }, [
    socket,
    loaded,
    roomId,
    act,
    advance,
    authed,
    getGame,
    myUserId,
    startingGoldBonus,
  ]);

  const markReady = useCallback(
    async (boonId?: string) => {
      if (!socket?.connected || !authed || voteInFlight.current) return;
      const current = getGame();
      if (current.phase === 5) {
        if (!boonId || !current.boonChoices.some((boon) => boon.id === boonId))
          return;
      } else if (!canAdvancePhase(current)) return;

      const vote = { round: current.currentRound, phase: current.phase };
      voteInFlight.current = true;
      setSubmitting(true);
      setStartError(null);
      act((state) => {
        state.pendingBoonId = boonId;
        state.readyVote = vote;
      });
      try {
        await flush();
        if (socket.connected) socket.emit("phase:ready", { roomId, ...vote });
      } catch {
        act((state) => {
          state.readyVote = undefined;
          state.pendingBoonId = undefined;
        });
        setStartError("Could not save your progress. Try continuing again.");
      } finally {
        voteInFlight.current = false;
        setSubmitting(false);
      }
    },
    [act, authed, flush, getGame, roomId, socket],
  );

  const cancelReady = useCallback(async () => {
    if (!socket || voteInFlight.current) return;
    const vote = getGame().readyVote;
    act((state) => {
      state.readyVote = undefined;
      state.pendingBoonId = undefined;
    });
    socket.emit("phase:unready", { roomId, ...vote });
    await flush().catch(() => {});
  }, [act, flush, getGame, roomId, socket]);

  const startGame = useCallback(() => {
    setStartError(null);
    socket?.emit("room:start", { roomId });
  }, [roomId, socket]);

  const restartVoyage = useCallback(() => {
    socket?.emit("room:restart", { roomId });
  }, [roomId, socket]);

  const atCheckpoint =
    ready?.round === game.currentRound && ready.phase === String(game.phase);
  const waiting =
    submitting ||
    Boolean(game.readyVote) ||
    Boolean(atCheckpoint && ready.readyUserIds.includes(myUserId));
  return {
    waiting,
    ready,
    readyCount: ready?.readyUserIds.length ?? 0,
    requiredCount: ready?.requiredUserIds.length ?? 0,
    markReady,
    cancelReady,
    startGame,
    restartVoyage,
    startError,
  };
}
