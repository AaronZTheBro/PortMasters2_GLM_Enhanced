"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { QuantityInput } from "@/components/ui/quantity-input";
import { WORKER_TYPES } from "@/lib/game/constants";
import { roundsFor } from "@/lib/game/difficulty";
import { quotePirateWaters } from "@/lib/game/engine/pirates";
import {
  maintenanceSurcharge,
  quoteDues,
  hireEscort,
  resolvePirateAttack,
} from "@/lib/game/engine";
import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { HandCoins, ShieldCheck, Skull, X } from "lucide-react";
import type { PublicUser } from "@/lib/api";
import {
  ReadyFooter,
  type Aid,
  type Backing,
  type PhaseSync,
} from "./PhaseShared";

function PirateAttack({
  game,
  act,
}: {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
}) {
  const { chance, escortCost, leak, raidLoss, reserve, weather } =
    quotePirateWaters(game);
  const { total: bills } = quoteDues(game);
  const raidPct = Number((chance * 100).toFixed(2));
  return (
    <div className="max-w-xl mx-auto text-center py-4">
      <div className="text-5xl mb-2">🏴‍☠️</div>
      <div className="text-2xl font-bold mb-1">Pirate Waters Ahead</div>
      <div className="mb-5 space-y-2">
        <p className="text-sm text-muted-foreground">
          Before this round's bills come due, your ship has to clear open water.
          Direct sailing has a {raidPct}% chance of losing {raidLoss} Gold.
          {reserve > 0 &&
            ` Your reserve protects ${reserve} Gold from the raid.`}
        </p>
        {leak > 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            🕵️ A corrupt broker leaked your position this round, so the odds
            above are already raised.
          </p>
        )}
        {weather > 0 && (
          <p className="text-sm text-muted-foreground">
            Heavy Seas is included in these odds.
          </p>
        )}
      </div>
      <div className="pm-decision-grid mx-auto max-w-lg">
        <Button
          size="lg"
          className="pm-grad-primary text-white rounded-xl h-14"
          onClick={() => act((g, l) => hireEscort(g, l))}
        >
          <ShieldCheck className="h-5 w-5 mr-2" /> Hire Escort ({escortCost}{" "}
          Gold)
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="rounded-xl h-14"
          onClick={() => act((g, l) => resolvePirateAttack(g, l))}
        >
          <Skull className="h-5 w-5 mr-2" /> Set Sail Anyway
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">
        {game.money >= escortCost + bills
          ? `After bills, escort leaves ${game.money - escortCost - bills} Gold.`
          : `After hiring an escort, you would be short by ${escortCost + bills - game.money} Gold for bills.`}{" "}
        {game.money >= raidLoss + bills
          ? `After a raid and bills, direct passage leaves ${game.money - raidLoss - bills} Gold.`
          : `After a raid, you would be short by ${raidLoss + bills - game.money} Gold for bills.`}
      </p>
    </div>
  );
}

