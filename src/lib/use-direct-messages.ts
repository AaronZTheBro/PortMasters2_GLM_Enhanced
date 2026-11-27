"use client";

import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { toast } from "sonner";
import { api, type ChatMessage } from "./api";

// A live message can arrive while the history request is in flight.
export function mergeChatMessages(history: ChatMessage[], live: ChatMessage[]) {
  const messages = new Map(history.map((message) => [message.id, message]));
  for (const message of live) messages.set(message.id, message);
  return [...messages.values()].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

export function useDirectMessages(
  socket: Socket | null,
  myId: string,
  peerId?: string,
) {
  const [history, setHistory] = useState<{
    peerId: string;
    messages: ChatMessage[];
    loaded: boolean;
  } | null>(null);
  useEffect(() => {
    if (!peerId) return;
    let active = true;
    const load = async () => {
      const messages = await api
        .getDmHistory(peerId)
        .then((result) => result.messages)
        .catch(() => {
          if (active) toast.error("Could not load the conversation history.");
          return [];
        });
      if (!active) return;
      setHistory((old) => ({
        peerId,
        messages: mergeChatMessages(
          messages,
          old?.peerId === peerId ? old.messages : [],
        ),
        loaded: true,
      }));
    };
    const onMessage = (message: ChatMessage) => {
      const mine = message.sender.id === myId;
      if (
        mine
          ? message.recipient?.id !== peerId
          : message.sender.id !== peerId || message.recipient?.id !== myId
      )
        return;
      setHistory((old) => ({
        peerId,
        messages: mergeChatMessages(
          old?.peerId === peerId ? old.messages : [],
          [message],
        ),
        loaded: old?.peerId === peerId && old.loaded,
      }));
    };
    socket?.on("chat:dm", onMessage);
    socket?.on("auth:ok", load);
    load();
    return () => {
      active = false;
      socket?.off("chat:dm", onMessage);
      socket?.off("auth:ok", load);
    };
  }, [socket, myId, peerId]);
  return {
    messages: history && history.peerId === peerId ? history.messages : [],
    loading: Boolean(
      peerId && (history?.peerId !== peerId || !history?.loaded),
    ),
  };
}
