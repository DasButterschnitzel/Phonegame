import { describe, expect, it } from 'vitest';
import type { BiomeId, FarmStamp, Journey } from '../types.ts';
import { STARTER_FARMS } from '../types.ts';
import { newJourney } from './journey.ts';
import { FARMS_PER_TOUR, planFarm, tourOf } from './plan.ts';
import { TRAIL_AHEAD, TRAIL_BEHIND, buildTrail, type TrailHere } from './trail.ts';

const SEED = 0x1234abcd;
const STATES = new Set(['done', 'current', 'next', 'future']);
const isFinale = (o: number) => o > 5 && tourOf(o).slot === FARMS_PER_TOUR - 1;

const hereOf = (o: number, finished = false): TrailHere => {
  const p = planFarm(SEED, o);
  return { key: p.key, ordinal: o, tour: p.tour, slot: p.slot, biome: p.biome, name: p.name, size: p.size, modifier: p.modifier, showcase: p.showcase, finished };
};
const stampOf = (o: number): FarmStamp => {
  if (o <= 5) return { key: STARTER_FARMS[o - 1], ordinal: o, biome: STARTER_FARMS[o - 1], name: -1, seconds: 600 };
  const p = planFarm(SEED, o);
  return { key: p.key, ordinal: o, biome: p.biome, name: p.name, seconds: 600, showcase: p.showcase };
};
/** A journey that has played every farm up to #o (o itself finished or not). */
function journeyAt(o: number, finished: boolean): Journey {
  const j = newJourney();
  j.seed = SEED;
  const done = finished ? o : o - 1;
  j.completed = done;
  j.ordinal = Math.max(6, done + 1);
  j.tours = done < 5 ? 0 : 1 + Math.floor((done - 5) / FARMS_PER_TOUR);
  const biomes = new Set<BiomeId>();
  for (let k = 1; k <= o; k++) biomes.add(stampOf(k).biome);
  j.biomes = [...biomes];
  for (let k = Math.max(1, done - 5); k <= done; k++) j.recent.push(stampOf(k));
  return j;
}

