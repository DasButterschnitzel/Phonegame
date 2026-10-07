import { describe, it, expect } from 'vitest';
import { DEFAULT_POLICY as cfg, canOfferRewarded, canShowInterstitial, newPolicyState, onInterstitialShown, onRewardedShown, onUnload, type BreakCtx } from './AdPolicy.ts';

const ctx = (o: Partial<BreakCtx> = {}): BreakCtx => ({ kind: 'barn_unload', sinceThrottle: 10, tutorialActive: false, modalOpen: false, wallNow: 1e6, ...o });

function ready() {
  const st = newPolicyState(400);
  onUnload(st);
  onUnload(st);
  return st;
}

describe('AdPolicy', () => {
  it('respects first-play grace and session warmup', () => {
    const st = newPolicyState(100);
    onUnload(st);
    onUnload(st);
    expect(canShowInterstitial(st, cfg, 500, ctx()).reason).toBe('grace');
    st.playtimeSec = 400;
    expect(canShowInterstitial(st, cfg, 30, ctx()).reason).toBe('warmup');
    expect(canShowInterstitial(st, cfg, 61, ctx()).ok).toBe(true);
  });
  it('cooldown, unload gating and throttle quiet', () => {
    const st = ready();
    onInterstitialShown(st, 100, 1e6);
    expect(canShowInterstitial(st, cfg, 150, ctx()).reason).toBe('cooldown');
    expect(canShowInterstitial(st, cfg, 230, ctx()).reason).toBe('unloads');
    onUnload(st);
    onUnload(st);
    expect(canShowInterstitial(st, cfg, 230, ctx({ sinceThrottle: 0.5 })).reason).toBe('throttle');
    expect(canShowInterstitial(st, cfg, 230, ctx()).ok).toBe(true);
    // Dialog breaks ignore unload / throttle gating.
    expect(canShowInterstitial(newPolicyState(400), cfg, 100, ctx({ kind: 'dialog_closed', sinceThrottle: 0 })).ok).toBe(true);
  });
  it('quiet after rewarded, tutorial and hourly cap', () => {
    const st = ready();
    onRewardedShown(st, 100, 'income_x2');
    expect(canShowInterstitial(st, cfg, 150, ctx()).reason).toBe('afterRewarded');
    expect(canShowInterstitial(st, cfg, 200, ctx({ tutorialActive: true })).reason).toBe('tutorial');
    st.interstitialWall = Array.from({ length: 10 }, (_, i) => 1e6 - i * 60);
    expect(canShowInterstitial(st, cfg, 400, ctx()).reason).toBe('hourly');
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
