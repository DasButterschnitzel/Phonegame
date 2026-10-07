import { Preferences } from '@capacitor/preferences';

export interface KeyValueStore {
  readonly name: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class LocalStore implements KeyValueStore {
  readonly name = 'local';
  async get(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  async set(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('save failed', e);
    }
  }
  async remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Capacitor Preferences (SharedPreferences / UserDefaults) — survives WebView storage eviction.
 *
 * Never let the `Preferences` plugin object pass through promise resolution (return it from an async function,
 * resolve a promise with it, `await` it): Capacitor plugins are Proxies that answer every property, including
 * `then`, so the promise machinery calls a native "then" method that doesn't exist and the caller hangs forever.
 * Only ever await the results of its *methods*.
 */
export class PreferencesStore implements KeyValueStore {
  readonly name = 'preferences';
  async get(key: string): Promise<string | null> {
    return (await Preferences.get({ key })).value;
  }
  async set(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  }
  async remove(key: string): Promise<void> {
    await Preferences.remove({ key });
  }
}
