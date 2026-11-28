"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Anchor, ScrollText, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BOONS, type Boon } from "@/lib/game/constants";
import type { GameState } from "@/lib/game/types";
import {
  CHARTERS,
  actForRound,
  charterGateRound,
  engineIsActive,
  engineName,
  engineRecipe,
  engineRecipeForPair,
  engineUpkeepFor,
  favorDescription,
  favorDraftHasNoPick,
  favorIcon,
  favorMarksFor,
  favorName,
  favorRankFor,
  charterMetricLabel,
  favorSlots,
  favorSlotsUsed,
  rankText,
  selectCharter,
  tagsForFavor,
} from "@/lib/game/reagents";
import { swapBoonChoices } from "@/lib/game/engine";
import { voyageBoon } from "@/lib/game/pools";
import { cn } from "@/lib/utils";
import { ReadyBar } from "../ReadyBar";
import type { PublicUser } from "@/lib/api";
import type { PhaseSync } from "./PhaseShared";

const TAG_STYLE: Record<string, string> = {
  Smuggling:
    "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  Silk: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
  Kiln: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  Ocean: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  Road: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  Court:
    "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

function Tag({ tag }: { tag: string }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide",
        TAG_STYLE[tag] ?? "border-border bg-muted text-muted-foreground",
      )}
    >
      {tag}
    </span>
  );
}

function RackSlot({
  game,
  id,
  index,
  selected,
  selectable,
  onSelect,
}: {
  game: GameState;
  id?: string;
  index: number;
  selected: boolean;
  selectable: boolean;
  onSelect: () => void;
}) {
  if (!id)
    return (
      <div className="flex min-h-20 items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/30 px-3 text-xs text-muted-foreground">
        Empty slot
      </div>
    );
  const rank = favorRankFor(game, id);
  const marks = favorMarksFor(game, id);
  const saved = BOONS.find((entry) => entry.id === id);
  const boon = saved ? voyageBoon(saved, game.rulesVersion) : undefined;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex min-h-20 w-full items-start gap-2 rounded-xl border bg-card p-3 text-left transition-colors",
        selected
          ? "border-amber-500/70 ring-2 ring-amber-500/20"
          : selectable
            ? "border-border hover:border-amber-500/40"
            : "cursor-default border-border",
      )}
    >
      <span className="text-xl" aria-hidden>
        {favorIcon(id)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {favorName(id)}
        </span>
        <span className="block text-[11px] text-muted-foreground">
          Rank {rank} · {marks}/6 marks
        </span>
        {boon && (
          <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
            {favorDescription(boon)}
          </span>
        )}
        {rank > 1 && (
          <span className="mt-1 block text-[11px] leading-snug text-amber-700 dark:text-amber-300">
            {rankText(id, rank).replace(/^Rank [23]: /, "")}
          </span>
        )}
        <span className="mt-1 flex flex-wrap gap-1">
          {tagsForFavor(id).map((tag) => (
            <Tag key={tag} tag={tag} />
          ))}
        </span>
      </span>
      <span className="text-[10px] font-semibold text-muted-foreground">
        {index + 1}
      </span>
    </button>
  );
}

