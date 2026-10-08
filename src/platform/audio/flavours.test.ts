import { describe, expect, it } from 'vitest';
import { AMBIENCE_KINDS, FLAVOURS, bassNote, flavourOf, type MusicFlavour } from './flavours.ts';
import { readyBiomes } from '../../game/world/biomes.ts';
import { STARTER_FARMS } from '../../game/types.ts';

const families = [...new Set([...STARTER_FARMS, ...readyBiomes().map((b) => b.id)])];

/** The ways two tunes differ (a family must never be another's tune with a new name). */
function differences(a: MusicFlavour, b: MusicFlavour): string[] {
  const out: string[] = [];
  if (Math.abs(a.bpm - b.bpm) >= 4) out.push('tempo');
  if (a.roots.join() !== b.roots.join()) out.push('key');
  if (a.scale.join() !== b.scale.join()) out.push('scale');
  if (a.pattern.join() !== b.pattern.join()) out.push('melody');
  if (a.lead !== b.lead) out.push('timbre');
  if (Math.abs(a.leadLen - b.leadLen) >= 0.04 || a.fills !== b.fills || a.bassEvery !== b.bassEvery) out.push('feel');
  return out;
}

describe('music flavours', () => {
  it('every family has its own flavour and ambience', () => {
    for (const id of families) {
      expect(FLAVOURS[id], id).toBeTruthy();
      expect(AMBIENCE_KINDS, id).toContain(flavourOf(id).ambience?.kind);
    }
  });

  it('Sunny Meadow keeps the original tune', () => {
    const m = flavourOf('meadow');
    expect([m.bpm, m.roots, m.scale, m.pattern, m.lead, m.leadLen, m.bassEvery, m.sparkle, m.fills, m.gain]).toEqual([
      92,
      [60, 65, 67, 64],
      [0, 2, 4, 7, 9, 12, 14, 16],
      [0, 2, 4, 2, 5, 4, 2, 1],
      'triangle',
      0.22,
      2,
      { type: 'square', oct: 12, vol: 0.12 },
      false,
      1,
    ]);
  });

  it('melodies stay in their scale and in a register phone speakers play', () => {
    for (const id of families) {
      const f = flavourOf(id);
      expect(f.roots.length, id).toBe(4);
      expect(f.pattern.length, id).toBe(8);
      for (const s of f.pattern) expect(s >= 0 && s < f.scale.length, `${id} step ${s}`).toBe(true);
      for (const r of f.roots) {
        // Melody between E3 and G6, bass never under C3, accents under C7.
        expect(r + Math.min(...f.pattern.map((s) => f.scale[s])), id).toBeGreaterThanOrEqual(52);
        expect(r + Math.max(...f.pattern.map((s) => f.scale[s])), id).toBeLessThanOrEqual(91);
        expect(bassNote(r), id).toBeGreaterThanOrEqual(48);
        expect(r + (f.sparkle?.oct ?? 0), id).toBeLessThanOrEqual(96);
      }
      expect(f.gain, id).toBeGreaterThan(0.5);
      expect(f.gain, id).toBeLessThanOrEqual(1);
    }
  });

  it('no family plays another family’s tune (at least two differences)', () => {
    const weak: string[] = [];
    for (let i = 0; i < families.length; i++)
      for (let j = i + 1; j < families.length; j++) {
        const d = differences(flavourOf(families[i]), flavourOf(families[j]));
        if (d.length < 2) weak.push(`${families[i]} ~ ${families[j]}: ${d.join(', ') || 'identical'}`);
      }
    expect(weak).toEqual([]);
  });

  it('the bass stays an octave down unless that falls under C3', () => {
    expect(bassNote(64)).toBe(52);
    expect(bassNote(60)).toBe(48);
    expect(bassNote(57)).toBe(57);
  });
});
