"use client";

import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import type { GameStatusUpdate, RoomMemberLive } from "@/lib/realtime";
import type { PublicUser } from "@/lib/api";

export type RoomStatusMap = Record<string, GameStatusUpdate>;

/** Shared roster subscription with deduplicated members and current statuses. */
export function useRoomRoster(
  socket: Socket | null,
  roomId: string,
  initialMembers: (PublicUser & { joinedAt?: string })[],
) {
  const [members, setMembers] = useState<RoomMemberLive[]>(initialMembers);
  const [statuses, setStatuses] = useState<RoomStatusMap>({});
  // Mute state arrives with the roster and needs no extra subscription.
  const [mutedUserIds, setMutedUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!socket) return;

    const onMembers = (data: {
      roomId: string;
      members: RoomMemberLive[];
      mutedUserIds?: string[];
    }) => {
      if (data.roomId !== roomId) return;
      setMutedUserIds(new Set(data.mutedUserIds ?? []));
      // Deduplicate ids before React reconciliation.
      const seen = new Set<string>();
      const filtered = data.members.filter((m) =>
        seen.has(m.id) ? false : (seen.add(m.id), true),
      );
      setMembers(filtered);
      // Remove status entries for captains outside the current roster.
      const memberIds = new Set(filtered.map((m) => m.id));
      setStatuses((prev) => {
        let changed = false;
        const next: RoomStatusMap = {};
        for (const [id, st] of Object.entries(prev)) {
          if (memberIds.has(id)) {
            next[id] = st;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };
    const onStatus = (u: GameStatusUpdate) => {
      if (u.roomId !== roomId) return;
      setStatuses((prev) => ({ ...prev, [u.user.id]: u }));
    };

    socket.on("room:members", onMembers);
    socket.on("game:status", onStatus);
    return () => {
      // Unmount detaches listeners but does not represent a deliberate departure.
      socket.off("room:members", onMembers);
      socket.off("game:status", onStatus);
    };
  }, [socket, roomId]);

  return { members, statuses, mutedUserIds };
}
