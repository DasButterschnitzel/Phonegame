import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GOOGLE_TAG_ID, checkAppAds } from './check-app-ads.ts';

const PUB = 'pub-5550000011112222';

describe('app-ads.txt check', () => {
  it('refuses the committed template: REPLACE_ME can never pass as valid', () => {
    const r = checkAppAds(readFileSync(new URL('../deploy/app-ads.txt.example', import.meta.url), 'utf8'));
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toContain('REPLACE_ME');
  });

  it('accepts a well-formed AdMob record, with comments and other networks', () => {
    const r = checkAppAds(`# app-ads.txt\ngoogle.com, ${PUB}, DIRECT, ${GOOGLE_TAG_ID}\nexample-network.com, 12345, RESELLER\ncontact=ads@example.org\n`, PUB);
    expect(r).toEqual({ ok: true, problems: [], publishers: [PUB] });
  });

  it('refuses demo and placeholder publishers, malformed IDs and a wrong certification ID', () => {
    for (const line of [
      `google.com, pub-3940256099942544, DIRECT, ${GOOGLE_TAG_ID}`,
      `google.com, pub-0000000000000000, DIRECT, ${GOOGLE_TAG_ID}`,
      `google.com, pub-1234567890123456, DIRECT, ${GOOGLE_TAG_ID}`,
      `google.com, pub-123, DIRECT, ${GOOGLE_TAG_ID}`,
      `google.com, ca-app-pub-5550000011112222, DIRECT, ${GOOGLE_TAG_ID}`,
      `google.com, ${PUB}, DIRECT, 0000000000000000`,
      `google.com, ${PUB}, OWNER, ${GOOGLE_TAG_ID}`,
      `google.com ${PUB} DIRECT`,
    ]) {
      expect(checkAppAds(line).ok, line).toBe(false);
    }
  });

  it('refuses an empty file and a file without the expected publisher', () => {
    expect(checkAppAds('# nothing here\n').ok).toBe(false);
    const r = checkAppAds(`google.com, ${PUB}, DIRECT, ${GOOGLE_TAG_ID}`, 'pub-6660000011112222');
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual(['the expected AdMob publisher is not listed']);
  });
});
