import { describe, it, expect, beforeAll } from 'vitest';
import { PreferencesStore } from './Storage.ts';

// The real @capacitor/preferences plugin object is a Proxy that answers *every* property — including `then`.
// If it ever flows through promise resolution (e.g. returned from an async function), JS calls
// `Preferences.then()`, which the native side rejects and the awaiting code hangs forever. That froze the
// Android build on the loading screen ("step: save"). This test uses the real plugin (web implementation).
beforeAll(() => {
  // The plugin's web implementation reads window.localStorage; give node a minimal one.
  const g = globalThis as unknown as { localStorage?: Storage; window?: unknown };
  g.window ??= globalThis;
  if (!g.localStorage || typeof g.localStorage.getItem !== 'function') {
    const m = new Map<string, string>();
    g.localStorage = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, String(v)),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
      key: (i: number) => [...m.keys()][i] ?? null,
      get length() {
        return m.size;
      },
    } as Storage;
  }
});

const within = <T>(p: Promise<T>, ms = 1500) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`hung for ${ms} ms`)), ms))]);

describe('PreferencesStore (real Capacitor plugin proxy)', () => {
  it('round-trips values without ever awaiting the plugin object itself', async () => {
    const s = new PreferencesStore();
    expect(await within(s.get('cc.test'))).toBeNull();
    await within(s.set('cc.test', 'hello'));
    expect(await within(s.get('cc.test'))).toBe('hello');
    await within(s.remove('cc.test'));
    expect(await within(s.get('cc.test'))).toBeNull();
  });
});
