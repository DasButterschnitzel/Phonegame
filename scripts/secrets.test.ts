import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Secret-leakage audit of everything tracked in git: no keystores or keys, no real-looking AdMob publisher IDs, no
 * device identifiers. Fixtures use Google's demo publisher, obviously fake publishers and Google's documented example
 * device ID only.
 */
const root = new URL('../', import.meta.url);
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const TEXT = /\.(ts|js|mjs|json|md|txt|ya?ml|gradle|java|kt|xml|html|css|svg|properties|plist|example|sh)$|^\.env|\/\.env|^[^.]+$/;
const texts = files
  .filter((f) => TEXT.test(f) && f !== 'package-lock.json')
  .map((f) => {
    try {
      return [f, readFileSync(new URL(f, root), 'utf8')] as const;
    } catch {
      return [f, ''] as const;
    }
  });

/** Google's demo publisher, the fakes the tests use, and the placeholders the guards refuse. */
const KNOWN_PUBLISHERS = new Set(['3940256099942544', '5550000011112222', '6660000011112222', '0000000000000000', '1234567890123456']);
/** Google's documentation example of a hashed test-device ID. */
const KNOWN_DEVICES = new Set(['33BE2250B43518CCDA7DE426D04EE231']);

describe('secret leakage audit (tracked files)', () => {
  it('no keystore, key, certificate or Google services file is committed', () => {
    const bad = files.filter((f) => /\.(jks|keystore|p12|pfx|pem|key|der|aab|apk)$/i.test(f) || /(^|\/)(google-services\.json|GoogleService-Info\.plist)$/.test(f));
    expect(bad).toEqual([]);
  });

  it('no private key material or literal signing passwords', () => {
    const bad = texts.filter(([, s]) => /-----BEGIN [A-Z ]*PRIVATE KEY-----|storePassword\s+['"][^'"$]|keyPassword\s+['"][^'"$]/.test(s)).map(([f]) => f);
    expect(bad).toEqual([]);
  });

  it('no AdMob publisher ID other than demo, fake or placeholder ones', () => {
    const bad: string[] = [];
    for (const [f, s] of texts) {
      for (const m of s.matchAll(/(?:ca-app-pub-|pub-)(\d{16})/g)) if (!KNOWN_PUBLISHERS.has(m[1])) bad.push(`${f}: …${m[1].slice(-4)}`);
    }
    expect(bad).toEqual([]);
  });

  it('no hashed device ID other than Google’s documentation example', () => {
    const bad: string[] = [];
    for (const [f, s] of texts) {
      for (const m of s.matchAll(/\b[0-9A-F]{32}\b/g)) if (!KNOWN_DEVICES.has(m[0]) && /[A-F]/.test(m[0]) && /\d/.test(m[0])) bad.push(`${f}: …${m[0].slice(-4)}`);
    }
    expect(bad).toEqual([]);
  });

  it('flavor env files hold no ad or signing configuration', () => {
    const bad = texts.filter(([f, s]) => /(^|\/)\.env/.test(f) && /^\s*(ADMOB_|VITE_ADMOB|ANDROID_KEY)/m.test(s)).map(([f]) => f);
    expect(bad).toEqual([]);
  });
});
