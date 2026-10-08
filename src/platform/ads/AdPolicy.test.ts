import { describe, it, expect } from 'vitest';
import { DEFAULT_POLICY as cfg, canOfferRewarded, canShowInterstitial, newPolicyState, onInterstitialShown, onRewardedShown, onUnload, type BreakCtx } from './AdPolicy.ts';

const ctx = (o: Partial<BreakCtx> = {}): BreakCtx => ({ kind: 'barn_unload', sinceThrottle: 10, tutorialActive: false, modalOpen: false, wallNow: 1e6, ...o });

function ready() {
  const st = newPolicyState(400);
  for (let i = 0; i < cfg.minUnloadsBetween; i++) onUnload(st);
  return st;
}
const unloads = (st: ReturnType<typeof newPolicyState>) => {
  for (let i = 0; i < cfg.minUnloadsBetween; i++) onUnload(st);
};

describe('AdPolicy', () => {
  it('respects first-play grace and session warmup', () => {
    const st = newPolicyState(100);
    unloads(st);
    expect(canShowInterstitial(st, cfg, 500, ctx()).reason).toBe('grace');
    st.playtimeSec = 400;
    expect(canShowInterstitial(st, cfg, 30, ctx()).reason).toBe('warmup');
    expect(canShowInterstitial(st, cfg, cfg.sessionWarmupSec + 1, ctx()).ok).toBe(true);
  });
  it('cooldown, unload gating and throttle quiet', () => {
    const st = ready();
    const t0 = 1000;
    onInterstitialShown(st, t0, 1e6);
    expect(canShowInterstitial(st, cfg, t0 + cfg.interstitialCooldownSec - 1, ctx()).reason).toBe('cooldown');
    const t1 = t0 + cfg.interstitialCooldownSec + 1;
    expect(canShowInterstitial(st, cfg, t1, ctx()).reason).toBe('unloads');
    unloads(st);
    expect(canShowInterstitial(st, cfg, t1, ctx({ sinceThrottle: cfg.throttleQuietSec - 0.5 })).reason).toBe('throttle');
    expect(canShowInterstitial(st, cfg, t1, ctx()).ok).toBe(true);
    // Dialog breaks ignore unload / throttle gating.
    expect(canShowInterstitial(newPolicyState(400), cfg, cfg.sessionWarmupSec + 1, ctx({ kind: 'dialog_closed', sinceThrottle: 0 })).ok).toBe(true);
  });
  it('quiet after rewarded, never right after a big moment, tutorial and hourly cap', () => {
    const st = ready();
    onRewardedShown(st, 1000, 'income_x2');
    expect(canShowInterstitial(st, cfg, 1000 + cfg.afterRewardedQuietSec - 1, ctx()).reason).toBe('afterRewarded');
    const t = 1000 + cfg.afterRewardedQuietSec + 1;
    expect(canShowInterstitial(st, cfg, t, ctx({ tutorialActive: true })).reason).toBe('tutorial');
    expect(canShowInterstitial(st, cfg, t, ctx({ sinceBigMoment: 2 })).reason).toBe('bigMoment');
    expect(canShowInterstitial(st, cfg, t, ctx({ sinceBigMoment: cfg.bigMomentQuietSec + 1 })).ok).toBe(true);
    st.interstitialWall = Array.from({ length: cfg.maxInterstitialsPerHour }, (_, i) => 1e6 - i * 600);
    expect(canShowInterstitial(st, cfg, t, ctx()).reason).toBe('hourly');
  });
  it('sparse by design: at most 4 an hour, 8 minutes apart, 5 quiet minutes after a rewarded ad', () => {
    expect(cfg.maxInterstitialsPerHour).toBeLessThanOrEqual(4);
    expect(cfg.interstitialCooldownSec).toBeGreaterThanOrEqual(480);
    expect(cfg.afterRewardedQuietSec).toBeGreaterThanOrEqual(300);
    expect(cfg.firstPlayGraceSec).toBeGreaterThanOrEqual(300);
  });
  it('per-placement rewarded cooldowns', () => {
    const st = newPolicyState();
    expect(canOfferRewarded(st, cfg, 0, 'free_upgrade')).toBe(true);
    onRewardedShown(st, 10, 'free_upgrade');
    expect(canOfferRewarded(st, cfg, 100, 'free_upgrade')).toBe(false);
    expect(canOfferRewarded(st, cfg, 131, 'free_upgrade')).toBe(true);
    expect(canOfferRewarded(st, cfg, 11, 'income_x2')).toBe(true);
  });
});
