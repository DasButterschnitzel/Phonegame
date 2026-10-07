import { describe, it, expect } from 'vitest';
import { newDaily, claimDaily, canClaimDaily, DAILY_REWARDS } from './daily.ts';

describe('daily calendar', () => {
  it('claims once per day and advances', () => {
    const d = newDaily();
    expect(claimDaily(d, '2026-10-07')).toBe(0);
    expect(canClaimDaily(d, '2026-10-07')).toBe(false);
    expect(claimDaily(d, '2026-10-07')).toBeNull();
    expect(claimDaily(d, '2026-10-09')).toBe(1); // a missed day does not reset
  });
  it('loops after 7 days', () => {
    const d = newDaily();
    for (let i = 0; i < DAILY_REWARDS.length; i++) claimDaily(d, `2026-10-0${i + 1}`);
    expect(claimDaily(d, '2026-10-08')).toBe(0);
  });
  it('winding the clock back never re-opens a claim', () => {
    const d = newDaily();
    claimDaily(d, '2026-10-08');
    expect(canClaimDaily(d, '2026-10-07')).toBe(false);
    expect(canClaimDaily(d, '2026-10-09')).toBe(true);
  });
});
