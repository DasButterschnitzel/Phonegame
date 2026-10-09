import { describe, expect, it } from 'vitest';
import { DUMMY_SIGNER, PACKAGE, audit, type ApkFacts, type Expectation } from './audit-android.ts';

const DEMO = { app: 'ca-app-pub-3940256099942544~3347511713', r: 'ca-app-pub-3940256099942544/5224354917', i: 'ca-app-pub-3940256099942544/1033173712' };
const PUB = '5550000011112222';
const REAL = { app: `ca-app-pub-${PUB}~1111111111`, r: `ca-app-pub-${PUB}/2222222222`, i: `ca-app-pub-${PUB}/3333333333` };

const strings = (mode: string, ids: typeof DEMO, extra: Record<string, string> = {}) => ({
  admob_mode: mode,
  admob_app_id: ids.app,
  admob_rewarded: ids.r,
  admob_interstitial: ids.i,
  admob_rewarded_boost: '',
  admob_rewarded_upgrade: '',
  admob_rewarded_bonus: '',
  admob_test_devices: '',
  admob_ump_debug_geography: '',
  ...extra,
});

const facts = (o: Partial<ApkFacts> = {}): ApkFacts => ({
  packageName: PACKAGE,
  versionCode: 10000,
  versionName: '0.1.0',
  minSdk: 24,
  targetSdk: 36,
  debuggable: false,
  strings: strings('production', REAL),
  appIdRef: '0x7f0d001b',
  appIdResource: '0x7f0d001b',
  permissions: ['android.permission.INTERNET', 'com.google.android.gms.permission.AD_ID'],
  capConfig: { appId: PACKAGE, android: {} },
  web: 'console.log("game")',
  signer: { verified: true, dn: 'CN=Butterweich Media Upload' },
  ...o,
});
const production: Expectation = { mode: 'production', debuggable: false, signed: true, minSdk: 24, targetSdk: 36, versionCode: 10000, versionName: '0.1.0', noTestDevices: true };
const debugBuild: Expectation = { mode: 'test', debuggable: true, signed: true, minSdk: 24, targetSdk: 36 };
const failures = (f: ApkFacts, e: Expectation) => audit(f, e).lines.filter((l) => l.startsWith('✗'));

describe('Android artifact audit', () => {
  it('passes a clean production bundle, and its report contains no ID', () => {
    const r = audit(facts(), production);
    expect(r.lines.filter((l) => l.startsWith('✗'))).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.lines.join('\n')).not.toMatch(/ca-app-pub|5550000011112222|\d{10}/);
  });

  it('debug safety: a debug APK carrying real inventory fails', () => {
    const f = facts({ debuggable: true, strings: strings('test', REAL), signer: { verified: true, dn: 'CN=Android Debug,O=Android,C=US' } });
    expect(failures(f, debugBuild)).toEqual(['✗ non-demo AdMob IDs in a test/disabled build']);
    // …and a clean debug APK passes.
    expect(failures(facts({ debuggable: true, strings: strings('test', DEMO), signer: { verified: true, dn: 'CN=Android Debug' } }), debugBuild)).toEqual([]);
  });

  it('production fails on demo IDs, placeholders, mixed publishers and a missing unit', () => {
    expect(failures(facts({ strings: strings('production', DEMO) }), production)).toHaveLength(2);
    const zeros = { app: 'ca-app-pub-0000000000000000~0000000000', r: 'ca-app-pub-0000000000000000/0000000000', i: 'ca-app-pub-0000000000000000/0000000001' };
    expect(failures(facts({ strings: strings('production', zeros) }), production)).toHaveLength(2);
    expect(failures(facts({ strings: strings('production', { ...REAL, i: 'ca-app-pub-6660000011112222/3333333333' }) }), production)).toEqual([
      '✗ app ID and units belong to different publishers',
    ]);
    expect(failures(facts({ strings: strings('production', { ...REAL, r: '' }) }), production).length).toBeGreaterThan(0);
    expect(failures(facts({ strings: strings('production', REAL, { admob_rewarded_bonus: 'REPLACE_ME' }) }), production).length).toBeGreaterThan(0);
  });

  it('production fails when debuggable, mis-moded, mis-versioned or wired wrong', () => {
    expect(failures(facts({ debuggable: true }), production)).toEqual(['✗ debuggable — a release build must not be']);
    expect(failures(facts({ strings: strings('test', REAL) }), production)[0]).toContain('admob_mode is "test"');
    expect(failures(facts({ versionCode: 9999 }), production)).toEqual(['✗ versionCode 9999, expected 10000']);
    expect(failures(facts({ targetSdk: 35 }), production)).toHaveLength(1);
    expect(failures(facts({ packageName: 'com.example' }), production)).toHaveLength(1);
    expect(failures(facts({ appIdRef: '0x7f0d0099' }), production)).toEqual(['✗ manifest APPLICATION_ID does not point at string/admob_app_id']);
  });

  it('production fails on debug WebView flags, dev servers, debug-only code and ad IDs in the web bundle', () => {
    expect(failures(facts({ capConfig: { android: { webContentsDebuggingEnabled: true } } }), production)).toEqual(['✗ WebView debugging forced on']);
    expect(failures(facts({ capConfig: { server: { url: 'http://192.168.0.2:5173' } } }), production)).toHaveLength(1);
    expect(failures(facts({ capConfig: { android: { allowMixedContent: true } } }), production)).toHaveLength(1);
    expect(failures(facts({ capConfig: null }), production)).toHaveLength(1);
    expect(failures(facts({ web: 'window.__game = hooks' }), production)[0]).toContain('debug-only code');
    expect(failures(facts({ web: 'el.className = "ad-overlay"' }), production)[0]).toContain('debug-only code');
    expect(failures(facts({ web: `const unit = "${DEMO.r}"` }), production)).toEqual(['✗ ad IDs in the web bundle (they must come from the native build)']);
  });

  it('production fails when unsigned or signed with a debug or release-test key', () => {
    expect(failures(facts({ signer: { verified: false, dn: '' } }), production)).toHaveLength(1);
    expect(failures(facts({ signer: { verified: true, dn: 'CN=Android Debug,O=Android,C=US' } }), production)).toHaveLength(1);
    expect(failures(facts({ signer: { verified: true, dn: `CN=${DUMMY_SIGNER}` } }), production)).toHaveLength(1);
  });

  it('test devices: counted, never listed; refused when a public build must have none', () => {
    const f = facts({ strings: strings('production', REAL, { admob_test_devices: '33BE2250B43518CCDA7DE426D04EE231' }) });
    expect(failures(f, production)).toEqual(['✗ 1 test device(s) registered — not for a public build']);
    const r = audit(f, { ...production, noTestDevices: false });
    expect(r.ok).toBe(true);
    expect(r.lines.join('\n')).not.toContain('33BE2250');
  });

  it('a simulated consent region only in debug builds', () => {
    expect(failures(facts({ strings: strings('production', REAL, { admob_ump_debug_geography: 'eea' }) }), production)).toEqual(['✗ a simulated consent region in a release build']);
  });
});
