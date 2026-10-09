import type { NativeAdConfig } from './config.ts';

/** UMP's stored decision (AdConfigPlugin.consent): available offline, after a failed update and after any form. */
export interface ConsentState {
  canRequestAds: boolean;
  privacyOptionsRequired: boolean;
}

/** A fresh consent information update. */
export interface ConsentUpdate {
  /** UMP status: REQUIRED | NOT_REQUIRED | OBTAINED | UNKNOWN. */
  status: string;
  formAvailable: boolean;
}

export type FullScreenKind = 'rewarded' | 'interstitial';
/** Full-screen ad events as the AdMob plugin reports them. */
export type FullScreenEvent = 'showed' | 'failedToShow' | 'dismissed' | 'rewarded';

export interface InitOptions {
  testDevices: string[];
  maxAdContentRating: 'General' | 'ParentalGuidance' | 'Teen' | 'MatureAudience';
  tagForChildDirectedTreatment: boolean | null;
  tagForUnderAgeOfConsent: boolean | null;
}

/**
 * Everything the AdMob controller needs from native code: the AdMob plugin plus this app's AdConfig plugin.
 * Any call may reject; the controller never lets that escape. Tests drive the controller through a fake.
 */
export interface AdMobBridge {
  readonly platform: string;
  config(): Promise<NativeAdConfig>;
  consent(): Promise<ConsentState>;
  /** UMP consent information update (network). Rejects when offline or on a UMP error. */
  requestConsentUpdate(debug: { geography: 'eea' | 'not_eea'; testDevices: string[] } | null): Promise<ConsentUpdate>;
  /** Loads and shows the consent form when UMP requires it. Rejects when the form cannot load or show. */
  showConsentForm(): Promise<void>;
  showPrivacyOptionsForm(): Promise<void>;
  initialize(o: InitOptions): Promise<void>;
  prepare(kind: FullScreenKind, adId: string): Promise<void>;
  /** Shows a prepared ad. On Android the call may never settle when a rewarded ad is closed early: events decide. */
  show(kind: FullScreenKind, adId: string): Promise<void>;
  listen(kind: FullScreenKind, on: (e: FullScreenEvent) => void): Promise<void>;
  /** iOS App Tracking Transparency prompt; nothing elsewhere. */
  requestTracking(): Promise<void>;
}
