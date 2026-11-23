"use client";

import { ShipIcon } from "./ShipVisualizer";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Socket } from "socket.io-client";
import type { PublicUser } from "@/lib/api";
import { useRoomRoster } from "@/lib/use-room-roster";
import { Avatar, OnlineDot, Pill } from "./shared";
import { cn, formatReputation } from "@/lib/utils";
import {
  Coins,
  Trophy,
  Crown,
  SkullIcon,
  VolumeX,
  Volume2,
} from "lucide-react";

/**
 * Live roster of room members, collapsed down to what matters at a glance:
 * gold, reputation, and whether they're still in the run. Click a row to
 * open the full detail popup (cargo, workers, log) in GameModals.tsx.
 */
export function MembersPanel({
  socket,
  roomId,
  me,
  initialMembers,
  hostId,
  onSelectPlayer,
}: {
  socket: Socket | null;
  roomId: string;
  me: PublicUser;
  initialMembers: (PublicUser & { joinedAt?: string })[];
  hostId: string;
  onSelectPlayer: (userId: string) => void;
}) {
  // Roster, captain status, and the host mute list come from the shared hook.
  // Only the system notice feed belongs to this panel.
  const { members, statuses, mutedUserIds } = useRoomRoster(
    socket,
    roomId,
    initialMembers,
  );
  const [systemNotes, setSystemNotes] = useState<string[]>([]);
  // Keep viewer host state distinct from each row host state.
  const viewerIsHost = me.id === hostId;

  // The room channel itself is joined again after every reconnect
  // from GameRoom.tsx, since that needs to happen exactly once per
  // connection regardless of which panels happen to be mounted.
  useEffect(() => {
    if (!socket) return;
    const onSystem = (data: { roomId: string; content: string }) => {
      if (data.roomId !== roomId) return;
      setSystemNotes((prev) => [...prev.slice(-12), data.content]);
    };
    socket.on("room:system", onSystem);
    return () => {
      // Only GameRoom.tsx emits "room:leave" for deliberate departures.
      socket.off("room:system", onSystem);
    };
  }, [socket, roomId]);

  // Sort: me first, then by reputation desc, then gold desc.
  const sorted = [...members].sort((a, b) => {
    if (a.id === me.id) return -1;
    if (b.id === me.id) return 1;
    const ra = statuses[a.id]?.reputation ?? -1;
    const rb = statuses[b.id]?.reputation ?? -1;
    if (rb !== ra) return rb - ra;
    return (statuses[b.id]?.gold ?? 0) - (statuses[a.id]?.gold ?? 0);
  });

  return (
    <div className="pm-glass rounded-2xl flex flex-col overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-black/5 dark:border-white/10 flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <ShipIcon className="h-4 w-4 text-teal-600 dark:text-teal-400" />{" "}
          Harbor Roster
        </h3>
        <Pill tone="sea">
          {members.length} captain{members.length !== 1 ? "s" : ""}
        </Pill>
      </div>

      <div className="pm-scroll flex-1 min-h-0 overflow-y-auto p-2.5 space-y-1.5">
        {sorted.map((m) => {
          const st = statuses[m.id];
          const isMe = m.id === me.id;
          const isHost = m.id === hostId;
          const isBankrupt = st?.phase === "bankruptcy";
          const isMuted = mutedUserIds.has(m.id);
          return (
            <motion.div
              key={m.id}
              layout
              role="button"
              tabIndex={0}
              whileHover={{ scale: 1.01, y: -1 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={() => onSelectPlayer(m.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectPlayer(m.id);
                }
              }}
              className={cn(
                "group flex w-full flex-wrap items-center gap-x-2.5 gap-y-2 rounded-xl border p-2 text-left transition-colors cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/[0.05] sm:flex-nowrap",
                isMe
                  ? "border-teal-500/30 bg-teal-500/[0.06]"
                  : isBankrupt
                    ? "border-rose-500/20 bg-rose-500/[0.04]"
                    : "border-black/5 dark:border-white/10 bg-background/40",
              )}
            >
              <div className="relative shrink-0">
                <Avatar hue={m.avatarHue} name={m.displayName} size={34} ring />
                <OnlineDot
                  online
                  size={10}
                  className="absolute -bottom-0.5 -right-0.5 ring-2 ring-background rounded-full"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold truncate">
                    {m.displayName}
                  </span>
                  {isHost && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[9px] font-bold tracking-wide shrink-0">
                      <Crown className="h-2.5 w-2.5" /> Host
                    </span>
                  )}
                  {isMe && (
                    <Pill tone="sea" className="!py-0">
                      you
                    </Pill>
                  )}
                  {isMuted && (
                    <Pill tone="rose" className="!py-0">
                      <VolumeX className="h-2.5 w-2.5" /> muted
                    </Pill>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                  {st ? `R${st.round} · ${st.phaseLabel}` : "loading…"}
                </div>
              </div>
              <div className="flex basis-full flex-wrap items-center justify-end gap-1.5 pl-11 sm:basis-auto sm:shrink-0 sm:pl-0">
                {isBankrupt ? (
                  <Pill tone="rose">
                    <SkullIcon className="h-3 w-3" /> Bankrupt
                  </Pill>
                ) : (
                  <>
                    <Pill tone="emerald">
                      <Coins className="h-3 w-3" /> {st ? st.gold : "…"}
                    </Pill>
                    <Pill tone="gold">
                      <Trophy className="h-3 w-3" />{" "}
                      {st ? formatReputation(st.reputation) : "…"}
                    </Pill>
                  </>
                )}
                {/* Host only, never on my own
                    row: the host can mute anyone else, never themselves. */}
                {viewerIsHost && !isMe && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      socket?.emit(isMuted ? "chat:unmute" : "chat:mute", {
                        roomId,
                        targetUserId: m.id,
                      });
                    }}
                    title={
                      isMuted ? "Unmute this captain" : "Mute this captain"
                    }
                    className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/10"
                    aria-label={
                      isMuted ? "Unmute this captain" : "Mute this captain"
                    }
                  >
                    {isMuted ? (
                      <Volume2 className="h-3.5 w-3.5" />
                    ) : (
                      <VolumeX className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
        {members.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-6">
            No captains in this harbor yet.
          </div>
        )}
      </div>

      {/* System notices */}
      {systemNotes.length > 0 && (
        <div className="border-t border-black/5 dark:border-white/10 px-3 py-2 max-h-16 overflow-y-auto pm-scroll">
          <AnimatePresence initial={false}>
            {systemNotes.slice(-2).map((n, i) => (
              <motion.div
                key={systemNotes.length - 2 + i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-[10px] text-muted-foreground italic"
              >
                {n}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
