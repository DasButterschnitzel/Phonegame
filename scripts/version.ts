/**
 * Android versionCode from the semantic version in package.json, and the monotonic check for production builds:
 *   node scripts/version.ts [--build 0..99] [--check-tags] [--github-output]
 *
 * versionCode = major·1 000 000 + minor·10 000 + patch·100 + build   (0.1.0 → 10000, 1.2.3 build 4 → 1020304)
 * `build` re-uploads the same version (a rejected upload, a signing fix); anything else bumps the version.
 * Every production build is tagged play-<versionCode> by the release workflow; --check-tags refuses a code that is
 * not higher than every existing tag, because Google Play rejects a versionCode it has seen before.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Google Play's ceiling for versionCode. */
export const MAX_VERSION_CODE = 2_100_000_000;

export function versionCode(version: string, build = 0): number {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`version "${version}" is not MAJOR.MINOR.PATCH`);
  const [major, minor, patch] = m.slice(1).map(Number);
  if (minor > 99 || patch > 99) throw new Error('minor and patch must be 0..99');
  if (!Number.isInteger(build) || build < 0 || build > 99) throw new Error('build must be 0..99');
  const code = major * 1_000_000 + minor * 10_000 + patch * 100 + build;
  if (code < 1 || code > MAX_VERSION_CODE) throw new Error(`versionCode ${code} is outside 1..${MAX_VERSION_CODE}`);
  return code;
}

/** The highest versionCode already built for production (from play-<code> tags), or 0. */
export function highestTagged(tags: string[]): number {
  return tags.reduce((max, t) => {
    const m = /^play-(\d+)$/.exec(t.trim());
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
}

function main(): void {
  const args = process.argv.slice(2);
  const i = args.indexOf('--build');
  const build = i >= 0 ? Number(args[i + 1]) : 0;
  const version = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
  const code = versionCode(version, build);
  if (args.includes('--check-tags')) {
    const tags = execFileSync('git', ['tag', '--list', 'play-*'], { encoding: 'utf8' }).split('\n');
    const top = highestTagged(tags);
    if (code <= top) {
      console.error(`versionCode ${code} (version ${version}, build ${build}) is not higher than play-${top}: bump the version in package.json or the build number.`);
      process.exit(1);
    }
  }
  if (args.includes('--github-output') && process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `version_code=${code}\nversion_name=${version}\n`);
  }
  console.log(JSON.stringify({ version, build, versionCode: code }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
