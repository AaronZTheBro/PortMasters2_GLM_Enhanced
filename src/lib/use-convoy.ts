"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Socket } from "socket.io-client";
import type { GameState } from "./game/types";
import type { VentureOutcome, VentureSettlement } from "./game/convoy";

type VentureContributor = {
  userId: string;
  name: string;
  amount: number;
};

export type ConvoyVenture = {
  id: string;
  posterId: string;
  posterName: string;
  targetGold: number;
  deadlineRound: number;
  payoutMultiplier: number;
  status: string;
  total: number;
  contributions: VentureContributor[];
};

export function useConvoy(
  socket: Socket | null,
  roomId: string,
  getGame: () => GameState,
  flush: () => Promise<void>,
  spendingRef: RefObject<boolean>,
  onSettled: (
    outcome: VentureOutcome,
    settlements: VentureSettlement[],
  ) => void,
) {
  const [ventures, setVentures] = useState<ConvoyVenture[]>([]);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    if (!socket) return;

    const onUpdate = (data: {
      roomId: string;
      ventures: ConvoyVenture[];
      locked: boolean;
    }) => {
      if (data.roomId !== roomId) return;
      setVentures(data.ventures);
      setLocked(data.locked);
    };
    const onSettledEvent = (data: {
      roomId: string;
      outcome: VentureOutcome;
      settlements: VentureSettlement[];
    }) => {
      if (data.roomId !== roomId) return;
      onSettledRef.current(data.outcome, data.settlements);
    };
    const onPostError = (data: { roomId: string; error: string }) => {
      if (data.roomId !== roomId) return;
      setError(data.error);
    };

    socket.on("venture:update", onUpdate);
    socket.on("venture:resolved", onSettledEvent);
    socket.on("venture:error", onPostError);
    socket.emit("venture:state:request", { roomId });

    return () => {
      socket.off("venture:update", onUpdate);
      socket.off("venture:resolved", onSettledEvent);
      socket.off("venture:error", onPostError);
    };
  }, [socket, roomId]);

  const post = useCallback(
    (targetGold: number, deadlineRound: number) => {
      if (!socket) return;
      socket.emit("venture:post", { roomId, targetGold, deadlineRound });
    },
    [socket, roomId],
  );

  const contribute = useCallback(
    async (ventureId: string, amount: number) => {
      if (!socket?.connected || spendingRef.current || getGame().readyVote)
        return;
      spendingRef.current = true;
      setBusy(true);
      setError(null);
      try {
        await flush();
        const result: { error: string | null } = await socket
          .timeout(5000)
          .emitWithAck("venture:contribute", { roomId, ventureId, amount });
        setError(result.error);
      } catch {
        setError(
          "Could not confirm the contribution. Check the Convoy Venture board before trying again.",
        );
        socket.emit("barter:state:request", { roomId });
        socket.emit("venture:state:request", { roomId });
      } finally {
        spendingRef.current = false;
        setBusy(false);
      }
    },
    [flush, getGame, roomId, socket, spendingRef],
  );

  return {
    ventures,
    busy,
    locked,
    error,
    clearError: () => setError(null),
    post,
    contribute,
  };
}
