import type { AdService, BreakKind, Placement, RewardOutcome } from '../AdService.ts';
import type { AdMobBridge, FullScreenEvent, FullScreenKind } from './bridge.ts';
import { AUDIENCE, modeLine, resolveAdMobConfig, rewardedUnit, type AdMobConfig } from './config.ts';

/** Seconds between load retries after a failure (no fill, offline). */
const BACKOFF_S = [2, 4, 8, 16, 32, 60];
/** A full-screen ad that has not appeared after this much visible time never will. */
const START_MS = 15_000;
/** Rewarded and Dismissed can arrive in either order: after a dismiss without reward, wait this long for one. */
const REWARD_GRACE_MS = 1_000;
/** A consent update that failed (offline) is retried on resume at most this often. */
const CONSENT_RETRY_MS = 60_000;
/** A consent update that hangs (captive portal, dead network) counts as failed after this long. */
const UPDATE_TIMEOUT_MS = 15_000;
/** SDK start: the plugin answers once MobileAds.initialize ran; if it never does, loads go ahead after this long. */
const INIT_TIMEOUT_MS = 10_000;

type Timer = ReturnType<typeof setTimeout>;

/** One preloaded ad per unit. */
interface Slot {
  kind: FullScreenKind;
  unit: string;
  state: 'idle' | 'loading' | 'ready';
  tries: number;
  retry: Timer | null;
}

/** One full-screen ad from show() to its outcome. Events only ever reach the current session. */
interface Session {
  kind: FullScreenKind;
  shown: boolean;
  dismissed: boolean;
  earned: boolean;
  done: boolean;
  timer: Timer | null;
  finish: (o: RewardOutcome) => void;
}

export interface ControllerDeps {
  /** Page visibility: a full-screen ad usually hides the WebView, and time behind it does not count. */
  visible: () => boolean;
  /** Monotonic milliseconds. */
  now: () => number;
  log: (msg: string) => void;
}

/** Rejects when `p` has not settled after `ms`. */
function within<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

/** Error text for logs, with any ad ID masked (logs never carry publisher configuration). */
const why = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/ca-app-pub-[\d~/]+/g, 'ca-app-pub-…');

/**
 * Google AdMob with the UMP consent flow, behind an injectable bridge.
 *
 * Consent: every launch asks UMP for a fresh decision and shows the form when it is required; whether the update
 * worked or not (offline, UMP error, form failure), only `canRequestAds()` decides — after a failed update that is
 * the decision UMP stored last time, so a first launch offline shows no ads and a returning player keeps theirs.
 * Nothing initializes the SDK or requests an ad before it allows it. The privacy options form re-reads the decision
 * at once: withdrawn consent stops ads, new consent starts them, without a restart.
 *
 * Rewards: each show is a session that ends exactly once. Only the network's reward event can make it 'earned';
 * stray, repeated or late events (after a timeout, a failure, a WebView reload) change nothing.
 */
export class AdMobController implements AdService {
  readonly name = 'admob';
  privacyOptionsAvailable = false;
  private bridge: AdMobBridge;
  private deps: ControllerDeps;
  private cfg: AdMobConfig = resolveAdMobConfig('none', null);
  private canRequest = false;
  private sdkStarted = false;
  private consentFailed = false;
  private lastConsentTry = -Infinity;
  /** Consent work (update, forms, SDK start) runs one step at a time. */
  private chain: Promise<void> = Promise.resolve();
  /** Bumped when ads must stop: loads and retries started before are ignored. */
  private gen = 0;
  private slots: Slot[] = [];
  private session: Session | null = null;

  constructor(bridge: AdMobBridge, deps: ControllerDeps) {
    this.bridge = bridge;
    this.deps = deps;
  }

