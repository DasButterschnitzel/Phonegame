import type { AdService, BreakKind, Placement } from './AdService.ts';
import { DEFAULT_POLICY, canOfferRewarded, canShowInterstitial, onInterstitialShown, onRewardedShown, onUnload, type AdPolicyState, type BreakCtx } from './AdPolicy.ts';

export interface AdHooks {
  /** Pause the game + mute audio. */
  onAdStart: () => void;
  onAdEnd: () => void;
  now: () => number;
  wallNow: () => number;
}

/** Give up on a provider that never answers — counted in *visible* time, so a click-through to the store doesn't forfeit the reward. */
const TIMEOUT_MS = 90_000;

function visibleTimeout(ms: number): Promise<false> {
  return new Promise((resolve) => {
    let left = ms;
    const id = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') left -= 1000;
      if (left <= 0) {
        clearInterval(id);
        resolve(false);
      }
    }, 1000);
  });
}

/** Facade over the active ad provider: policy, pause/mute, timeouts, never throws. */
export class AdManager {
  readonly provider: AdService;
  readonly policy: AdPolicyState;
  private hooks: AdHooks;
  private busy = false;
  inAd = false;
  /** Why the last rewarded ad gave nothing: the player closed it early, or it never showed. */
  lastFailure: 'skipped' | 'failed' | null = null;
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
    return this.provider.isRewardedReady() && canOfferRewarded(this.policy, DEFAULT_POLICY, this.hooks.now(), p);
  }

  get rewardedAvailable(): boolean {
    return this.provider.isRewardedReady();
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
    let earned = false;
    try {
      let failed = false;
      earned = await Promise.race([
        this.provider.showRewarded(p).catch(() => {
          failed = true;
          return false;
        }),
        visibleTimeout(TIMEOUT_MS).then(() => {
          failed = true;
          return false as const;
        }),
      ]);
      if (!earned) this.lastFailure = failed ? 'failed' : 'skipped';
    } finally {
      onRewardedShown(this.policy, this.hooks.now(), p);
      this.inAd = false;
      this.busy = false;
      this.hooks.onAdEnd();
    }
    return earned;
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

  /** Shows an interstitial if the policy allows it at this break. */
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
    try {
      await Promise.race([this.provider.showInterstitial(ctx.kind as BreakKind).catch(() => undefined), new Promise((r) => setTimeout(r, TIMEOUT_MS))]);
    } finally {
      onInterstitialShown(this.policy, this.hooks.now(), this.hooks.wallNow());
      this.inAd = false;
      this.busy = false;
      this.hooks.onAdEnd();
    }
    return true;
  }
}
