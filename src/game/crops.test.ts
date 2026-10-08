import { describe, expect, it } from 'vitest';
import { CROP_FITS } from './crops.ts';
import { FARMS } from './farms/index.ts';
import { buildField } from './field.ts';
import { crop as cropCfg } from './config.ts';

describe('crop sizes', () => {
  it('every size fills a plot with the same HP and value as nine small crops', () => {
    for (const f of Object.values(CROP_FITS)) expect(f.k * f.k * f.chunks * f.scale).toBeCloseTo(27, 9);
  });

  it('a field of small, large and huge crops: same HP and value per plot, crops spread inside their plot', () => {
    const base = FARMS.meadow;
    const mixed = { ...base, fits: [CROP_FITS.small, CROP_FITS.large, CROP_FITS.huge, CROP_FITS.large] as const };
    const a = buildField(base);
    const b = buildField(mixed);
    const l = base.layout;
    for (let p = 0; p < l.cols * l.rows; p++) {
      const z = l.zone[p];
      if (z < 0 || l.start[p]) continue;
      const sum = (f: typeof a) => {
        let hp = 0;
        let value = 0;
        for (let i = f.plotStart[p]; i < f.plotStart[p + 1]; i++) {
          hp += f.maxHp[i];
          value += f.chunks[i] * cropCfg.chunkValue(f.tier[i]) * f.chunkScale[f.tier[i]];
        }
        return { hp, value, n: f.plotStart[p + 1] - f.plotStart[p] };
      };
      const sa = sum(a);
      const sb = sum(b);
      expect(sb.n).toBe(mixed.fits[z].k ** 2);
      expect(sb.hp).toBeCloseTo(sa.hp, 3);
      expect(sb.value).toBeCloseTo(sa.value, 6);
      const c = p % l.cols;
      const r = (p - c) / l.cols;
      for (let i = b.plotStart[p]; i < b.plotStart[p + 1]; i++) {
        expect(b.x[i]).toBeGreaterThan(l.x0 + c * l.plot + 0.4);
        expect(b.x[i]).toBeLessThan(l.x0 + (c + 1) * l.plot - 0.4);
        expect(b.z[i]).toBeGreaterThan(l.z0 + r * l.plot + 0.4);
        expect(b.z[i]).toBeLessThan(l.z0 + (r + 1) * l.plot - 0.4);
      }
    }
    // Small-crop farms are exactly what they were.
    expect(Array.from(a.chunks).every((n) => n === 3)).toBe(true);
  });
});
