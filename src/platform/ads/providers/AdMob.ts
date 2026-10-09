import { Capacitor, registerPlugin } from '@capacitor/core';
import { AdMob, AdmobConsentDebugGeography, InterstitialAdPluginEvents, MaxAdContentRating, RewardAdPluginEvents } from '@capacitor-community/admob';
import { AdMobController } from '../admob/AdMobController.ts';
import type { AdMobBridge, ConsentState } from '../admob/bridge.ts';
import type { NativeAdConfig } from '../admob/config.ts';

/** This app's own native plugin (android/.../AdConfigPlugin.java): the build's ad configuration and UMP's stored decision. */
const AdConfig = registerPlugin<{ get(): Promise<NativeAdConfig>; consent(): Promise<ConsentState> }>('AdConfig');

/** @capacitor-community/admob + AdConfig, as the controller sees them. */
const bridge: AdMobBridge = {
  platform: Capacitor.getPlatform(),
  config: () => AdConfig.get(),
  consent: () => AdConfig.consent(),
  requestConsentUpdate: async (debug) => {
    const info = await AdMob.requestConsentInfo(
      debug
        ? {
            debugGeography: debug.geography === 'eea' ? AdmobConsentDebugGeography.EEA : AdmobConsentDebugGeography.NOT_EEA,
            testDeviceIdentifiers: debug.testDevices,
          }
        : {},
    );
    return { status: String(info.status), formAvailable: info.isConsentFormAvailable === true };
  },
  showConsentForm: async () => {
    await AdMob.showConsentForm();
  },
  showPrivacyOptionsForm: () => AdMob.showPrivacyOptionsForm(),
  initialize: async (o) => {
    await AdMob.initialize({
      // Test devices are only registered when initializeForTesting is set (plugin source).
      initializeForTesting: o.testDevices.length > 0,
      testingDevices: o.testDevices,
      maxAdContentRating: o.maxAdContentRating as MaxAdContentRating,
      // Left out when unspecified: the plugin then sends UNSPECIFIED.
      ...(o.tagForChildDirectedTreatment === null ? {} : { tagForChildDirectedTreatment: o.tagForChildDirectedTreatment }),
      ...(o.tagForUnderAgeOfConsent === null ? {} : { tagForUnderAgeOfConsent: o.tagForUnderAgeOfConsent }),
    });
  },
  prepare: async (kind, adId) => {
    // isTesting stays false: with it the plugin swaps in its own demo unit and stores the ad under that ID. Whether an
    // ad is a test ad is decided by the unit (Google's demo units) or a registered test device.
    if (kind === 'rewarded') await AdMob.prepareRewardVideoAd({ adId, isTesting: false, immersiveMode: true });
    else await AdMob.prepareInterstitial({ adId, isTesting: false, immersiveMode: true });
  },
  show: async (kind, adId) => {
    if (kind === 'rewarded') await AdMob.showRewardVideoAd({ adId });
    else await AdMob.showInterstitial({ adId });
  },
  listen: async (kind, on) => {
    if (kind === 'rewarded') {
      await AdMob.addListener(RewardAdPluginEvents.Showed, () => on('showed'));
      await AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => on('failedToShow'));
      await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => on('dismissed'));
      await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => on('rewarded'));
    } else {
      await AdMob.addListener(InterstitialAdPluginEvents.Showed, () => on('showed'));
      await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => on('failedToShow'));
      await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => on('dismissed'));
    }
  },
  requestTracking: async () => {
    if (Capacitor.getPlatform() !== 'ios') return;
    const st = await AdMob.trackingAuthorizationStatus();
    if (st.status === 'notDetermined') await AdMob.requestTrackingAuthorization();
  },
};

/** Google AdMob (Android; iOS once AdConfigPlugin is ported) with the UMP consent flow. See AdMobController. */
export class AdMobAds extends AdMobController {
  constructor() {
    super(bridge, {
      visible: () => document.visibilityState === 'visible',
      now: () => performance.now(),
      log: (m) => console.info(m),
    });
  }
}