  async init(): Promise<void> {
    const native = this.bridge.platform === 'android' ? await this.bridge.config().catch(() => null) : null;
    this.cfg = resolveAdMobConfig(this.bridge.platform, native);
    this.deps.log(modeLine(this.cfg));
    if (this.cfg.mode === 'disabled') return;
    const units = new Set([this.cfg.rewarded, ...Object.values(this.cfg.groupUnits)]);
    this.slots = [...[...units].map((unit) => slot('rewarded', unit)), slot('interstitial', this.cfg.interstitial)];
    try {
      await this.bridge.listen('rewarded', (e) => this.onEvent('rewarded', e));
      await this.bridge.listen('interstitial', (e) => this.onEvent('interstitial', e));
    } catch (e) {
      // Without events no outcome could be trusted.
      this.deps.log(`ads off: no ad events (${why(e)})`);
      return;
    }
    await this.updateConsent();
  }

  /** Only after a failed update (likely offline): a dismissed form waits for the next launch. */
  foreground(): void {
    if (this.cfg.mode === 'disabled' || this.canRequest || !this.consentFailed) return;
    if (this.deps.now() - this.lastConsentTry < CONSENT_RETRY_MS) return;
    void this.updateConsent();
  }

  async showPrivacyOptions(): Promise<void> {
    await this.serial(async () => {
      try {
        await this.bridge.showPrivacyOptionsForm();
      } catch (e) {
        this.deps.log(`privacy options: ${why(e)}`);
      }
      // Ads loaded under the old choice are dropped; the new decision applies at once.
      this.stopLoading();
      await this.applyConsent();
    });
  }

  isRewardedReady(p?: Placement): boolean {
    if (!this.canRequest || this.session) return false;
    const unit = p ? rewardedUnit(this.cfg, p) : null;
    return this.slots.some((s) => s.kind === 'rewarded' && s.state === 'ready' && (unit === null || s.unit === unit));
  }

  showRewarded(p: Placement): Promise<RewardOutcome> {
    const unit = rewardedUnit(this.cfg, p);
    return this.show(this.slots.find((s) => s.kind === 'rewarded' && s.unit === unit));
  }

  async showInterstitial(_k: BreakKind): Promise<boolean> {
    return (await this.show(this.slots.find((s) => s.kind === 'interstitial'))) !== 'failed';
  }

  adOnScreen(): boolean {
    return this.session !== null && this.session.shown;
  }

  cancel(): void {
    this.session?.finish('failed');
  }

  // ——— consent ———

  private serial(step: () => Promise<void>): Promise<void> {
    const run = this.chain.then(step).catch((e: unknown) => this.deps.log(`consent: ${why(e)}`));
    this.chain = run;
    return run;
  }

  private updateConsent(): Promise<void> {
    return this.serial(async () => {
      this.lastConsentTry = this.deps.now();
      let failed = false;
      try {
        const geo = this.cfg.umpDebugGeography;
        const info = await within(this.bridge.requestConsentUpdate(geo ? { geography: geo, testDevices: this.cfg.testDevices } : null), UPDATE_TIMEOUT_MS, 'consent update');
        if (info.status === 'REQUIRED' && info.formAvailable) {
          try {
            await this.bridge.showConsentForm();
          } catch (e) {
            failed = true;
            this.deps.log(`consent form unavailable: ${why(e)}`);
          }
        }
      } catch (e) {
        failed = true;
        this.deps.log(`consent update failed, using the stored decision: ${why(e)}`);
      }
      this.consentFailed = failed;
      await this.applyConsent();
    });
  }

  /** The single gate: UMP's canRequestAds(), never an assumption. */
  private async applyConsent(): Promise<void> {
    const st = await this.bridge.consent().catch(() => null);
    this.privacyOptionsAvailable = st?.privacyOptionsRequired === true;
    if (st?.canRequestAds !== true) {
      if (this.canRequest) this.deps.log('ads stopped: consent no longer allows ad requests');
      this.canRequest = false;
      this.stopLoading();
      return;
    }
    if (!this.sdkStarted) {
      await this.bridge.requestTracking().catch(() => undefined);
      try {
        await within(this.bridge.initialize({ testDevices: this.cfg.testDevices, ...AUDIENCE }), INIT_TIMEOUT_MS, 'initialize');
      } catch (e) {
        // The plugin can reject after MobileAds.initialize already ran (its banner-view check); loads tell the truth.
        this.deps.log(`initialize: ${why(e)}`);
      }
      this.sdkStarted = true;
    }
    this.canRequest = true;
    for (const s of this.slots) this.load(s);
  }

