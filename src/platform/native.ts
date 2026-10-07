import { Capacitor, SystemBars } from '@capacitor/core';

const native = Capacitor.isNativePlatform();

/** Hide the native launch splash once the first game frame is on screen (launchAutoHide is off). */
export async function hideNativeSplash(): Promise<void> {
  if (!native) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 250 });
  } catch (e) {
    console.warn('splash hide failed', e);
  }
}

/** Immersive full screen. Bars come back after system dialogs and ads, so call again on resume / ad end. */
export async function hideSystemBars(): Promise<void> {
  if (!native) return;
  try {
    await SystemBars.hide();
  } catch {
    /* older WebView / platform without support */
  }
}
