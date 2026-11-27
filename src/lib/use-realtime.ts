"use client";

import { useEffect, useMemo, useState } from "react";
import { getSocket, getAuthToken, type OnlineUser } from "@/lib/realtime";
import type { PublicUser } from "@/lib/api";

/**
 * Shared realtime connection and presence. The socket is a singleton; this
 * hook attaches listeners for presence/auth and returns the live socket so
 * components can subscribe to room, chat, and game status events.
 */
export function useRealtime(user: PublicUser | null) {
  // Lazily obtain the shared socket (singleton). Recomputed only when the
  // authenticated user changes.
  const socket = useMemo(() => (user ? getSocket() : null), [user]);
  const [connected, setConnected] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) {
      const timer = setTimeout(() => {
        setConnected(false);
        setAuthed(false);
        setAuthError(null);
        setOnlineUsers([]);
      }, 0);
      return () => clearTimeout(timer);
    }

    const onConnect = () => {
      setConnected(true);
      setAuthError(null);
      // Always present the token explicitly on (re)connect. The server also
      // tries to authenticate automatically from the session cookie, but that
      // only works when the realtime service shares an origin with the page;
      // this covers the case
      // where it is hosted on its own domain and never receives that cookie.
      socket.emit("auth", { token: getAuthToken() ?? undefined });
    };
    const onDisconnect = () => {
      setConnected(false);
      setAuthed(false);
    };
    const onAuthOk = () => {
      setAuthed(true);
      setAuthError(null);
    };
    const onAuthFail = (data: { error: string }) => {
      setAuthError(data.error);
    };
    const onPresence = (data: { users: OnlineUser[] }) => {
      setOnlineUsers(data.users ?? []);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("auth:ok", onAuthOk);
    socket.on("auth:fail", onAuthFail);
    socket.on("presence:update", onPresence);

    let connectedSyncTimer: ReturnType<typeof setTimeout> | null = null;

    if (socket.connected) {
      connectedSyncTimer = setTimeout(() => {
        setConnected(socket.connected);
      }, 0);
      socket.emit("auth", { token: getAuthToken() ?? undefined });
    }

    return () => {
      if (connectedSyncTimer) clearTimeout(connectedSyncTimer);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("auth:ok", onAuthOk);
      socket.off("auth:fail", onAuthFail);
      socket.off("presence:update", onPresence);
    };
  }, [socket]);

  return {
    socket,
    connected,
    authed,
    onlineUsers,
    authError: connected && !authed ? authError : null,
  };
}
