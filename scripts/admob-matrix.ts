/**
 * The AdMob build matrix, run against Gradle itself (needs the Android SDK):
 *   node scripts/admob-matrix.ts
 *
 * Each case sets environment variables, asks Gradle for the AdMob resources a build type would carry and runs the
 * release guards, then checks the result: debug builds always carry Google's demo units, release builds carry exactly
 * the validated configuration or refuse to build. The IDs are fake; only case names are printed.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ANDROID = fileURLToPath(new URL('../android/', import.meta.url));
const DEMO = { app: 'ca-app-pub-3940256099942544~3347511713', r: 'ca-app-pub-3940256099942544/5224354917', i: 'ca-app-pub-3940256099942544/1033173712' };
const P = '5550000011112222';
const REAL = {
  ADMOB_APP_ID_ANDROID: `ca-app-pub-${P}~1111111111`,
  ADMOB_ANDROID_REWARDED: `ca-app-pub-${P}/2222222222`,
  ADMOB_ANDROID_INTERSTITIAL: `ca-app-pub-${P}/3333333333`,
};
const DEVICE = '33BE2250B43518CCDA7DE426D04EE231';

type Res = Record<string, string>;
interface Case {
  name: string;
  type: 'debug' | 'release';
  env: Record<string, string>;
  /** The release guards must refuse the configuration (checked on the guard's own message). */
  refused?: boolean;
  /** Sign with a throwaway key and set a versionCode, as a production build must. */
  signed?: boolean;
  expect?: (r: Res) => string | null;
}

const demo = (r: Res) =>
  r.admob_mode === 'test' && r.admob_app_id === DEMO.app && r.admob_rewarded === DEMO.r && r.admob_interstitial === DEMO.i && !r.admob_rewarded_boost
    ? null
    : 'not the demo configuration';

const CASES: Case[] = [
  { name: 'debug + ADMOB_REAL=false', type: 'debug', env: { ADMOB_REAL: 'false' }, expect: demo },
  { name: 'debug + ADMOB_REAL=true', type: 'debug', env: { ADMOB_REAL: 'true' }, expect: demo },
  { name: 'debug + real IDs accidentally supplied', type: 'debug', env: { ADMOB_MODE: 'production', ADMOB_REAL: 'true', ...REAL }, expect: demo },
  {
    name: 'debug + test devices and a simulated consent region',
    type: 'debug',
    env: { ADMOB_TEST_DEVICE_IDS: DEVICE, ADMOB_UMP_DEBUG_GEOGRAPHY: 'eea' },
    expect: (r) => demo(r) ?? (r.admob_test_devices === DEVICE && r.admob_ump_debug_geography === 'eea' ? null : 'devices or region missing'),
  },
  { name: 'release + nothing set (test by default)', type: 'release', env: {}, expect: demo },
  { name: 'release + test configuration, real IDs lying around', type: 'release', env: { ADMOB_MODE: 'test', ...REAL }, expect: demo },
  {
    name: 'release + disabled',
    type: 'release',
    env: { ADMOB_MODE: 'disabled' },
    expect: (r) => (r.admob_mode === 'disabled' && r.admob_app_id === DEMO.app ? null : 'not disabled'),
  },
  {
    name: 'release + valid production configuration',
    type: 'release',
    signed: true,
    env: { ADMOB_REAL: 'true', ...REAL, ADMOB_ANDROID_REWARDED_BONUS: `ca-app-pub-${P}/4444444444`, ADMOB_UMP_DEBUG_GEOGRAPHY: 'eea' },
    expect: (r) =>
      r.admob_mode === 'production' &&
      r.admob_app_id === REAL.ADMOB_APP_ID_ANDROID &&
      r.admob_rewarded === REAL.ADMOB_ANDROID_REWARDED &&
      r.admob_interstitial === REAL.ADMOB_ANDROID_INTERSTITIAL &&
      r.admob_rewarded_bonus === `ca-app-pub-${P}/4444444444` &&
      r.admob_rewarded_boost === '' &&
      r.admob_ump_debug_geography === '' &&
      r.admob_test_devices === ''
        ? null
        : 'production values not carried exactly',
  },
  {
    name: 'release + production with registered test devices',
    type: 'release',
    signed: true,
    env: { ADMOB_MODE: 'production', ...REAL, ADMOB_TEST_DEVICE_IDS: `${DEVICE}, ${DEVICE.toLowerCase()}` },
    expect: (r) => (r.admob_mode === 'production' && r.admob_test_devices.split(',').length === 2 ? null : 'test devices not carried'),
  },
  { name: 'release + incomplete production IDs', type: 'release', env: { ADMOB_REAL: 'true', ADMOB_APP_ID_ANDROID: REAL.ADMOB_APP_ID_ANDROID }, refused: true },
  { name: 'release + malformed unit', type: 'release', env: { ADMOB_MODE: 'production', ...REAL, ADMOB_ANDROID_REWARDED: 'ca-app-pub-123/456' }, refused: true },
  { name: 'release + malformed app ID (a unit ID)', type: 'release', env: { ADMOB_MODE: 'production', ...REAL, ADMOB_APP_ID_ANDROID: REAL.ADMOB_ANDROID_REWARDED }, refused: true },
  { name: 'release + demo interstitial in production', type: 'release', env: { ADMOB_MODE: 'production', ...REAL, ADMOB_ANDROID_INTERSTITIAL: DEMO.i }, refused: true },
  {
    name: 'release + placeholder publisher',
    type: 'release',
    env: { ADMOB_MODE: 'production', ADMOB_APP_ID_ANDROID: 'ca-app-pub-1234567890123456~1111111111', ADMOB_ANDROID_REWARDED: 'ca-app-pub-1234567890123456/2222222222', ADMOB_ANDROID_INTERSTITIAL: 'ca-app-pub-1234567890123456/3333333333' },
    refused: true,
  },
  { name: 'release + units of another publisher', type: 'release', env: { ADMOB_MODE: 'production', ...REAL, ADMOB_ANDROID_REWARDED_UPGRADE: 'ca-app-pub-6660000011112222/2222222222' }, refused: true },
  { name: 'release + REPLACE_ME left in', type: 'release', env: { ADMOB_MODE: 'production', ...REAL, ADMOB_APP_ID_ANDROID: 'ca-app-pub-REPLACE_ME~REPLACE_ME' }, refused: true },
  { name: 'release + contradictory switches', type: 'release', env: { ADMOB_REAL: 'true', ADMOB_MODE: 'test' }, refused: true },
  { name: 'release + unknown mode', type: 'release', env: { ADMOB_MODE: 'live' }, refused: true },
  { name: 'release + malformed test device', type: 'release', env: { ADMOB_TEST_DEVICE_IDS: 'my-phone' }, refused: true },
  { name: 'release + production, unsigned', type: 'release', env: { ADMOB_MODE: 'production', ...REAL, VERSION_CODE: '10000' }, refused: true },
  { name: 'release + production, no versionCode', type: 'release', env: { ADMOB_MODE: 'production', ...REAL }, refused: true },
  { name: 'release + incomplete signing secrets', type: 'release', env: { ANDROID_KEYSTORE_PATH: '/nonexistent', ANDROID_KEY_ALIAS: 'x' }, refused: true },
];

