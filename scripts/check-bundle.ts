/** Bundle checks: initial JS size budget, ad-provider isolation per flavor, and no ad IDs in any web bundle. */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 350;
const MARKERS: Record<string, string> = {
  admob: 'prepareRewardVideoAd',
  crazygames: 'crazygames-sdk-v3',
  youtube: 'requestRewardedAd',
};
const ALLOWED: Record<string, string[]> = { web: [], native: ['admob'], crazygames: ['crazygames'], youtube: ['youtube'], e2e: [] };

function files(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else out.push(p);
  }
  return out;
}

let failed = false;
for (const flavor of Object.keys(ALLOWED)) {
  const dir = join('dist', flavor);
  if (!existsSync(dir)) continue;
  const all = files(dir);
  const js = all.filter((f) => f.endsWith('.js') && !f.endsWith('sw.js') && !/workbox-/.test(f));
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const entry = [...html.matchAll(/src="\.\/(assets\/[^"]+\.js)"/g)].map((m) => join(dir, m[1]));
  const entryGz = entry.reduce((a, f) => a + gzipSync(readFileSync(f)).length, 0) / 1024;
  const text = js.map((f) => readFileSync(f, 'utf8')).join('\n') + html;
  const present = Object.entries(MARKERS)
    .filter(([, marker]) => text.includes(marker))
    .map(([k]) => k);
  const leaks = present.filter((p) => !ALLOWED[flavor].includes(p));
  // AdMob IDs come only from the native build (android/app/admob.gradle): a shared web bundle must not carry any.
  const adIds = /ca-app-pub-\d/.test(text);
  // Templates (deploy/app-ads.txt.example) never ship inside a build.
  const placeholder = /REPLACE_ME/.test(text);
  const ok = entryGz <= BUDGET_KB && leaks.length === 0 && !adIds && !placeholder;
  if (!ok) failed = true;
  console.log(
    `${ok ? '✓' : '✗'} ${flavor.padEnd(11)} initial JS ${entryGz.toFixed(0)} KB gz (budget ${BUDGET_KB})  providers: ${present.join(', ') || '—'}${leaks.length ? `  LEAK: ${leaks.join(', ')}` : ''}${adIds ? '  AD IDS IN BUNDLE' : ''}${placeholder ? '  REPLACE_ME IN BUNDLE' : ''}`,
  );
}
process.exit(failed ? 1 : 0);
