/**
 * Audits a built Android artifact — the file itself, not the build's intentions:
 *   node scripts/audit-android.ts --apk app.apk [--aab app.aab] --mode test|production|disabled
 *        [--debuggable] [--signed] [--version-code N] [--version-name X] [--no-test-devices]
 *
 * For an AAB pass the universal APK built from it (`gradlew packageReleaseUniversalApk`) as --apk: its manifest,
 * resources and web assets are the bundle's. Findings never print IDs, keys, passwords or device identifiers.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE = 'com.butterweichmedia.cropcrawler';
const DEMO_PUBLISHER = '3940256099942544';
const DEMO_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const APP_ID = /^ca-app-pub-(\d{16})~\d{10}$/;
const UNIT_ID = /^ca-app-pub-(\d{16})\/\d{10}$/;
const PLACEHOLDER_PUBLISHER = /^(\d)\1{15}$|^1234567890123456$|^0123456789012345$/;
/** The throwaway key the release-test job signs with. */
export const DUMMY_SIGNER = 'Crop Crawler Release Test';
/** Code that exists only in dev/e2e builds: debug hooks and simulated ads. */
const DEBUG_MARKERS = ['__game', 'ad-overlay'];

export interface ApkFacts {
  packageName: string;
  versionCode: number;
  versionName: string;
  minSdk: number;
  targetSdk: number;
  debuggable: boolean;
  /** string resources named admob_* */
  strings: Record<string, string>;
  /** Resource ID the APPLICATION_ID meta-data points at, and the ID of string/admob_app_id. */
  appIdRef: string | null;
  appIdResource: string | null;
  permissions: string[];
  capConfig: Record<string, unknown> | null;
  /** All web JavaScript and HTML in the artifact. */
  web: string;
  signer: { verified: boolean; dn: string } | null;
}

export interface Expectation {
  mode: 'test' | 'production' | 'disabled';
  debuggable: boolean;
  signed: boolean;
  minSdk: number;
  targetSdk: number;
  versionCode?: number;
  versionName?: string;
  noTestDevices?: boolean;
}

