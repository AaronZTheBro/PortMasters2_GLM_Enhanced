"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { ChatMessage, PublicUser } from "@/lib/api";
import type { Socket } from "socket.io-client";
import { Avatar } from "./shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SendHorizontal, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** Room or direct chat. REST seeds history and socket events append updates. */
export function ChatPanel({
  socket,
  me,
  mode,
  roomId,
  other,
  messages,
  className,
  disabled,
  draft,
  onDraftChange,
}: {
  socket: Socket | null;
  me: PublicUser;
  mode: "room" | "dm";
  roomId?: string;
  other?: PublicUser;
  messages: ChatMessage[];
  className?: string;
  // Room mute state controls local input. The server enforces the restriction.
  disabled?: boolean;
  draft?: string;
  onDraftChange?: (value: string) => void;
}) {
  const [localInput, setLocalInput] = useState("");
  const input = draft ?? localInput;
  const setInput = onDraftChange ?? setLocalInput;
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest messages visible.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send() {
    const content = input.trim();
    if (!content || sending || !socket?.connected) return;
    setSending(true);
    try {
      const request = socket.timeout(5000);
      const error: string | null =
        mode === "room"
          ? await request.emitWithAck("chat:room", { roomId, content })
          : await request.emitWithAck("chat:dm", {
              recipientId: other?.id,
              content,
            });
      if (error) toast.error(error);
      else setInput("");
    } catch {
      toast.error(
        "Could not confirm delivery. Check the conversation before sending again.",
      );
    } finally {
      setSending(false);
    }
  }

  const emptyText =
    mode === "room"
      ? "No harbor messages to display."
      : "No direct messages to display.";

  return (
    <div className={cn("flex h-full flex-col min-h-0", className)}>
      <div
        ref={scrollRef}
        className="pm-scroll flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2.5"
      >
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center px-6">
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              {emptyText}
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.mine ?? m.sender.id === me.id;
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  "flex gap-2",
                  mine ? "flex-row-reverse" : "flex-row",
                )}
              >
                <Avatar
                  hue={m.sender.avatarHue}
                  name={m.sender.displayName}
                  size={26}
                />
                <div
                  className={cn(
                    "flex flex-col max-w-[78%]",
                    mine ? "items-end" : "items-start",
                  )}
                >
                  {!mine && (
                    <span className="text-[10px] text-muted-foreground mb-0.5 px-1">
                      {m.sender.displayName}
                    </span>
                  )}
                  <div
                    className={cn(
                      "px-3 py-1.5 rounded-2xl text-[13px] leading-snug break-words shadow-sm",
                      mine
                        ? "pm-grad-primary text-white rounded-br-md shadow-teal-500/10"
                        : "bg-black/[0.04] dark:bg-white/[0.08] rounded-bl-md border border-black/[0.04] dark:border-white/[0.08]",
                    )}
                  >
                    {m.content}
                  </div>
                  <span className="text-[9px] text-muted-foreground/70 mt-0.5 px-1">
                    {new Date(m.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
      {disabled ? (
        <div className="p-2.5 border-t border-black/5 dark:border-white/10 text-center text-xs text-muted-foreground">
          The host has muted you in room chat for the rest of this voyage.
        </div>
      ) : (
        <div className="pm-input-glow p-2.5 border-t border-black/5 dark:border-white/10 flex items-center gap-2">
          <Input
            disabled={sending}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              mode === "room"
                ? "Message the harbor…"
                : `Message ${other?.displayName ?? ""}…`
            }
            className="h-9 rounded-full bg-black/[0.04] dark:bg-white/[0.08] border-0 text-sm transition-shadow focus:ring-0 focus-visible:ring-0"
            maxLength={1000}
          />
          <Button
            size="icon"
            onClick={send}
            aria-label="Send message"
            disabled={!socket?.connected || !input.trim() || sending}
            className="h-9 w-9 rounded-full pm-grad-primary text-white shrink-0"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizontal className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
