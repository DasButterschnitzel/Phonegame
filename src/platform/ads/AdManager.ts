import type { AdService, BreakKind, Placement } from './AdService.ts';
import { DEFAULT_POLICY, canOfferRewarded, canShowInterstitial, onInterstitialShown, onRewardedShown, onUnload, type AdPolicyState, type BreakCtx } from './AdPolicy.ts';

export interface AdHooks {
  /** Pause the game + mute audio. */
  onAdStart: () => void;
  onAdEnd: () => void;
  now: () => number;
  wallNow: () => number;
}

const TIMEOUT_MS = 90_000;

/** Facade over the active ad provider: policy, pause/mute, timeouts, never throws. */
export class AdManager {
  readonly provider: AdService;
  readonly policy: AdPolicyState;
  private hooks: AdHooks;
  private busy = false;
  inAd = false;
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
    if (this.busy) return false;
    this.busy = true;
    this.inAd = true;
    this.hooks.onAdStart();
    let earned = false;
    try {
      earned = await Promise.race([
        this.provider.showRewarded(p).catch(() => false),
        new Promise<boolean>((r) => setTimeout(() => r(false), TIMEOUT_MS)),
      ]);
    } finally {
      onRewardedShown(this.policy, this.hooks.now(), p);
      this.inAd = false;
      this.busy = false;
      this.hooks.onAdEnd();
    }
    return earned;
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
    const chk = canShowInterstitial(this.policy, DEFAULT_POLICY, now, { ...ctx, wallNow: this.hooks.wallNow() });
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
