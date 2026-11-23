"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  applyBarterEntries,
  type BarterUpdate,
} from "@/lib/game/barter-ledger";
import type { GameState } from "@/lib/game/types";

export type { BarterOffer } from "@/lib/game/barter-ledger";

export function useBarter(
  socket: Socket | null,
  roomId: string,
  enabled: boolean,
  epoch: number,
  getGame: () => GameState,
  act: (fn: (game: GameState, logs: string[]) => void) => void,
  flush: () => Promise<void>,
) {
  const [board, setBoard] = useState<BarterUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  useEffect(() => {
    if (!socket || !enabled) return;
    const onUpdate = (update: BarterUpdate) => {
      const game = getGame();
      if (update.roomId !== roomId || update.epoch !== game.voyageEpoch) return;
      setBoard((previous) =>
        previous?.epoch === update.epoch && previous.revision > update.revision
          ? previous
          : update,
      );
      if (update.entries.some(({ id }) => id > (game.barterCursor ?? 0))) {
        act((state, logs) => applyBarterEntries(state, update.entries, logs));
        void flush().catch(() => {});
      }
    };
    socket.on("barter:update", onUpdate);
    socket.emit("barter:state:request", { roomId });
    return () => {
      socket.off("barter:update", onUpdate);
    };
  }, [act, enabled, epoch, flush, getGame, roomId, socket]);

  const send = useCallback(
    async (action: Record<string, unknown>) => {
      if (
        !socket?.connected ||
        !enabled ||
        sending.current ||
        getGame().readyVote
      )
        return false;
      sending.current = true;
      setBusy(true);
      setError(null);
      try {
        await flush();
        if (getGame().readyVote) return false;
        const result: { error: string | null } = await socket
          .timeout(5000)
          .emitWithAck("barter:action", { roomId, ...action });
        setError(result.error);
        return !result.error;
      } catch {
        setError(
          "Could not confirm the trade. Check the offer board and try again.",
        );
        socket.emit("barter:state:request", { roomId });
        return false;
      } finally {
        sending.current = false;
        setBusy(false);
      }
    },
    [enabled, flush, getGame, roomId, socket],
  );

  return {
    offers: board?.epoch === epoch ? board.offers : [],
    error,
    busy,
    clearError: () => setError(null),
    post: (
      offerItem: string,
      offerAmount: number,
      requestItem: string,
      requestAmount: number,
      targetUserId?: string,
    ) =>
      send({
        kind: "post",
        offerItem,
        offerAmount,
        requestItem,
        requestAmount,
        targetUserId,
      }),
    cancel: (offerId: string) => send({ kind: "cancel", offerId }),
    accept: (offerId: string) => send({ kind: "accept", offerId }),
  };
}