/** A throwaway keystore for the cases that must pass every release guard. */
let signing: Record<string, string> = {};
function makeKey(): string {
  const dir = mkdtempSync(join(tmpdir(), 'admob-matrix-'));
  const pass = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const path = join(dir, 'matrix.jks');
  execFileSync('keytool', ['-genkeypair', '-keystore', path, '-storetype', 'PKCS12', '-alias', 'matrix', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '1',
    '-dname', 'CN=Crop Crawler Release Test, O=matrix', '-storepass', pass, '-keypass', pass], { stdio: 'ignore' });
  signing = { ANDROID_KEYSTORE_PATH: path, ANDROID_KEYSTORE_PASSWORD: pass, ANDROID_KEY_ALIAS: 'matrix', ANDROID_KEY_PASSWORD: pass, VERSION_CODE: '10000' };
  return dir;
}

/** The environment without anything that could steer the build, plus the case's own variables. */
function envFor(c: Case): NodeJS.ProcessEnv {
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ADMOB_|ANDROID_KEY|VERSION_)/.test(k)));
  return { ...base, ...(c.signed ? signing : {}), ...c.env };
}

function resources(type: string): Res {
  const xml = readFileSync(new URL(`../android/app/build/generated/res/resValues/${type}/values/gradleResValues.xml`, import.meta.url), 'utf8');
  return Object.fromEntries([...xml.matchAll(/<string name="(admob_\w+)"[^>]*>([^<]*)<\/string>/g)].map((m) => [m[1], m[2]]));
}

function run(c: Case): string | null {
  const cap = c.type === 'debug' ? 'Debug' : 'Release';
  const tasks = [`:app:generate${cap}ResValues`, `:app:checkAdMob${cap}`, ...(c.type === 'release' ? [':app:checkReleaseSigning'] : [])];
  const r = spawnSync('./gradlew', ['-q', '--continue', ...tasks], { cwd: ANDROID, env: envFor(c), encoding: 'utf8' });
  const out = `${r.stdout}\n${r.stderr}`;
  if (c.refused) {
    if (r.status === 0) return 'accepted, must be refused';
    return /AdMob release configuration is invalid|Release build refused/.test(out) ? null : 'failed, but not on a release guard';
  }
  if (r.status !== 0) return 'refused, must build';
  return c.expect?.(resources(c.type)) ?? null;
}

function main(): void {
  let failed = 0;
  const keyDir = makeKey();
  try {
    for (const c of CASES) {
      const problem = run(c);
      if (problem) failed++;
      console.log(`${problem ? '✗' : '✓'} ${c.name}${problem ? ` — ${problem}` : ''}`);
    }
  } finally {
    rmSync(keyDir, { recursive: true, force: true });
  }
  console.log(failed ? `${failed} of ${CASES.length} cases FAILED` : `all ${CASES.length} cases passed`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
