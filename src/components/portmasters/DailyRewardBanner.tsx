"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Gift, Loader2, Sparkles } from "lucide-react";
import {
  CHECK_IN_XP_REWARDS,
  type CheckInStatus,
  utcDayKey,
} from "@/lib/game/checkin";
import { cn } from "@/lib/utils";

type Props = {
  status: CheckInStatus;
  onClaim: () => Promise<void>;
  className?: string;
};

type RewardState = "claimed" | "current" | "future";

function deriveStreak(
  claimedThisCycle: number,
  lastCheckInDate: string | null,
): number {
  if (!lastCheckInDate) return 0;
  const today = utcDayKey();
  const yesterday = utcDayKey(new Date(Date.now() - 86_400_000));
  if (lastCheckInDate === today || lastCheckInDate === yesterday) {
    return claimedThisCycle;
  }
  return 0;
}

function RewardDay({
  day,
  xp,
  state,
  isBonus,
}: {
  day: number;
  xp: number;
  state: RewardState;
  isBonus: boolean;
}) {
  const isClaimed = state === "claimed";
  const isCurrent = state === "current";

  return (
    <div
      className={cn(
        "flex min-h-16 flex-col justify-between rounded-xl border px-2.5 py-2 transition-colors",
        isClaimed &&
          "border-emerald-500/25 bg-emerald-500/[0.07] dark:border-emerald-300/20 dark:bg-emerald-400/[0.08]",
        isCurrent &&
          "border-amber-500/35 bg-amber-500/[0.09] dark:border-amber-300/25 dark:bg-amber-300/[0.08]",
        !isClaimed &&
          !isCurrent &&
          "border-black/[0.06] bg-white/45 text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "text-[11px] font-medium",
            isCurrent && "text-amber-700 dark:text-amber-200",
            isClaimed && "text-emerald-700 dark:text-emerald-300",
          )}
        >
          {isBonus ? "Bonus" : `Day ${day}`}
        </span>
        <span
          className={cn(
            "grid h-5 w-5 place-items-center rounded-full",
            isClaimed
              ? "bg-emerald-500 text-white"
              : isCurrent
                ? "bg-amber-500 text-white"
                : "bg-black/[0.06] text-muted-foreground dark:bg-white/10",
          )}
        >
          {isClaimed ? (
            <Check className="h-3 w-3" />
          ) : isCurrent ? (
            <Sparkles className="h-3 w-3" />
          ) : (
            <span className="text-[10px] font-semibold">{day}</span>
          )}
        </span>
      </div>
      <span className="text-[11px] font-semibold tabular-nums">+{xp}</span>
    </div>
  );
}

export const DailyRewardBanner = forwardRef<HTMLDivElement, Props>(
  function DailyRewardBanner({ status, onClaim, className }, ref) {
    const [claiming, setClaiming] = useState(false);
    const [justClaimed, setJustClaimed] = useState(false);
    const justClaimedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const streak = deriveStreak(
      status.claimedThisCycle,
      status.lastCheckInDate,
    );
    const canClaim = status.canClaimToday;
    const currentReward = status.rewards[status.currentDay - 1] ?? 0;

    const handleClaim = useCallback(async () => {
      if (claiming || !canClaim) return;
      setClaiming(true);
      try {
        await onClaim();
        setJustClaimed(true);
        if (justClaimedTimer.current) clearTimeout(justClaimedTimer.current);
        justClaimedTimer.current = setTimeout(
          () => setJustClaimed(false),
          3000,
        );
      } catch {
        setJustClaimed(false);
      } finally {
        setClaiming(false);
      }
    }, [claiming, canClaim, onClaim]);

    useEffect(() => {
      return () => {
        if (justClaimedTimer.current) clearTimeout(justClaimedTimer.current);
      };
    }, []);

    const earnedRenown = useMemo(
      () =>
        CHECK_IN_XP_REWARDS.slice(0, status.claimedThisCycle).reduce(
          (sum, xp) => sum + xp,
          0,
        ),
      [status.claimedThisCycle],
    );

    return (
      <div
        ref={ref}
        className={cn(
          "pm-glass-warm overflow-hidden rounded-2xl border border-amber-500/15 shadow-sm",
          className,
        )}
      >
        <div className="space-y-5 px-4 py-4 sm:px-5 sm:py-5">
          <div className="grid gap-4">
            <div className="min-w-0 space-y-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/80 text-amber-700 shadow-sm ring-1 ring-amber-500/15 dark:bg-slate-950/30 dark:text-amber-200">
                  <Gift className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold leading-tight text-amber-900 dark:text-amber-100">
                    Daily check in
                  </h3>
                  <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    A quiet harbor ritual. Claim today, keep the week moving,
                    and collect a larger reward on the final day.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-14 text-xs text-muted-foreground max-sm:pl-0">
                <span className="rounded-full bg-black/[0.04] px-2.5 py-1 dark:bg-white/[0.06]">
                  {earnedRenown} renown collected
                </span>
                {streak > 0 && (
                  <span className="rounded-full bg-orange-500/[0.09] px-2.5 py-1 text-orange-700 dark:text-orange-300">
                    {streak} day streak
                  </span>
                )}
                {!canClaim && (
                  <span className="rounded-full bg-emerald-500/[0.09] px-2.5 py-1 text-emerald-700 dark:text-emerald-300">
                    Claimed today
                  </span>
                )}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {justClaimed ? (
                <motion.div
                  key="celebration"
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                >
                  <Check className="h-4 w-4" />
                  Reward claimed
                </motion.div>
              ) : canClaim ? (
                <motion.button
                  key="claim"
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:opacity-50"
                  disabled={claiming}
                  onClick={handleClaim}
                  whileTap={{ scale: 0.98 }}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                >
                  {claiming ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Claiming</span>
                    </>
                  ) : (
                    <>
                      <Gift className="h-4 w-4" />
                      <span>Claim {currentReward} renown</span>
                    </>
                  )}
                </motion.button>
              ) : (
                <motion.div
                  key="claimed"
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-black/[0.04] px-4 py-2.5 text-sm text-muted-foreground dark:bg-white/[0.06]"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                >
                  <Check className="h-4 w-4" />
                  Return tomorrow
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {status.rewards.map((xp, i) => {
              const day = i + 1;
              const isClaimed = day <= status.claimedThisCycle;
              const isCurrent = day === status.currentDay;
              const isBonus = day === 7;

              let rewardState: RewardState = "future";
              if (isClaimed) rewardState = "claimed";
              else if (isCurrent) rewardState = "current";

              return (
                <RewardDay
                  key={day}
                  day={day}
                  xp={xp}
                  state={rewardState}
                  isBonus={isBonus}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  },
);