export function audit(f: ApkFacts, e: Expectation): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  let ok = true;
  const check = (pass: boolean, good: string, bad: string = good) => {
    lines.push(`${pass ? '✓' : '✗'} ${pass ? good : bad}`);
    if (!pass) ok = false;
  };
  check(f.packageName === PACKAGE, `package ${PACKAGE}`, `package is "${f.packageName}", expected ${PACKAGE}`);
  check(f.minSdk === e.minSdk && f.targetSdk === e.targetSdk, `minSdk ${f.minSdk}, targetSdk ${f.targetSdk}`, `minSdk ${f.minSdk} / targetSdk ${f.targetSdk}, expected ${e.minSdk} / ${e.targetSdk}`);
  if (e.versionCode !== undefined) check(f.versionCode === e.versionCode, `versionCode ${f.versionCode}`, `versionCode ${f.versionCode}, expected ${e.versionCode}`);
  if (e.versionName !== undefined) check(f.versionName === e.versionName, `versionName ${f.versionName}`, `versionName "${f.versionName}", expected "${e.versionName}"`);
  check(f.debuggable === e.debuggable, e.debuggable ? 'debuggable (debug build)' : 'not debuggable', f.debuggable ? 'debuggable — a release build must not be' : 'not debuggable, expected a debug build');

  // AdMob: what the app will actually request.
  const s = f.strings;
  check(s.admob_mode === e.mode, `ADMOB MODE: ${e.mode.toUpperCase()}`, `admob_mode is "${s.admob_mode ?? 'missing'}", expected ${e.mode}`);
  check(f.appIdRef !== null && f.appIdRef === f.appIdResource, 'manifest APPLICATION_ID comes from string/admob_app_id', 'manifest APPLICATION_ID does not point at string/admob_app_id');
  const groups = ['admob_rewarded_boost', 'admob_rewarded_upgrade', 'admob_rewarded_bonus'].map((k) => s[k] ?? '').filter(Boolean);
  const units = [s.admob_rewarded ?? '', s.admob_interstitial ?? '', ...groups];
  const appPub = APP_ID.exec(s.admob_app_id ?? '')?.[1];
  const unitPubs = units.map((u) => UNIT_ID.exec(u)?.[1]);
  if (e.mode === 'production') {
    check(appPub !== undefined && appPub !== DEMO_PUBLISHER && !PLACEHOLDER_PUBLISHER.test(appPub), 'app ID: well-formed, not a demo or placeholder', 'app ID: missing, malformed, a demo or a placeholder ID');
    check(
      unitPubs.every((p) => p !== undefined && p !== DEMO_PUBLISHER && !PLACEHOLDER_PUBLISHER.test(p)),
      `ad units: ${units.length} well-formed, none a demo or placeholder (${groups.length} placement-specific)`,
      'ad units: a unit is missing, malformed, a demo or a placeholder',
    );
    check(new Set([appPub, ...unitPubs]).size === 1, 'app ID and units share one publisher', 'app ID and units belong to different publishers');
  } else {
    check(s.admob_app_id === DEMO_APP_ID && unitPubs.every((p) => p === DEMO_PUBLISHER), "Google's demo app ID and units only", 'non-demo AdMob IDs in a test/disabled build');
  }
  const devices = (s.admob_test_devices ?? '').split(',').filter(Boolean).length;
  if (e.noTestDevices) check(devices === 0, 'no test devices registered', `${devices} test device(s) registered — not for a public build`);
  else lines.push(`· ${devices} test device(s) registered`);
  check(!s.admob_ump_debug_geography || e.debuggable, 'no simulated consent region', 'a simulated consent region in a release build');
  lines.push(`· advertising ID permission (com.google.android.gms.permission.AD_ID): ${f.permissions.includes('com.google.android.gms.permission.AD_ID') ? 'declared' : 'not declared'}`);

  // WebView and web assets.
  const cap = f.capConfig ?? {};
  const server = (cap.server ?? {}) as Record<string, unknown>;
  const android = (cap.android ?? {}) as Record<string, unknown>;
  check(f.capConfig !== null, 'capacitor.config.json present', 'capacitor.config.json missing');
  check(!server.url && server.cleartext !== true, 'no dev server URL, no cleartext', 'capacitor.config.json points at a dev server or allows cleartext');
  check(android.webContentsDebuggingEnabled !== true || e.debuggable, 'WebView debugging follows the build type', 'WebView debugging forced on');
  check(android.allowMixedContent !== true, 'no mixed content', 'mixed content allowed');
  check(!/ca-app-pub-\d/.test(f.web), 'no ad IDs in the web bundle', 'ad IDs in the web bundle (they must come from the native build)');
  const markers = DEBUG_MARKERS.filter((m) => f.web.includes(m));
  check(markers.length === 0 || e.debuggable, 'no debug-only code (debug hooks, simulated ads)', `debug-only code in a release build: ${markers.join(', ')}`);

  // Signing.
  if (e.signed) {
    check(f.signer?.verified === true, 'signature verifies', 'not signed, or the signature does not verify');
    if (e.mode === 'production' && f.signer) {
      check(!/Android Debug/i.test(f.signer.dn) && !f.signer.dn.includes(DUMMY_SIGNER), 'signed with the upload key (not a debug or test key)', 'signed with a debug or release-test key');
    }
  }
  return { ok, lines };
}

// ——— reading the artifact ———

function sdkTool(name: string): string {
  const roots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, '/opt/android-sdk'].filter((x): x is string => !!x);
  for (const root of roots) {
    const dir = join(root, 'build-tools');
    if (!existsSync(dir)) continue;
    const versions = readdirSync(dir).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const v of versions) if (existsSync(join(dir, v, name))) return join(dir, v, name);
  }
  throw new Error(`${name} not found (set ANDROID_HOME)`);
}

const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

