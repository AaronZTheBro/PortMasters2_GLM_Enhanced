"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { GameState } from "@/lib/game/types";
import type { Phase } from "@/lib/game/types";
import { phaseLabel } from "@/lib/game/engine";
import { reagentRules } from "@/lib/game/expansion";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Save,
  RotateCcw,
  Play,
  ChevronRight,
  Loader2,
  GraduationCap,
  CheckCircle2,
  CircleX,
  CircleAlert,
  MoreHorizontal,
} from "lucide-react";

/**
 * Compute voyage progress as a percentage (0 to 100).
 * Each round has 4 main phases: Buy, Trade, Settle, and Shipyard.
 * Phase 0 = In Harbor (0%), endgame = 100%.
 */
function voyageProgress(
  phase: Phase,
  currentRound: number,
  maxRounds: number,
): number {
  if (phase === "endgame") return 100;
  if (phase === 0) return 0;
  const phaseStep: Record<string, number> = {
    "1": 1,
    barter: 1,
    worker_mgmt: 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 4,
    module_draft: 4,
    module_swap: 4,
    bankruptcy: 0,
  };
  const step = phaseStep[String(phase)] ?? 0;
  const totalSteps = maxRounds * 4;
  if (totalSteps === 0) return 0;
  const completed = (currentRound - 1) * 4 + step;
  return Math.round((completed / totalSteps) * 100);
}

