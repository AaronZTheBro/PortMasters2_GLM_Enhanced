"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { COLORS, COLORS_COLORBLIND_SAFE } from "@/lib/game/constants";

// This local rendering preference never changes shared game state.
const COLORBLIND_SAFE_KEY = "portmasters_colorblind_safe";

function readableItemColor(color: string | undefined, dark: boolean) {
  if (!color) return undefined;
  return dark
    ? `color-mix(in oklab, ${color} 50%, white)`
    : `color-mix(in oklab, ${color} 55%, black)`;
}

// Keep the default palette next to the optional resolver contract.
export function itemColorResolver(
  colorFor?: (item: string) => string | undefined,
): (item: string) => string | undefined {
  return colorFor ?? ((item: string) => readableItemColor(COLORS[item], false));
}

export function useColorPreference() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const [colorblindSafe, setColorblindSafeState] = useState(false);

  useEffect(() => {
    let stored = false;
    try {
      stored = localStorage.getItem(COLORBLIND_SAFE_KEY) === "1";
    } catch {
      // Private browsing or a disabled storage API: default stays off.
    }
    if (!stored) return;
    const t = setTimeout(() => setColorblindSafeState(true), 0);
    return () => clearTimeout(t);
  }, []);

  const setColorblindSafe = useCallback((value: boolean) => {
    setColorblindSafeState(value);
    try {
      localStorage.setItem(COLORBLIND_SAFE_KEY, value ? "1" : "0");
    } catch {
      // Best effort only; the in memory state above still applies for the
      // rest of this session even if persisting it fails.
    }
  }, []);

  const colorFor = useCallback(
    (item: string): string | undefined =>
      readableItemColor(
        (colorblindSafe ? COLORS_COLORBLIND_SAFE : COLORS)[item],
        dark,
      ),
    [colorblindSafe, dark],
  );

  return { colorblindSafe, setColorblindSafe, colorFor };
}
