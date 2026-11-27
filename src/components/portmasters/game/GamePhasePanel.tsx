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
import { BOONS } from "@/lib/game/constants";
import { voyageBoon } from "@/lib/game/pools";
import { MANDATE_TEMPLATES, mandateIndexFor } from "@/lib/game/difficulty";
import {
  expanded,
  forecastFor,
  classicHarbor,
  harborTrading,
  rebalanced,
  SPECIALTIES,
  specialtyOpens,
} from "@/lib/game/expansion";
import { announcedMandateRound, describeForecast } from "@/lib/game/forecast";
import {
  featuredDemand,
  harborArrival,
  upcomingBuyer,
} from "@/lib/game/engine/market";
import { quoteOrder } from "@/lib/game/engine/orders";
import { hasModule } from "@/lib/game/engine";
import { Endgame } from "./phases/Endgame";

// Module level phase components keep stable React identities and preserve
// local state across game updates.
type Props = {
  game: GameState;
  context: GameContext;
  flush: () => Promise<void>;
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
  onShowTutorial: () => void;
  // Item defaults apply when no custom color resolver is provided.
  colorFor?: (item: string) => string | undefined;
};

export function GamePhasePanel({
  game,
  context,
  flush,
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
          flush={flush}
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
  const updated = rebalanced(game);
  const harbor = harborTrading(game);
  const savedBoon =
    game.phase === 5
      ? undefined
      : BOONS.find(({ id }) => id === game.lastBoonId);
  const activeBoon = savedBoon && voyageBoon(savedBoon, game.rulesVersion);
  const forecast =
    forecastFor(game) ??
    (updated ? forecastFor(game, game.currentRound + 1) : undefined);
  const briefing = forecast && describeForecast(forecast, game);
  const announced = announcedMandateRound(
    game.difficulty,
    game.currentRound,
    updated ? 3 : 2,
    game.rulesVersion,
  );
  const lantern = hasModule(game, "signal_lantern");
  const includesPreview = game.phase === 1 || game.phase === "worker_mgmt";
  const nextBuyers =
    updated && includesPreview
      ? [
          upcomingBuyer(game, context, game.currentRound + 1),
          lantern
            ? upcomingBuyer(game, context, game.currentRound + 1, true)
            : undefined,
        ]
      : [];
  const specialties =
    updated && game.phase === 5 ? game.specialties : undefined;
  const mandateIndex =
    announced === undefined
      ? undefined
      : mandateIndexFor(game.difficulty, announced, game.rulesVersion);
  const mandate =
    mandateIndex === undefined ? undefined : MANDATE_TEMPLATES[mandateIndex];
  const nextDemand =
    !updated && game.phase === "worker_mgmt" && lantern
      ? featuredDemand(game, context, game.currentRound + 1)
      : undefined;
  const scout = includesPreview ? game.scoutedOrder : undefined;
  const scouts = includesPreview ? game.scoutedOrders : undefined;
  if (
    !harbor &&
    !briefing &&
    !mandate &&
    !nextDemand &&
    !scout &&
    !nextBuyers.some(Boolean) &&
    !scouts?.length &&
    !specialties?.length
  )
    return null;
  return (
    <aside
      aria-label="Voyage briefing"
      className="pm-brief mb-4 grid min-w-0 gap-2 rounded-xl border p-3 text-sm"
    >
      {harbor && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <strong>{harborArrival(game)}</strong>
          {game.arrivals?.[game.currentRound] &&
            game.difficulty !== "monsoon" && (
              <span className="text-xs text-muted-foreground">
                Next port: {game.arrivals[game.currentRound]}
              </span>
            )}
        </div>
      )}
      {harbor && (activeBoon || game.equippedModules.length > 0) && (
        <details className="min-w-0">
          <summary className="cursor-pointer">Active effects</summary>
          <ul className="mt-1 grid gap-1">
            {activeBoon && (
              <li>
                <strong>{activeBoon.name}</strong> · {activeBoon.desc}
              </li>
            )}
            {game.equippedModules.map((module) => (
              <li key={module.id}>
                <strong>{module.name}</strong> · {module.desc}
              </li>
            ))}
            {game.travelingCommissionRound === game.currentRound &&
              !game.effectUses?.traveling_commission &&
              game.equippedModules.some(
                ({ id }) => id === "traveling_commission",
              ) && <li>Traveling Commission is ready.</li>}
            {game.directPassageRound === game.currentRound - 1 &&
              !game.effectUses?.storm_dividend &&
              game.equippedModules.some(
                ({ id }) => id === "storm_dividend",
              ) && <li>Storm Dividend is ready.</li>}
            {game.effectUses?.momentum_ready &&
            !game.effectUses?.market_momentum ? (
              <li>Market Momentum is ready.</li>
            ) : null}
          </ul>
        </details>
      )}
      {specialties?.length ? (
        <p>
          <strong>Voyage specialties</strong> ·{" "}
          {specialties
            .map(
              (key, index) =>
                `${SPECIALTIES[key].name} in round ${specialtyOpens(game.difficulty, index)}`,
            )
            .join(", ")}
        </p>
      ) : null}
      {briefing && (
        <div className="flex min-w-0 gap-2">
          <Compass className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <strong>
              {briefing.title}
              {forecast && forecast.round > game.currentRound
                ? ` in round ${forecast.round}`
                : ""}
            </strong>
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
              {updated && (
                <span className="block text-muted-foreground">
                  Missing now{" "}
                  {mandate.resources
                    .filter(
                      ({ type, required }) => game.inventory[type] < required,
                    )
                    .map(
                      ({ type, required }) =>
                        `${required - game.inventory[type]} ${type}`,
                    )
                    .join(", ") || "none"}
                  .
                </span>
              )}
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
      {nextBuyers.map((buyer, index) => {
        if (!buyer) return null;
        const quote = quoteOrder(
          {
            ...game,
            modifierFlags: {},
            effectUses: {},
            completedOrders: [],
            currentRound: game.currentRound + 1,
          },
          buyer,
        );
        const proceeds = quote.reward - quote.freight.final;
        return (
          <div key={buyer.id} className="flex min-w-0 gap-2">
            <Telescope className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              <strong>
                {index === 0
                  ? classicHarbor(game)
                    ? buyer.isProductOrder
                      ? "Next round commission"
                      : "Next round mixed order"
                    : "Next round featured buyer"
                  : "Signal Lantern"}
              </strong>{" "}
              · {buyer.demandPort} requests{" "}
              {buyer.resources
                .map(({ type, required }) => `${required} ${type}`)
                .join(", ")}{" "}
              for {buyer.reward} Gold.{" "}
              {proceeds < 0
                ? `Estimated cost ${Math.abs(proceeds)}`
                : `Estimated proceeds ${proceeds}`}{" "}
              Gold after freight and VAT, before any new Boon.
            </p>
          </div>
        );
      })}
      {scouts?.map((buyer) => (
        <div key={buyer.id} className="flex min-w-0 gap-2">
          <Telescope className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <strong>Scouted buyer this round</strong> · {buyer.demandPort}{" "}
            requests{" "}
            {buyer.resources
              .map(({ type, required }) => `${required} ${type}`)
              .join(", ")}{" "}
            for {buyer.reward} Gold before costs.
          </p>
        </div>
      ))}
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