export function readApk(apk: string): ApkFacts {
  const aapt2 = sdkTool('aapt2');
  const badging = run(aapt2, ['dump', 'badging', apk]);
  const pkg = /package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'/.exec(badging);
  const resources = run(aapt2, ['dump', 'resources', apk]);
  const strings: Record<string, string> = {};
  let appIdResource: string | null = null;
  for (const m of resources.matchAll(/resource (0x[0-9a-f]+) string\/(admob_\w+)[^\n]*\n\s*\(\)\s*"((?:[^"\\]|\\.)*)"/g)) {
    strings[m[2]] = m[3];
    if (m[2] === 'admob_app_id') appIdResource = m[1];
  }
  const manifest = run(aapt2, ['dump', 'xmltree', '--file', 'AndroidManifest.xml', apk]);
  const meta = /"com\.google\.android\.gms\.ads\.APPLICATION_ID"[^\n]*\n[^\n]*android:value\(0x01010024\)=@(0x[0-9a-f]+)/.exec(manifest);
  const files = run('unzip', ['-Z1', apk]).split('\n');
  const web = files
    .filter((f) => /^assets\/public\/.*\.(js|html)$/.test(f))
    .map((f) => run('unzip', ['-p', apk, f]))
    .join('\n');
  let capConfig: Record<string, unknown> | null = null;
  try {
    capConfig = JSON.parse(run('unzip', ['-p', apk, 'assets/capacitor.config.json'])) as Record<string, unknown>;
  } catch {
    capConfig = null;
  }
  let signer: ApkFacts['signer'] = null;
  try {
    const out = run(sdkTool('apksigner'), ['verify', '--print-certs', apk]);
    signer = { verified: true, dn: /Signer #1 certificate DN: (.*)/.exec(out)?.[1] ?? '' };
  } catch {
    signer = { verified: false, dn: '' };
  }
  return {
    packageName: pkg?.[1] ?? '',
    versionCode: Number(pkg?.[2] ?? 0),
    versionName: pkg?.[3] ?? '',
    minSdk: Number(/(?:^|\n)(?:minSdkVersion|sdkVersion):'(\d+)'/.exec(badging)?.[1] ?? 0),
    targetSdk: Number(/targetSdkVersion:'(\d+)'/.exec(badging)?.[1] ?? 0),
    debuggable: /application-debuggable/.test(badging),
    strings,
    appIdRef: meta?.[1] ?? null,
    appIdResource,
    permissions: [...badging.matchAll(/uses-permission: name='([^']+)'/g)].map((m) => m[1]),
    capConfig,
    web,
    signer,
  };
}

/** An app bundle is a signed jar: jarsigner verifies it, keytool names the signer. */
export function readAabSigner(aab: string): { verified: boolean; dn: string } {
  try {
    const verified = /jar verified/.test(run('jarsigner', ['-verify', aab]));
    const dn = /Owner: (.*)/.exec(run('keytool', ['-printcert', '-jarfile', aab]))?.[1] ?? '';
    return { verified, dn };
  } catch {
    return { verified: false, dn: '' };
  }
}

function sdkLevels(): { minSdk: number; targetSdk: number } {
  const vars = readFileSync(new URL('../android/variables.gradle', import.meta.url), 'utf8');
  return { minSdk: Number(/minSdkVersion = (\d+)/.exec(vars)?.[1]), targetSdk: Number(/targetSdkVersion = (\d+)/.exec(vars)?.[1]) };
}

function main(): void {
  const args = process.argv.slice(2);
  const arg = (k: string) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const apk = arg('apk');
  const mode = arg('mode');
  if (!apk || (mode !== 'test' && mode !== 'production' && mode !== 'disabled')) {
    console.error('usage: audit-android.ts --apk app.apk [--aab app.aab] --mode test|production|disabled [--debuggable] [--signed] [--version-code N] [--version-name X] [--no-test-devices]');
    process.exit(2);
  }
  const vc = arg('version-code');
  const expectation: Expectation = {
    mode,
    debuggable: args.includes('--debuggable'),
    signed: args.includes('--signed'),
    ...sdkLevels(),
    versionCode: vc === undefined ? undefined : Number(vc),
    versionName: arg('version-name'),
    noTestDevices: args.includes('--no-test-devices'),
  };
  const r = audit(readApk(apk), expectation);
  console.log(`Audit of ${apk}`);
  for (const l of r.lines) console.log(`  ${l}`);
  let ok = r.ok;
  const aab = arg('aab');
  if (aab) {
    const s = readAabSigner(aab);
    const good = s.verified && (!expectation.signed || mode !== 'production' || (!/Android Debug/i.test(s.dn) && !s.dn.includes(DUMMY_SIGNER)));
    console.log(`Audit of ${aab}`);
    console.log(`  ${good ? '✓' : '✗'} ${good ? 'bundle signature verifies' + (mode === 'production' ? ' (upload key)' : '') : 'bundle unsigned, unverifiable, or signed with a debug/test key'}`);
    ok &&= good;
  }
  console.log(ok ? 'AUDIT PASSED' : 'AUDIT FAILED');
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
