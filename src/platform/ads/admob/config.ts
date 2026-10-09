import type { Placement } from '../AdService.ts';

/**
 * AdMob configuration as the native build hands it over (android/app/admob.gradle → AdConfigPlugin). The web bundle
 * carries no ad IDs: a debug APK gets Google's demo units from Gradle whatever the environment says, and this file
 * re-checks what arrives, so a broken build turns ads off instead of mixing test and production inventory.
 */

/** Google's demo publisher: its units always serve test ads. */
export const DEMO_PUBLISHER = '3940256099942544';
const APP_ID = /^ca-app-pub-(\d{16})~\d{10}$/;
const UNIT_ID = /^ca-app-pub-(\d{16})\/\d{10}$/;
const DEVICE_ID = /^[0-9A-Fa-f]{32}$/;

export type AdMobMode = 'test' | 'production' | 'disabled';

/** Rewarded placements share one ad unit unless a group has its own (ADMOB_ANDROID_REWARDED_BOOST / _UPGRADE / _BONUS). */
export type RewardGroup = 'boost' | 'upgrade' | 'bonus';
export const REWARD_GROUP: Record<Placement, RewardGroup> = {
  income_x2: 'boost',
  autopilot: 'boost',
  free_upgrade: 'upgrade',
  free_tornado: 'upgrade',
  offline_x3: 'bonus',
  gift_x3: 'bonus',
  farm_complete_x2: 'bonus',
  daily_x2: 'bonus',
};

/** What AdConfigPlugin.get() resolves with. */
export interface NativeAdConfig {
  debuggable: boolean;
  mode: string;
  appId: string;
  rewarded: string;
  rewardedBoost: string;
  rewardedUpgrade: string;
  rewardedBonus: string;
  interstitial: string;
  /** Comma-separated hashed device IDs (from the build environment, never from the repository). */
  testDevices: string;
  umpDebugGeography: string;
}

export interface AdMobConfig {
  mode: AdMobMode;
  /** Why ads are off or the build's request was refused. Logged, never shown to players, never contains IDs. */
  note: string;
  /** The rewarded unit every placement uses unless its group has its own. */
  rewarded: string;
  groupUnits: Partial<Record<RewardGroup, string>>;
  interstitial: string;
  testDevices: string[];
  /** Simulated consent region for testing the form (debuggable builds only). */
  umpDebugGeography: 'eea' | 'not_eea' | null;
}

const disabled = (note: string): AdMobConfig => ({
  mode: 'disabled',
  note,
  rewarded: '',
  groupUnits: {},
  interstitial: '',
  testDevices: [],
  umpDebugGeography: null,
});

export function resolveAdMobConfig(platform: string, n: NativeAdConfig | null): AdMobConfig {
  if (platform !== 'android') return disabled(`no native ad configuration on ${platform}`);
  if (!n) return disabled('native ad configuration unavailable');
  if (n.mode === 'disabled') return disabled('disabled by the build');
  if (n.mode !== 'test' && n.mode !== 'production') return disabled('unknown mode');
  const groupUnits: Partial<Record<RewardGroup, string>> = {};
  if (n.rewardedBoost) groupUnits.boost = n.rewardedBoost;
  if (n.rewardedUpgrade) groupUnits.upgrade = n.rewardedUpgrade;
  if (n.rewardedBonus) groupUnits.bonus = n.rewardedBonus;
  const units = [n.rewarded, n.interstitial, ...Object.values(groupUnits)];
  const publishers = new Set([APP_ID.exec(n.appId)?.[1], ...units.map((u) => UNIT_ID.exec(u)?.[1])]);
  if (publishers.has(undefined)) return disabled(`malformed ${n.mode} configuration`);
  if (publishers.size !== 1) return disabled('ad IDs from more than one publisher');
  const demo = publishers.has(DEMO_PUBLISHER);
  if (n.mode === 'test' && !demo) return disabled('test mode without demo units');
  if (n.mode === 'production' && demo) return disabled('production mode with demo units');
  if (n.mode === 'production' && n.debuggable) return disabled('a debuggable build never uses production units');
  const geo = n.umpDebugGeography;
  return {
    mode: n.mode,
    note: '',
    rewarded: n.rewarded,
    groupUnits,
    interstitial: n.interstitial,
    testDevices: n.testDevices.split(',').map((s) => s.trim()).filter((s) => DEVICE_ID.test(s)),
    umpDebugGeography: n.debuggable && (geo === 'eea' || geo === 'not_eea') ? geo : null,
  };
}

/** The ad unit a rewarded placement shows. */
export const rewardedUnit = (c: AdMobConfig, p: Placement): string => c.groupUnits[REWARD_GROUP[p]] ?? c.rewarded;

/** The one log line per launch: ADMOB MODE: TEST | PRODUCTION | DISABLED (never with IDs). */
export const modeLine = (c: AdMobConfig): string => `ADMOB MODE: ${c.mode.toUpperCase()}${c.note ? ` (${c.note})` : ''}`;

/**
 * Who the ads are for. The game is for a general 13+ audience (Play Console target audience 13+, not in the Families
 * program): ads are capped at PG to suit its tone, and the child-directed / under-age-of-consent tags stay
 * unspecified because the app is not directed at children and asks no ages. If the Play target audience ever
 * includes children, that is not a flag flip — the Families policy applies (docs/PLAY_CONSOLE_CHECKLIST.md).
 */
export const AUDIENCE = {
  maxAdContentRating: 'ParentalGuidance',
  tagForChildDirectedTreatment: null,
  tagForUnderAgeOfConsent: null,
} as const;
