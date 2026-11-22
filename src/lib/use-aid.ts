"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

export type AidRequest = {
  id: string;
  fromUserId: string;
  fromName: string;
  amount: number;
  round: number;
};

export type GrantedLoan = {
  requestId: string;
  borrowerId: string;
  borrowerName: string;
  helperId: string;
  helperName: string;
  amount: number;
  round: number;
};

export type RepaidLoan = {
  debtId: string;
  amount: number;
  fromUserId: string;
  fromName: string;
};

// Fires only on the original lender's own
// client, only for a loan they redirected before it was repaid: the Gold
// already went to the redirect target via onRepaid on their client
// instead, this is purely "stop tracking a debt that is no longer open."
export type RedirectedLoanClosed = {
  debtId: string;
  redirectedToName: string;
};

/**
 * Phase 3's shared "I'm short, can someone help" board: a thin relay
 * around the aid:* socket events (see src/server/realtime.ts). It stays
 * separate from GameState just like useBarter because an open request is
 * state shared by the room that no single client can compute alone. This hook
 * tracks the board and tells the caller when a loan is granted or repaid. The Gold
 * effect (debit the helper, credit the borrower, settle the debt) is the
 * caller's job via the engine functions in src/lib/game/engine.ts.
 *
 * `onGranted` fires once for every loan involving me, on both sides: as
 * the helper (debit my Gold, the request disappears from the board) and
 * as the borrower (credit my Gold, record the debt). The caller tells the
 * two apart from the `role` argument rather than comparing ids itself.
 */
export function useAid(
  socket: Socket | null,
  roomId: string,
  myUserId: string,
  onGranted: (loan: GrantedLoan, role: "borrower" | "helper") => void,
  onRepaid: (loan: RepaidLoan) => void,
  onRedirectedClosed?: (closed: RedirectedLoanClosed) => void,
) {
  const [requests, setRequests] = useState<AidRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  const onGrantedRef = useRef(onGranted);
  useEffect(() => {
    onGrantedRef.current = onGranted;
  }, [onGranted]);
  const onRepaidRef = useRef(onRepaid);
  useEffect(() => {
    onRepaidRef.current = onRepaid;
  }, [onRepaid]);
  const onRedirectedClosedRef = useRef(onRedirectedClosed);
  useEffect(() => {
    onRedirectedClosedRef.current = onRedirectedClosed;
  }, [onRedirectedClosed]);

  useEffect(() => {
    if (!socket) return;

    const onUpdate = (data: { roomId: string; requests: AidRequest[] }) => {
      if (data.roomId !== roomId) return;
      setRequests(data.requests);
    };
    const onGrantedEvent = (data: GrantedLoan & { roomId: string }) => {
      if (data.roomId !== roomId) return;
      const role =
        data.helperId === myUserId
          ? "helper"
          : data.borrowerId === myUserId
            ? "borrower"
            : null;
      if (role) onGrantedRef.current(data, role);
    };
    const onRepaidEvent = (data: RepaidLoan & { roomId: string }) => {
      if (data.roomId !== roomId) return;
      onRepaidRef.current(data);
    };
    const onRedirectedEvent = (
      data: RedirectedLoanClosed & { roomId: string },
    ) => {
      if (data.roomId !== roomId) return;
      onRedirectedClosedRef.current?.(data);
    };
    const onHelpFail = (data: {
      roomId: string;
      requestId: string;
      reason: string;
    }) => {
      if (data.roomId !== roomId) return;
      setError(data.reason);
    };
    const onPostError = (data: { roomId: string; error: string }) => {
      if (data.roomId !== roomId) return;
      setError(data.error);
    };

    socket.on("aid:update", onUpdate);
    socket.on("aid:granted", onGrantedEvent);
    socket.on("aid:repaid", onRepaidEvent);
    socket.on("aid:redirected", onRedirectedEvent);
    socket.on("aid:help:fail", onHelpFail);
    socket.on("aid:error", onPostError);
    socket.emit("aid:state:request", { roomId });

    return () => {
      socket.off("aid:update", onUpdate);
      socket.off("aid:granted", onGrantedEvent);
      socket.off("aid:repaid", onRepaidEvent);
      socket.off("aid:redirected", onRedirectedEvent);
      socket.off("aid:help:fail", onHelpFail);
      socket.off("aid:error", onPostError);
    };
  }, [socket, roomId, myUserId]);

  const post = useCallback(
    (amount: number) => {
      if (!socket) return;
      socket.emit("aid:post", { roomId, amount });
    },
    [socket, roomId],
  );

  const cancel = useCallback(() => {
    if (!socket) return;
    socket.emit("aid:cancel", { roomId });
  }, [socket, roomId]);

  const help = useCallback(
    (requestId: string) => {
      if (!socket) return;
      setError(null);
      socket.emit("aid:help", { roomId, requestId });
    },
    [socket, roomId],
  );

  const repay = useCallback(
    async (amount: number, debtId: string) => {
      if (!socket?.connected) return false;
      try {
        const result: { ok: boolean } = await socket
          .timeout(5000)
          .emitWithAck("aid:repay", { roomId, amount, debtId });
        return result.ok;
      } catch {
        return false;
      }
    },
    [socket, roomId],
  );

  return {
    requests,
    error,
    clearError: () => setError(null),
    post,
    cancel,
    help,
    repay,
  };
}
