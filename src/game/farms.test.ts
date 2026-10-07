import { describe, it, expect } from 'vitest';
import { FARMS, type FarmDef } from './farms/index.ts';
import { buildField, buildRoute } from './field.ts';
import { BODY, FIELD } from './config.ts';
import { chainLength } from './caterpillar.ts';
import { sampleAt } from './path.ts';
import { isFrontier, isSimple, keepsRouteTidy, keepsSimpleLoop, newTerritory, type Territory } from './territory.ts';
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

/** Closest approach of two stretches of the loop that are more than `window` apart along it. */
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

function checkRoute(farm: FarmDef, t: Territory): void {
  expect(isSimple(t)).toBe(true);
  const p = buildRoute(farm, t);
  // Smooth (fillets), no self-overlap of the caterpillar's width, passes the depot.
  expect(minTurnRadius(p)).toBeGreaterThan(FIELD.CORNER_R - 0.15);
  expect(minNonAdjacentGap(p, 7)).toBeGreaterThan(2.4);
  const b = sampleAt(p, p.barnS, { x: 0, z: 0, tx: 0, tz: 0 });
  expect(Math.hypot(b.x - farm.barn.x, b.z - farm.barn.z)).toBeLessThan(0.3);
}

/** Seeded LCG for claim-order fuzzing (test-only). */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/**
 * Claims plots in a random order under the game's rules (zone by zone; tidy rules honoured when possible, as the grace
 * period would eventually waive them). Returns the share of each zone's plots that could be claimed.
 */
function claimAll(farm: FarmDef, rnd: () => number, onClaim?: (t: Territory) => void): number[] {
  const t = newTerritory(farm.layout);
  const l = farm.layout;
  const got = [0, 0, 0, 0];
  for (let zone = 0; zone < 4; zone++) {
    for (;;) {
      const cands: number[] = [];
      for (let p = 0; p < t.claimed.length; p++) if (isFrontier(t, p, zone) && keepsSimpleLoop(t, p)) cands.push(p);
      if (!cands.length) break;
      const tidy = cands.filter((p) => keepsRouteTidy(t, p, zone));
      const pool = tidy.length ? tidy : cands;
      const p = pool[Math.floor(rnd() * pool.length)];
      t.claimed[p] = 1;
      t.claimedCount++;
      got[l.zone[p]]++;
      onClaim?.(t);
    }
  }
  return got.map((g, z) => g / l.zonePlots[z]);
}

describe.each(Object.values(FARMS))('farm $id', (farm) => {
  const l = farm.layout;
  it('layout: depot on the outer edge, zones sized as designed, start route fits the first caterpillar', () => {
    expect(l.start[l.depotPlot]).toBe(1);
    const total = l.zonePlots.reduce((a, b) => a + b, 0);
    l.zonePlots.forEach((n, z) => expect(Math.abs(n / total - farm.zoneShare[z])).toBeLessThan(0.03));
    const t = newTerritory(l);
    checkRoute(farm, t);
    const p = buildRoute(farm, t);
    expect(p.length).toBeGreaterThan(28);
    expect(p.length).toBeLessThan(50);
    expect(chainLength(farm.maxSegments[0])).toBeLessThan(p.length + 30);
  });
  it('every crop of the start ring is in reach and the field is a sensible size', () => {
    const f = buildField(farm);
    expect(f.count).toBeGreaterThan(800);
    expect(f.count).toBeLessThan(1500);
    const p = buildRoute(farm, newTerritory(l));
    // The first lap must have plenty to chomp.
    let reach = 0;
    for (let i = 0; i < f.count; i++) {
      for (let s = 0; s < p.n; s += 2) {
        if ((p.x[s] - f.x[i]) ** 2 + (p.z[s] - f.z[i]) ** 2 < BODY.REACH ** 2) {
          reach++;
          break;
        }
      }
    }
    expect(reach).toBeGreaterThan(30);
  });
  it('no softlock: in any claim order every zone can be (almost) fully claimed and every route is valid', () => {
    for (let seed = 1; seed <= 12; seed++) {
      let k = 0;
      const shares = claimAll(farm, lcg(seed * 7919 + farm.index), (t) => {
        // Validating every route is slow; sample them (always the first few).
        if (k++ < 6 || k % 9 === 0) checkRoute(farm, t);
      });
      for (const s of shares) expect(s).toBeGreaterThanOrEqual(0.97);
    }
  });
  it('the fully cleared farm is one valid loop that fits the longest caterpillar', () => {
    let last: Territory | null = null;
    claimAll(farm, lcg(5), (tt) => (last = tt));
    checkRoute(farm, last!);
    expect(chainLength(farm.maxSegments[3])).toBeLessThan(buildRoute(farm, last!).length - 4);
  });
});
