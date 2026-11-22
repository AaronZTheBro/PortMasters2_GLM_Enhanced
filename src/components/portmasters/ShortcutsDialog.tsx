"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

const SHORTCUTS: Array<{
  group: string;
  items: Array<{ keys: string[]; label: string }>;
}> = [
  {
    group: "Global",
    items: [
      { keys: ["F1"], label: "Open help for the current screen" },
      { keys: ["Esc"], label: "Close dialog or popover" },
    ],
  },
  {
    group: "Game Room",
    items: [
      { keys: ["Ctrl", "S"], label: "Save current game state" },
      { keys: ["Ctrl", "N"], label: "Advance to next phase" },
      { keys: ["Ctrl", "R"], label: "Restart the voyage (host only)" },
      { keys: ["Ctrl / Cmd", "K"], label: "Open Quick Actions" },
    ],
  },
  {
    group: "Navigation",
    items: [
      { keys: ["Tab"], label: "Move focus forward" },
      { keys: ["Shift", "Tab"], label: "Move focus backward" },
      { keys: ["Enter"], label: "Activate focused element" },
      { keys: ["Space"], label: "Toggle switches or buttons" },
    ],
  },
  {
    group: "Rooms",
    items: [
      { keys: ["Enter"], label: "Create or join a room from the input" },
      { keys: ["Click"], label: "Click a captain to open a direct message" },
    ],
  },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-1.5 rounded-md border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/5 text-[11px] font-mono font-medium text-foreground/80 shadow-sm">
      {children}
    </kbd>
  );
}

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-4 sm:max-w-lg sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Available shortcuts depend on whether you are in the Lobby or a game
            room.
          </DialogDescription>
        </DialogHeader>
        <div className="pm-scroll -mr-2 grid max-h-[60dvh] gap-3 overflow-y-auto pr-2 sm:grid-cols-2">
          {SHORTCUTS.map((group) => (
            <section
              key={group.group}
              className="min-w-0 rounded-xl border border-border/70 bg-background/55 p-2.5"
            >
              <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
                {group.group}
              </h4>
              <div className="space-y-1.5">
                {group.items.map((item, i) => (
                  <div
                    key={i}
                    className="grid min-w-0 gap-1.5 rounded-lg px-2 py-2 transition-colors hover:bg-black/[0.03] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center dark:hover:bg-white/5"
                  >
                    <span className="min-w-0 text-sm text-foreground/80">
                      {item.label}
                    </span>
                    <div className="flex flex-wrap items-center gap-1 sm:justify-end">
                      {item.keys.map((k, j) => (
                        <span key={j} className="flex items-center gap-1">
                          {j > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              +
                            </span>
                          )}
                          <Kbd>{k}</Kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
