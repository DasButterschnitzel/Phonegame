import { describe, it, expect } from 'vitest';
import { FARMS } from './farms/index.ts';
import { farmPaths, buildField } from './field.ts';
import { BODY } from './config.ts';
import { chainLength } from './caterpillar.ts';
import { sampleAt } from './path.ts';
import type { PathTable } from './types.ts';

function minTurnRadius(p: PathTable): number {
  let min = Infinity;
  const k = 4; // compare tangents 1 unit apart
  for (let i = 0; i < p.n; i++) {
    const j = (i + k) % p.n;
    const dot = p.tx[i] * p.tx[j] + p.tz[i] * p.tz[j];
    const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
    if (ang > 1e-3) min = Math.min(min, (k * p.ds) / ang);
  }
  return min;
}

function minNonAdjacentGap(p: PathTable, window: number): number {
  let min = Infinity;
  const w = Math.ceil(window / p.ds);
  for (let i = 0; i < p.n; i += 2) {
    for (let j = 0; j < p.n; j += 2) {
      const di = Math.min(Math.abs(i - j), p.n - Math.abs(i - j));
      if (di < w) continue;
      const d = Math.hypot(p.x[i] - p.x[j], p.z[i] - p.z[j]);
      if (d < min) min = d;
    }
  }
  return min;
}

describe.each(Object.values(FARMS))('farm $id', (farm) => {
  const paths = farmPaths(farm);
  it('stages grow, are smooth, simple, pass the barn and fit their segment cap', () => {
    let prev = 0;
    paths.forEach((p, k) => {
      expect(p.length).toBeGreaterThan(prev);
      prev = p.length;
      expect(minTurnRadius(p)).toBeGreaterThan(2.0);
      // Non-adjacent stretches never closer than the caterpillar's width (no self-intersection / overlap).
      expect(minNonAdjacentGap(p, 8)).toBeGreaterThan(2.4);
      const b = sampleAt(p, p.barnS, { x: 0, z: 0, tx: 0, tz: 0 });
      expect(Math.hypot(b.x - farm.barn.x, b.z - farm.barn.z)).toBeLessThan(0.3);
      expect(chainLength(farm.stages[k].maxSegments)).toBeLessThan(p.length - 4);
    });
  });
  it('generates a reasonable field with every tier reachable', () => {
    const f = buildField(farm, 0);
    expect(f.count).toBeGreaterThan(400);
    expect(f.count).toBeLessThan(3000);
    for (let k = 0; k < 4; k++) {
      // Stage k must have crops of tier k within reach of its loop.
      const p = paths[k];
      let n = 0;
      for (let i = 0; i < f.count; i++) {
        if (f.tier[i] !== k || f.pavedAt[k][i]) continue;
        for (let s = 0; s < p.n; s += 2) {
          if ((p.x[s] - f.x[i]) ** 2 + (p.z[s] - f.z[i]) ** 2 < BODY.REACH ** 2) {
            n++;
            break;
          }
        }
      }
      expect(n).toBeGreaterThan(20);
    }
  });
});
