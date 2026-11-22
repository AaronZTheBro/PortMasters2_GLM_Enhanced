"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Search,
  CornerDownLeft,
  X,
  Compass,
  Gamepad2,
  Eye,
  Users,
  HelpCircle,
  History,
  type LucideIcon,
} from "lucide-react";

// Types

export type QuickAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  group: string;
  shortcut?: string;
  disabled?: boolean;
  action: () => void;
};

/** Sound cues stay safe for server rendering and support tree shaking. */
export type QuickActionSound =
  "open" | "close" | "navigate" | "select" | "search";

type Props = {
  open: boolean;
  onClose: () => void;
  actions: QuickAction[];
  /** Optional sound callback fired on palette lifecycle events. */
  onSound?: (type: QuickActionSound) => void;
};

// Constants

const STORAGE_KEY = "pm2-quick-actions-recent";
const MAX_RECENT = 5;

// Group metadata

/** Visual + ordering metadata for each action group. The palette accepts any
 *  group string from the parent (so a parent can introduce its own group
 *  without touching this file); unknown groups fall back to the default
 *  icon/priority and sort after the known ones. */
type GroupMeta = {
  icon: LucideIcon;
  /** Lower sorts first. */
  priority: number;
  /** Optional override label (e.g. "Recently Used" for the synthetic recent
   *  group). When omitted, the raw group string is shown. */
  label?: string;
};

const RECENT_GROUP = "__recent__";

const GROUP_META: Record<string, GroupMeta> = {
  Navigation: { icon: Compass, priority: 0 },
  Game: { icon: Gamepad2, priority: 1 },
  View: { icon: Eye, priority: 2 },
  Social: { icon: Users, priority: 3 },
  Help: { icon: HelpCircle, priority: 4 },
  [RECENT_GROUP]: { icon: History, priority: -1, label: "Recently Used" },
};

function groupMeta(group: string): GroupMeta {
  return (
    GROUP_META[group] ?? {
      icon: Compass,
      priority: 99,
    }
  );
}

// Helpers

/** Simple fuzzy match: each char in the query must appear in order in the
 *  target, but not necessarily contiguous. Returns a score (higher = better
 *  match) or a negative value if no match. */
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastMatchIdx = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Bonus for consecutive matches and word prefix matches.
      const isConsecutive = lastMatchIdx === ti - 1;
      const isWordStart = ti === 0 || t[ti - 1] === " " || t[ti - 1] === "/";
      score += isConsecutive ? 2 : 1;
      score += isWordStart ? 2 : 0;
      lastMatchIdx = ti;
      qi++;
    }
  }

  return qi === q.length ? score : -1;
}

function loadRecentIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function saveRecentIds(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_RECENT)));
  } catch {
    // Ignore unavailable localStorage.
  }
}

/** Keyboard shortcut badge (mirrors the Kbd pattern from ShortcutsDialog). */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/5 text-[10px] font-mono font-medium text-foreground/60 shadow-sm">
      {children}
    </kbd>
  );
}

// Component

