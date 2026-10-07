/** 7-day login calendar. Days advance one per claim (missed days don't reset the streak — gentle by design). */
export interface DailyState {
  lastClaimKey: string;
  day: number;
}

export type DailyReward =
  | { kind: 'coins'; incomeSeconds: number }
  | { kind: 'tornado'; n: number }
  | { kind: 'boost'; seconds: number };

export const DAILY_REWARDS: readonly DailyReward[] = [
  { kind: 'coins', incomeSeconds: 60 },
  { kind: 'coins', incomeSeconds: 120 },
  { kind: 'tornado', n: 2 },
  { kind: 'coins', incomeSeconds: 240 },
  { kind: 'boost', seconds: 300 },
  { kind: 'coins', incomeSeconds: 480 },
  { kind: 'tornado', n: 5 },
];

export const newDaily = (): DailyState => ({ lastClaimKey: '', day: 0 });

/** ISO date keys sort lexicographically, so winding the device clock back never re-opens a claimed day. */
export const canClaimDaily = (d: DailyState, todayKey: string): boolean => todayKey > d.lastClaimKey;

/** Returns the reward index claimed and advances the calendar. */
export function claimDaily(d: DailyState, todayKey: string): number | null {
  if (!canClaimDaily(d, todayKey)) return null;
  const idx = d.day % DAILY_REWARDS.length;
  d.day += 1;
  d.lastClaimKey = todayKey;
  return idx;
}
