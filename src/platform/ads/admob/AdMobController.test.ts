import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RewardOutcome } from '../AdService.ts';
import { AdMobController } from './AdMobController.ts';
import type { AdMobBridge, FullScreenEvent, FullScreenKind, InitOptions } from './bridge.ts';
import type { NativeAdConfig } from './config.ts';

const DEMO_R = 'ca-app-pub-3940256099942544/5224354917';
const DEMO_I = 'ca-app-pub-3940256099942544/1033173712';
const PUB = '5550000011112222';
const R = `ca-app-pub-${PUB}/2222222222`;
const R_BONUS = `ca-app-pub-${PUB}/4444444444`;
const I = `ca-app-pub-${PUB}/3333333333`;

const testBuild = (o: Partial<NativeAdConfig> = {}): NativeAdConfig => ({
  debuggable: true,
  mode: 'test',
  appId: 'ca-app-pub-3940256099942544~3347511713',
  rewarded: DEMO_R,
  rewardedBoost: '',
  rewardedUpgrade: '',
  rewardedBonus: '',
  interstitial: DEMO_I,
  testDevices: '',
  umpDebugGeography: '',
  ...o,
});
const productionBuild = (o: Partial<NativeAdConfig> = {}) =>
  testBuild({ debuggable: false, mode: 'production', appId: `ca-app-pub-${PUB}~1111111111`, rewarded: R, interstitial: I, ...o });

interface Scenario {
  native?: NativeAdConfig;
  /** What UMP stored from earlier launches. */
  stored?: boolean;
  privacyRequired?: boolean;
  update?: 'ok' | 'fail';
  status?: 'REQUIRED' | 'NOT_REQUIRED' | 'OBTAINED';
  formAvailable?: boolean;
  /** The player's answer to the consent form (any answer lets UMP allow ads; 'dismiss' leaves it undecided). */
  form?: 'answer' | 'dismiss' | 'fail';
  prepare?: 'ok' | 'fail';
}

/** A scriptable stand-in for the AdMob plugin + AdConfig plugin, recording every call in order. */
function fake(sc: Scenario = {}) {
  const calls: string[] = [];
  const on: Partial<Record<FullScreenKind, (e: FullScreenEvent) => void>> = {};
  const umps = { canRequestAds: sc.stored ?? false, privacyOptionsRequired: sc.privacyRequired ?? false };
  const s = { update: sc.update ?? 'ok', status: sc.status ?? 'NOT_REQUIRED', formAvailable: sc.formAvailable ?? true, form: sc.form ?? 'answer', prepare: sc.prepare ?? 'ok' };
  let showResult: () => Promise<void> = () => new Promise(() => {});
  let privacyForm: () => void = () => {};
  let init: InitOptions | null = null;
  const bridge: AdMobBridge = {
    platform: 'android',
    config: async () => {
      calls.push('config');
      return sc.native ?? testBuild();
    },
    consent: async () => {
      calls.push('consent');
      return { ...umps };
    },
    requestConsentUpdate: async () => {
      calls.push('update');
      if (s.update === 'fail') throw new Error('offline');
      if (s.status === 'NOT_REQUIRED') umps.canRequestAds = true;
      return { status: s.status, formAvailable: s.formAvailable };
    },
    showConsentForm: async () => {
      calls.push('form');
      if (s.form === 'fail') throw new Error('form failed to load');
      if (s.form === 'answer') umps.canRequestAds = true;
    },
    showPrivacyOptionsForm: async () => {
      calls.push('privacyForm');
      privacyForm();
    },
    initialize: async (o) => {
      calls.push('initialize');
      init = o;
    },
    prepare: async (kind, id) => {
      calls.push(`prepare ${kind} ${id}`);
      if (s.prepare === 'fail') throw new Error(`No fill for ${id}`);
    },
    show: (kind, id) => {
      calls.push(`show ${kind} ${id}`);
      return showResult();
    },
    listen: async (kind, cb) => {
      on[kind] = cb;
    },
    requestTracking: async () => {},
  };
  return {
    bridge,
    calls,
    umps,
    s,
    init: () => init,
    fire: (kind: FullScreenKind, ...events: FullScreenEvent[]) => events.forEach((e) => on[kind]?.(e)),
    showResolves: (f: () => Promise<void>) => (showResult = f),
    onPrivacyForm: (f: () => void) => (privacyForm = f),
  };
}

