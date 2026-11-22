"use client";

// This placeholder preserves layout while asynchronous content loads.
// A moving gradient signals progress, and the settings layer disables it
// when reduced motion is active.
import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // A pure CSS gradient moves across the base surface.
        "relative overflow-hidden rounded-md bg-black/5 dark:bg-white/[0.06]",
        "pm-skeleton-shimmer",
        className,
      )}
      {...props}
    />
  );
}
