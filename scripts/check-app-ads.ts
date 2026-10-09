/**
 * Checks an app-ads.txt before (or after) it goes live on the developer website:
 *   node scripts/check-app-ads.ts path/to/app-ads.txt [--publisher pub-<16 digits>]
 *   node scripts/check-app-ads.ts --url https://butterweich.media/app-ads.txt [--publisher …]
 *
 * Refuses the template (REPLACE_ME), demo and placeholder publishers, malformed lines and a wrong Google
 * certification authority ID. Prints no publisher ID — only whether the expected one is present.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Google's certification authority ID for AdMob records. */
export const GOOGLE_TAG_ID = 'f08c47fec0942fa0';
const DEMO_PUBLISHER = '3940256099942544';
const PLACEHOLDER = /^(\d)\1{15}$|^1234567890123456$|^0123456789012345$/;

export interface AppAdsResult {
  ok: boolean;
  problems: string[];
  /** AdMob publisher IDs found (pub-…); never printed by the CLI. */
  publishers: string[];
}

export function checkAppAds(text: string, expectedPublisher?: string): AppAdsResult {
  const problems: string[] = [];
  const publishers: string[] = [];
  if (/REPLACE_ME/i.test(text)) problems.push('still contains REPLACE_ME: this is the template, not a real app-ads.txt');
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line || /^[a-z]+=/i.test(line)) return; // comments, blank lines, variables (contact=, subdomain=, ownerdomain=…)
    const f = line.split(',').map((x) => x.trim());
    if (f.length < 3 || f.length > 4) return void problems.push(`line ${i + 1}: expected "domain, account ID, DIRECT|RESELLER[, certification ID]"`);
    const [domain, account, relation, cert] = f;
    if (!/^(DIRECT|RESELLER)$/i.test(relation)) problems.push(`line ${i + 1}: relationship must be DIRECT or RESELLER`);
    if (domain.toLowerCase() !== 'google.com') return;
    const m = /^pub-(\d{16})$/.exec(account);
    if (!m) return void problems.push(`line ${i + 1}: google.com needs a publisher ID of the form pub-<16 digits>`);
    if (m[1] === DEMO_PUBLISHER) problems.push(`line ${i + 1}: Google's demo publisher, not yours`);
    else if (PLACEHOLDER.test(m[1])) problems.push(`line ${i + 1}: a placeholder publisher ID`);
    if (cert !== GOOGLE_TAG_ID) problems.push(`line ${i + 1}: google.com records end with ${GOOGLE_TAG_ID}`);
    publishers.push(account);
  });
  if (!publishers.length) problems.push('no google.com record for an AdMob publisher');
  if (expectedPublisher && !publishers.includes(expectedPublisher)) problems.push('the expected AdMob publisher is not listed');
  return { ok: problems.length === 0, problems, publishers };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const at = (k: string) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const url = at('url');
  const file = url ? undefined : args.find((a) => !a.startsWith('--'));
  if (!url && !file) {
    console.error('usage: check-app-ads.ts <file> | --url <https://…/app-ads.txt> [--publisher pub-…]');
    process.exit(2);
  }
  let text: string;
  if (url) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
      console.error(`✗ ${url} answered HTTP ${res.status}`);
      process.exit(1);
    }
    if (!/^text\/plain/i.test(res.headers.get('content-type') ?? '')) console.warn(`! served as "${res.headers.get('content-type')}", should be text/plain`);
    text = await res.text();
  } else {
    text = readFileSync(file!, 'utf8');
  }
  const r = checkAppAds(text, at('publisher'));
  for (const p of r.problems) console.log(`✗ ${p}`);
  console.log(r.ok ? `✓ app-ads.txt is well-formed (${r.publishers.length} AdMob record${r.publishers.length === 1 ? '' : 's'}${at('publisher') ? ', expected publisher present' : ''})` : '✗ app-ads.txt is NOT ready');
  process.exit(r.ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
