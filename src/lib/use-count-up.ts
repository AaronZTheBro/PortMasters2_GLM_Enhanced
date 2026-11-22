"use client";

// Animates display values while honoring local and system motion preferences.
// Browser access stays inside effects so initial markup remains stable.
import { useEffect, useRef, useState } from "react";
import { useSettings } from "@/lib/use-settings";

const DEFAULT_DURATION_MS = 850;

// Ease quickly at first and settle gently on the final value.
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function useCountUp(
  target: number,
  opts?: { durationMs?: number; disabled?: boolean },
): number {
  const duration = opts?.durationMs ?? DEFAULT_DURATION_MS;
  const manuallyDisabled = opts?.disabled ?? false;
  // Local motion changes apply to the next value without a reload.
  const { settings } = useSettings();
  const [value, setValue] = useState(target);
  // Mirror the rendered value without restarting the active frame loop.
  const valueRef = useRef(target);
  // Continue from the value reached by the preceding animation.
  const fromRef = useRef(target);
  // Keep one active animation frame loop.
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (manuallyDisabled || settings.reduceMotion) {
      // Defer the update so the effect does not commit state synchronously.
      const t = setTimeout(() => {
        valueRef.current = target;
        setValue(target);
        fromRef.current = target;
      }, 0);
      return () => clearTimeout(t);
    }

    // The media query is an independent motion control.
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      // Match the deferred local preference path.
      const t = setTimeout(() => {
        valueRef.current = target;
        setValue(target);
        fromRef.current = target;
      }, 0);
      return () => clearTimeout(t);
    }

    // Skip animation when no numeric delta exists.
    if (target === fromRef.current) {
      valueRef.current = target;
      setValue(target);
      return;
    }

    const from = fromRef.current;
    const delta = target - from;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(t);
      const nextValue = from + delta * eased;
      valueRef.current = nextValue;
      setValue(nextValue);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        // Snap exactly to the target to remove floating point drift.
        valueRef.current = target;
        setValue(target);
        fromRef.current = target;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Preserve the reached value as the next animation origin.
      fromRef.current = valueRef.current;
    };
  }, [target, duration, manuallyDisabled, settings.reduceMotion]);

  // Display values are integral game totals.
  return Math.round(value);
}
