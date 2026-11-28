"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BOONS,
  MODULES,
  WORD_ON_THE_DOCKS_LEDGER_ENTRY,
} from "@/lib/game/constants";
import { api } from "@/lib/api";
import { recordVoyageMilestones } from "@/lib/game/milestones";
import type { Socket } from "socket.io-client";
import {
  claimWordOnTheDocksReward,
  phaseLabel,
  showWelcome,
  snapToCheckpoint,
} from "@/lib/game/engine";
import {
  createInitialGameState,
  normalizeInventory,
  normalizeWorkerRoster,
  type GameContext,
  type GameState,
} from "@/lib/game/types";
import { renownStartingGoldBonus } from "@/lib/game/legacy";
import { normalizeDifficulty, type Difficulty } from "@/lib/game/difficulty";
import type { Module } from "@/lib/game/constants";
import { voyageBoon, voyageModule } from "@/lib/game/pools";
import { restoreBrokerWhispers } from "@/lib/game/broker-whispers";
import { REAGENT_RULES, type VoyageRules } from "@/lib/game/expansion";
import { refreshFavorModifiers, repairSavedRack } from "@/lib/game/reagents";

// Maximum retained ledger lines. The APPLY reducer enforces this cap.
const LEDGER_LINE_CAP = 500;

type SessionState = {
  game: GameState;
  logs: string[];
  // Lines added by the latest APPLY action, captured before older ledger
  // entries are trimmed. Toasts consume this delta directly.
  newLines: string[];
  loaded: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  loadError: boolean;
};

type Action =
  | { type: "INIT"; game: GameState; logs: string[] }
  | {
      type: "APPLY";
      fn: (g: GameState, logs: string[]) => void;
    }
  | {
      type: "START_FRESH";
      checkpoint?: {
        round: number;
        phase: string;
        harborPulse?: Record<string, number>;
      } | null;
      ctx?: GameContext;
      startingGoldBonus?: number;
      renownLevel?: number;
      voyageEpoch?: number;
      difficulty?: Difficulty;
      rules?: VoyageRules;
      tidewatchSurge?: boolean;
    }
  | { type: "SAVE_STATUS"; status: SessionState["saveStatus"] }
  | { type: "LOAD_ERROR" }
  | { type: "LOAD_START" };

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "INIT":
      return {
        ...state,
        game: action.game,
        logs: action.logs,
        newLines: [],
        loaded: true,
        loadError: false,
      };
    case "START_FRESH": {
      const g = createInitialGameState(
        action.startingGoldBonus ?? 0,
        action.renownLevel ?? 1,
        action.voyageEpoch ?? 0,
        action.difficulty,
        action.rules,
      );
      g.seatSeed = action.ctx?.seedBase;
      g.tidewatchSurge = action.tidewatchSurge ?? false;
      const logs: string[] = [];
      showWelcome(g, logs);
      // A genuinely new captain (no save of their own yet) joins wherever
      // the room's checkpoint already is, instead of always at round 1.
      const cp = action.checkpoint;
      if (cp && action.ctx && (cp.round > 1 || cp.phase !== "0")) {
        g.harborPulse = cp.harborPulse ?? {};
        snapToCheckpoint(g, action.ctx, cp.round, cp.phase, logs);
      }
      recordVoyageMilestones(g);
      return {
        ...state,
        game: g,
        logs,
        newLines: [],
        loaded: true,
        loadError: false,
      };
    }
    case "APPLY": {
      if (!state.loaded) return state;
      const game = structuredClone(state.game) as GameState;
      const logs = [...state.logs];
      const before = logs.length;
      action.fn(game, logs);
      recordVoyageMilestones(game);
      const newLines = logs.slice(before);
      if (logs.length > LEDGER_LINE_CAP)
        logs.splice(0, logs.length - LEDGER_LINE_CAP);
      return { ...state, game, logs, newLines, saveStatus: "saving" };
    }
    case "SAVE_STATUS":
      return {
        ...state,
        saveStatus: action.status,
      };
    case "LOAD_START":
      return { ...state, loaded: false, loadError: false };
    case "LOAD_ERROR":
      return { ...state, loadError: true };
    default:
      return state;
  }
}

