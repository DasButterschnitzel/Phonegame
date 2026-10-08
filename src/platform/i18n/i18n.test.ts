import { describe, it, expect } from 'vitest';
import { en } from './en.ts';
import { de } from './de.ts';
import { t, setLang } from './i18n.ts';
import { CROP_IDS } from '../../game/crops.ts';
import { NAME_COUNT, readyBiomes } from '../../game/world/biomes.ts';

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
    expect(t('hud.cleared', { n: 42 })).toBe('42% cleared');
    setLang('de');
    expect(t('up.add')).toBe('NEU');
    setLang('en');
  });
  it('every crop and every scheduled biome has its texts in both languages', () => {
    const all: Record<string, string>[] = [en, de];
    for (const dict of all) {
      for (const id of CROP_IDS) expect(dict[`crop.${id}`], `crop.${id}`).toBeTruthy();
      const seen = new Set<string>();
      for (const b of readyBiomes()) {
        expect(dict[`biome.${b.id}`], `biome.${b.id}`).toBeTruthy();
        const names = (dict[`names.${b.id}`] ?? '').split('|').filter(Boolean);
        expect(names.length, `names.${b.id}`).toBe(NAME_COUNT);
        // Curated names never repeat, within a biome or across biomes.
        for (const n of names) {
          expect(seen.has(n), `${n} (names.${b.id})`).toBe(false);
          seen.add(n);
        }
      }
    }
  });
});
