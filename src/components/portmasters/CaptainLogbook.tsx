"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Feather,
  Trash2,
  Copy,
  Check,
  Loader2,
  Package,
  Coins,
  Skull,
  ArrowLeftRight,
  Anchor,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Props

type Props = {
  userId: string;
  /** Current room id : scopes the logbook to a specific game room. */
  roomId: string;
  /** Voyage epoch : each new voyage in the same room gets a fresh journal. */
  voyageEpoch: number;
  className?: string;
};

// Constants

const MAX_CHARS = 5000;
const DEBOUNCE_MS = 500;
const CONFIRM_RESET_MS = 3000;

type SaveStatus = "idle" | "saving" | "saved";

type Template = {
  id: string;
  icon: LucideIcon;
  label: string;
  text: string;
};

/** Quick note templates for common voyage reminders. */
const TEMPLATES: Template[] = [
  {
    id: "hemp",
    icon: Package,
    label: "Buy Hemp",
    text: "Buy more Hemp next round because stocks are running low.",
  },
  {
    id: "save-gold",
    icon: Coins,
    label: "Save Gold",
    text: "Save gold for the next ship upgrade at the Shipyard.",
  },
  {
    id: "pirates",
    icon: Skull,
    label: "Pirates",
    text: "Watch out for pirates and keep an escape fund ready.",
  },
  {
    id: "barter",
    icon: ArrowLeftRight,
    label: "Barter",
    text: "Barter with Captain X because they had cheap Silk last round.",
  },
  {
    id: "orders",
    icon: ClipboardCheck,
    label: "Fulfil Orders",
    text: "Fulfil outstanding orders before settling wages.",
  },
  {
    id: "anchor",
    icon: Anchor,
    label: "Hold Position",
    text: "Hold position this round and wait for better harbor prices.",
  },
];

// Helpers

function storageKey(
  userId: string,
  roomId: string,
  voyageEpoch: number,
): string {
  return `pm2_logbook_${userId}_${roomId}_${voyageEpoch}`;
}

function loadEntry(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    // localStorage unavailable (private mode, SSR, etc.) : degrade gracefully.
    return "";
  }
}