export function QuickActions({ open, onClose, actions, onSound }: Props) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  // Store recent IDs as state so they can be read during render without
  // the render safety issue that a ref would cause.
  const [recentIds, setRecentIds] = useState<string[]>(() => loadRecentIds());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the sound callback stable across parent renders.
  const onSoundRef = useRef(onSound);
  useEffect(() => {
    onSoundRef.current = onSound;
  }, [onSound]);

  // Reset and focus the search input when the palette opens.
  // Defer state updates until after the effect body.
  useEffect(() => {
    if (open) {
      onSoundRef.current?.("open");
      const t = setTimeout(() => {
        setQuery("");
        setActiveIndex(0);
        requestAnimationFrame(() => inputRef.current?.focus());
      }, 0);
      return () => clearTimeout(t);
    } else {
      onSoundRef.current?.("close");
    }
  }, [open]);

  // Filter + sort actions based on query and recency
  const visibleActions = useMemo(() => {
    const q = query.trim();

    // Fuzzy filter when there's a query
    if (q) {
      return actions
        .map((a) => ({ action: a, score: fuzzyScore(q, a.label) }))
        .filter((entry) => entry.score >= 0)
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.action);
    }

    // No query: sort with recently used first, then by group order, then
    // alphabetically within each group.
    return [...actions].sort((a, b) => {
      const aRecent = recentIds.indexOf(a.id);
      const bRecent = recentIds.indexOf(b.id);
      // Recently used items float to the top. A negative index means not recent.
      if (aRecent !== bRecent) {
        if (aRecent === -1) return 1;
        if (bRecent === -1) return -1;
        return aRecent - bRecent; // earlier in recent list = higher priority
      }
      const aGroup = groupMeta(a.group).priority;
      const bGroup = groupMeta(b.group).priority;
      if (aGroup !== bGroup) return aGroup - bGroup;
      return a.label.localeCompare(b.label);
    });
  }, [actions, query, recentIds]);

  // Group the visible actions for rendering headers. When there is no query,
  // recent actions are split into their own synthetic "__recent__" group at
  // the top, so the user can see what they reach for most often at a glance.
  const grouped = useMemo(() => {
    const recentSet = new Set(recentIds);
    const recentGroup: QuickAction[] = [];
    const byGroup = new Map<string, QuickAction[]>();

    for (const a of visibleActions) {
      if (query.trim() === "" && recentSet.has(a.id)) {
        recentGroup.push(a);
        continue;
      }
      const existing = byGroup.get(a.group);
      if (existing) existing.push(a);
      else byGroup.set(a.group, [a]);
    }

    const out: Array<[string, QuickAction[]]> = [];
    if (recentGroup.length > 0) {
      out.push([RECENT_GROUP, recentGroup]);
    }
    for (const [g, list] of Array.from(byGroup.entries()).sort(
      ([a], [b]) => groupMeta(a).priority - groupMeta(b).priority,
    )) {
      out.push([g, list]);
    }
    return out;
  }, [visibleActions, recentIds, query]);

  // Derive a clamped active index (never exceeds the list length).
  // Avoid an effect driven clamp and synchronous state updates.
  const effectiveActiveIndex = Math.min(
    activeIndex,
    Math.max(0, visibleActions.length - 1),
  );

  // Execute the currently active action
  const executeAction = useCallback(
    (action: QuickAction) => {
      if (action.disabled) return;
      // Record as recently used
      setRecentIds((prev) => {
        const next = prev.filter((id) => id !== action.id);
        next.unshift(action.id);
        const trimmed = next.slice(0, MAX_RECENT);
        saveRecentIds(trimmed);
        return trimmed;
      });
      onSound?.("select");
      // Close palette, then fire the action
      onClose();
      // Fire after close so the palette unmounts cleanly
      setTimeout(() => action.action(), 0);
    },
    [onClose, onSound],
  );

  // Keyboard handler for arrow navigation, enter, and escape
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          onSound?.("navigate");
          setActiveIndex((prev) =>
            prev < visibleActions.length - 1 ? prev + 1 : 0,
          );
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          onSound?.("navigate");
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : visibleActions.length - 1,
          );
          break;
        }
        case "Enter": {
          e.preventDefault();
          const active = visibleActions[effectiveActiveIndex];
          if (active) executeAction(active);
          break;
        }
        case "Escape": {
          e.preventDefault();
          onClose();
          break;
        }
      }
    },
    [visibleActions, effectiveActiveIndex, executeAction, onClose, onSound],
  );

  // Scroll the active item into view when it changes
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(
      `[data-action-index="${effectiveActiveIndex}"]`,
    );
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [effectiveActiveIndex]);

  // Action count badge
  const totalCount = actions.length;

  // Search input change handler : fires the "search" sound cue only when the
  // query actually changes (not on every keystroke that produces the same
  // value, which would be silent anyway).
  const handleQueryChange = useCallback(
    (v: string) => {
      setQuery((prev) => {
        if (v !== prev) onSound?.("search");
        return v;
      });
      setActiveIndex(0);
    },
    [onSound],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[78dvh] overflow-hidden rounded-2xl border-black/[0.06] p-0 shadow-2xl sm:max-w-[520px] dark:border-white/[0.12] [&>div]:gap-0 [&>div]:overflow-hidden"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Quick actions</DialogTitle>
          <DialogDescription>
            Search available game, navigation, social, and help actions.
          </DialogDescription>
        </DialogHeader>
        {/* Search header */}
        <div className="flex items-center gap-2.5 border-b border-black/[0.06] dark:border-white/[0.08] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground/70" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search…"
            className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 text-sm"
            aria-label="Search quick actions"
            autoComplete="off"
            spellCheck={false}
          />
          {/* Clear button */}
          {query !== "" && (
            <button
              type="button"
              onClick={() => handleQueryChange("")}
              className="inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground/60 hover:bg-black/[0.06] dark:hover:bg-white/[0.1] hover:text-foreground transition-colors shrink-0"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="inline-flex items-center justify-center h-5 min-w-[1.5rem] px-1.5 rounded-full bg-teal-500/10 dark:bg-teal-400/15 text-[10px] font-semibold text-teal-700 dark:text-teal-300 tabular-nums"
              title={`${totalCount} action${totalCount !== 1 ? "s" : ""} available`}
            >
              {totalCount}
            </span>
            <Kbd>Esc</Kbd>
          </div>
        </div>

        {/* Action list */}
        <ScrollArea className="max-h-[45vh]">
          <div ref={listRef} className="px-2 py-2">
            {visibleActions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/60">
                <Search className="h-7 w-7 mb-2 opacity-30" />
                <p className="text-xs font-medium">No actions found</p>
                <p className="text-[10px] text-muted-foreground/40 mt-0.5">
                  Try a different search term.
                </p>
              </div>
            ) : (
              grouped.map(([groupName, groupActions]) => {
                const meta = groupMeta(groupName);
                const GroupIcon = meta.icon;
                const headerLabel = meta.label ?? groupName;
                const groupCount = groupActions.length;

                return (
                  <div key={groupName} className="mb-1.5 last:mb-0">
                    {/* Group header */}
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <GroupIcon
                        className="h-3 w-3 text-muted-foreground/60"
                        aria-hidden
                      />
                      <span className="text-[10px] font-semibold tracking-widest text-muted-foreground/70">
                        {headerLabel}
                      </span>
                      <span className="text-[9px] text-muted-foreground/40 tabular-nums">
                        {groupCount}
                      </span>
                      <div className="flex-1 h-px bg-black/[0.04] dark:bg-white/[0.06]" />
                    </div>

                    {/* Action items */}
                    {groupActions.map((action) => {
                      // Use the action id as a stable key, but compute
                      // the flat index separately for keyboard nav.
                      const idx = visibleActions.indexOf(action);
                      const isActive = idx === effectiveActiveIndex;
                      const Icon = action.icon;

                      return (
                        <button
                          key={action.id}
                          data-action-index={idx}
                          onClick={() => executeAction(action)}
                          onMouseEnter={() => setActiveIndex(idx)}
                          disabled={action.disabled}
                          className={cn(
                            "w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-100 group",
                            isActive &&
                              !action.disabled &&
                              "bg-teal-500/10 dark:bg-teal-400/10",
                            isActive &&
                              action.disabled &&
                              "bg-black/[0.03] dark:bg-white/[0.05]",
                            !isActive &&
                              !action.disabled &&
                              "hover:bg-black/[0.03] dark:hover:bg-white/[0.05]",
                            action.disabled && "opacity-40",
                          )}
                          role="option"
                          aria-selected={isActive}
                          aria-disabled={action.disabled}
                        >
                          {/* Icon */}
                          <div
                            className={cn(
                              "flex items-center justify-center h-8 w-8 rounded-lg shrink-0 transition-colors",
                              isActive
                                ? "bg-teal-500/15 dark:bg-teal-400/15 text-teal-600 dark:text-teal-300"
                                : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground/70",
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>

                          {/* Label */}
                          <span
                            className={cn(
                              "flex-1 text-sm truncate",
                              isActive
                                ? "font-medium text-foreground"
                                : "text-foreground/80",
                              action.disabled &&
                                "line-through decoration-muted-foreground/30",
                            )}
                          >
                            {action.label}
                          </span>

                          {/* Shortcut hint */}
                          {action.shortcut && (
                            <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                              {action.shortcut.split("+").map((part, i) => (
                                <span
                                  key={i}
                                  className="flex items-center gap-0.5"
                                >
                                  {i > 0 && (
                                    <span className="text-[9px] text-muted-foreground/40 mx-0.5">
                                      +
                                    </span>
                                  )}
                                  <Kbd>{part}</Kbd>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Enter hint on active row */}
                          {isActive && !action.disabled && (
                            <CornerDownLeft className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Footer hint */}
        <div className="flex items-center justify-between border-t border-black/[0.04] dark:border-white/[0.06] px-4 py-2 text-[10px] text-muted-foreground/50">
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <span className="hidden sm:inline">navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd>
              <span className="hidden sm:inline">select</span>
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Esc</Kbd>
              <span className="hidden sm:inline">close</span>
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="hidden sm:inline">Quick Actions</span>
            <kbd className="inline-flex items-center justify-center h-5 px-1.5 rounded border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/5 text-[10px] font-mono font-medium text-foreground/60 shadow-sm">
              Ctrl+K
            </kbd>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Global keyboard hook

/** Call this hook at the game room level to bind Ctrl+K / Cmd+K to open the
 *  quick action palette.
 *
 *  Supports two calling conventions for backwards compatibility:
 *  Calling `useQuickActionTrigger()` returns the open state and setter for
 *  parents that want the hook to own the open state.
 *  Calling `useQuickActionTrigger(onOpen)` invokes `onOpen` every time Ctrl+K
 *  is pressed. This supports parents that manage their own state and only need
 *  the keybinding. The returned setters remain functional, but the parent
 *  typically ignores them in this mode. */
export function useQuickActionTrigger(onOpen?: () => void): {
  quickActionsOpen: boolean;
  setQuickActionsOpen: (v: boolean) => void;
} {
  const [open, setOpen] = useState(false);
  // Keep the callback in a ref so the keydown listener stays bound.
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // If a parent passed an onOpen callback, fire it (the parent manages
        // its own open state in that mode). Otherwise toggle our internal
        // state so the argument free calling convention keeps working.
        if (onOpenRef.current) {
          onOpenRef.current();
        } else {
          setOpen((prev) => !prev);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return { quickActionsOpen: open, setQuickActionsOpen: setOpen };
}