let visible = true;
let now = 0;
const logs: string[] = [];
function controller(f: ReturnType<typeof fake>) {
  return new AdMobController(f.bridge, { visible: () => visible, now: () => now, log: (m) => logs.push(m) });
}
/** Let pending promise chains run (no time passes). */
const settle = () => vi.advanceTimersByTimeAsync(0);
const requests = (calls: string[]) => calls.filter((c) => c === 'initialize' || c.startsWith('prepare') || c.startsWith('show'));

/** An initialized controller with every ad loaded. */
async function ready(sc: Scenario = {}) {
  const f = fake(sc);
  const c = controller(f);
  await c.init();
  await settle();
  expect(c.isRewardedReady()).toBe(true);
  return { f, c };
}

/** Starts a rewarded show and tracks how often its promise settles. */
function watch(c: AdMobController, p: Parameters<AdMobController['showRewarded']>[0] = 'income_x2') {
  const seen: RewardOutcome[] = [];
  const done = c.showRewarded(p).then((o) => {
    seen.push(o);
    return o;
  });
  return { seen, done };
}

beforeEach(() => {
  vi.useFakeTimers();
  visible = true;
  now = 0;
  logs.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('AdMob consent gate', () => {
  it('consent not required: the SDK starts and ads load only after the update and UMP’s answer', async () => {
    const { f } = await ready();
    expect(f.calls.slice(0, 4)).toEqual(['config', 'update', 'consent', 'initialize']);
    expect(f.calls.slice(4).sort()).toEqual([`prepare interstitial ${DEMO_I}`, `prepare rewarded ${DEMO_R}`]);
    expect(logs[0]).toBe('ADMOB MODE: TEST');
  });

  it('consent required: the form comes first; any answer lets UMP allow ads', async () => {
    const { f } = await ready({ status: 'REQUIRED' });
    expect(f.calls.slice(0, 5)).toEqual(['config', 'update', 'form', 'consent', 'initialize']);
  });

  it('nothing is initialized or requested while the update is still running', async () => {
    const f = fake();
    let release: () => void = () => {};
    const slow = f.bridge.requestConsentUpdate;
    f.bridge.requestConsentUpdate = (d) => new Promise((r) => (release = () => r(slow(d))));
    const c = controller(f);
    const init = c.init();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(requests(f.calls)).toEqual([]);
    expect(c.isRewardedReady()).toBe(false);
    release();
    await init;
    await settle();
    expect(f.calls.indexOf('initialize')).toBeGreaterThan(f.calls.indexOf('consent'));
    expect(c.isRewardedReady()).toBe(true);
  });

  it('first launch offline: no stored decision, so no SDK start and no request — and the game never waits', async () => {
    const f = fake({ update: 'fail' });
    const c = controller(f);
    await c.init();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(requests(f.calls)).toEqual([]);
    expect(c.isRewardedReady()).toBe(false);
    expect(await c.showRewarded('daily_x2')).toBe('failed');
    expect(await c.showInterstitial('barn_unload')).toBe(false);
  });

  it('offline with an earlier decision: the stored canRequestAds() still allows ads', async () => {
    const { f } = await ready({ update: 'fail', stored: true });
    expect(f.calls.slice(0, 4)).toEqual(['config', 'update', 'consent', 'initialize']);
  });

  it('a UMP error never means "allow": an earlier "not allowed" stays not allowed', async () => {
    const f = fake({ update: 'fail', stored: false, status: 'REQUIRED' });
    const c = controller(f);
    await c.init();
    await settle();
    expect(requests(f.calls)).toEqual([]);
  });

  it('when the stored decision cannot be read at all, ads stay off (fail closed)', async () => {
    const f = fake();
    f.bridge.consent = () => Promise.reject(new Error('"AdConfig.consent()" is not implemented on android'));
    const c = controller(f);
    await c.init();
    await settle();
    expect(requests(f.calls)).toEqual([]);
    expect(c.isRewardedReady()).toBe(false);
  });

  it('required but no form available: no ads', async () => {
    const f = fake({ status: 'REQUIRED', formAvailable: false });
    const c = controller(f);
    await c.init();
    await settle();
    expect(f.calls).not.toContain('form');
    expect(requests(f.calls)).toEqual([]);
  });

  it('a form that fails to load means no ads now, and a retry on resume — at most once a minute', async () => {
    const f = fake({ status: 'REQUIRED', form: 'fail' });
    const c = controller(f);
    await c.init();
    await settle();
    expect(requests(f.calls)).toEqual([]);
    now = 30_000;
    c.foreground();
    await settle();
    expect(f.calls.filter((x) => x === 'update')).toHaveLength(1);
    now = 61_000;
    f.s.form = 'answer';
    c.foreground();
    await settle();
    expect(f.calls.filter((x) => x === 'update')).toHaveLength(2);
    expect(c.isRewardedReady()).toBe(true);
  });

  it('a dismissed form is not asked again on every resume (next launch asks)', async () => {
    const f = fake({ status: 'REQUIRED', form: 'dismiss' });
    const c = controller(f);
    await c.init();
    await settle();
    now = 600_000;
    c.foreground();
    await settle();
    expect(f.calls.filter((x) => x === 'update')).toHaveLength(1);
    expect(requests(f.calls)).toEqual([]);
  });

  it('privacy options: offered when UMP requires them; a withdrawn decision stops ads, a new one restarts them', async () => {
    const { f, c } = await ready({ status: 'REQUIRED', privacyRequired: true });
    expect(c.privacyOptionsAvailable).toBe(true);
    f.onPrivacyForm(() => (f.umps.canRequestAds = false));
    await c.showPrivacyOptions();
    await settle();
    expect(c.isRewardedReady()).toBe(false);
    expect(await c.showRewarded('income_x2')).toBe('failed');
    const before = f.calls.length;
    await vi.advanceTimersByTimeAsync(300_000);
    expect(requests(f.calls.slice(before))).toEqual([]);
    f.onPrivacyForm(() => (f.umps.canRequestAds = true));
    await c.showPrivacyOptions();
    await settle();
    expect(c.isRewardedReady()).toBe(true);
    expect(f.calls.filter((x) => x === 'initialize')).toHaveLength(1);
  });

  it('a changed choice drops ads loaded under the old one and loads fresh ones', async () => {
    const { f, c } = await ready({ privacyRequired: true });
    const before = f.calls.length;
    await c.showPrivacyOptions();
    await settle();
    expect(f.calls.slice(before).filter((x) => x.startsWith('prepare'))).toHaveLength(2);
  });

  it('a disabled build asks nothing at all', async () => {
    const f = fake({ native: testBuild({ mode: 'disabled' }) });
    const c = controller(f);
    await c.init();
    c.foreground();
    await settle();
    expect(f.calls).toEqual(['config']);
    expect(logs[0]).toBe('ADMOB MODE: DISABLED (disabled by the build)');
  });

  it('starts the SDK with a PG content cap, unspecified child tags and the build’s test devices', async () => {
    const device = '33BE2250B43518CCDA7DE426D04EE231';
    const { f } = await ready({ native: productionBuild({ testDevices: device }) });
    expect(f.init()).toEqual({ testDevices: [device], maxAdContentRating: 'ParentalGuidance', tagForChildDirectedTreatment: null, tagForUnderAgeOfConsent: null });
    expect(logs[0]).toBe('ADMOB MODE: PRODUCTION');
  });

  it('load failures retry with backoff, and stop when consent goes away', async () => {
    const f = fake({ prepare: 'fail', privacyRequired: true });
    const c = controller(f);
    await c.init();
    await settle();
    const prepares = () => f.calls.filter((x) => x.startsWith('prepare rewarded')).length;
    expect(prepares()).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(prepares()).toBe(2);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(prepares()).toBe(3);
    f.onPrivacyForm(() => (f.umps.canRequestAds = false));
    await c.showPrivacyOptions();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(prepares()).toBe(3);
    // Error texts are logged without ad IDs.
    expect(logs.join('\n')).not.toContain('ca-app-pub-3940');
  });
});

describe('AdMob rewarded sessions (hostile event orders)', () => {
  it('reward, then dismiss: earned at once, exactly once', async () => {
    const { f, c } = await ready();
    const w = watch(c);
    f.fire('rewarded', 'showed', 'rewarded', 'dismissed');
    expect(await w.done).toBe('earned');
    f.fire('rewarded', 'rewarded', 'dismissed', 'rewarded');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(w.seen).toEqual(['earned']);
  });

  it('reward twice: still one reward', async () => {
    const { f, c } = await ready();
    const w = watch(c);
    f.fire('rewarded', 'showed', 'rewarded', 'rewarded', 'dismissed');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(w.seen).toEqual(['earned']);
  });

  it('dismiss, then the reward a moment later: earned', async () => {
    const { f, c } = await ready();
    const w = watch(c);
    f.fire('rewarded', 'showed', 'dismissed');
    await vi.advanceTimersByTimeAsync(400);
    expect(w.seen).toEqual([]);
    f.fire('rewarded', 'rewarded');
    expect(await w.done).toBe('earned');
  });

  it('dismiss without reward: skipped; a reward arriving later changes nothing — not even for the next ad', async () => {
    const { f, c } = await ready();
    const w = watch(c);
    f.fire('rewarded', 'showed', 'dismissed');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await w.done).toBe('skipped');
    f.fire('rewarded', 'rewarded');
    await settle();
    const next = watch(c);
    f.fire('rewarded', 'showed', 'dismissed');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await next.done).toBe('skipped');
    expect(w.seen).toEqual(['skipped']);
  });

  it('failed to show, then a stray dismiss and reward: failed, and the next ad starts clean', async () => {
    const { f, c } = await ready();
    const w = watch(c);
    f.fire('rewarded', 'failedToShow', 'dismissed', 'rewarded');
    expect(await w.done).toBe('failed');
    await settle();
    const next = watch(c);
    f.fire('rewarded', 'showed', 'dismissed');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await next.done).toBe('skipped');
  });

  it('show() rejecting before the ad appears: failed; its later events are ignored', async () => {
    const { f, c } = await ready();
    f.showResolves(() => Promise.reject(new Error(`No ad for ${DEMO_R}`)));
    const w = watch(c);
    expect(await w.done).toBe('failed');
    f.fire('rewarded', 'showed', 'rewarded', 'dismissed');
    await settle();
    expect(w.seen).toEqual(['failed']);
    expect(logs.join('\n')).not.toContain(DEMO_R);
  });

  it('show() rejecting after the ad appeared: the dismiss decides', async () => {
    const { f, c } = await ready();
    let reject: (e: Error) => void = () => {};
    f.showResolves(() => new Promise((_, r) => (reject = r)));
    const w = watch(c);
    f.fire('rewarded', 'showed');
    reject(new Error('late error'));
    await settle();
    expect(w.seen).toEqual([]);
    f.fire('rewarded', 'rewarded', 'dismissed');
    expect(await w.done).toBe('earned');
  });

  it('show() resolving (the plugin’s reward item) is not a reward: only the reward event is', async () => {
    const { f, c } = await ready();
    f.showResolves(async () => {});
    const w = watch(c);
    f.fire('rewarded', 'showed', 'dismissed');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await w.done).toBe('skipped');
  });

  it('no events at all: failed after 15 s of visible time; time in the background does not count', async () => {
    const { c } = await ready();
    const w = watch(c);
    visible = false;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(w.seen).toEqual([]);
    visible = true;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await w.done).toBe('failed');
  });

  it('backgrounded while the ad plays (a click-through): the reward still counts when it comes', async () => {
    const { f, c } = await ready();
    const w = watch(c);
    f.fire('rewarded', 'showed');
    expect(c.adOnScreen()).toBe(true);
    visible = false;
    await vi.advanceTimersByTimeAsync(300_000);
    visible = true;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(w.seen).toEqual([]);
    f.fire('rewarded', 'rewarded', 'dismissed');
    expect(await w.done).toBe('earned');
  });

  it('the manager giving up settles the ad as failed; a reward after that is ignored', async () => {
    const { f, c } = await ready();
    const w = watch(c);
    f.fire('rewarded', 'showed');
    c.cancel();
    f.fire('rewarded', 'rewarded', 'dismissed');
    expect(await w.done).toBe('failed');
    await settle();
    expect(w.seen).toEqual(['failed']);
  });

  it('events from an ad nobody is waiting for (activity recreated, WebView reloaded) are ignored', async () => {
    const { f, c } = await ready();
    f.fire('rewarded', 'showed', 'rewarded', 'dismissed');
    f.fire('interstitial', 'showed', 'dismissed');
    await settle();
    const w = watch(c);
    f.fire('rewarded', 'showed', 'dismissed');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await w.done).toBe('skipped');
  });

  it('interstitial events never touch a rewarded session', async () => {
    const { f, c } = await ready();
    const w = watch(c);
    f.fire('interstitial', 'showed', 'dismissed', 'failedToShow');
    await vi.advanceTimersByTimeAsync(3_000);
    expect(w.seen).toEqual([]);
    f.fire('rewarded', 'showed', 'rewarded', 'dismissed');
    expect(await w.done).toBe('earned');
  });

  it('one ad at a time; a used ad is replaced and not offered until the new one loads', async () => {
    const { f, c } = await ready();
    const w = watch(c);
    expect(c.isRewardedReady()).toBe(false);
    expect(await c.showRewarded('daily_x2')).toBe('failed');
    expect(await c.showInterstitial('barn_unload')).toBe(false);
    f.fire('rewarded', 'showed', 'rewarded', 'dismissed');
    await w.done;
    await settle();
    expect(f.calls.filter((x) => x === `prepare rewarded ${DEMO_R}`)).toHaveLength(2);
    expect(c.isRewardedReady()).toBe(true);
  });

  it('interstitials: shown only when the ad appeared', async () => {
    const { f, c } = await ready();
    const shown = c.showInterstitial('barn_unload');
    f.fire('interstitial', 'showed', 'dismissed');
    expect(await shown).toBe(true);
    await settle();
    const failed = c.showInterstitial('dialog_closed');
    f.fire('interstitial', 'failedToShow');
    expect(await failed).toBe(false);
  });

  it('placement units: each group shows its own unit when the build has one', async () => {
    const { f, c } = await ready({ native: productionBuild({ rewardedBonus: R_BONUS }) });
    expect(f.calls.filter((x) => x.startsWith('prepare rewarded')).sort()).toEqual([`prepare rewarded ${R}`, `prepare rewarded ${R_BONUS}`]);
    const w = watch(c, 'gift_x3');
    expect(f.calls.at(-1)).toBe(`show rewarded ${R_BONUS}`);
    expect(c.isRewardedReady('income_x2')).toBe(false);
    f.fire('rewarded', 'showed', 'rewarded', 'dismissed');
    expect(await w.done).toBe('earned');
    await settle();
    expect(c.isRewardedReady('income_x2')).toBe(true);
  });
});
