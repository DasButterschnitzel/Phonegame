/** Google's public test ad units are the default; real IDs are injected at build time (CI secrets). */
const TEST = {
  android: { rewarded: 'ca-app-pub-3940256099942544/5224354917', interstitial: 'ca-app-pub-3940256099942544/1033173712' },
  ios: { rewarded: 'ca-app-pub-3940256099942544/1712485313', interstitial: 'ca-app-pub-3940256099942544/4411468910' },
};

export const ADMOB_REAL = import.meta.env.VITE_ADMOB_REAL === 'true';

export function adUnits(platform: 'android' | 'ios'): { rewarded: string; interstitial: string } {
  const env = import.meta.env;
  if (!ADMOB_REAL) return TEST[platform];
  return platform === 'android'
    ? { rewarded: env.VITE_ADMOB_ANDROID_REWARDED || TEST.android.rewarded, interstitial: env.VITE_ADMOB_ANDROID_INTERSTITIAL || TEST.android.interstitial }
    : { rewarded: env.VITE_ADMOB_IOS_REWARDED || TEST.ios.rewarded, interstitial: env.VITE_ADMOB_IOS_INTERSTITIAL || TEST.ios.interstitial };
}
