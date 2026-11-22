// Account rewards advance once per claimed UTC day and wrap after day seven.
export const CHECK_IN_XP_REWARDS = [20, 30, 40, 50, 60, 80, 150] as const;
export const CHECK_IN_CYCLE_LENGTH = CHECK_IN_XP_REWARDS.length;

// Clamps invalid day values into the configured reward cycle.
export function checkInRewardForDay(day: number): number {
  const idx = Math.min(CHECK_IN_CYCLE_LENGTH, Math.max(1, Math.floor(day))) - 1;
  return CHECK_IN_XP_REWARDS[idx];
}

// Uses one UTC date boundary for every captain and server location.
export function utcDayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

// Stores progress within the current cycle and the most recent claim date.
export type CheckInState = {
  checkInCount: number;
  lastCheckInDate: string | null;
};

// Derived state used by the check in interface.
export type CheckInStatus = {
  // The next claimable day, starting at one.
  currentDay: number;
  // The number of completed days in the current cycle.
  claimedThisCycle: number;
  // Whether the current UTC day remains claimable.
  canClaimToday: boolean;
  // A copy of the configured reward table.
  rewards: number[];
  lastCheckInDate: string | null;
};

// Folds persisted values into a valid cycle position.
function normalizeCount(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return (
    ((Math.floor(count) % CHECK_IN_CYCLE_LENGTH) + CHECK_IN_CYCLE_LENGTH) %
    CHECK_IN_CYCLE_LENGTH
  );
}

export function checkInStatus(
  state: CheckInState,
  today: string = utcDayKey(),
): CheckInStatus {
  const claimedThisCycle = normalizeCount(state.checkInCount);
  return {
    currentDay: claimedThisCycle + 1,
    claimedThisCycle,
    canClaimToday: state.lastCheckInDate !== today,
    rewards: [...CHECK_IN_XP_REWARDS],
    lastCheckInDate: state.lastCheckInDate,
  };
}

// Returns null when the current UTC day has already been claimed.
export type CheckInResult = { day: number; xp: number; next: CheckInState };

export function applyCheckIn(
  state: CheckInState,
  today: string = utcDayKey(),
): CheckInResult | null {
  if (state.lastCheckInDate === today) return null;
  const day = normalizeCount(state.checkInCount) + 1;
  const xp = checkInRewardForDay(day);
  // Modulo advances the cycle and returns day seven to its starting position.
  const next: CheckInState = {
    checkInCount: day % CHECK_IN_CYCLE_LENGTH,
    lastCheckInDate: today,
  };
  return { day, xp, next };
}
