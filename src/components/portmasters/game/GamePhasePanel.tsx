"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useLayoutEffect, useRef } from "react";
import type { GameContext, GameState } from "@/lib/game/types";
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
import { CalendarDays, Compass, Telescope } from "lucide-react";
import { MANDATE_TEMPLATES, mandateIndexFor } from "@/lib/game/difficulty";
import { expanded, forecastFor } from "@/lib/game/expansion";
import { announcedMandateRound, describeForecast } from "@/lib/game/forecast";
import { featuredDemand } from "@/lib/game/engine/market";
import { hasModule } from "@/lib/game/engine";
import { Endgame } from "./phases/Endgame";

// Module level phase components keep stable React identities and preserve
// local state across game updates.
type Props = {
  game: GameState;
  context: GameContext;
  logs: string[];
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
  context,
  logs,
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
            <VoyageBrief game={game} context={context} />
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
          rulesVersion={game.rulesVersion}
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
          logs={logs}
          members={members}
          backing={backing}
          myUserId={myUserId}
        />
      );
    if (p === "endgame")
      return (
        <Endgame
          game={game}
          logs={logs}
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

function VoyageBrief({
  game,
  context,
}: {
  game: GameState;
  context: GameContext;
}) {
  if (!expanded(game) || ![5, 1, "worker_mgmt", 2, 3].includes(game.phase))
    return null;
  const forecast = forecastFor(game);
  const briefing = forecast && describeForecast(forecast);
  const announced = announcedMandateRound(game.difficulty, game.currentRound);
  const mandateIndex =
    announced === undefined
      ? undefined
      : mandateIndexFor(game.difficulty, announced);
  const mandate =
    mandateIndex === undefined ? undefined : MANDATE_TEMPLATES[mandateIndex];
  const nextDemand =
    game.phase === "worker_mgmt" && hasModule(game, "signal_lantern")
      ? featuredDemand(game, context, game.currentRound + 1)
      : undefined;
  const scout =
    game.phase === 1 || game.phase === "worker_mgmt"
      ? game.scoutedOrder
      : undefined;
  if (!briefing && !mandate && !nextDemand && !scout) return null;
  return (
    <aside
      aria-label="Voyage briefing"
      className="pm-brief mb-4 grid min-w-0 gap-2 rounded-xl border p-3 text-sm"
    >
      {briefing && (
        <div className="flex min-w-0 gap-2">
          <Compass className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <strong>{briefing.title}</strong>
            <p>{briefing.detail}</p>
          </div>
        </div>
      )}
      {mandate && announced !== undefined && (
        <div className="flex min-w-0 gap-2">
          <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <strong>Imperial Mandate in round {announced}</strong>
            <p>
              {mandate.resources
                .map(({ type, required }) => `${required} ${type}`)
                .join(", ")}{" "}
              for {mandate.reward} Gold at {mandate.port}.
            </p>
          </div>
        </div>
      )}
      {nextDemand && (
        <div className="flex min-w-0 gap-2">
          <Telescope className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <strong>Signal Lantern</strong> · Next round features {nextDemand}{" "}
            demand on the ordinary board.
          </p>
        </div>
      )}
      {scout && (
        <div className="flex min-w-0 gap-2">
          <Telescope className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <strong>Coastal Forecast</strong> · {scout.demandPort} will request{" "}
            {scout.resources
              .map(({ required, type }) => `${required} ${type}`)
              .join(", ")}{" "}
            for a quoted reward of {scout.reward} Gold.
          </p>
        </div>
      )}
    </aside>
  );
}
