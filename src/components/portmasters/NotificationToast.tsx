"use client";

import { TextWithShipIcons } from "./ShipVisualizer";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Renders message lines separately so their structure remains visible.
 * Dismiss and activation stay independent because either action may stand alone.
 */
export function NotificationToast({
  icon,
  title,
  lines,
  fromLedger,
  onActivate,
  toastId,
  dismiss,
}: {
  icon: string;
  title: string;
  lines: string[];
  fromLedger?: boolean;
  onActivate?: () => void;
  toastId: string | number;
  dismiss: (id: string | number) => void;
}) {
  const clickable = Boolean(onActivate);
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={
        clickable
          ? () => {
              onActivate!();
              dismiss(toastId);
            }
          : undefined
      }
      onKeyDown={
        clickable
          ? (event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onActivate!();
              dismiss(toastId);
            }
          : undefined
      }
      className={cn(
        "relative w-full text-left pm-glass-strong rounded-xl px-4 py-3 pr-8 shadow-xl border border-teal-500/25",
        clickable &&
          "pointer-events-auto cursor-pointer hover:border-teal-500/50 transition-colors",
      )}
    >
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={(e) => {
          e.stopPropagation();
          dismiss(toastId);
        }}
        className="pointer-events-auto absolute top-2.5 right-2.5 rounded-md p-0.5 text-muted-foreground/70 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="text-sm font-semibold mb-1 flex items-center gap-1.5">
        <span className="text-base">{icon}</span> {title}
      </div>
      <div className="space-y-0.5">
        {lines.slice(0, 3).map((line, i) => (
          <div
            key={i}
            className="line-clamp-2 text-[13px] text-foreground/85 leading-snug break-words"
          >
            {fromLedger ? <TextWithShipIcons>{line}</TextWithShipIcons> : line}
          </div>
        ))}
        {lines.length > 3 && (
          <p className="text-xs text-muted-foreground">More in Notifications</p>
        )}
      </div>
    </div>
  );
}