export function GameControlPanel({
  game,
  saveStatus,
  nextBusy,
  isHost,
  onSetSail,
  onNextPhase,
  onGuide,
  onSave,
  onRestart,
  onShowTutorial,
  waiting,
  readyCount,
  requiredCount,
  onCancelReady,
}: {
  game: GameState;
  saveStatus: "idle" | "saving" | "saved" | "error";
  nextBusy: boolean;
  isHost: boolean;
  onSetSail: () => void;
  onNextPhase: () => void;
  onGuide: () => void;
  onSave: () => void;
  onRestart: () => void;
  onShowTutorial: () => void;
  waiting: boolean;
  readyCount: number;
  requiredCount: number;
  onCancelReady: () => void;
}) {
  const [toolsOpen, setToolsOpen] = useState(false);
  let startText = "Set sail";
  let startDisabled = true;
  let nextText = "Continue";
  let nextDisabled = true;

  if (game.gameOver) {
    startText = "Voyage complete";
    startDisabled = true;
    nextDisabled = true;
  } else if (game.phase === 0) {
    // Starting the voyage is a one time host action without a ready vote.
    // The button is disabled until the host has enough captains.
    if (!isHost) {
      startText = "Waiting for host";
      startDisabled = true;
    } else if (requiredCount < 2) {
      startText = `Need 2 captains (${requiredCount}/2)`;
      startDisabled = true;
    } else {
      startText = "Start the Voyage";
      startDisabled = false;
    }
    nextDisabled = true;
  } else if (game.phase === 5) {
    startText = reagentRules(game) ? "Drafting Favor" : "Drafting boon";
    startDisabled = true;
    nextDisabled = true;
  } else if (
    [1, 2, 4, "barter", "worker_mgmt"].includes(game.phase) ||
    (game.phase === 3 && game.pirateAttackResolved)
  ) {
    startText = "On voyage";
    startDisabled = true;
    nextText = "Continue to next phase";
    nextDisabled = false;
  } else {
    startText = "On voyage";
    startDisabled = true;
    nextDisabled = true;
  }

  // The ready vote waiting state only applies to the recurring
  // Next Phase transitions (phase 0's Start Game is handled above on its
  // own terms), so it always routes to that button.
  if (waiting) {
    nextText = `Cancel ready vote · ${readyCount}/${requiredCount} ready`;
    nextDisabled = false;
  }

  // Compute canStart for glow effect
  const canStart = !startDisabled;
  const canNext = !nextDisabled && !waiting;

  const progressPct = voyageProgress(
    game.phase,
    game.currentRound,
    game.maxRounds,
  );
  const showStartAction = game.phase === 0 && !game.gameOver;
  const showNextAction = waiting || !nextDisabled;

  const runTool = (action: () => void) => {
    setToolsOpen(false);
    requestAnimationFrame(action);
  };

  return (
    <>
      <div className="pm-glass flex flex-col gap-2 rounded-2xl px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2 px-1 text-[10px] text-muted-foreground">
          <span className="min-w-0 truncate">{phaseLabel(game)}</span>
          {game.phase !== 0 && !game.gameOver && (
            <>
              <Progress value={progressPct} className="h-1.5 min-w-10 flex-1" />
              <span className="shrink-0 tabular-nums">{progressPct}%</span>
            </>
          )}
          <AnimatePresence mode="wait" initial={false}>
            {saveStatus === "saving" ? (
              <motion.span
                key="saving"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="ml-auto inline-flex shrink-0 items-center gap-1"
                title="Saving voyage"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="hidden min-[420px]:inline">Saving</span>
              </motion.span>
            ) : saveStatus === "saved" ? (
              <motion.span
                key="saved"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
                className="ml-auto inline-flex shrink-0 items-center gap-1"
                title="Voyage saved"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span className="hidden min-[420px]:inline">Saved</span>
              </motion.span>
            ) : saveStatus === "error" ? (
              <span
                className="ml-auto inline-flex shrink-0 items-center gap-1 text-rose-700 dark:text-rose-300"
                role="status"
              >
                <CircleAlert className="h-3.5 w-3.5" /> Save failed
              </span>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2">
          {showStartAction ? (
            <Button
              className={cn(
                "h-full w-full rounded-lg px-3",
                canStart && "pm-grad-primary text-white pm-glow-teal",
              )}
              variant={startDisabled ? "secondary" : "default"}
              disabled={startDisabled}
              onClick={onSetSail}
            >
              <Play className="h-4 w-4" />
              <span className="min-w-0">{startText}</span>
            </Button>
          ) : showNextAction ? (
            <Button
              className={cn(
                "h-full w-full rounded-lg px-3",
                canNext && "pm-grad-emerald text-white pm-glow-teal",
              )}
              variant={
                nextDisabled ? "secondary" : waiting ? "secondary" : "default"
              }
              disabled={nextDisabled || nextBusy}
              onClick={waiting ? onCancelReady : onNextPhase}
            >
              {waiting ? (
                <CircleX className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <span className="min-w-0">{nextText}</span>
            </Button>
          ) : (
            <div className="flex min-h-10 min-w-0 items-center rounded-lg border border-border/60 bg-background/50 px-3 text-xs text-muted-foreground">
              <span className="truncate">
                {game.gameOver
                  ? "Voyage complete"
                  : game.phase === 3
                    ? "Choose how to sail through pirate waters"
                    : startText}
              </span>
            </div>
          )}

          <Button
            variant="outline"
            className="h-full min-h-10 shrink-0 rounded-lg px-3"
            onClick={() => setToolsOpen(true)}
            aria-label="Open voyage tools"
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="hidden min-[380px]:inline">Tools</span>
          </Button>
        </div>
      </div>

      <Dialog open={toolsOpen} onOpenChange={setToolsOpen}>
        <DialogContent className="max-w-[calc(100%-1rem)] p-4 sm:max-w-sm">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle>Voyage tools</DialogTitle>
            <DialogDescription>
              Reference, save, and room controls.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            <Button
              variant="outline"
              className="justify-start rounded-xl"
              onClick={() => runTool(onGuide)}
            >
              <BookOpen className="h-4 w-4" /> Guide
            </Button>
            <Button
              variant="outline"
              className="justify-start rounded-xl"
              onClick={() => runTool(onShowTutorial)}
            >
              <GraduationCap className="h-4 w-4" /> Tutorial
            </Button>
            <Button
              variant="outline"
              className="justify-start rounded-xl"
              onClick={() => runTool(onSave)}
            >
              <Save className="h-4 w-4" /> Save now
            </Button>
            <Button
              variant="outline"
              className="justify-start rounded-xl"
              disabled={!isHost}
              title={
                isHost
                  ? "Restart the voyage for everyone in the harbor"
                  : "Only the host can restart the voyage"
              }
              onClick={() => runTool(onRestart)}
            >
              <RotateCcw className="h-4 w-4" /> Restart voyage
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
