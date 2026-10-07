import { Capacitor } from '@capacitor/core';

type Kind = 'light' | 'medium' | 'heavy' | 'selection' | 'success';

/** Native haptics via @capacitor/haptics; navigator.vibrate fallback on Android web. Throttled. */
export class Haptics {
  enabled = true;
  private last = 0;
  private native: typeof import('@capacitor/haptics') | null = null;

  constructor() {
    if (Capacitor.isNativePlatform()) {
      void import('@capacitor/haptics').then((m) => (this.native = m));
    }
  }

  fire(kind: Kind): void {
    if (!this.enabled) return;
    const now = performance.now();
    if (now - this.last < 80) return;
    this.last = now;
    const n = this.native;
    if (n) {
      if (kind === 'selection') void n.Haptics.selectionChanged();
      else if (kind === 'success') void n.Haptics.notification({ type: n.NotificationType.Success });
      else void n.Haptics.impact({ style: kind === 'light' ? n.ImpactStyle.Light : kind === 'medium' ? n.ImpactStyle.Medium : n.ImpactStyle.Heavy });
      return;
    }
    if ('vibrate' in navigator) {
      const ms = kind === 'heavy' ? 40 : kind === 'medium' ? 25 : kind === 'success' ? [20, 40, 30] : 10;
      try {
        navigator.vibrate(ms);
      } catch {
        /* ignore */
      }
    }
  }
}
