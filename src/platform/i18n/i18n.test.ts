import { describe, it, expect } from 'vitest';
import { en } from './en.ts';
import { de } from './de.ts';
import { t, setLang } from './i18n.ts';

const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');

describe('i18n', () => {
  it('German has every key with the same placeholders', () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(de[k], k).toBeTruthy();
      expect(ph(de[k]), k).toBe(ph(en[k]));
    }
  });
  it('interpolates and switches language', () => {
    setLang('en');
    expect(t('hud.stage', { n: 2 })).toBe('Stage 2/4');
    setLang('de');
    expect(t('up.add')).toBe('NEU');
    setLang('en');
  });
});
