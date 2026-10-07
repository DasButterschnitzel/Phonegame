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

/** Capacitor Preferences (SharedPreferences / UserDefaults) — survives WebView storage eviction. */
export class PreferencesStore implements KeyValueStore {
  readonly name = 'preferences';
  private prefs: typeof import('@capacitor/preferences').Preferences | null = null;
  private async p() {
    if (!this.prefs) this.prefs = (await import('@capacitor/preferences')).Preferences;
    return this.prefs;
  }
  async get(key: string): Promise<string | null> {
    return (await (await this.p()).get({ key })).value;
  }
  async set(key: string, value: string): Promise<void> {
    await (await this.p()).set({ key, value });
  }
  async remove(key: string): Promise<void> {
    await (await this.p()).remove({ key });
  }
}