export function useGameSession(
  roomId: string,
  socket: Socket | null,
  enabled: boolean,
  userId: string = "",
) {
  // Each captain has a deterministic seed identity for markets, orders, and
  // intel.
  const ctx: GameContext = useMemo(
    () => ({
      roomSeed: roomId,
      seedBase: userId ? `${roomId}:${userId}` : roomId,
    }),
    [roomId, userId],
  );
  const [state, setState] = useState<SessionState>(() => ({
    game: createInitialGameState(),
    logs: [],
    newLines: [],
    loaded: false,
    loadError: false,
    saveStatus: "idle",
  }));
  const latest = useRef(state);
  const dispatch = useCallback((action: Action) => {
    const next = reducer(latest.current, action);
    latest.current = next;
    setState(next);
  }, []);
  const getGame = useCallback(() => latest.current.game, []);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const retryLoad = useCallback(() => {
    dispatch({ type: "LOAD_START" });
    setLoadAttempt((n) => n + 1);
  }, [dispatch]);
  const savedGame = useRef<GameState | null>(null);
  const savedRevision = useRef<number | null>(null);
  // The captain's Renown level translates to a small starting Gold bonus
  // (see src/lib/game/legacy.ts) applied both to a brand new voyage below
  // and, later, to a restart initiated by the host (see usePhaseSync, which
  // takes this as a parameter so its own reset stays consistent with
  // whatever a fresh join would grant).
  const [startingGoldBonus, setStartingGoldBonus] = useState(0);

  // Load saved state on mount / room change.
  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    // A failed read must leave the saved voyage intact.
    const LOAD_TIMEOUT_MS = 12_000;
    let loadTimedOut = false;
    const timeoutId = setTimeout(() => {
      if (!alive) return;
      loadTimedOut = true;
      dispatch({ type: "LOAD_ERROR" });
    }, LOAD_TIMEOUT_MS);

    (async () => {
      try {
        const [
          {
            state: raw,
            checkpoint,
            revision,
            difficulty: roomDifficulty,
            rules,
            tidewatchSurge,
            docksWon,
          },
          legacyResult,
        ] = await Promise.all([
          api.getGameState(roomId),
          // A brand new captain (no CaptainLegacy row yet) or a fetch
          // that fails outright just means no bonus this load; never
          // block picking up the actual voyage over it.
          api.getLegacy().catch(() => null),
        ]);
        if (!alive || loadTimedOut) return;
        clearTimeout(timeoutId);
        const goldBonus = legacyResult
          ? renownStartingGoldBonus(legacyResult.legacy.renownLevel)
          : 0;
        const renownLevel = legacyResult ? legacyResult.legacy.renownLevel : 1;
        setStartingGoldBonus(goldBonus);
        savedRevision.current = revision ?? null;
        if (raw) {
          const game = JSON.parse(raw) as GameState;
          // Ensure required arrays exist for backward compatibility.
          game.purchasedCards = game.purchasedCards ?? [];
          game.completedOrders = game.completedOrders ?? [];
          game.resourceCards = game.resourceCards ?? [];
          game.customerCards = game.customerCards ?? [];
          const version = rules?.version ?? game.rulesVersion;
          const restoreModule = (saved: Module) =>
            voyageModule(
              MODULES.find(({ id }) => id === saved.id) ?? saved,
              version,
            );
          game.equippedModules = (game.equippedModules ?? []).map(
            restoreModule,
          );
          game._draftChoices = game._draftChoices?.map(restoreModule);
          if (game._newModule) game._newModule = restoreModule(game._newModule);
          // Rebuild the artisan roster defensively: fills in any type this
          // save predates, and reads an older save that still carried
          // three separate weavers / masterWeavers / sachetMakers arrays.
          game.workers = normalizeWorkerRoster(
            (game as unknown as { workers?: unknown }).workers,
            game as unknown as {
              weavers?: GameState["workers"]["weaver"];
              masterWeavers?: GameState["workers"]["master"];
              sachetMakers?: GameState["workers"]["sachet_maker"];
            },
          );
          game.revealedIntel = game.revealedIntel ?? [];
          game.phase2DemandTags = game.phase2DemandTags ?? [];
          game.modifierFlags = game.modifierFlags ?? {};
          // Guarantees a key for every catalogued good and replaces any NaN
          // left by saves that predate the catalogue (stored as null by JSON).
          // This lets a damaged hold heal on load instead of staying broken.
          game.inventory = normalizeInventory(game.inventory);
          game.boonChoices = (game.boonChoices ?? []).map((saved) =>
            voyageBoon(
              BOONS.find(({ id }) => id === saved.id) ?? saved,
              version,
            ),
          );
          game.lastBoonId ??=
            BOONS.map((boon) => voyageBoon(boon, version)).find(
              ({ modifiers }) => {
                const keys = Object.keys(modifiers);
                return (
                  keys.length === Object.keys(game.modifierFlags).length &&
                  keys.every(
                    (key) => modifiers[key] === game.modifierFlags[key],
                  )
                );
              },
            )?.id ?? null;
          game.boonSwapUsed = game.boonSwapUsed ?? false;
          game.moduleSwapUsed = game.moduleSwapUsed ?? false;
          game.pirateAttackResolved = game.pirateAttackResolved ?? false;
          game.escortHired = game.escortHired ?? false;
          game.brokerTippedPirates = game.brokerTippedPirates ?? false;
          repairSavedRack(game);
          game.charterMarks = game.charterMarks ?? 0;
          game.charterMisses = game.charterMisses ?? 0;
          game.charterActsSettled = game.charterActsSettled ?? 0;
          game.charterComplete = game.charterComplete ?? false;
          game.heat = game.heat ?? 0;
          game.shadowGold = game.shadowGold ?? 0;
          game.goodsSold =
            game.goodsSold && typeof game.goodsSold === "object"
              ? game.goodsSold
              : {};
          game.bestRoundRevenue = game.bestRoundRevenue ?? 0;
          game.roundOrderRevenue = game.roundOrderRevenue ?? 0;
          game.producedLastRound =
            game.producedLastRound && typeof game.producedLastRound === "object"
              ? game.producedLastRound
              : {};
          game.silkShippedThisRound = game.silkShippedThisRound ?? 0;
          if (version === REAGENT_RULES) refreshFavorModifiers(game);
          game.debts = game.debts ?? [];
          game.loansGiven = game.loansGiven ?? [];
          game.defaultedDebt = game.defaultedDebt ?? false;
          // Refresh Renown from the freshly loaded legacy so a captain who
          // leveled up since this voyage was saved gets the current unlock
          // state; fall back to the saved value (then 1) if legacy is missing.
          game.renownLevel = legacyResult
            ? renownLevel
            : (game.renownLevel ?? 1);
          game.brokersFavorUsed = game.brokersFavorUsed ?? false;
          // Keep helper Reputation arithmetic finite for saves missing the
          // tally for each voyage.
          game.helperReputationEarned = game.helperReputationEarned ?? 0;
          // Missing voyage epochs belong to the room's first voyage.
          game.voyageEpoch = game.voyageEpoch ?? 0;
          game.seatSeed = ctx.seedBase;
          game.rulesVersion = rules?.version ?? game.rulesVersion;
          game.forecasts = rules?.forecasts ?? game.forecasts;
          game.arrivals = rules?.arrivals ?? game.arrivals;
          game.specialties = rules?.specialties ?? game.specialties;
          restoreBrokerWhispers(game);
          // Refresh difficulty from the room (the authoritative source), the
          // same reason renownLevel is refreshed above; default an old save
          // that predates difficulty to whatever tier the room is on.
          game.difficulty = normalizeDifficulty(
            roomDifficulty ?? game.difficulty,
          );
          const stored = game as GameState & { voyageLog?: string[] };
          const logs = Array.isArray(stored.voyageLog)
            ? stored.voyageLog
                .filter((line) => typeof line === "string")
                .slice(-LEDGER_LINE_CAP)
            : [];
          delete stored.voyageLog;
          game.docksRewardClaimed ??= logs.includes(
            WORD_ON_THE_DOCKS_LEDGER_ENTRY,
          );
          if (tidewatchSurge) game.tidewatchSurge = true;
          savedGame.current = game;
          const needsDocksReward = docksWon && !game.docksRewardClaimed;
          const restored = needsDocksReward ? { ...game } : game;
          if (needsDocksReward) claimWordOnTheDocksReward(restored, logs);
          recordVoyageMilestones(restored);
          dispatch({ type: "INIT", game: restored, logs });
          dispatch({
            type: "SAVE_STATUS",
            status: needsDocksReward ? "saving" : "saved",
          });
        } else {
          dispatch({
            type: "START_FRESH",
            checkpoint: checkpoint
              ? {
                  round: checkpoint.currentRound,
                  phase: checkpoint.currentPhase,
                  harborPulse: checkpoint.harborPulse,
                }
              : null,
            ctx,
            startingGoldBonus: goldBonus,
            renownLevel,
            voyageEpoch: checkpoint?.voyageEpoch ?? 0,
            difficulty: roomDifficulty,
            rules,
            tidewatchSurge,
          });
        }
      } catch {
        if (alive && !loadTimedOut) {
          clearTimeout(timeoutId);
          dispatch({ type: "LOAD_ERROR" });
        }
      }
    })();
    return () => {
      alive = false;
      clearTimeout(timeoutId);
    };
  }, [roomId, enabled, ctx, dispatch, loadAttempt]);

  // Broadcast live status to the room on every game change.
  const statusPhase = state.game.defaultedDebt
    ? "bankruptcy"
    : state.game.phase;
  const {
    currentRound,
    voyageEpoch,
    money,
    score,
    shipLevel,
    gameOver,
    rulesVersion,
  } = state.game;
  useEffect(() => {
    if (!enabled || !state.loaded || !socket) return;
    const sendStatus = () =>
      socket.emit("game:status", {
        roomId,
        round: currentRound,
        phase: statusPhase,
        phaseLabel: phaseLabel({
          phase: statusPhase,
          currentRound,
          rulesVersion,
        }),
        voyageEpoch,
        gold: money,
        reputation: score,
        shipLevel,
        gameOver,
      });
    const update = setTimeout(sendStatus, 120);
    const heartbeat = setInterval(sendStatus, 8000);
    return () => {
      clearTimeout(update);
      clearInterval(heartbeat);
    };
  }, [
    enabled,
    state.loaded,
    socket,
    roomId,
    currentRound,
    statusPhase,
    voyageEpoch,
    money,
    score,
    shipLevel,
    gameOver,
    rulesVersion,
  ]);

  const saveTail = useRef<Promise<void>>(Promise.resolve());
  const flush = useCallback(() => {
    const save = saveTail.current
      .catch(() => {})
      .then(async () => {
        const { game, logs, loaded } = latest.current;
        if (!loaded || game === savedGame.current) return;
        dispatch({ type: "SAVE_STATUS", status: "saving" });
        try {
          const revision =
            savedGame.current?.voyageEpoch === game.voyageEpoch
              ? savedRevision.current
              : null;
          const result = await api.saveGameState(
            roomId,
            { ...game, voyageLog: logs },
            revision,
          );
          savedRevision.current = result.revision;
          savedGame.current = game;
          if (latest.current.game === game) {
            dispatch({ type: "SAVE_STATUS", status: "saved" });
          }
        } catch (error) {
          dispatch({ type: "SAVE_STATUS", status: "error" });
          throw error;
        }
      });
    saveTail.current = save;
    return save;
  }, [dispatch, roomId]);

  useEffect(() => {
    if (!enabled || !state.loaded) return;
    const timer = setTimeout(() => void flush().catch(() => {}), 700);
    return () => clearTimeout(timer);
  }, [enabled, state.game, state.loaded, flush]);

  useEffect(() => {
    const onPageHide = () => void flush().catch(() => {});
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [flush]);

  const act = useCallback(
    (fn: (g: GameState, logs: string[]) => void) =>
      dispatch({ type: "APPLY", fn }),
    [dispatch],
  );

  return { state, act, ctx, flush, getGame, retryLoad, startingGoldBonus };
}
