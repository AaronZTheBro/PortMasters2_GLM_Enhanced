"use client";

import { useState } from "react";
import {
  CONVOY_VENTURE_MAX_CONTRIBUTOR_SHARE,
  CONVOY_VENTURE_MAX_ROUNDS_AHEAD,
  CONVOY_VENTURE_MAX_TARGET,
  CONVOY_VENTURE_MIN_ROUNDS_AHEAD,
  CONVOY_VENTURE_MIN_TARGET,
} from "@/lib/game/constants";
import {
  getWorkerWage,
  maintenanceSurcharge,
  quoteWages,
  workerWagesFor,
} from "@/lib/game/engine";
import { taxReserve } from "@/lib/game/engine/pricing";
import type { GameState } from "@/lib/game/types";
import { difficultyConfig } from "@/lib/game/difficulty";
import {
  unlockedProducts,
  unlockedResources,
  unlockedWorkerTypes,
} from "@/lib/game/pools";
import type { ConvoyVenture } from "@/lib/use-convoy";
import { displayLedgerLine } from "@/lib/game/engine/lifecycle";
import { cn, formatReputation } from "@/lib/utils";
import { itemColorResolver } from "@/lib/use-color-preference";
import { Term } from "../Term";
import { priceAwareTermContent } from "./PriceTooltips";
import { GameLogPanel } from "./GameLogPanel";
import { VoyageChronicle, type ChronicleEvent } from "../VoyageChronicle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ItemIcon } from "../shared";
import { ShipVisualizer, ShipIcon, TextWithShipIcons } from "../ShipVisualizer";
import {
  Package,
  Receipt,
  BookOpen,
  Coins,
  Star,
  Anchor,
  AlertTriangle,
  ScrollText,
} from "lucide-react";

const roundHeader = /=== (Preparing for )?Round (\d+)(?: ·| Settlement| ===)/i;

