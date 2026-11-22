"use client";

// Applies captain interface preferences to the document root and motion
// runtime so child components can stay focused on rendering.
import { useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { useSettings } from "@/lib/use-settings";

export function SettingsApplier({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (settings.reduceMotion) root.classList.add("pm-animate-none");
    else root.classList.remove("pm-animate-none");
  }, [settings.reduceMotion]);

  return (
    <MotionConfig reducedMotion={settings.reduceMotion ? "always" : "never"}>
      {children}
    </MotionConfig>
  );
}
