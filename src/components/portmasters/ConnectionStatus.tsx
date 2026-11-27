"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ConnectionStatus: a small, unobtrusive Socket.IO health indicator.
//
// States:
// Connected uses a solid green dot.
// Connecting uses a yellow pulsing dot.
// Disconnected uses a red dot and shows the "Reconnecting..." label.
//
// On disconnect a subtle toast fires once (not on every reconnection attempt)
// so the captain knows something is wrong without being spammed.
export type ConnectionState = "connected" | "connecting" | "disconnected";

type Props = {
  /** Derived from useRealtime's connected + authed flags. */
  state: ConnectionState;
  /** Extra class name for positioning in the host layout. */
  className?: string;
};

export function SessionNotice({ reason }: { reason: string }) {
  return (
    <div role="alert" className="text-xs text-rose-700 dark:text-rose-300">
      {reason}.{" "}
      <button
        type="button"
        className="font-medium underline"
        onClick={() => window.location.reload()}
      >
        Reload session
      </button>
    </div>
  );
}

export function ConnectionStatus({ state, className }: Props) {
  // Fire the "Connection lost" toast at most once per disconnect cycle,
  // not on every reconnection attempt. Reset when we reconnect.
  const prevRef = useRef<ConnectionState>(state);
  const toastShown = useRef(false);

  useEffect(() => {
    if (
      state === "disconnected" &&
      prevRef.current !== "disconnected" &&
      !toastShown.current
    ) {
      toastShown.current = true;
      toast("Connection lost. Reconnecting…", {
        description:
          "The harbor will rejoin automatically once the signal returns.",
        duration: 4000,
      });
    }
    if (state === "connected") {
      toastShown.current = false;
    }
    prevRef.current = state;
  }, [state]);

  const [hovered, setHovered] = useState(false);

  const dotColor = {
    connected: "bg-emerald-400",
    connecting: "bg-amber-400",
    disconnected: "bg-rose-500",
  }[state];

  const glowColor = {
    connected: "0 0 6px 1px oklch(0.75 0.18 150 / 0.6)",
    connecting: "0 0 6px 1px oklch(0.78 0.15 85 / 0.5)",
    disconnected: "0 0 6px 1px oklch(0.6 0.2 25 / 0.5)",
  }[state];

  const label = {
    connected: "Connected",
    connecting: "Connecting…",
    disconnected: "Reconnecting…",
  }[state];

  const isPulsing = state === "connecting";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 group cursor-default",
        className,
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="status"
      aria-label={label}
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        {isPulsing && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400/60 animate-ping" />
        )}
        <span
          className={cn(
            "inline-flex h-2.5 w-2.5 rounded-full transition-colors duration-300",
            dotColor,
          )}
          style={{ boxShadow: state !== "disconnected" ? glowColor : "none" }}
        />
      </span>
      {state === "disconnected" && (
        <span className="text-[10px] font-medium text-rose-600 dark:text-rose-400 leading-none">
          Reconnecting…
        </span>
      )}
      {state !== "disconnected" && hovered && (
        <span className="text-[10px] font-medium text-muted-foreground leading-none">
          {label}
        </span>
      )}
    </div>
  );
}

// Helper to derive the state from useRealtime's flags.
export function deriveConnectionState(
  connected: boolean,
  authed: boolean,
): ConnectionState {
  if (connected && authed) return "connected";
  if (connected && !authed) return "connecting";
  return "disconnected";
}