function CharterPicker({
  act,
  maxRounds,
}: {
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  maxRounds: number;
}) {
  const [pendingCharter, setPendingCharter] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const chosen = CHARTERS.find((charter) => charter.id === pendingCharter);
  useEffect(() => {
    if (pendingCharter) confirmRef.current?.focus();
  }, [pendingCharter]);
  const unit = (id: string) =>
    CHARTERS.find((charter) => charter.id === id)?.metric === "best_round"
      ? "in one round"
      : "in total";
  return (
    <section className="mb-5 rounded-2xl border border-indigo-500/25 bg-indigo-500/[0.04] p-4">
      <div className="mb-1 flex items-center gap-2">
        <ScrollText className="h-4 w-4 text-indigo-500" />
        <h3 className="font-semibold">Choose a Patron Charter</h3>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        This choice is permanent. Your Patron and goal appear in your captain
        detail for the table. A met act gate adds a mark, pays 20, 25 or 30 Gold
        by act, adds 6 Reputation and raises Heat by 1. A warm up act grants
        only its mark. A missed gate loses 4 Reputation and gives up the
        completion payout, which needs all three marks. Three marks add 40 Gold
        and 60 Reputation. Gates are at rounds {charterGateRound(maxRounds, 1)},{" "}
        {charterGateRound(maxRounds, 2)} and {charterGateRound(maxRounds, 3)}.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {CHARTERS.map((charter) => (
          <button
            key={charter.id}
            type="button"
            onClick={() => setPendingCharter(charter.id)}
            aria-pressed={pendingCharter === charter.id}
            className={cn(
              "rounded-xl border bg-card p-3 text-left transition-colors hover:border-indigo-500/50",
              pendingCharter === charter.id
                ? "border-indigo-500/70 ring-2 ring-indigo-500/20"
                : "border-border",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden>
                {charter.icon}
              </span>
              <span className="text-sm font-semibold">{charter.name}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <Tag tag={charter.tag} />
              <span className="text-[10px] text-muted-foreground">
                {charter.patron}
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {charter.desc}
            </p>
            <p className="mt-2 text-[11px] font-medium text-indigo-600 dark:text-indigo-300">
              {charter.goals[0] === 0
                ? `Act 1 is a warm up. Acts 2 and 3 ask for ${charter.goals[1]} and ${charter.goals[2]} ${charter.metricLabel} ${unit(charter.id)} by rounds ${charterGateRound(maxRounds, 2)} and ${charterGateRound(maxRounds, 3)}`
                : `Act goals: ${charter.goals[0]}, ${charter.goals[1]} and ${charter.goals[2]} ${charter.metricLabel} ${unit(charter.id)} by rounds ${charterGateRound(maxRounds, 1)}, ${charterGateRound(maxRounds, 2)} and ${charterGateRound(maxRounds, 3)}`}
            </p>
          </button>
        ))}
      </div>
      {chosen && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/[0.07] px-3 py-2">
          <p className="text-xs">
            Confirm <strong>{chosen.name}</strong> with {chosen.patron}. This
            cannot be changed.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPendingCharter(null)}
            >
              Cancel
            </Button>
            <Button
              ref={confirmRef}
              size="sm"
              onClick={() => {
                act((g, logs) => selectCharter(g, chosen.id, logs));
                setPendingCharter(null);
              }}
            >
              Confirm Charter
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function FavorCard({
  boon,
  game,
  replaceSlot,
  canTakeNew,
  onTake,
}: {
  boon: Boon;
  game: GameState;
  replaceSlot?: number;
  canTakeNew: boolean;
  onTake: (boon: Boon, slot?: number) => void;
}) {
  const owned = (game.favors ?? []).includes(boon.id);
  const rank = favorRankFor(game, boon.id);
  const nextRank = rank < 3 ? ((rank + 1) as 2 | 3) : 3;
  const blocked = !owned && !canTakeNew;
  const bondModule = game.equippedModules.find((module) =>
    engineRecipeForPair(boon.id, module.id),
  );
  const bond = bondModule
    ? engineRecipeForPair(boon.id, bondModule.id)
    : undefined;
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex min-w-0 flex-col rounded-2xl border border-amber-500/20 bg-card/90 p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden>
              {boon.icon}
            </span>
            <h3 className="truncate font-semibold">{boon.name}</h3>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {tagsForFavor(boon.id).map((tag) => (
              <Tag key={tag} tag={tag} />
            ))}
          </div>
        </div>
        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
          {owned
            ? `Rank ${rank} · ${favorMarksFor(game, boon.id)}/6 marks`
            : "New · starts at 1 mark"}
        </span>
      </div>
      <p className="mt-3 flex-1 text-xs leading-relaxed text-muted-foreground">
        {favorDescription(boon)}
      </p>
      {rank < 3 && (
        <p className="mt-2 text-[11px] leading-relaxed text-sky-700 dark:text-sky-300">
          Next at rank {nextRank}:{" "}
          {rankText(boon.id, nextRank).replace(/^Rank [23]: /, "")}
        </p>
      )}
      {bond && !owned && (
        <p className="mt-1 text-[11px] text-teal-700 dark:text-teal-300">
          Pairs with {bond.name} at the Bond Table.
        </p>
      )}
      <Button
        className="mt-3 w-full"
        variant={owned ? "secondary" : "default"}
        disabled={owned ? rank >= 3 : blocked}
        onClick={() => onTake(boon, owned ? undefined : replaceSlot)}
      >
        {owned
          ? rank >= 3
            ? "Fully Attuned"
            : "Attune with a Duplicate"
          : blocked
            ? "No slot is open"
            : replaceSlot !== undefined
              ? "Replace and Take"
              : "Take this Favor"}
      </Button>
    </motion.article>
  );
}

export function ReagentDraft({
  game,
  act,
  phaseSync,
  members,
}: {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  phaseSync: PhaseSync;
  members: PublicUser[];
}) {
  const [replaceSlot, setReplaceSlot] = useState<number | undefined>(undefined);
  const choiceIds = game.boonChoices.map((boon) => boon.id).join(",");
  const liveRef = useRef<HTMLParagraphElement>(null);
  const rerollPending = useRef(false);
  const previousChoices = useRef(choiceIds);
  useEffect(() => {
    // Write the result to the live region directly so no extra render is
    // needed. A reroll only announces once the choices actually change.
    if (!rerollPending.current) return;
    rerollPending.current = false;
    if (previousChoices.current === choiceIds) return;
    previousChoices.current = choiceIds;
    const names = game.boonChoices.map((boon) => boon.name).join(", ");
    if (liveRef.current)
      liveRef.current.textContent = names ? `Rerolled Favors: ${names}.` : "";
  }, [choiceIds, game.boonChoices]);
  const slots = favorSlots(game);
  const engines = game.engines ?? [];
  const used = favorSlotsUsed(game);
  const full = used >= slots;
  const favorSlotCount = Math.max(0, slots - engines.length);
  const canAddNew = !full;
  const replaceable =
    replaceSlot !== undefined && replaceSlot < (game.favors?.length ?? 0);
  const actNo = actForRound(game.maxRounds, game.currentRound);
  const nextSlotRound =
    actNo === 1
      ? Math.ceil(game.maxRounds / 3) + 1
      : actNo === 2
        ? Math.ceil((game.maxRounds * 2) / 3) + 1
        : undefined;
  const charterAct = Math.min(3, (game.charterActsSettled ?? 0) + 1);

  const take = (boon: Boon, slot?: number) => {
    act((g) => {
      g.pendingFavorSlot = slot;
    });
    void phaseSync.markReady(boon.id);
  };

  if (!game.charterId)
    return (
      <section>
        <div className="mb-4 text-center">
          <h2 className="text-2xl font-bold pm-text-gradient">
            The Reagent Table
          </h2>
          <p className="text-sm text-muted-foreground">
            A Patron Charter sets the voyage goal. Favors set the build.
          </p>
        </div>
        <CharterPicker act={act} maxRounds={game.maxRounds} />
        <div className="text-center">
          <ReadyBar
            ready={phaseSync.ready}
            members={members}
            className="justify-center"
          />
        </div>
      </section>
    );

  const charter = CHARTERS.find((entry) => entry.id === game.charterId);
  return (
    <div className="mx-auto max-w-4xl">
      <div className="text-center">
        <div className="mb-1 flex items-center justify-center gap-2">
          <Anchor className="h-5 w-5 text-amber-500" />
          <h2 className="text-2xl font-bold pm-text-gradient">
            The Favor Rack
          </h2>
          <Sparkles className="h-5 w-5 text-sky-500" />
        </div>
        <p className="text-sm text-muted-foreground">
          Act {actNo} · {used} of {slots} Favor slots used
          {engines.length ? ` · ${engines.length} held by bonded Engines` : ""}
        </p>
        {nextSlotRound !== undefined && (
          <p className="text-[11px] text-muted-foreground">
            The Rack gains a {actNo === 1 ? "second" : "third"} slot in round{" "}
            {nextSlotRound}.
          </p>
        )}
        {charter && (
          <p className="mt-1 text-xs text-indigo-600 dark:text-indigo-300">
            {charter.icon} {charter.name}:{" "}
            {charter.goals[charterAct - 1] === 0
              ? `Act ${charterAct} is a warm up`
              : `Act ${charterAct} goal ${charter.goals[charterAct - 1]} ${charterMetricLabel(charter, charter.goals[charterAct - 1])}`}
            {game.charterComplete
              ? " · complete"
              : ` · ${game.charterMarks ?? 0} of 3 marks`}
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {Array.from({ length: favorSlotCount }).map((_, index) => (
          <RackSlot
            key={index}
            game={game}
            id={game.favors?.[index]}
            index={index}
            selected={replaceable && replaceSlot === index}
            selectable={full}
            onSelect={() => {
              // With room on the Rack a new Favor fills an empty slot, so a
              // slot selection would be ignored. Only offer it when replacing.
              if (!full || !game.favors?.[index]) return;
              setReplaceSlot((current) =>
                current === index ? undefined : index,
              );
            }}
          />
        ))}
        {engines.map((engine) => {
          const recipe = engineRecipe(engine.id);
          return (
            <div
              key={engine.id}
              className="flex min-h-20 w-full items-start gap-2 rounded-xl border border-teal-500/30 bg-teal-500/[0.04] p-3"
            >
              <span className="text-xl" aria-hidden>
                {recipe?.icon ?? "⚙️"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {engineName(engine.id)}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {engineIsActive(game, engine)
                    ? `Bonded Engine · ${engineUpkeepFor(engine)} Gold upkeep`
                    : (engine.dormantUntilRound ?? 0) > game.maxRounds
                      ? "Dormant · out for the rest of the voyage"
                      : `Dormant · returns in round ${engine.dormantUntilRound}`}
                </span>
                {recipe?.desc && (
                  <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
                    {recipe.desc}
                  </span>
                )}
                <span className="mt-1 inline-block rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold text-teal-700 dark:text-teal-300">
                  Holds a Favor slot and a module slot
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {full && (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {replaceSlot === undefined ? (
            <span>
              {game.favors?.length
                ? "The rack is full. Choose the Favor you want to replace, or draft a duplicate to attune one you own."
                : actNo < 3
                  ? "Bonded Engines hold every Favor slot this act. The next act opens another slot."
                  : "Bonded Engines hold all three Favor slots. No further slot opens this voyage."}
            </span>
          ) : (
            <>
              <span>
                Replacing slot {replaceSlot + 1} (
                {game.favors?.[replaceSlot]
                  ? `${favorName(game.favors[replaceSlot])}, ${favorMarksFor(game, game.favors[replaceSlot])} marks`
                  : "empty"}
                ). The departing Favor loses its Attunement marks. Choose a new
                Favor below.
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-1 font-semibold"
                onClick={() => setReplaceSlot(undefined)}
              >
                <X className="h-3 w-3" /> Cancel
              </button>
            </>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <ReadyBar
          ready={phaseSync.ready}
          members={members}
          className="justify-center"
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={
            game.boonSwapUsed || game.money < 10 || favorDraftHasNoPick(game)
          }
          onClick={() => {
            rerollPending.current = true;
            act((g, logs) => swapBoonChoices(g, logs));
          }}
        >
          Reroll Favors for 10 Gold
        </Button>
        <p ref={liveRef} role="status" aria-live="polite" className="sr-only" />
        {favorDraftHasNoPick(game) && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void phaseSync.markReady()}
          >
            Pass the draft
          </Button>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {game.boonChoices.map((boon) => (
          <FavorCard
            key={boon.id}
            boon={boon}
            game={game}
            replaceSlot={
              canAddNew ? undefined : replaceable ? replaceSlot : undefined
            }
            canTakeNew={canAddNew || replaceable}
            onTake={take}
          />
        ))}
      </div>

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        A new Favor starts with one mark, every owned Favor gains one at
        settlement, and a duplicate adds two. Three marks reach rank 2 and six
        marks reach rank 3. Bond a rank 2 Favor with a module at the Shipyard to
        make an Engine.
      </p>
    </div>
  );
}
