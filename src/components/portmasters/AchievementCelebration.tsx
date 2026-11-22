"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Volume2, X } from "lucide-react";
import { MeritIcon } from "./shared";
import { useSound } from "@/lib/use-sound";
import type { MeritId } from "@/lib/game/merits";

export type AchievementCelebrationProps = {
  meritId: string | null;
  meritName: string;
  meritDesc: string;
};

export function AchievementCelebration({
  meritId,
  meritName,
  meritDesc,
}: AchievementCelebrationProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const seenIds = useRef(new Set<string>());
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { play } = useSound();

  useEffect(() => {
    if (!meritId || seenIds.current.has(meritId)) return;
    seenIds.current.add(meritId);

    const activationTimer = setTimeout(() => {
      play("success");
      setActiveId(meritId);
    }, 0);

    return () => clearTimeout(activationTimer);
  }, [meritId, play]);

  useEffect(() => {
    if (!activeId) return;
    dismissTimer.current = setTimeout(() => setActiveId(null), 4000);
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [activeId]);

  function dismiss() {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setActiveId(null);
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-50 flex justify-center px-4">
      <AnimatePresence mode="wait">
        {activeId && (
          <motion.div
            key={activeId}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-amber-400/50 bg-background/95 p-4 shadow-xl backdrop-blur"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-700 dark:text-amber-300">
              <MeritIcon id={activeId as MeritId} className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{meritName}</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {meritDesc}
              </p>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-300">
                <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                Captain&apos;s Merit earned
              </div>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Dismiss merit notification"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
