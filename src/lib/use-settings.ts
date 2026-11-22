"use client";

// Stores captain interface preferences and publishes one shared client snapshot.
// Storage access begins after mount so initial server markup remains stable.
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "pm2.settings.v1";

export type CaptainSettings = {
  // Disables interface motion and numeric tweens.
  reduceMotion: boolean;
  // Controls synthesized interface sounds.
  soundEnabled: boolean;
  // Whether to show the floating "captain online" toast notifications in
  // the lobby. Some captains find them lively; others find them noisy.
  // Defaults on; the toggle is for the second camp.
  showOnlineToasts: boolean;
};

export const DEFAULT_SETTINGS: CaptainSettings = {
  reduceMotion: false,
  soundEnabled: true,
  showOnlineToasts: true,
};

function readSettings(): CaptainSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<CaptainSettings>;
    // Merge with defaults and discard keys outside the current schema.
    return {
      reduceMotion: parsed.reduceMotion ?? DEFAULT_SETTINGS.reduceMotion,
      soundEnabled: parsed.soundEnabled ?? DEFAULT_SETTINGS.soundEnabled,
      showOnlineToasts:
        parsed.showOnlineToasts ?? DEFAULT_SETTINGS.showOnlineToasts,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeSettings(s: CaptainSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Swallow: storage may be unavailable (private mode, quota, etc.).
    // The setting is decorative; a write failure shouldn't break the UI.
  }
}

// One module snapshot keeps every consumer synchronized.
let current: CaptainSettings = DEFAULT_SETTINGS;
const listeners = new Set<(s: CaptainSettings) => void>();
let initialized = false;

function ensureInitialized(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  current = readSettings();
}

export function useSettings(): {
  settings: CaptainSettings;
  update: (patch: Partial<CaptainSettings>) => void;
  reset: () => void;
} {
  const [state, setState] = useState<CaptainSettings>(current);

  // Load stored values after mount, then subscribe to shared updates.
  useEffect(() => {
    ensureInitialized();
    // Defer the update so the effect does not commit state synchronously.
    const t = setTimeout(() => setState(current), 0);
    const listener = (s: CaptainSettings) => setState(s);
    listeners.add(listener);
    return () => {
      clearTimeout(t);
      listeners.delete(listener);
    };
  }, []);

  const update = useCallback((patch: Partial<CaptainSettings>) => {
    current = { ...current, ...patch };
    writeSettings(current);
    for (const listener of listeners) listener(current);
  }, []);

  const reset = useCallback(() => {
    current = DEFAULT_SETTINGS;
    writeSettings(current);
    for (const listener of listeners) listener(current);
  }, []);

  return { settings: state, update, reset };
}