function persistEntry(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function formatSavedAt(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Clamp text to MAX_CHARS without splitting surrogate pairs. */
function clampText(input: string): string {
  if (input.length <= MAX_CHARS) return input;
  return Array.from(input).slice(0, MAX_CHARS).join("");
}

// Supporting components

function QuickNoteChip({
  template,
  onInsert,
}: {
  template: Template;
  onInsert: (text: string) => void;
}) {
  const Icon = template.icon;
  return (
    <button
      type="button"
      onClick={() => onInsert(template.text)}
      className="group/chip inline-flex items-center gap-1 rounded-full border border-amber-700/15 bg-amber-50/70 px-2.5 py-1 text-[11px] font-medium text-amber-800 transition-colors hover:border-amber-700/35 hover:bg-amber-100/80 hover:text-amber-900 dark:border-amber-300/15 dark:bg-amber-400/10 dark:text-amber-200 dark:hover:border-amber-300/30 dark:hover:bg-amber-400/20 dark:hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
      title={`Insert: ${template.text}`}
    >
      <Icon
        className="h-3 w-3 shrink-0 transition-transform group-hover/chip:scale-110"
        aria-hidden
      />
      <span className="whitespace-nowrap">{template.label}</span>
    </button>
  );
}

function SaveStatusBadge({
  status,
  lastSavedAt,
}: {
  status: SaveStatus;
  lastSavedAt: number | null;
}) {
  return (
    <div className="flex items-center gap-1 text-[10px] font-medium tabular-nums">
      <AnimatePresence mode="wait" initial={false}>
        {status === "saving" ? (
          <motion.span
            key="saving"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1 text-amber-600 dark:text-amber-400"
          >
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            <span>Saving…</span>
          </motion.span>
        ) : status === "saved" ? (
          <motion.span
            key="saved"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
          >
            <Check className="h-3 w-3" aria-hidden />
            <span>
              Saved{lastSavedAt ? ` · ${formatSavedAt(lastSavedAt)}` : ""}
            </span>
          </motion.span>
        ) : (
          <motion.span
            key="idle"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1 text-muted-foreground/60"
          >
            <Feather className="h-3 w-3" aria-hidden />
            <span>Not saved yet</span>
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

// Main component

export function CaptainLogbook({
  userId,
  roomId,
  voyageEpoch,
  className,
}: Props) {
  const key = useMemo(
    () => storageKey(userId, roomId, voyageEpoch),
    [userId, roomId, voyageEpoch],
  );

  // Lazy initializer reads localStorage once on mount so the very first
  // paint already shows the saved entry (no flash of empty textarea).
  const [value, setValue] = useState<string>(() => loadEntry(key));
  const [status, setStatus] = useState<SaveStatus>(() =>
    loadEntry(key).length > 0 ? "saved" : "idle",
  );
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(() =>
    loadEntry(key).length > 0 ? Date.now() : null,
  );
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [copied, setCopied] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Distinguishes an initial localStorage load from a genuine user edit, so
  // loading a saved entry into the textarea doesn't itself trigger a save.
  const userEdited = useRef(false);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Skip the first key change effect because useState loaded the initial entry.
  const firstKeyRun = useRef(true);

  // Reload when the key changes while the component stays mounted. A zero
  // delay timer avoids synchronous state updates in the effect.
  useEffect(() => {
    if (firstKeyRun.current) {
      firstKeyRun.current = false;
      return;
    }
    const stored = loadEntry(key);
    const t = setTimeout(() => {
      userEdited.current = false;
      setValue(stored);
      setStatus(stored.length > 0 ? "saved" : "idle");
      setLastSavedAt(stored.length > 0 ? Date.now() : null);
    }, 0);
    return () => clearTimeout(t);
  }, [key]);

  // Save shortly after the latest edit.
  useEffect(() => {
    if (!userEdited.current) return;
    setStatus("saving");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const ok = persistEntry(key, value);
      if (ok) {
        setStatus("saved");
        setLastSavedAt(Date.now());
      } else {
        setStatus("idle");
        toast.error("Could not save logbook : storage unavailable.");
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, key]);

  // Resize the textarea up to its maximum height.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [value]);

  // Cleanup pending timers on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    };
  }, []);

  // Handlers
  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    userEdited.current = true;
    setValue(clampText(e.target.value));
  }

  function handleInsertTemplate(text: string) {
    const stamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const sep = value.length === 0 || value.endsWith("\n") ? "" : "\n";
    const next = clampText(`${value}${sep}[${stamp}] ${text}`);
    userEdited.current = true;
    setValue(next);
    // Focus the textarea so the captain can keep writing immediately.
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    });
  }

  function handleClear() {
    if (value.length === 0) return;
    if (!confirmingClear) {
      setConfirmingClear(true);
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = setTimeout(() => {
        setConfirmingClear(false);
      }, CONFIRM_RESET_MS);
      return;
    }
    // Confirmed : wipe.
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    setConfirmingClear(false);
    userEdited.current = true;
    setValue("");
    toast.success("Logbook cleared");
  }

  async function handleExport() {
    if (value.length === 0) {
      toast.info("Logbook is empty. Nothing to copy.");
      return;
    }
    const header = `PortMasters 2 Captain's Logbook\nRoom: ${roomId} · Voyage #${voyageEpoch}\nExported: ${new Date().toLocaleString()}\n\n`;
    const payload = header + value;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), 1800);
      toast.success("Logbook copied to clipboard");
    } catch {
      toast.error("Could not copy : clipboard blocked by browser.");
    }
  }

  // Derived
  const charCount = value.length;
  const charPct = (charCount / MAX_CHARS) * 100;
  const charColor =
    charPct > 95
      ? "text-rose-600 dark:text-rose-400"
      : charPct > 80
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground/70";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
      className={cn(
        "pm-glass-warm relative flex flex-col overflow-hidden rounded-2xl",
        className,
      )}
    >
      {/* Decorative ink marks */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-[0.08]"
        style={{
          background:
            "radial-gradient(circle, oklch(0.4 0.12 45) 0%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-10 -left-6 h-32 w-32 rounded-full opacity-[0.06]"
        style={{
          background:
            "radial-gradient(circle, oklch(0.35 0.1 55) 0%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-10 bottom-16 h-3 w-3 rounded-full opacity-20"
        style={{ background: "oklch(0.3 0.1 40)" }}
      />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between gap-2 px-4 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <motion.div
            animate={{ rotate: [0, -8, 0, 5, 0] }}
            transition={{
              duration: 7,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
          >
            <Feather className="h-4 w-4" aria-hidden />
          </motion.div>
          <div className="min-w-0">
            <h3 className="pm-text-shadow text-sm font-semibold tracking-wide text-amber-900 dark:text-amber-100 leading-tight">
              Captain&apos;s Logbook
            </h3>
            <p className="text-[10px] text-amber-700/70 dark:text-amber-200/50 truncate">
              Room {roomId} · Voyage #{voyageEpoch}
            </p>
          </div>
        </div>
        <SaveStatusBadge status={status} lastSavedAt={lastSavedAt} />
      </div>

      {/* Quick note templates */}
      <div className="relative z-10 px-4 pb-2.5">
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map((tpl) => (
            <QuickNoteChip
              key={tpl.id}
              template={tpl}
              onInsert={handleInsertTemplate}
            />
          ))}
        </div>
      </div>

      {/* Parchment writing surface */}
      <div className="relative z-10 px-4">
        <div className="pm-paper-texture relative rounded-lg border border-amber-700/15 p-2.5 shadow-inner dark:border-amber-300/10">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            maxLength={MAX_CHARS}
            spellCheck
            aria-label="Captain's logbook entry"
            placeholder="Dear logbook, today the winds favored our voyage…"
            className="pm-scroll block w-full resize-none bg-transparent font-mono text-[12.5px] leading-relaxed text-amber-950 placeholder:text-amber-700/40 focus:outline-none dark:text-amber-50 dark:placeholder:text-amber-200/30"
            style={{ minHeight: 120 }}
          />
          {/* Ruled line accent */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-2 bottom-1 h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, oklch(0.6 0.08 60 / 0.25), transparent)",
            }}
          />
        </div>
      </div>

      {/* Footer: char count + actions */}
      <div className="relative z-10 mt-2.5 flex items-center justify-between gap-2 px-4 pb-3 pt-1">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn("text-[10px] font-medium tabular-nums", charColor)}
          >
            {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()}
          </span>
          {/* Mini progress bar */}
          <div className="hidden sm:block h-1 w-16 overflow-hidden rounded-full bg-amber-700/10 dark:bg-amber-300/10">
            <motion.div
              className={cn(
                "h-full rounded-full",
                charPct > 95
                  ? "bg-rose-500"
                  : charPct > 80
                    ? "bg-amber-500"
                    : "bg-amber-600/60 dark:bg-amber-300/50",
              )}
              animate={{ width: `${Math.min(charPct, 100)}%` }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1 rounded-md border border-amber-700/15 bg-amber-50/60 px-2 py-1 text-[10px] font-medium text-amber-800 transition-colors hover:border-amber-700/35 hover:bg-amber-100/70 dark:border-amber-300/15 dark:bg-amber-400/10 dark:text-amber-200 dark:hover:bg-amber-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
            title="Copy logbook to clipboard"
          >
            {copied ? (
              <Check className="h-3 w-3" aria-hidden />
            ) : (
              <Copy className="h-3 w-3" aria-hidden />
            )}
            <span className="hidden xs:inline sm:inline">
              {copied ? "Copied" : "Export"}
            </span>
          </button>

          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear all notes"
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40",
              confirmingClear
                ? "border-rose-500/40 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 dark:text-rose-300"
                : "border-amber-700/15 bg-amber-50/60 text-amber-800 hover:border-rose-500/30 hover:bg-rose-50/60 hover:text-rose-600 dark:border-amber-300/15 dark:bg-amber-400/10 dark:text-amber-200 dark:hover:border-rose-400/30 dark:hover:bg-rose-500/10 dark:hover:text-rose-300",
            )}
            title={
              confirmingClear ? "Click again to confirm" : "Clear all notes"
            }
          >
            <Trash2 className="h-3 w-3" aria-hidden />
            <span className="hidden xs:inline sm:inline">
              {confirmingClear ? "Confirm?" : "Clear"}
            </span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
