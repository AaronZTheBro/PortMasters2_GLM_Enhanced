"use client";

import { Button } from "@/components/ui/button";
import type { PublicUser } from "@/lib/api";
import type { usePhaseSync } from "@/lib/use-phase-sync";
import type { useBarter } from "@/lib/use-barter";
import type { useAid } from "@/lib/use-aid";
import type { useBacking } from "@/lib/use-backing";
import { cn } from "@/lib/utils";
import { ReadyBar } from "../ReadyBar";

// Shared contracts and components for phase modules.
export type PhaseSync = ReturnType<typeof usePhaseSync>;
export type Barter = ReturnType<typeof useBarter>;
export type Aid = ReturnType<typeof useAid>;
export type Backing = ReturnType<typeof useBacking>;

// Module level exports preserve local state because React sees a stable
// component identity across parent renders.
export function ReadyFooter({
  phaseSync,
  members,
  idleLabel,
  onConfirm,
  idleClassName,
  disabled,
}: {
  phaseSync: PhaseSync;
  members: PublicUser[];
  idleLabel: string;
  onConfirm: () => void;
  idleClassName?: string;
  disabled?: boolean;
}) {
  if (phaseSync.waiting) {
    return (
      <div className="text-center mt-5 space-y-3">
        <div className="text-sm font-medium text-amber-700 dark:text-amber-300">
          ⏳ Waiting for the rest of the crew…
        </div>
        <ReadyBar
          ready={phaseSync.ready}
          members={members}
          className="justify-center"
        />
        <Button
          variant="secondary"
          className="rounded-xl"
          onClick={phaseSync.cancelReady}
        >
          ↩️ Not ready yet
        </Button>
      </div>
    );
  }
  return (
    <div className="text-center mt-5">
      <Button
        className={cn("rounded-xl px-6", idleClassName)}
        onClick={onConfirm}
        disabled={disabled}
      >
        {idleLabel}
      </Button>
    </div>
  );
}