  // ——— loading ———

  private stopLoading(): void {
    this.gen++;
    for (const s of this.slots) {
      if (s.retry) clearTimeout(s.retry);
      s.retry = null;
      s.state = 'idle';
      s.tries = 0;
    }
  }

  private load(s: Slot): void {
    if (!this.canRequest || s.state !== 'idle' || s.retry) return;
    s.state = 'loading';
    const gen = this.gen;
    this.bridge.prepare(s.kind, s.unit).then(
      () => {
        if (gen !== this.gen) return;
        s.state = 'ready';
        s.tries = 0;
      },
      () => {
        if (gen !== this.gen) return;
        s.state = 'idle';
        const delay = BACKOFF_S[Math.min(s.tries++, BACKOFF_S.length - 1)] * 1000;
        s.retry = setTimeout(() => {
          s.retry = null;
          if (gen === this.gen) this.load(s);
        }, delay);
      },
    );
  }

  // ——— showing ———

  private show(s: Slot | undefined): Promise<RewardOutcome> {
    if (!s || !this.canRequest || this.session || s.state !== 'ready') return Promise.resolve('failed');
    // The prepared ad is used up, whatever happens next.
    s.state = 'idle';
    return new Promise<RewardOutcome>((resolve) => {
      const session: Session = {
        kind: s.kind,
        shown: false,
        dismissed: false,
        earned: false,
        done: false,
        timer: null,
        finish: (o) => {
          if (session.done) return;
          session.done = true;
          if (session.timer) clearTimeout(session.timer);
          if (this.session === session) this.session = null;
          resolve(o);
          this.load(s);
        },
      };
      this.session = session;
      // An ad that has not appeared after START_MS of visible time never will.
      let left = START_MS;
      const tick = () => {
        if (session.shown || session.done) return;
        if (this.deps.visible()) left -= 500;
        if (left <= 0) session.finish('failed');
        else session.timer = setTimeout(tick, 500);
      };
      session.timer = setTimeout(tick, 500);
      this.bridge.show(s.kind, s.unit).catch((e: unknown) => {
        // Rejected before it appeared: it never will. Once on screen, the dismiss event decides.
        if (session.shown) return;
        this.deps.log(`show failed: ${why(e)}`);
        session.finish('failed');
      });
    });
  }

  private onEvent(kind: FullScreenKind, e: FullScreenEvent): void {
    const s = this.session;
    // No ad of this kind on screen: a stray dismiss, a reward after the session ended, an ad from before a reload.
    if (!s || s.done || s.kind !== kind) return;
    switch (e) {
      case 'showed':
        s.shown = true;
        if (s.timer) clearTimeout(s.timer);
        s.timer = null;
        return;
      case 'rewarded':
        // The only way to 'earned' — and only once, since the session ends once.
        s.earned = true;
        if (s.dismissed) s.finish('earned');
        return;
      case 'failedToShow':
        s.finish(s.earned ? 'earned' : s.shown ? 'skipped' : 'failed');
        return;
      case 'dismissed':
        s.shown = true;
        s.dismissed = true;
        if (s.earned || kind === 'interstitial') return s.finish(s.earned ? 'earned' : 'skipped');
        // A reward can still arrive just after the dismiss.
        if (s.timer) clearTimeout(s.timer);
        s.timer = setTimeout(() => s.finish(s.earned ? 'earned' : 'skipped'), REWARD_GRACE_MS);
        return;
    }
  }
}

const slot = (kind: FullScreenKind, unit: string): Slot => ({ kind, unit, state: 'idle', tries: 0, retry: null });
