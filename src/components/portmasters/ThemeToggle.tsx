"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, Monitor } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark" | "system";

const MODES: Array<{
  value: ThemeMode;
  label: string;
  icon: typeof Moon;
}> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // The theme provider resolves the theme on the client; render a stable
  // placeholder until then so the toggle never flashes the wrong state.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  if (!mounted) {
    return (
      <div
        className={cn(
          "inline-flex h-8 w-[5.5rem] max-w-full items-center rounded-full bg-black/5 p-0.5 dark:bg-white/10",
        )}
        aria-hidden
      />
    );
  }

  const current = (theme as ThemeMode) || "system";

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className={cn(
        "relative inline-flex h-8 w-[5.5rem] max-w-full items-center rounded-full bg-black/5 p-0.5 dark:bg-white/10",
      )}
    >
      {MODES.map((m) => {
        const active = current === m.value;
        const Icon = m.icon;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${m.label} theme`}
            title={m.label}
            onClick={() => setTheme(m.value)}
            className={cn(
              "relative z-10 inline-flex items-center justify-center rounded-full transition-colors",
              "h-7 w-7",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
      <AnimatePresence>
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="absolute top-0.5 bottom-0.5 rounded-full bg-background shadow-sm pointer-events-none"
          style={{
            left: `calc(${MODES.findIndex((m) => m.value === current) * 28}px + 2px)`,
            width: 28,
          }}
        />
      </AnimatePresence>
    </div>
  );
}
