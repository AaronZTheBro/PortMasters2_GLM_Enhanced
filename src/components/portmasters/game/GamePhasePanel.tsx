"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useLayoutEffect, useRef } from "react";
import type { GameState } from "@/lib/game/types";
import type { PublicUser } from "@/lib/api";
import type { VoyageCompleteEvent } from "@/lib/realtime";
import type { CaptainLegacySummary } from "@/lib/game/legacy";
import type { Aid, Backing, Barter, PhaseSync } from "./phases/PhaseShared";
import { Welcome } from "./phases/Welcome";
import { BoonDraft } from "./phases/BoonDraft";
import { Purchase } from "./phases/Purchase";
import { BarterPhase } from "./phases/BarterPhase";
import { WorkerMgmt } from "./phases/WorkerMgmt";
import { Orders } from "./phases/Orders";
import { Settlement } from "./phases/Settlement";
import { Shipyard, ModuleDraft, ModuleSwap } from "./phases/Shipyard";
import { Bankruptcy } from "./phases/Bankruptcy";
import { Endgame } from "./phases/Endgame";

// Module level phase components keep stable React identities and preserve
// local state across game updates.
type Props = {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  members: PublicUser[];
  myUserId: string;
  isHost: boolean;
  phaseSync: PhaseSync;
  barter: Barter;
  aid: Aid;
  backing: Backing;
  voyageResult: VoyageCompleteEvent | null;
  myLegacy: CaptainLegacySummary | null;
  onRestart: () => void;
  onShowRumors: () => void;
  onShowGuide: () => void;
  onShowTips: () => void;
  onShowTutorial: () => void;
  // Item defaults apply when no custom color resolver is provided.
  colorFor?: (item: string) => string | undefined;
};

export function GamePhasePanel({
  game,
  act,
  members,
  myUserId,
  isHost,
  phaseSync,
  barter,
  aid,
  backing,
  voyageResult,
  myLegacy,
  onRestart,
  onShowRumors,
  onShowTutorial,
  colorFor,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const phaseKey = `${game.phase}:${game.currentRound}`;

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [phaseKey]);

  return (
    <div className="pm-glass flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
      <div
        ref={scrollRef}
        className="pm-scroll min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-5"
        role="region"
        aria-label="Current phase"
        tabIndex={0}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={phaseKey}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1.0] }}
          >
            {renderPhase()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );

  function renderPhase() {
    const p = game.phase;
    if (p === 0)
      return (
        <Welcome
          phaseSync={phaseSync}
          members={members}
          isHost={isHost}
          onShowTutorial={onShowTutorial}
          difficulty={game.difficulty}
        />
      );
    if (p === 5)
      return (
        <BoonDraft
          game={game}
          act={act}
          phaseSync={phaseSync}
          members={members}
        />
      );
    if (p === 1)
      return (
        <Purchase
          game={game}
          act={act}
          phaseSync={phaseSync}
          members={members}
          onShowRumors={onShowRumors}
          colorFor={colorFor}
        />
      );
    if (p === "barter")
      return (
        <BarterPhase
          game={game}
          barter={barter}
          myUserId={myUserId}
          phaseSync={phaseSync}
          members={members}
          colorFor={colorFor}
        />
      );
    if (p === "worker_mgmt")
      return (
        <WorkerMgmt
          game={game}
          act={act}
          phaseSync={phaseSync}
          members={members}
          colorFor={colorFor}
        />
      );
    if (p === 2)
      return (
        <Orders
          game={game}
          act={act}
          phaseSync={phaseSync}
          members={members}
          colorFor={colorFor}
        />
      );
    if (p === 3)
      return (
        <Settlement
          game={game}
          act={act}
          aid={aid}
          backing={backing}
          myUserId={myUserId}
          phaseSync={phaseSync}
          members={members}
        />
      );
    if (p === 4)
      return (
        <Shipyard
          game={game}
          act={act}
          phaseSync={phaseSync}
          members={members}
        />
      );
    if (p === "bankruptcy")
      return (
        <Bankruptcy
          game={game}
          members={members}
          backing={backing}
          myUserId={myUserId}
        />
      );
    if (p === "endgame")
      return (
        <Endgame
          game={game}
          isHost={isHost}
          onRestart={onRestart}
          voyageResult={voyageResult}
          myLegacy={myLegacy}
          myUserId={myUserId}
        />
      );
    if (p === "module_draft") return <ModuleDraft game={game} act={act} />;
    if (p === "module_swap") return <ModuleSwap game={game} act={act} />;
    return null;
  }
}