describe('journey trail (the map)', () => {
  it('the Starter Tour: its five farms in order, the World Tour at its end, never a grey locked row', () => {
    const j = newJourney();
    const fresh = buildTrail(j, { key: 'meadow', ordinal: 1, tour: 0, slot: 0, biome: 'meadow', name: -1, size: null, modifier: null, showcase: false, finished: false }, [], ['meadow']);
    expect(fresh.nodes.map((n) => n.state)).toEqual(['current', 'future', 'future', 'future', 'future']);
    expect(fresh).toMatchObject({ tour: 0, farms: 5, done: 0, hereSlot: 0, worldTeaser: true, milestone: null });
    // Two farms done, on the third.
    const mid = buildTrail(j, { key: 'sunflower', ordinal: 3, tour: 0, slot: 2, biome: 'sunflower', name: -1, size: null, modifier: null, showcase: false, finished: false }, ['meadow', 'pumpkin'], ['meadow', 'pumpkin', 'sunflower']);
    expect(mid.nodes.map((n) => n.state)).toEqual(['done', 'done', 'current', 'future', 'future']);
    expect(mid.done).toBe(2);
    // Gone back to the meadow: the farm waiting to be finished is the next stop.
    const back = buildTrail(j, { key: 'meadow', ordinal: 1, tour: 0, slot: 0, biome: 'meadow', name: -1, size: null, modifier: null, showcase: false, finished: true }, ['meadow', 'pumpkin'], ['meadow', 'pumpkin', 'sunflower']);
    expect(back.nodes.map((n) => n.state)).toEqual(['current', 'done', 'next', 'future', 'future']);
    for (const n of [...fresh.nodes, ...mid.nodes, ...back.nodes]) expect(STATES.has(n.state)).toBe(true);
  });

  it('on a World farm: three behind, where you are, five ahead and the Tour finale', () => {
    for (const o of [6, 7, 8, 9, 12, 13, 14, 21, 50, 1003]) {
      for (const finished of [false, true]) {
        const t = buildTrail(journeyAt(o, finished), hereOf(o, finished), [], []);
        const behind = t.nodes.filter((n) => n.state === 'done');
        const ahead = t.nodes.filter((n) => n.state === 'next' || n.state === 'future');
        expect(behind.length, `#${o}`).toBe(Math.min(TRAIL_BEHIND, o - 1));
        expect(t.nodes.filter((n) => n.state === 'current').map((n) => n.ordinal)).toEqual([o]);
        expect(ahead.map((n) => n.ordinal), `#${o}`).toEqual(Array.from({ length: TRAIL_AHEAD }, (_, i) => o + 1 + i));
        expect(ahead[0].state).toBe('next');
        expect(behind.map((n) => n.ordinal)).toEqual(Array.from({ length: behind.length }, (_, i) => o - behind.length + i));
        // The next finale shows exactly once: among the farms ahead, or as the milestone beyond them.
        const finales = [...ahead, ...(t.milestone ? [t.milestone] : [])].filter((n) => isFinale(n.ordinal));
        expect(finales.length, `#${o}`).toBe(1);
        expect(finales[0].showcase).toBe(true);
        if (t.milestone) expect(t.milestone.ordinal).toBeGreaterThan(o + TRAIL_AHEAD);
        // Bounded: at most 3 + 1 + 5 nodes and one milestone, however long the journey.
        expect(t.nodes.length + (t.milestone ? 1 : 0)).toBeLessThanOrEqual(TRAIL_BEHIND + 1 + TRAIL_AHEAD + 1);
        // Tour pips: the slot you are on, and how many of the Tour's farms are done.
        expect(t).toMatchObject({ tour: tourOf(o).tour, farms: 8, hereSlot: tourOf(o).slot, done: tourOf(o).slot + (finished ? 1 : 0) });
      }
    }
  });

  it('NEW BIOME: the next stop names its new family, further ones stay a mystery until then', () => {
    const j = journeyAt(6, false);
    j.biomes = [...STARTER_FARMS, planFarm(SEED, 6).biome];
    const t = buildTrail(j, hereOf(6), [], []);
    const ahead = t.nodes.filter((n) => n.state === 'next' || n.state === 'future');
    expect(ahead.some((n) => n.newBiome)).toBe(true);
    for (const n of ahead) {
      expect(n.newBiome).toBe(!j.biomes.includes(n.biome));
      expect(n.mystery).toBe(n.newBiome && n.state === 'future');
    }
    // A family you have been to is never "new".
    j.biomes = [...new Set([...j.biomes, ...ahead.map((n) => n.biome), t.milestone?.biome ?? 'meadow'])];
    const again = buildTrail(j, hereOf(6), [], []);
    expect([...again.nodes, again.milestone].filter((n) => n?.newBiome)).toEqual([]);
  });

  it('on a starter farm once the World Tour is open, the map points into World Tour 1', () => {
    const j = journeyAt(5, true);
    const t = buildTrail(j, { key: 'desert', ordinal: 5, tour: 0, slot: 4, biome: 'desert', name: -1, size: null, modifier: null, showcase: false, finished: true }, [...STARTER_FARMS], [...STARTER_FARMS]);
    expect(t).toMatchObject({ tour: 1, farms: 8, done: 0, hereSlot: -1, worldTeaser: false });
    expect(t.nodes.filter((n) => n.state === 'done').map((n) => n.key)).toEqual(['pumpkin', 'sunflower', 'snowyberry']);
    expect(t.nodes.find((n) => n.state === 'next')?.ordinal).toBe(6);
    expect(t.milestone?.ordinal).toBe(13);
  });

  it('a journey of thousands of farms reads only its last stamps (the map stays the same size)', () => {
    const j = journeyAt(4005, true);
    expect(j.recent.length).toBeLessThanOrEqual(6);
    const t = buildTrail(j, hereOf(4005, true), [], []);
    expect(t.nodes.length).toBe(TRAIL_BEHIND + 1 + TRAIL_AHEAD);
    expect(t.nodes.at(-1)?.ordinal).toBe(4005 + TRAIL_AHEAD);
  });
});