function SettlementBills({
  game,
  aid,
  backing,
  myUserId,
  phaseSync,
  members,
}: {
  game: GameState;
  aid: Aid;
  backing: Backing;
  myUserId: string;
  phaseSync: PhaseSync;
  members: PublicUser[];
}) {
  // Mirror payWages across every configured artisan so the preview and aid
  // gate use the exact amount that settlement charges.
  const roster = WORKER_TYPES.map((w) => (game.workers[w.id] ?? []).length);
  const { wages, maintenance: maintCost, total: totalDue } = quoteDues(game);
  const wagesDue = wages.due;
  const nWorkers = roster.reduce((sum, n) => sum + n, 0);
  const surcharge = maintenanceSurcharge(game);
  const canAfford = game.money >= totalDue;
  const balanceAfter = game.money - totalDue;

  const myRequest = aid.requests.find((r) => r.fromUserId === myUserId);
  const otherRequests = aid.requests.filter((r) => r.fromUserId !== myUserId);
  const shortfall = Math.max(1, totalDue - game.money);
  const [requestAmount, setRequestAmount] = useState(shortfall);

  // Only a loan neither side of, and not already
  // backed by someone else, is actually mine to back.
  const backableLoans = backing.loans.filter(
    (l) => l.borrowerId !== myUserId && l.lenderId !== myUserId && !l.backerId,
  );
  const [backAmounts, setBackAmounts] = useState<Record<string, number>>({});

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-2xl font-bold text-center mb-4">
        🔧 Phase 3: Round Settlement
      </div>

      {game.pirateAttackResolved && (
        <div
          className={cn(
            "rounded-xl border p-3 my-3.5 text-center text-sm",
            game.escortHired
              ? "border-teal-500/20 bg-teal-500/[0.04]"
              : "border-black/10 dark:border-white/10 bg-background/40",
          )}
        >
          {game.escortHired
            ? "🛡️ Escort hired, you sailed through safely this round."
            : "🌊 You sailed without an escort this round."}
        </div>
      )}

      <div className="rounded-xl bg-amber-500/[0.06] border border-amber-500/20 p-3.5 my-3.5">
        <h3 className="font-semibold text-orange-700 dark:text-orange-300 mb-2">
          ⏳ Bills Due This Round
        </h3>
        <div className="flex justify-between text-[13px] py-0.5">
          <span>
            👥 Worker Wages ({nWorkers} worker{nWorkers !== 1 ? "s" : ""})
          </span>
          <span className="font-bold">{wagesDue} Gold</span>
        </div>
        {wages.discount > 0 && (
          <p className="text-xs text-muted-foreground">
            Wage Ledger saves {wages.discount} Gold.
          </p>
        )}
        <div className="flex justify-between text-sm py-0.5">
          <span>🔧 Ship Maintenance Fee</span>
          <span className="font-bold">{maintCost} Gold</span>
        </div>
        {surcharge > 0 && (
          <div className="text-[11px] text-muted-foreground pl-2.5">
            ↳ Base {game.fixedCost}g + module upkeep {surcharge}g
          </div>
        )}
        <div className="flex justify-between text-sm py-0.5 border-t border-orange-500/20 pt-1.5 mt-1.5 font-bold">
          <span>💸 Total Due</span>
          <span className="text-orange-600 dark:text-orange-400">
            {totalDue} Gold
          </span>
        </div>
      </div>

      <div className="rounded-xl bg-teal-500/[0.04] border border-teal-500/15 p-3.5 my-3.5">
        <h3 className="font-semibold mb-2">💹 Balance Summary</h3>
        <div className="flex justify-between text-[13px] py-0.5">
          <span>Current Funds</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
            {game.money} Gold
          </span>
        </div>
        <div className="flex justify-between text-[13px] py-0.5">
          <span>After Settlement</span>
          <span
            className={cn(
              "font-bold",
              balanceAfter >= 0
                ? "text-teal-700 dark:text-teal-300"
                : "text-rose-600 dark:text-rose-400",
            )}
          >
            {balanceAfter < 0
              ? `Short by ${Math.abs(balanceAfter)} Gold`
              : `${balanceAfter} Gold`}
          </span>
        </div>
        <div className="flex justify-between text-[13px] py-0.5">
          <span>Round Revenue</span>
          <span className="text-emerald-600 dark:text-emerald-400">
            +{game.roundRevenue} Gold
          </span>
        </div>
      </div>

      {!canAfford && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.04] p-3.5 my-3.5">
          <h3 className="font-semibold text-rose-700 dark:text-rose-300 mb-2 flex items-center gap-1.5">
            <HandCoins className="h-4 w-4" /> Short on Gold? Ask the Harbor for
            Help
          </h3>
          {myRequest ? (
            <div className="flex items-center justify-between text-sm bg-background/50 rounded-lg px-3 py-2">
              <span>
                🆘 Waiting for a captain to lend you{" "}
                <b>{myRequest.amount} Gold</b>…
              </span>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 px-2.5 text-[10px] rounded shrink-0"
                onClick={() => aid.cancel()}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Request</span>
              <QuantityInput
                value={requestAmount}
                onCommit={setRequestAmount}
                min={1}
                aria-label="Loan amount to request"
                className="w-20 h-9"
              />
              <span className="text-muted-foreground">
                Gold from another captain
              </span>
              <Button
                size="sm"
                className="pm-grad-primary text-white rounded-lg"
                onClick={() => aid.post(requestAmount)}
              >
                🆘 Request Help
              </Button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-2">
            A loan transfers instantly if someone helps. Repay it any time
            before the voyage ends, or it's deducted automatically at Round{" "}
            {roundsFor(game.difficulty)} and handed to them.
          </p>
        </div>
      )}

      {otherRequests.length > 0 && (
        <div className="rounded-xl border border-black/10 dark:border-white/10 bg-background/50 p-3.5 my-3.5">
          <h3 className="font-semibold mb-2 text-sm">
            🆘 Captains Asking for Help
          </h3>
          <div className="space-y-1.5">
            {otherRequests.map((r) => {
              const canHelp = game.money >= r.amount;
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-xs border border-black/5 dark:border-white/10 bg-background/60 gap-2"
                >
                  <span>
                    <b>{r.fromName}</b> needs{" "}
                    <span className="text-rose-600 dark:text-rose-400 font-semibold">
                      {r.amount} Gold
                    </span>
                  </span>
                  <Button
                    size="sm"
                    className={cn(
                      "h-7 px-2.5 text-[10px] rounded shrink-0",
                      canHelp && "pm-grad-emerald text-white",
                    )}
                    variant={canHelp ? "default" : "secondary"}
                    disabled={!canHelp}
                    onClick={() => aid.help(r.id)}
                  >
                    🤝 Lend {r.amount} Gold
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {backableLoans.length > 0 && (
        <div className="rounded-xl border border-black/10 dark:border-white/10 bg-background/50 p-3.5 my-3.5">
          <h3 className="font-semibold mb-2 text-sm">
            🛡️ Loans You Could Back
          </h3>
          <div className="space-y-1.5">
            {backableLoans.map((l) => {
              const pledge = Math.min(
                backAmounts[l.debtId] ?? l.amount,
                l.amount,
              );
              const canBack = game.money >= pledge && pledge >= 1;
              return (
                <div
                  key={l.debtId}
                  className="flex flex-wrap items-center justify-between rounded-md px-3 py-2 text-xs border border-black/5 dark:border-white/10 bg-background/60 gap-2"
                >
                  <span>
                    <b>{l.lenderName}</b> lent <b>{l.borrowerName}</b>{" "}
                    <span className="text-rose-600 dark:text-rose-400 font-semibold">
                      {l.amount} Gold
                    </span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <QuantityInput
                      value={pledge}
                      onCommit={(v) =>
                        setBackAmounts((prev) => ({
                          ...prev,
                          [l.debtId]: Math.min(v, l.amount),
                        }))
                      }
                      min={1}
                      max={l.amount}
                      aria-label={`Gold to pledge backing ${l.lenderName}'s loan to ${l.borrowerName}`}
                      className="w-16 h-7"
                    />
                    <Button
                      size="sm"
                      className={cn(
                        "h-7 px-2.5 text-[10px] rounded shrink-0",
                        canBack && "pm-grad-emerald text-white",
                      )}
                      variant={canBack ? "default" : "secondary"}
                      disabled={!canBack}
                      onClick={() => backing.offer(l.debtId, pledge)}
                    >
                      🛡️ Back {pledge} Gold
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Pledged Gold is escrowed now, only spent if the loan actually
            defaults, up to what you pledged. Never called on? It all comes
            back, plus a small Reputation bonus.
          </p>
        </div>
      )}

      {backing.error && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/25 px-3.5 py-2 mb-3.5 text-xs text-rose-600 dark:text-rose-300 flex items-center justify-between">
          <span>⚠️ {backing.error}</span>
          <button onClick={backing.clearError}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {aid.error && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/25 px-3.5 py-2 mb-3.5 text-xs text-rose-600 dark:text-rose-300 flex items-center justify-between">
          <span>⚠️ {aid.error}</span>
          <button onClick={aid.clearError}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <ReadyFooter
        phaseSync={phaseSync}
        members={members}
        idleLabel={
          canAfford
            ? `💸 Settle Bills: ${totalDue} Gold`
            : `⚠️ Force Pay (${game.money}/${totalDue} Gold)`
        }
        idleClassName="pm-grad-amber text-white h-12 px-8"
        onConfirm={() => void phaseSync.markReady()}
      />
    </div>
  );
}

export function Settlement({
  game,
  act,
  aid,
  backing,
  myUserId,
  phaseSync,
  members,
}: {
  game: GameState;
  act: (fn: (g: GameState, logs: string[]) => void) => void;
  aid: Aid;
  backing: Backing;
  myUserId: string;
  phaseSync: PhaseSync;
  members: PublicUser[];
}) {
  if (!game.pirateAttackResolved) return <PirateAttack game={game} act={act} />;
  return (
    <SettlementBills
      game={game}
      aid={aid}
      backing={backing}
      myUserId={myUserId}
      phaseSync={phaseSync}
      members={members}
    />
  );
}
