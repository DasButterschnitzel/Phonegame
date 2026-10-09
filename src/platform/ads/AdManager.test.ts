import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdManager } from './AdManager.ts';
import { DEFAULT_POLICY, newPolicyState, onUnload } from './AdPolicy.ts';
import type { AdService, RewardOutcome } from './AdService.ts';

/** A provider whose answers the test controls. */
function fakeProvider(o: { rewarded?: () => Promise<RewardOutcome>; interstitial?: () => Promise<boolean>; onScreen?: () => boolean } = {}) {
  const p = {
    name: 'fake',
    privacyOptionsAvailable: false,
    cancelled: 0,
    init: async () => {},
    isRewardedReady: () => true,
    showRewarded: o.rewarded ?? (async () => 'earned' as const),
    showInterstitial: o.interstitial ?? (async () => true),
    adOnScreen: o.onScreen,
    cancel: () => {
      p.cancelled++;
    },
  };
  return p satisfies AdService;
}

let now = 0;
function manager(provider: AdService) {
  const hooks = { started: 0, ended: 0 };
  const m = new AdManager(provider, newPolicyState(400), {
    onAdStart: () => hooks.started++,
    onAdEnd: () => hooks.ended++,
    now: () => now,
    wallNow: () => 1e6 + now,
  });
  return { m, hooks };
}
const breakCtx = { kind: 'barn_unload' as const, sinceThrottle: 10, tutorialActive: false, modalOpen: false };

describe('AdManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    now = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('an ad that never started costs nothing: no cooldown, no quiet time', async () => {
    const { m, hooks } = manager(fakeProvider({ rewarded: async () => 'failed' }));
    now = 50;
    expect(await m.rewarded('free_upgrade')).toBe(false);
    expect(m.lastFailure).toBe('failed');
    expect(m.policy.lastByPlacement.free_upgrade).toBeUndefined();
    expect(m.policy.lastRewarded).toBe(-Infinity);
    expect(m.canOffer('free_upgrade')).toBe(true);
    expect(hooks).toEqual({ started: 1, ended: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a provider that throws counts as never started', async () => {
    const { m } = manager(fakeProvider({ rewarded: () => Promise.reject(new Error('boom')) }));
    expect(await m.rewarded('daily_x2')).toBe(false);
    expect(m.lastFailure).toBe('failed');
    expect(m.policy.lastRewarded).toBe(-Infinity);
  });

  it('an ad closed early started: it costs its cooldown but grants nothing', async () => {
    const { m } = manager(fakeProvider({ rewarded: async () => 'skipped' }));
    now = 50;
    expect(await m.rewarded('free_upgrade')).toBe(false);
    expect(m.lastFailure).toBe('skipped');
    expect(m.policy.lastByPlacement.free_upgrade).toBe(50);
    expect(m.canOffer('free_upgrade')).toBe(false);
    now = 50 + (DEFAULT_POLICY.rewardedCooldownSec.free_upgrade ?? 0);
    expect(m.canOffer('free_upgrade')).toBe(true);
  });

  it('an earned reward resolves true once and records the ad', async () => {
    const { m, hooks } = manager(fakeProvider());
    now = 70;
    expect(await m.rewarded('gift_x3')).toBe(true);
    expect(m.lastFailure).toBeNull();
    expect(m.policy.lastRewarded).toBe(70);
    expect(hooks).toEqual({ started: 1, ended: 1 });
  });

  it('a second request while one runs is refused without touching the policy', async () => {
    let finish: (o: RewardOutcome) => void = () => {};
    const { m } = manager(fakeProvider({ rewarded: () => new Promise((r) => (finish = r)) }));
    const first = m.rewarded('income_x2');
    expect(await m.rewarded('autopilot')).toBe(false);
    expect(m.policy.lastByPlacement.autopilot).toBeUndefined();
    finish('earned');
    expect(await first).toBe(true);
  });

  it('gives up on a silent provider after 90 s of visible time, cancels it, and records nothing', async () => {
    const provider = fakeProvider({ rewarded: () => new Promise(() => {}) });
    const { m, hooks } = manager(provider);
    const r = m.rewarded('income_x2');
    await vi.advanceTimersByTimeAsync(89_000);
    expect(hooks.ended).toBe(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await r).toBe(false);
    expect(provider.cancelled).toBe(1);
    expect(m.lastFailure).toBe('failed');
    expect(m.policy.lastRewarded).toBe(-Infinity);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits much longer while the ad is on screen (a long end card is not a timeout)', async () => {
    let finish: (o: RewardOutcome) => void = () => {};
    const provider = fakeProvider({ rewarded: () => new Promise((r) => (finish = r)), onScreen: () => true });
    const { m } = manager(provider);
    const r = m.rewarded('offline_x3');
    await vi.advanceTimersByTimeAsync(200_000);
    finish('earned');
    expect(await r).toBe(true);
    expect(provider.cancelled).toBe(0);
  });

  it('an interstitial that never showed uses no cooldown and no hourly slot', async () => {
    const { m } = manager(fakeProvider({ interstitial: async () => false }));
    for (let i = 0; i < DEFAULT_POLICY.minUnloadsBetween; i++) onUnload(m.policy);
    now = 1000;
    expect(await m.maybeInterstitial(breakCtx)).toBe(false);
    expect(m.lastCheck?.ok).toBe(true);
    expect(m.policy.interstitialWall).toEqual([]);
    expect(m.policy.lastInterstitial).toBe(-Infinity);
    expect(m.policy.unloadsSinceInterstitial).toBe(DEFAULT_POLICY.minUnloadsBetween);
  });

  it('a shown interstitial is recorded', async () => {
    const { m } = manager(fakeProvider());
    for (let i = 0; i < DEFAULT_POLICY.minUnloadsBetween; i++) onUnload(m.policy);
    now = 1000;
    expect(await m.maybeInterstitial(breakCtx)).toBe(true);
    expect(m.policy.interstitialWall).toEqual([1e6 + 1000]);
    expect(m.policy.lastInterstitial).toBe(1000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
