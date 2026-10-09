import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  AdMob,
  AdmobConsentDebugGeography,
  AdmobConsentStatus,
  InterstitialAdPluginEvents,
  RewardAdPluginEvents,
} from '@capacitor-community/admob';
import type { AdService, BreakKind, Placement } from '../AdService.ts';
import { modeLine, resolveAdMobConfig, type AdMobConfig, type NativeAdConfig } from '../admob/config.ts';

/** This app's own native plugin (android/.../AdConfigPlugin.java): the build's ad configuration. */
const AdConfig = registerPlugin<{ get(): Promise<NativeAdConfig> }>('AdConfig');

const BACKOFF = [2, 4, 8, 16, 32, 60];

/**
 * Google AdMob via @capacitor-community/admob, with the UMP (GDPR) consent flow.
 * The rewarded flow is event driven: on Android `showRewardVideoAd()` never settles if the user closes early.
 */
export class AdMobAds implements AdService {
  readonly name = 'admob';
  privacyOptionsAvailable = false;
  private canRequest = false;
  private rewardedLoaded = false;
  private interstitialLoaded = false;
  private cfg: AdMobConfig = resolveAdMobConfig('web', null);
  private rTry = 0;
  private iTry = 0;
  private onRewardDone: ((earned: boolean) => void) | null = null;
  private earned = false;
  private onInterstitialDone: (() => void) | null = null;

  async init(): Promise<void> {
    const platform = Capacitor.getPlatform();
    // Ad IDs come only from the native build: a debug APK always carries Google's demo units (app/admob.gradle).
    const native = platform === 'android' ? await AdConfig.get().catch(() => null) : null;
    this.cfg = resolveAdMobConfig(platform, native);
    console.info(modeLine(this.cfg));
    if (this.cfg.mode === 'disabled') return;
    const geo = this.cfg.umpDebugGeography;
    try {
      const info = await AdMob.requestConsentInfo(
        geo
          ? { debugGeography: geo === 'eea' ? AdmobConsentDebugGeography.EEA : AdmobConsentDebugGeography.NOT_EEA, testDeviceIdentifiers: this.cfg.testDevices }
          : {},
      );
      let state = info;
      if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) state = await AdMob.showConsentForm();
      this.privacyOptionsAvailable = String(state.privacyOptionsRequirementStatus) === 'REQUIRED';
      this.canRequest = state.canRequestAds;
    } catch (e) {
      // Consent SDK unavailable (e.g. no network) — AdMob may still serve limited ads; try anyway.
      console.warn('consent failed', e);
      this.canRequest = true;
    }
    if (!this.canRequest) return;
    if (Capacitor.getPlatform() === 'ios') {
      try {
        const st = await AdMob.trackingAuthorizationStatus();
        if (st.status === 'notDetermined') await AdMob.requestTrackingAuthorization();
      } catch {
        /* ignore */
      }
    }
    // General audience, not child-directed (see STORE.md); personalised only after consent (handled by UMP).
    // Test devices are only registered when initializeForTesting is set (plugin source).
    await AdMob.initialize({ initializeForTesting: this.cfg.testDevices.length > 0, testingDevices: this.cfg.testDevices });
    await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
      this.earned = true;
    });
    await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
      // Rewarded and Dismissed can arrive in either order — give the reward event a short grace period.
      setTimeout(() => this.finishReward(this.earned), 400);
    });
    await AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => this.finishReward(false));
    await AdMob.addListener(RewardAdPluginEvents.FailedToLoad, () => {
      this.rewardedLoaded = false;
      this.retry('r');
    });
    await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => this.finishInterstitial());
    await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => this.finishInterstitial());
    await AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, () => {
      this.interstitialLoaded = false;
      this.retry('i');
    });
    void this.loadRewarded();
    void this.loadInterstitial();
  }

  private retry(kind: 'r' | 'i'): void {
    const n = kind === 'r' ? this.rTry++ : this.iTry++;
    const delay = BACKOFF[Math.min(n, BACKOFF.length - 1)] * 1000;
    setTimeout(() => void (kind === 'r' ? this.loadRewarded() : this.loadInterstitial()), delay);
  }

  private async loadRewarded(): Promise<void> {
    try {
      // isTesting stays false: with it the plugin swaps in its own demo unit, and stores the ad under that ID.
      await AdMob.prepareRewardVideoAd({ adId: this.cfg.rewarded, isTesting: false });
      this.rewardedLoaded = true;
      this.rTry = 0;
    } catch {
      this.rewardedLoaded = false;
      this.retry('r');
    }
  }

  private async loadInterstitial(): Promise<void> {
    try {
      await AdMob.prepareInterstitial({ adId: this.cfg.interstitial, isTesting: false, immersiveMode: true });
      this.interstitialLoaded = true;
      this.iTry = 0;
    } catch {
      this.interstitialLoaded = false;
      this.retry('i');
    }
  }

  isRewardedReady(): boolean {
    return this.canRequest && this.rewardedLoaded;
  }

  private finishReward(earned: boolean): void {
    const cb = this.onRewardDone;
    this.onRewardDone = null;
    cb?.(earned);
  }

  private finishInterstitial(): void {
    const cb = this.onInterstitialDone;
    this.onInterstitialDone = null;
    cb?.();
  }

  showRewarded(_p: Placement): Promise<boolean> {
    if (!this.isRewardedReady()) return Promise.resolve(false);
    this.earned = false;
    this.rewardedLoaded = false;
    return new Promise<boolean>((resolve) => {
      this.onRewardDone = (earned) => {
        resolve(earned);
        void this.loadRewarded();
      };
      // Do not await: on early close this promise may never settle (see class comment).
      AdMob.showRewardVideoAd().catch(() => this.finishReward(false));
    });
  }

  showInterstitial(_k: BreakKind): Promise<void> {
    if (!this.canRequest || !this.interstitialLoaded) return Promise.resolve();
    this.interstitialLoaded = false;
    return new Promise<void>((resolve) => {
      this.onInterstitialDone = () => {
        resolve();
        void this.loadInterstitial();
      };
      AdMob.showInterstitial().catch(() => this.finishInterstitial());
    });
  }

  async showPrivacyOptions(): Promise<void> {
    try {
      await AdMob.showPrivacyOptionsForm();
    } catch (e) {
      console.warn(e);
    }
  }
}