export function deriveChronicleEvents(
  logs: string[],
  currentRound: number,
): ChronicleEvent[] {
  const first = logs.map((entry) => entry.match(roundHeader)).find(Boolean);
  let round = first
    ? Math.max(1, Number(first[2]) - Number(Boolean(first[1])))
    : currentRound;
  return logs
    .filter((entry) => entry.trim() && !/^=+$/.test(entry.trim()))
    .map((line) => {
      const description = displayLedgerLine(line);
      const header = description.match(roundHeader);
      if (header) round = Number(header[2]);
      if (header) return { round, type: "round_start", description };
      let type: ChronicleEvent["type"] = "note";
      if (/bankrupt|defaulted|cannot cover/i.test(description))
        type = "bankruptcy";
      else if (/barter|🤝 (?:Traded|Offered)/i.test(description))
        type = "barter";
      else if (/loan|borrow|lend|repaid|debt|bequest/i.test(description))
        type = "loan";
      else if (/pirate|raid|escort|clear seas/i.test(description))
        type = "pirate";
      else if (
        /^\s*(?:👥|💰)?\s*(?:wages|paid wages|paying worker wages)|payroll/i.test(
          description,
        )
      )
        type = "wages";
      else if (/maintenance|upkeep/i.test(description)) type = "maintenance";
      else if (/upgraded|upgrade the ship/i.test(description)) type = "upgrade";
      else if (/installed |swapped |module draft/i.test(description))
        type = "module";
      else if (/boon|navigator's compass/i.test(description)) type = "boon";
      else if (/purchase|bought/i.test(description)) type = "purchase";
      else if (
        /order|trad(?:e|ing)|net (?:profit|proceeds)|freight/i.test(description)
      )
        type = "order";
      return { round, type, description };
    });
}

/**
 * Pins critical voyage totals above bounded detail tabs. Each tab scrolls on
 * its own while the amount due remains visible for solvency decisions.
 */
export function GameStatusPanel({
  game,
  logs,
  onRepayLoan,
  waiting,
  convoy,
  myUserId,
  colorFor,
}: {
  game: GameState;
  logs: string[];
  onRepayLoan?: (debtId: string) => void;
  waiting?: boolean;
  // Optional room venture data.
  convoy?: {
    ventures: ConvoyVenture[];
    busy: boolean;
    // One completed venture locks posting until the next voyage.
    locked: boolean;
    error: string | null;
    clearError: () => void;
    post: (targetGold: number, deadlineRound: number) => void;
    contribute: (ventureId: string, amount: number) => void;
  };
  myUserId?: string;
  // Item defaults apply when no custom color resolver is provided.
  colorFor?: (item: string) => string | undefined;
}) {
  const resolveColor = itemColorResolver(colorFor);
  const discount = game.shipLevel * 5;
  const available = game.money - taxReserve(game);
  const billsPaid = [4, "module_draft", "module_swap"].includes(game.phase);
  const showObligations = [1, "barter", "worker_mgmt", 2, 3].includes(
    game.phase,
  );

  // Summed across the whole unlocked roster, not the three founding types.
  // Hardcoding those three meant a captain who hired a charter artisan was
  // shown a wages figure that omitted them, understating the round end bill
  // and therefore the bankruptcy risk this panel exists to warn about.
  const roster = unlockedWorkerTypes(
    game.difficulty,
    game.currentRound,
    game.rulesVersion,
  ).map((w) => {
    const list = game.workers[w.id] ?? [];
    return { ...w, list, due: workerWagesFor(game, w.id) };
  });
  const { due: pendWages, discount: wageSavings } = quoteWages(game);
  const pendMaint = game.fixedCost + maintenanceSurcharge(game);
  const pendTotal = pendWages + pendMaint;
  const nextRoundDue =
    pendMaint +
    roster.reduce(
      (sum, { id, list }) => sum + list.length * getWorkerWage(game, id),
      0,
    );
  const safe = game.money >= pendTotal;
  const nW = roster.reduce((sum, r) => sum + r.list.length, 0);
  const cfg = difficultyConfig(game.difficulty);
  const shownRound = Math.min(game.currentRound, game.maxRounds);
  const hasLoans = game.debts.length > 0 || game.loansGiven.length > 0;
  const duesAlert = (showObligations && !safe) || game.debts.length > 0;

  return (
    <div className="pm-scroll flex h-full min-h-0 flex-col overflow-y-auto lg:overflow-hidden">
      {/* Pinned: never scrolls, so the numbers a captain checks constantly
          are always in the same place. */}
      <div className="shrink-0 space-y-3">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <Anchor className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
            Voyage{" "}
            <b className="text-foreground">
              {shownRound}/{game.maxRounds}
            </b>
          </span>
          {/* Round progress bar */}
          <div className="flex-1 max-w-[80px] h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden mx-2">
            <div
              className="h-full rounded-full bg-teal-500/70 transition-all duration-500"
              style={{
                width: `${Math.max(2, (shownRound / game.maxRounds) * 100)}%`,
              }}
            />
          </div>
          <span
            className="truncate text-foreground/80 flex items-center gap-1"
            title={cfg.name}
          >
            {cfg.icon} {cfg.name}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1 sm:gap-2">
          <Stat
            label="Funds"
            value={`${game.money}`}
            icon={<Coins className="h-3.5 w-3.5" />}
            className="text-emerald-600 dark:text-emerald-400"
          />
          <Stat
            label="Reputation"
            value={formatReputation(game.score)}
            icon={<Star className="h-3.5 w-3.5" />}
            className="text-amber-600 dark:text-amber-400"
          />
          {showObligations ? (
            <Stat
              label="Due"
              value={`${pendTotal}`}
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              className={cn(
                safe
                  ? "text-foreground/80"
                  : "text-rose-600 dark:text-rose-400",
              )}
            />
          ) : (
            <Stat
              label="Ship"
              value={`Lv ${game.shipLevel}`}
              icon={<ShipIcon className="h-3.5 w-3.5" />}
              className="text-teal-600 dark:text-teal-400"
            />
          )}
        </div>
      </div>

      <Tabs
        defaultValue="hold"
        className="mt-2 flex flex-none flex-col gap-2 lg:mt-4 lg:min-h-0 lg:flex-1 lg:gap-3"
      >
        <TabsList className="grid h-auto w-full shrink-0 grid-cols-3 gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.06] sm:grid-cols-5">
          <TabsTrigger value="hold" className="min-h-9 gap-1 px-2 text-[11px]">
            <Package className="h-3 w-3" /> Hold
          </TabsTrigger>
          <TabsTrigger value="ship" className="min-h-9 gap-1 px-2 text-[11px]">
            <ShipIcon className="h-3 w-3" /> Ship
          </TabsTrigger>
          <TabsTrigger value="dues" className="min-h-9 gap-1 px-2 text-[11px]">
            <Receipt className="h-3 w-3" /> Dues
            {duesAlert && (
              <span
                className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse"
                aria-label="attention needed"
              />
            )}
          </TabsTrigger>
          <TabsTrigger value="log" className="min-h-9 gap-1 px-2 text-[11px]">
            <BookOpen className="h-3 w-3" /> Log
          </TabsTrigger>
          <TabsTrigger
            value="chronicle"
            className="min-h-9 gap-1 px-2 text-[11px]"
          >
            <ScrollText className="h-3 w-3" />
            Story
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="hold"
          className="pm-scroll lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
        >
          <div className="text-[10px] font-semibold tracking-wide text-muted-foreground/80 mb-1 flex items-center gap-1">
            <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
            Raw Materials
            <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
          </div>
          {unlockedResources(
            game.difficulty,
            game.currentRound,
            game.rulesVersion,
            game.specialties,
          ).map((r) => (
            <InvItem
              key={r}
              icon={<ItemIcon item={r} className="h-3.5 w-3.5" />}
              name={r}
              color={resolveColor(r)}
              count={game.inventory[r] || 0}
              priceContent={priceAwareTermContent(game, r)}
            />
          ))}
          <div className="text-[10px] font-semibold tracking-wide text-muted-foreground/80 mt-3 mb-1 flex items-center gap-1">
            <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
            Finished Goods
            <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
          </div>
          {unlockedProducts(
            game.difficulty,
            game.currentRound,
            game.rulesVersion,
            game.specialties,
          ).map((r) => (
            <InvItem
              key={r}
              icon={<ItemIcon item={r} className="h-3.5 w-3.5" />}
              name={r}
              color={resolveColor(r)}
              count={game.inventory[r] || 0}
              priceContent={priceAwareTermContent(game, r)}
            />
          ))}
          {nW > 0 ? (
            <>
              <div className="text-[10px] font-semibold tracking-wide text-muted-foreground/80 mt-3 mb-1 flex items-center gap-1">
                <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
                Artisans
                <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
              </div>
              {/* Each row reports how many are trained. A skilled artisan
                  produces two items per round instead of one (see
                  processProduction), which was invisible everywhere before. */}
              {roster
                .filter((r) => r.list.length > 0)
                .map((r) => (
                  <InvItem
                    key={r.id}
                    icon={r.icon}
                    name={r.plural}
                    term={r.label}
                    count={r.list.length}
                    skilled={r.list.filter((x) => x.isSkilled).length}
                    muted
                  />
                ))}
            </>
          ) : null}
        </TabsContent>

        <TabsContent
          value="ship"
          className="pm-scroll lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
        >
          {/* Ship visualizer : animated ship silhouette with module slot badges */}
          <div className="mb-2 rounded-lg border border-black/5 bg-black/[0.02] p-2 dark:border-white/10 dark:bg-white/[0.03] shadow-sm">
            <ShipVisualizer
              shipLevel={game.shipLevel}
              equippedModules={game.equippedModules}
              compact
              cargoUnits={Object.values(game.inventory).reduce(
                (sum, n) => sum + n,
                0,
              )}
              crewCount={Object.values(game.workers).reduce(
                (sum, arr) => sum + arr.length,
                0,
              )}
            />
          </div>

          <Row label={<Term term="Ship Level">Class</Term>}>
            <b>Level {game.shipLevel}</b>
          </Row>
          <Row label={<Term term="Freight">Freight</Term>}>
            <span className="text-[10px] text-muted-foreground">
              2 Gold per unit with {discount} Gold off from ship level. Base
              minimum 5 Gold before extra cargo and module discounts.
            </span>
          </Row>
          <Row label="Modules">
            <b>
              {game.equippedModules.length}/{game.shipLevel}
            </b>
          </Row>
          {game.equippedModules.length === 0 ? (
            <p className="pt-1 text-[10px] text-muted-foreground/80">
              No modules installed. Upgrade the ship in the Shipyard to unlock
              slots.
            </p>
          ) : (
            game.equippedModules.map((m) => (
              <div key={m.id} className="py-0.5 text-[11px]">
                <span className="mr-1">
                  <TextWithShipIcons>{m.icon}</TextWithShipIcons>
                </span>
                <span className="text-foreground/90">{m.name}</span>
                <div className="pl-5 text-[10px] text-muted-foreground">
                  {m.desc}
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent
          value="dues"
          className="pm-scroll lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
        >
          {showObligations ? (
            <>
              <Row label={<Term term="Maintenance">Maintenance</Term>}>
                <b>{pendMaint} Gold</b>
              </Row>
              <Row
                label={
                  <Term term="Wages">
                    Wages{nW > 0 ? ` (${nW} workers)` : ""}
                  </Term>
                }
              >
                <b>{nW > 0 ? `${pendWages} Gold` : "…"}</b>
                {wageSavings > 0 && (
                  <span> · Wage Ledger saves {wageSavings} Gold</span>
                )}
              </Row>
              {roster
                .filter((r) => r.due > 0)
                .map((r) => (
                  <SubRow
                    key={r.id}
                    label={`${r.list.length} x ${r.label}`}
                    value={`${r.due}g`}
                  />
                ))}
              <div
                className={cn(
                  "mt-1.5 flex items-center justify-between border-t pt-2",
                  safe ? "border-teal-500/20" : "border-rose-500/30",
                )}
              >
                <span className="text-xs font-semibold">Total due</span>
                <span
                  className={cn(
                    "font-bold",
                    safe
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400",
                  )}
                >
                  {pendTotal} Gold
                </span>
              </div>
              {safe ? (
                <div className="mt-2 rounded-md bg-emerald-500/10 py-1.5 text-center text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  Funds are ready for round end
                </div>
              ) : (
                <div className="mt-2 rounded-md bg-rose-500/15 py-1.5 text-center text-[10px] text-rose-600 dark:text-rose-300 font-medium">
                  Funds may fall short at round end
                </div>
              )}
            </>
          ) : billsPaid ? (
            <>
              <Row label="Paid this round">
                <b>{game.workerWages + game.maintenanceCosts} Gold</b>
              </Row>
              {game.currentRound < game.maxRounds && (
                <Row label="Projected next round">
                  <b>{nextRoundDue} Gold</b>
                </Row>
              )}
            </>
          ) : (
            <p className="py-2 text-[11px] text-muted-foreground/80">
              No current wages or maintenance are due.
            </p>
          )}

          {hasLoans && (
            <div className="mt-3 border-t border-black/5 pt-2 dark:border-white/10">
              <div className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground/80 flex items-center gap-1">
                <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
                Outstanding Loans
                <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
              </div>
              {game.debts.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-1.5 py-0.5"
                >
                  <span className="text-[12px] text-muted-foreground">
                    You owe{" "}
                    <b className="text-foreground/90">{d.counterpartyName}</b>
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[12px] font-bold text-rose-600 dark:text-rose-400">
                      {d.amount}g
                    </span>
                    {onRepayLoan && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-6 rounded px-2 text-[10px]"
                        disabled={
                          waiting || convoy?.busy || available < d.amount
                        }
                        onClick={() => onRepayLoan(d.id)}
                      >
                        Repay
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {game.loansGiven.map((l) => (
                <Row
                  key={l.id}
                  label={
                    <span>
                      Owed by <b>{l.counterpartyName}</b>
                    </span>
                  }
                >
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {l.amount}g
                  </span>
                </Row>
              ))}
              <p className="pt-1 text-[10px] text-muted-foreground/80">
                Unpaid loans settle automatically at the end of Round{" "}
                {game.maxRounds}.
              </p>
            </div>
          )}

          {convoy && myUserId && (
            <ConvoyVenturesSection
              game={game}
              convoy={convoy}
              myUserId={myUserId}
              waiting={waiting}
            />
          )}
        </TabsContent>

        <TabsContent value="log" className="min-h-0 flex-1">
          <GameLogPanel logs={logs} embedded />
        </TabsContent>
        <TabsContent
          value="chronicle"
          className="pm-scroll lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
        >
          <VoyageChronicle
            events={deriveChronicleEvents(logs, shownRound)}
            currentRound={shownRound}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({
  label,
  value,
  className,
  icon,
}: {
  label: string;
  value: string;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="pm-stat-card rounded-xl border border-black/[0.06] bg-white/55 px-2.5 py-2.5 text-left dark:border-white/[0.08] dark:bg-white/[0.05]">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-background shadow-sm ring-1 ring-black/[0.06] dark:bg-slate-950/35 dark:ring-white/[0.08]",
            className,
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className={cn("text-base font-bold leading-tight", className)}>
            {value}
          </div>
          <div className="truncate text-[10px] text-muted-foreground">
            {label}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-0.5 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground/90 font-medium">{children}</span>
    </div>
  );
}

function SubRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5 pl-3 text-[10px] text-muted-foreground">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// Shows shared convoy commitments beside outstanding loans.
function ConvoyVenturesSection({
  game,
  convoy,
  myUserId,
  waiting,
}: {
  game: GameState;
  waiting?: boolean;
  convoy: {
    ventures: ConvoyVenture[];
    busy: boolean;
    locked: boolean;
    error: string | null;
    clearError: () => void;
    post: (targetGold: number, deadlineRound: number) => void;
    contribute: (ventureId: string, amount: number) => void;
  };
  myUserId: string;
}) {
  const [target, setTarget] = useState("");
  const [roundsAhead, setRoundsAhead] = useState(
    String(CONVOY_VENTURE_MIN_ROUNDS_AHEAD),
  );
  const [contributions, setContributions] = useState<Record<string, string>>(
    {},
  );

  // Mirrors the server's own cap (see venture:post in
  // src/server/realtime.ts): the deadline can never land on, or past, this
  // voyage's actual final round, so whoever contributes always has at
  // least one full round left to spend whatever they're paid. Computed
  // client side purely so the form can't even offer an option the server
  // would reject; the server enforces this for real regardless.
  const maxRoundsAhead = Math.min(
    CONVOY_VENTURE_MAX_ROUNDS_AHEAD,
    game.maxRounds - 1 - game.currentRound,
  );
  const tooLateToPost = maxRoundsAhead < CONVOY_VENTURE_MIN_ROUNDS_AHEAD;
  const available = game.money - taxReserve(game);
  const active = game.phase !== 0 && !game.gameOver;
  const canContribute = !waiting && !convoy.busy && active;

  function submitPost() {
    const t = Math.floor(Number(target));
    const r = Math.floor(Number(roundsAhead));
    if (!Number.isFinite(t) || !Number.isFinite(r)) return;
    convoy.post(t, game.currentRound + r);
    setTarget("");
    setRoundsAhead(String(CONVOY_VENTURE_MIN_ROUNDS_AHEAD));
  }

  function submitContribute(ventureId: string) {
    const raw = contributions[ventureId];
    const amount = Math.floor(Number(raw));
    if (!canContribute || !Number.isFinite(amount) || amount <= 0) return;
    convoy.contribute(ventureId, amount);
    setContributions((c) => ({ ...c, [ventureId]: "" }));
  }

  return (
    <div className="mt-3 border-t border-black/5 pt-2 dark:border-white/10">
      <div className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground/80 flex items-center gap-1">
        <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
        Convoy Ventures
        <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
      </div>

      {convoy.error && (
        <div className="mb-1.5 rounded bg-rose-500/10 px-2 py-1 text-[10px] text-rose-600 dark:text-rose-300">
          {convoy.error}
        </div>
      )}

      {!active ? (
        <p className="text-xs text-muted-foreground">
          Convoy Ventures are available during an active voyage.
        </p>
      ) : convoy.locked ? (
        // This harbor's one Convoy Venture chance for
        // this voyage is already spent (a venture somewhere in this room
        // has already filled). Explaining why, rather than just hiding the
        // form, is what actually stops a captain from wondering why
        // posting silently does nothing.
        <p className="mb-2 rounded bg-black/[0.03] px-2 py-1.5 text-[10px] text-muted-foreground/80 dark:bg-white/[0.04]">
          This harbor has already used its one Convoy Venture for this voyage.
          It opens again on a fresh voyage or a restart.
        </p>
      ) : tooLateToPost ? (
        // Too close to the voyage's own final round for
        // any deadline to leave a full round free to spend the reward in.
        <p className="mb-2 rounded bg-black/[0.03] px-2 py-1.5 text-[10px] text-muted-foreground/80 dark:bg-white/[0.04]">
          Too late in this voyage to post a new Convoy Venture: there's no round
          left that would leave time to spend the reward.
        </p>
      ) : (
        <>
          <div className="mb-2 flex items-end gap-1.5">
            <div className="flex-1">
              <label className="mb-0.5 block text-[9px] text-muted-foreground/80">
                Target Gold
              </label>
              <Input
                type="number"
                min={CONVOY_VENTURE_MIN_TARGET}
                max={CONVOY_VENTURE_MAX_TARGET}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={`${CONVOY_VENTURE_MIN_TARGET}+`}
                className="h-7 text-[11px]"
              />
            </div>
            <div className="flex-1">
              <label className="mb-0.5 block text-[9px] text-muted-foreground/80">
                Rounds to fill
              </label>
              <Input
                type="number"
                min={CONVOY_VENTURE_MIN_ROUNDS_AHEAD}
                max={maxRoundsAhead}
                value={roundsAhead}
                onChange={(e) => setRoundsAhead(e.target.value)}
                className="h-7 text-[11px]"
              />
            </div>
            <Button
              size="sm"
              className="h-7 rounded px-2 text-[10px]"
              onClick={submitPost}
            >
              Post
            </Button>
          </div>

          {game.currentRound + Number(roundsAhead || 0) > 0 && (
            <p className="mb-2 text-[9px] text-muted-foreground/70">
              Fills by Round{" "}
              {game.currentRound + (Math.floor(Number(roundsAhead)) || 0)}. Miss
              it and every contributor only gets back a partial refund. This
              harbor only gets one venture per voyage, so make it count.
            </p>
          )}
        </>
      )}

      {convoy.ventures.length === 0 ? (
        <p className="py-1 text-[11px] text-muted-foreground/80">
          {convoy.locked
            ? "No ventures open. This voyage's one chance has already been used."
            : "No ventures open right now. Post one, or wait for another captain to."}
        </p>
      ) : (
        <div className="space-y-2">
          {convoy.ventures.map((v) => {
            const pct = Math.min(
              100,
              Math.round((v.total / v.targetGold) * 100),
            );
            const mine = v.contributions.find((c) => c.userId === myUserId);
            // Mirrors the server's own per contributor cap
            // (see computeAcceptedContribution in src/lib/game/convoy.ts):
            // no single captain may ever hold more than
            // CONVOY_VENTURE_MAX_CONTRIBUTOR_SHARE of a venture's target, so
            // it can never fill from one captain's own Gold alone.
            const myShareCap = Math.ceil(
              v.targetGold * CONVOY_VENTURE_MAX_CONTRIBUTOR_SHARE,
            );
            const myRemainingShare = myShareCap - (mine?.amount ?? 0);
            const atMyShareCap = myRemainingShare <= 0;
            const maximum = Math.max(
              0,
              Math.min(myRemainingShare, v.targetGold - v.total, available),
            );
            const requested = Number(contributions[v.id] ?? "");
            const canSubmit =
              canContribute &&
              Number.isSafeInteger(requested) &&
              requested > 0 &&
              requested <= maximum;
            return (
              <div
                key={v.id}
                className="rounded-lg border border-black/5 bg-black/[0.02] p-2 dark:border-white/10 dark:bg-white/[0.03]"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    {v.posterId === myUserId ? "Your venture" : v.posterName}
                  </span>
                  <span className="font-semibold">
                    {v.total} / {v.targetGold}g
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-teal-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[9px] text-muted-foreground/80">
                  <span>By Round {v.deadlineRound}</span>
                  {mine && <span>You've backed {mine.amount}g</span>}
                </div>
                {atMyShareCap ? (
                  <p className="mt-1.5 text-[9px] text-muted-foreground/70">
                    You've backed this as much as any single captain can. It
                    needs another captain to fund the rest.
                  </p>
                ) : (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={1}
                      max={maximum}
                      aria-label="Gold to back this Convoy Venture"
                      value={contributions[v.id] ?? ""}
                      onChange={(e) =>
                        setContributions((c) => ({
                          ...c,
                          [v.id]: e.target.value,
                        }))
                      }
                      placeholder="Gold"
                      className="h-6 text-[10px]"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-6 shrink-0 rounded px-2 text-[10px]"
                      disabled={!canSubmit}
                      onClick={() => submitContribute(v.id)}
                    >
                      {convoy.busy ? "Confirming…" : "Back it"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InvItem({
  icon,
  name,
  term,
  color,
  count,
  muted,
  skilled,
  priceContent,
}: {
  icon: React.ReactNode;
  name: string;
  term?: string;
  color?: string;
  count: number;
  muted?: boolean;
  // Artisan rows only: how many of this type have been promoted. Rendered as
  // a star tally beside the head count rather than a second row, so the
  // hold stays scannable.
  skilled?: number;
  priceContent?: React.ReactNode;
}) {
  return (
    <div className="flex items-center py-0.5 text-[11px] gap-1.5">
      <span className="inline-flex items-center text-[14px] shrink-0">
        {icon}
      </span>
      <span
        className="flex-1 min-w-0 truncate"
        style={{ color: muted ? undefined : color }}
      >
        <Term term={term ?? name} content={priceContent}>
          {name}
        </Term>
      </span>
      {skilled !== undefined && skilled > 0 && (
        <span
          className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0"
          title={`${skilled} of ${count} trained: each produces 2 per round`}
        >
          ⭐{skilled}
        </span>
      )}
      <span
        className={cn(
          "min-w-[28px] text-right font-bold rounded-md px-1.5 py-0.5 text-[10px] shrink-0",
          count > 0 && !muted ? "bg-black/[0.05] dark:bg-white/[0.08]" : "",
        )}
        style={{ color: muted ? undefined : color }}
      >
        {count}
      </span>
    </div>
  );
}
