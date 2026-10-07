import type { LangSetting } from './i18n/i18n.ts';

export interface Settings {
  sound: boolean;
  music: boolean;
  haptics: boolean;
  lang: LangSetting;
  quality: 'auto' | 'low' | 'med' | 'high';
  reduceMotion: boolean;
  toggleHold: boolean;
  /** Developer performance overlay (Settings: tap the version seven times). */
  perfOverlay: boolean;
}

export const defaultSettings = (): Settings => ({
  sound: true,
  music: true,
  haptics: true,
  lang: 'auto',
  quality: 'auto',
  reduceMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  toggleHold: false,
  perfOverlay: false,
});
