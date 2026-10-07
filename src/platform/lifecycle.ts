import { Capacitor } from '@capacitor/core';

export interface LifecycleHooks {
  onHide: () => void;
  onShow: () => void;
  /** Android back button; return true when handled. */
  onBack: () => boolean;
  onExitRequest: () => void;
}

/** Visibility + native app lifecycle. Uses Capacitor App events on native, Page Visibility on web. */
export async function installLifecycle(h: LifecycleHooks): Promise<void> {
  let hidden = false;
  const hide = () => {
    if (hidden) return;
    hidden = true;
    h.onHide();
  };
  const show = () => {
    if (!hidden) return;
    hidden = false;
    h.onShow();
  };
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? hide() : show()));
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  if (Capacitor.isNativePlatform()) {
    const { App } = await import('@capacitor/app');
    await App.addListener('pause', hide);
    await App.addListener('resume', show);
    await App.addListener('backButton', () => {
      if (!h.onBack()) h.onExitRequest();
    });
  }
}

export async function exitApp(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { App } = await import('@capacitor/app');
    await App.exitApp();
  }
}
