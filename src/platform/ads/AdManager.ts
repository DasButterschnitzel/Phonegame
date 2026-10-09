import type { AdService, BreakKind, Placement, RewardOutcome } from './AdService.ts';
import { DEFAULT_POLICY, canOfferRewarded, canShowInterstitial, onInterstitialShown, onRewardedShown, onUnload, type AdPolicyState, type BreakCtx } from './AdPolicy.ts';

export interface AdHooks {
  /** Pause the game + mute audio. */
  onAdStart: () => void;
  onAdEnd: () => void;
  now: () => number;
  wallNow: () => number;
}

/**
 * Give up on a provider that never answers. Counted in *visible* time, so a click-through to the store doesn't forfeit
 * the reward, and much longer while the provider says its ad is on screen (an end card can stay up a while).
 */
const GIVE_UP_MS = 90_000;
const ON_SCREEN_MS = 600_000;

function giveUp(onScreen: () => boolean): { done: Promise<'timeout'>; cancel: () => void } {
  let id: ReturnType<typeof setInterval> | undefined;
  const done = new Promise<'timeout'>((resolve) => {
    let seen = 0;
    id = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') seen += 1000;
      if (seen >= (onScreen() ? ON_SCREEN_MS : GIVE_UP_MS)) {
        clearInterval(id);
        resolve('timeout');
      }
    }, 1000);
  });
  return { done, cancel: () => clearInterval(id) };
}

/** Facade over the active ad provider: policy, pause/mute, timeouts, never throws. */
export class AdManager {
  readonly provider: AdService;
  readonly policy: AdPolicyState;
  private hooks: AdHooks;
  private busy = false;
  inAd = false;
  /** Why the last rewarded ad gave nothing: the player closed it early, or it never started. */
  lastFailure: Exclude<RewardOutcome, 'earned'> | null = null;
  /** Set by the app while backgrounded / portal-paused. */
  isPaused: () => boolean = () => false;
  /** Last interstitial policy decision (debug/tests). */
  lastCheck: { ok: boolean; reason?: string; kind?: string } | null = null;

  constructor(provider: AdService, policy: AdPolicyState, hooks: AdHooks) {
    this.provider = provider;
    this.policy = policy;
    this.hooks = hooks;
    this.policy.sessionStart = hooks.now();
  }

  async init(): Promise<void> {
    try {
      await this.provider.init();
    } catch (e) {
      console.warn('ads init failed', e);
    }
  }

  /** Whether a rewarded offer for this placement should be visible right now. */
  canOffer(p: Placement): boolean {
    return this.provider.isRewardedReady(p) && canOfferRewarded(this.policy, DEFAULT_POLICY, this.hooks.now(), p);
  }

  /** A rewarded ad for this placement is loaded (no policy check: for offers that have no cooldown). */
  ready(p: Placement): boolean {
    return this.provider.isRewardedReady(p);
  }

  async rewarded(p: Placement): Promise<boolean> {
    if (this.busy) {
      this.lastFailure = 'failed';
      return false;
    }
    this.busy = true;
    this.inAd = true;
    this.lastFailure = null;
    this.hooks.onAdStart();
    const timer = giveUp(() => this.provider.adOnScreen?.() ?? false);
    let outcome: RewardOutcome = 'failed';
    try {
      const r = await Promise.race([this.provider.showRewarded(p).catch(() => 'failed' as const), timer.done]);
      if (r === 'timeout') this.provider.cancel?.();
      else outcome = r;
    } finally {
      timer.cancel();
      // Only an ad that really started costs the placement's cooldown and the quiet time before an interstitial.
      if (outcome !== 'failed') onRewardedShown(this.policy, this.hooks.now(), p);
      this.lastFailure = outcome === 'earned' ? null : outcome;
      this.inAd = false;
      this.busy = false;
      this.hooks.onAdEnd();
    }
    return outcome === 'earned';
  }

  /** The app is back in the foreground. */
  foreground(): void {
    this.provider.foreground?.();
  }

  /** A long time away counts as a new session (warm-up applies again before any interstitial). */
  newSession(): void {
    this.policy.sessionStart = this.hooks.now();
  }

  noteUnload(): void {
    onUnload(this.policy);
  }

  addPlaytime(sec: number): void {
    this.policy.playtimeSec += sec;
  }

  /** Shows an interstitial if the policy allows it at this break; true when one was actually shown. */
  async maybeInterstitial(ctx: Omit<BreakCtx, 'wallNow'>): Promise<boolean> {
    if (this.busy) {
      this.lastCheck = { ok: false, reason: 'busy', kind: ctx.kind };
      return false;
    }
    const now = this.hooks.now();
    const chk = canShowInterstitial(this.policy, DEFAULT_POLICY, now, { ...ctx, paused: ctx.paused || this.isPaused(), wallNow: this.hooks.wallNow() });
    this.lastCheck = { ...chk, kind: ctx.kind };
    if (!chk.ok) return false;
    this.busy = true;
    this.inAd = true;
    this.hooks.onAdStart();
    const timer = giveUp(() => this.provider.adOnScreen?.() ?? false);
    let shown = false;
    try {
      const r = await Promise.race([this.provider.showInterstitial(ctx.kind as BreakKind).catch(() => false), timer.done]);
      if (r === 'timeout') this.provider.cancel?.();
      else shown = r;
    } finally {
      timer.cancel();
      // An interstitial that never showed costs nothing: no cooldown, no slot in the hourly budget.
      if (shown) onInterstitialShown(this.policy, this.hooks.now(), this.hooks.wallNow());
      this.inAd = false;
      this.busy = false;
      this.hooks.onAdEnd();
    }
    return shown;
  }
}
