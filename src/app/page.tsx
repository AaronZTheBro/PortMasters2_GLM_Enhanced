"use client";

import { useEffect, useState } from "react";
import { api, type PublicUser, type RoomSummary } from "@/lib/api";
import { disconnectSocket, setAuthToken } from "@/lib/realtime";
import { AuthScreen } from "@/components/portmasters/AuthScreen";
import { Lobby } from "@/components/portmasters/Lobby";
import { GameRoom } from "@/components/portmasters/GameRoom";
import { Anchor } from "lucide-react";

type Status = "loading" | "auth" | "lobby" | "game" | "restoreError";

export default function Home() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [room, setRoom] = useState<RoomSummary | null>(null);

  // Restore the session and durable room membership together. Membership
  // defines the synchronized roster, so an active captain returns to the room.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { user: u, token } = await api.me();
        if (!alive) return;
        if (!u) {
          setStatus("auth");
          return;
        }
        setAuthToken(token);
        setUser(u);
        const active = await api.getActiveRoom();
        if (!alive) return;
        if (active.room) {
          setRoom(active.room);
          setStatus("game");
        } else {
          setStatus("lobby");
        }
      } catch {
        if (alive) setStatus("restoreError");
      }
    })();
    return () => {
      alive = false;
    };
  }, [restoreAttempt]);

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    // Disconnect before clearing auth so presence cannot retain the session.
    disconnectSocket();
    setAuthToken(null);
    setUser(null);
    setStatus("auth");
    setRoom(null);
  }

  if (status === "loading") {
    return (
      <div className="pm-canvas min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="pm-grad-primary h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg">
            <Anchor className="h-6 w-6 text-white" />
          </div>
          <span className="text-sm">Reading the tide tables…</span>
        </div>
      </div>
    );
  }

  if (status === "restoreError") {
    return (
      <main className="pm-canvas grid min-h-dvh place-items-center p-4 text-center">
        <div role="alert" className="space-y-3">
          <p>Could not restore your harbor.</p>
          <button
            className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
            onClick={() => {
              setStatus("loading");
              setRestoreAttempt((attempt) => attempt + 1);
            }}
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (status === "auth" || !user) {
    return (
      <AuthScreen
        onAuthed={(u, token) => {
          setAuthToken(token);
          setUser(u);
          setStatus("lobby");
        }}
      />
    );
  }

  if (status === "game" && room) {
    return (
      <GameRoom
        key={room.id}
        me={user}
        room={room}
        onLeave={() => {
          setRoom(null);
          setStatus("lobby");
        }}
      />
    );
  }

  return (
    <Lobby
      me={user}
      onEnterRoom={(joined) => {
        setRoom(joined);
        setStatus("game");
      }}
      onLogout={handleLogout}
    />
  );
}
