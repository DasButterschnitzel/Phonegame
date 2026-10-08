import type { BreakKind, Placement } from './AdService.ts';

/** Pure ad frequency rules (no DOM, unit-tested). Times are seconds. */
export interface AdPolicyCfg {
  firstPlayGraceSec: number;
  sessionWarmupSec: number;
  interstitialCooldownSec: number;
  afterRewardedQuietSec: number;
  maxInterstitialsPerHour: number;
  minUnloadsBetween: number;
  throttleQuietSec: number;
  /** Never right after a big moment (route growth, merge, new field, FINAL HARVEST, farm finished). */
  bigMomentQuietSec: number;
  rewardedCooldownSec: Partial<Record<Placement, number>>;
}

/**
 * Interstitials are rare and only at natural breaks. Simulated with the balance bots (every profile, five farms):
 * the old rules (2 min apart, 10/hour) let every kind of player hit 10 an hour, mostly after lucky-bug dialogs; these
 * allow at most 4 an hour, 8 minutes apart, and none for 5 minutes after a rewarded ad.
 */
export const DEFAULT_POLICY: AdPolicyCfg = {
  firstPlayGraceSec: 300,
  sessionWarmupSec: 120,
  interstitialCooldownSec: 480,
  afterRewardedQuietSec: 300,
  maxInterstitialsPerHour: 4,
  minUnloadsBetween: 3,
  throttleQuietSec: 3,
  bigMomentQuietSec: 10,
  rewardedCooldownSec: { free_upgrade: 120, free_tornado: 180 },
};

export interface AdPolicyState {
  /** Total gameplay seconds since install (persisted). */
  playtimeSec: number;
  /** Wall-clock seconds (persisted) of recent interstitials for the hourly cap. */
  interstitialWall: number[];
  /** Session-relative monotonic times. */
  sessionStart: number;
  lastInterstitial: number;
  lastRewarded: number;
  unloadsSinceInterstitial: number;
  lastByPlacement: Partial<Record<Placement, number>>;
}

export const newPolicyState = (playtimeSec = 0, interstitialWall: number[] = []): AdPolicyState => ({
  playtimeSec,
  interstitialWall,
  sessionStart: 0,
  lastInterstitial: -Infinity,
  lastRewarded: -Infinity,
  unloadsSinceInterstitial: 0,
  lastByPlacement: {},
});

export interface BreakCtx {
  kind: BreakKind;
  /** Seconds since the player last held the throttle. */
  sinceThrottle: number;
  tutorialActive: boolean;
  modalOpen: boolean;
  wallNow: number;
  /** App backgrounded / portal-paused: never show an ad the player can't see coming. */
  paused?: boolean;
  /** Seconds since the last big moment (route growth, merge, new field, FINAL HARVEST, farm finished). */
  sinceBigMoment?: number;
}

export function canShowInterstitial(st: AdPolicyState, cfg: AdPolicyCfg, now: number, ctx: BreakCtx): { ok: boolean; reason?: string } {
  if (ctx.paused) return { ok: false, reason: 'paused' };
  if (st.playtimeSec < cfg.firstPlayGraceSec) return { ok: false, reason: 'grace' };
  if (now - st.sessionStart < cfg.sessionWarmupSec) return { ok: false, reason: 'warmup' };
  if (now - st.lastInterstitial < cfg.interstitialCooldownSec) return { ok: false, reason: 'cooldown' };
  if (now - st.lastRewarded < cfg.afterRewardedQuietSec) return { ok: false, reason: 'afterRewarded' };
  if (ctx.tutorialActive) return { ok: false, reason: 'tutorial' };
  if ((ctx.sinceBigMoment ?? Infinity) < cfg.bigMomentQuietSec) return { ok: false, reason: 'bigMoment' };
  if (ctx.kind === 'barn_unload') {
    if (ctx.modalOpen) return { ok: false, reason: 'modal' };
    if (ctx.sinceThrottle < cfg.throttleQuietSec) return { ok: false, reason: 'throttle' };
    if (st.unloadsSinceInterstitial < cfg.minUnloadsBetween) return { ok: false, reason: 'unloads' };
  }
  const hourAgo = ctx.wallNow - 3600;
  if (st.interstitialWall.filter((t) => t > hourAgo).length >= cfg.maxInterstitialsPerHour) return { ok: false, reason: 'hourly' };
  return { ok: true };
}

export function canOfferRewarded(st: AdPolicyState, cfg: AdPolicyCfg, now: number, p: Placement): boolean {
  const cd = cfg.rewardedCooldownSec[p] ?? 0;
  const last = st.lastByPlacement[p] ?? -Infinity;
  return now - last >= cd;
}

export function onInterstitialShown(st: AdPolicyState, now: number, wallNow: number): void {
  st.lastInterstitial = now;
  st.unloadsSinceInterstitial = 0;
  st.interstitialWall = [...st.interstitialWall.filter((t) => t > wallNow - 3600), wallNow];
}

export function onRewardedShown(st: AdPolicyState, now: number, p: Placement): void {
  st.lastRewarded = now;
  st.lastByPlacement[p] = now;
}

export function onUnload(st: AdPolicyState): void {
  st.unloadsSinceInterstitial++;
}
