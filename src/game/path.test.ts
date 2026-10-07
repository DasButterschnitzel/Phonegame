import { describe, it, expect } from 'vitest';
import { buildLoop, sampleAt, nearestS, arcDelta } from './path.ts';

describe('path', () => {
  const p = buildLoop([[-6, 4], [-6, -4], [6, -4], [6, 4]], 2.5, 0.25, [0, 4]);
  it('has expected length (rectangle minus fillet savings)', () => {
    const expected = 2 * (12 + 8) - 4 * (2 * 2.5 - (Math.PI / 2) * 2.5);
    expect(Math.abs(p.length - expected)).toBeLessThan(0.05);
  });
  it('is uniformly sampled and closed', () => {
    for (let i = 0; i < p.n; i++) {
      const j = (i + 1) % p.n;
      const d = Math.hypot(p.x[j] - p.x[i], p.z[j] - p.z[i]);
      expect(Math.abs(d - p.ds)).toBeLessThan(p.ds * 0.02);
    }
  });
  it('samples with wrap and unit tangents', () => {
    const o = { x: 0, z: 0, tx: 0, tz: 0 };
    sampleAt(p, p.length * 3 + 1.0, o);
    const o2 = { x: 0, z: 0, tx: 0, tz: 0 };
    sampleAt(p, 1.0, o2);
    expect(o.x).toBeCloseTo(o2.x, 4);
    expect(Math.hypot(o.tx, o.tz)).toBeCloseTo(1, 4);
  });
  it('finds the barn on the path', () => {
    const o = sampleAt(p, p.barnS, { x: 0, z: 0, tx: 0, tz: 0 });
    expect(Math.hypot(o.x - 0, o.z - 4)).toBeLessThan(0.2);
    expect(nearestS(p, o.x, o.z)).toBeCloseTo(p.barnS, 3);
  });
  it('computes signed arc deltas', () => {
    expect(arcDelta(p, 1, 2)).toBeCloseTo(1);
    expect(arcDelta(p, 2, 1)).toBeCloseTo(-1);
    expect(arcDelta(p, p.length - 0.5, 0.5)).toBeCloseTo(1);
  });
});
