import { describe, expect, it } from 'vitest';
import { modeLine, resolveAdMobConfig, rewardedUnit, type NativeAdConfig } from './config.ts';

const DEMO_APP = 'ca-app-pub-3940256099942544~3347511713';
const DEMO_R = 'ca-app-pub-3940256099942544/5224354917';
const DEMO_I = 'ca-app-pub-3940256099942544/1033173712';
const PUB = '5550000011112222';
const REAL_APP = `ca-app-pub-${PUB}~1111111111`;
const REAL_R = `ca-app-pub-${PUB}/2222222222`;
const REAL_I = `ca-app-pub-${PUB}/3333333333`;
const DEVICE = '33BE2250B43518CCDA7DE426D04EE231';

const debugBuild = (o: Partial<NativeAdConfig> = {}): NativeAdConfig => ({
  debuggable: true,
  mode: 'test',
  appId: DEMO_APP,
  rewarded: DEMO_R,
  rewardedBoost: '',
  rewardedUpgrade: '',
  rewardedBonus: '',
  interstitial: DEMO_I,
  testDevices: '',
  umpDebugGeography: '',
  ...o,
});
const productionBuild = (o: Partial<NativeAdConfig> = {}): NativeAdConfig =>
  debugBuild({ debuggable: false, mode: 'production', appId: REAL_APP, rewarded: REAL_R, rewardedBoost: '', rewardedUpgrade: '', rewardedBonus: '', interstitial: REAL_I, ...o });

describe('AdMob configuration from the native build', () => {
  it('a debug build runs Google demo units in TEST mode', () => {
    const c = resolveAdMobConfig('android', debugBuild());
    expect(c.mode).toBe('test');
    expect(rewardedUnit(c, 'income_x2')).toBe(DEMO_R);
    expect(rewardedUnit(c, 'daily_x2')).toBe(DEMO_R);
    expect(c.interstitial).toBe(DEMO_I);
    expect(modeLine(c)).toBe('ADMOB MODE: TEST');
  });

  it('a debuggable build never uses production units, whatever it claims', () => {
    expect(resolveAdMobConfig('android', productionBuild({ debuggable: true })).mode).toBe('disabled');
    // Real units smuggled into a test build are refused too — no mixed modes.
    expect(resolveAdMobConfig('android', debugBuild({ rewarded: REAL_R, interstitial: REAL_I, appId: REAL_APP })).mode).toBe('disabled');
    expect(resolveAdMobConfig('android', debugBuild({ interstitial: REAL_I })).mode).toBe('disabled');
    expect(resolveAdMobConfig('android', debugBuild({ rewardedBonus: REAL_R })).mode).toBe('disabled');
  });

  it('a valid production build uses its units; empty placement units fall back to the shared one', () => {
    const c = resolveAdMobConfig('android', productionBuild({ rewardedBonus: `ca-app-pub-${PUB}/4444444444` }));
    expect(c.mode).toBe('production');
    expect(rewardedUnit(c, 'income_x2')).toBe(REAL_R);
    expect(rewardedUnit(c, 'free_upgrade')).toBe(REAL_R);
    expect(rewardedUnit(c, 'gift_x3')).toBe(`ca-app-pub-${PUB}/4444444444`);
    expect(c.interstitial).toBe(REAL_I);
    expect(modeLine(c)).toBe('ADMOB MODE: PRODUCTION');
  });

  it('broken production configurations turn ads off — never back to test units', () => {
    const cases: Partial<NativeAdConfig>[] = [
      { rewarded: '' },
      { interstitial: 'ca-app-pub-123/456' },
      { appId: REAL_R },
      { interstitial: DEMO_I },
      { rewardedUpgrade: 'ca-app-pub-6543210987654321/2222222222' },
      { appId: DEMO_APP, rewarded: DEMO_R, interstitial: DEMO_I },
      { appId: 'ca-app-pub-0000000000000000~0000000000', rewarded: 'ca-app-pub-0000000000000000/0000000000', interstitial: 'ca-app-pub-0000000000000000/0000000001' },
      { appId: 'ca-app-pub-1234567890123456~1111111111', rewarded: 'ca-app-pub-1234567890123456/2222222222', interstitial: 'ca-app-pub-1234567890123456/3333333333' },
    ];
    for (const o of cases) {
      const c = resolveAdMobConfig('android', productionBuild(o));
      expect(c.mode, JSON.stringify(o)).toBe('disabled');
      expect([c.rewarded, c.interstitial, ...Object.values(c.groupUnits)].join('')).toBe('');
    }
  });

  it('disabled, unknown, missing or non-Android configurations mean no ads', () => {
    expect(resolveAdMobConfig('android', productionBuild({ mode: 'disabled' })).mode).toBe('disabled');
    expect(resolveAdMobConfig('android', productionBuild({ mode: 'prod' })).mode).toBe('disabled');
    expect(resolveAdMobConfig('android', null).mode).toBe('disabled');
    expect(resolveAdMobConfig('ios', debugBuild()).mode).toBe('disabled');
    expect(modeLine(resolveAdMobConfig('ios', null))).toBe('ADMOB MODE: DISABLED (no native ad configuration on ios)');
  });

  it('keeps only well-formed test devices; the consent region is simulated in debuggable builds only', () => {
    const c = resolveAdMobConfig('android', debugBuild({ testDevices: ` ${DEVICE}, nope ,`, umpDebugGeography: 'eea' }));
    expect(c.testDevices).toEqual([DEVICE]);
    expect(c.umpDebugGeography).toBe('eea');
    expect(resolveAdMobConfig('android', productionBuild({ umpDebugGeography: 'eea' })).umpDebugGeography).toBeNull();
  });

  it('log lines never contain IDs', () => {
    for (const n of [debugBuild(), productionBuild(), productionBuild({ interstitial: DEMO_I }), productionBuild({ debuggable: true })]) {
      expect(modeLine(resolveAdMobConfig('android', n))).not.toMatch(/ca-app-pub|\d{10}/);
    }
  });
});
