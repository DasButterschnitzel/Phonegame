import { describe, expect, it } from 'vitest';
import { Sim } from '../sim.ts';
import { WORLD } from '../config.ts';
import type { FarmKey, SimEvent } from '../types.ts';
import { STARTER_FARMS } from '../types.ts';
import { FARMS_PER_TOUR, STARTER_COUNT, firstOrdinalOfTour, parseWorldKey, planFarm, tourOf } from './plan.ts';
import { checkMap, generateBlueprint } from './generate.ts';
import { readyBiomes } from './biomes.ts';
import { serialize } from '../save/serialize.ts';
import { parseSave } from '../save/migrations.ts';
import { newMeta } from '../save/schema.ts';

/** Clears the farm you are on and presses FINISH (debug commands, no yield). */
export function finishHere(sim: Sim): SimEvent[] {
  sim.execute({ c: 'grantCoins', amount: 1e15, reason: 'debug' });
  while (sim.state.progress.zone < 3) sim.execute({ c: 'buy', id: 'expand' });
  sim.execute({ c: 'clearAll' });
  sim.execute({ c: 'buy', id: 'finish' });
  return sim.drainEvents();
}

/** Travels to the journey's next destination (or the next starter farm). */
export function goNext(sim: Sim): SimEvent[] {
  const st = sim.state;
  const next: FarmKey | undefined = sim.nextDestination ?? STARTER_FARMS.find((f) => f !== st.farmId && st.unlockedFarms.includes(f) && !st.completedFarms.includes(f));
  if (!next) throw new Error('no destination');
  sim.execute({ c: 'travel', farm: next });
  return sim.drainEvents();
}

const reload = (sim: Sim): Sim => {
  const res = parseSave(JSON.stringify(serialize(sim, newMeta(1000), {}, 2000)), 3000);
  if (!res.ok) throw new Error(res.reason);
  return new Sim(res.save.game);
};

describe('World Tour plan', () => {
  it('numbers farms into Tours: the Starter Tour is #1–#5, then eight per Tour', () => {
    expect(tourOf(1)).toEqual({ tour: 0, slot: 0 });
    expect(tourOf(5)).toEqual({ tour: 0, slot: 4 });
    expect(tourOf(6)).toEqual({ tour: 1, slot: 0 });
    expect(tourOf(13)).toEqual({ tour: 1, slot: FARMS_PER_TOUR - 1 });
    expect(tourOf(14)).toEqual({ tour: 2, slot: 0 });
    expect(firstOrdinalOfTour(3)).toBe(STARTER_COUNT + 1 + 2 * FARMS_PER_TOUR);
  });
  it('is deterministic per journey seed, with unique keys that describe their farm', () => {
    const keys = new Set<string>();
    for (let o = 6; o < 1006; o++) {
      const p = planFarm(1234567, o);
      expect(planFarm(1234567, o)).toEqual(p);
      expect(keys.has(p.key)).toBe(false);
      keys.add(p.key);
      expect(parseWorldKey(p.key)).toEqual({ ordinal: o, biome: p.biome, seed: p.seed });
      expect(p.showcase).toBe(p.slot === FARMS_PER_TOUR - 1);
    }
    expect(planFarm(42, 6).key).not.toBe(planFarm(43, 6).key);
  });
  it('never repeats a biome within four farms, even across Tours', () => {
    if (readyBiomes().length < 5) return;
    for (const seed of [1, 99, 123456]) {
      const seq = Array.from({ length: 400 }, (_, i) => planFarm(seed, 6 + i).biome);
      for (let i = 0; i < seq.length; i++) for (let k = 1; k <= 4 && i + k < seq.length; k++) expect(seq[i + k]).not.toBe(seq[i]);
    }
  });
  it('generates valid, deterministic layouts', () => {
    for (let o = 6; o < 106; o++) {
      const p = planFarm(777, o);
      const a = generateBlueprint(p);
      expect(generateBlueprint(p)).toEqual(a);
      expect(checkMap(a.map, a.size).ok).toBe(true);
    }
  });
});

describe('journey', () => {
  it('Starter Tour → World Tour: Core Rank 1, a recalibrated bank, forward-only travel, Tour after Tour', () => {
    const sim = new Sim();
    for (let i = 0; i < STARTER_COUNT; i++) {
      const ev = finishHere(sim);
      const fin = ev.find((e) => e.t === 'farmFinished');
      expect(fin && fin.t === 'farmFinished' && fin.next).toBeTruthy();
      if (i < STARTER_COUNT - 1) {
        expect(fin && fin.t === 'farmFinished' && fin.tourDone).toBe(null);
        goNext(sim);
      } else {
        // Cactus Ranch closes the Starter Tour: the journey goes on.
        expect(fin && fin.t === 'farmFinished' && fin.tourDone).toBe(0);
        expect(sim.state.journey.tours).toBe(1);
        expect(sim.state.journey.seed).not.toBe(0);
        expect(fin && fin.t === 'farmFinished' && fin.next).toBe(planFarm(sim.state.journey.seed, 6).key);
      }
    }
    // Still on Cactus Ranch: the starter farms can be revisited until you set off.
    expect(sim.canTravel('meadow')).toBe(true);
    const ev = goNext(sim);
    const tr = ev.find((e) => e.t === 'traveled');
    expect(tr && tr.t === 'traveled' && tr.newTour).toBe(true);
    expect(sim.farm.ordinal).toBe(6);
    expect(sim.state.coins).toBe(WORLD.START_COINS);
    expect(sim.state.farmsProgress).toEqual({});
    expect(sim.state.economy.passive).toEqual({});
    expect(sim.state.progress.bp?.key).toBe(sim.state.farmId);
    // Forward only.
    expect(sim.canTravel('meadow')).toBe(false);
    expect(sim.nextDestination).toBe(null);
    // Through Tour 1 into Tour 2.
    for (let o = 6; o <= 13; o++) {
      const fin = finishHere(sim).find((e) => e.t === 'farmFinished');
      expect(fin && fin.t === 'farmFinished' && fin.tourDone).toBe(o === 13 ? 1 : null);
      const t2 = goNext(sim).find((e) => e.t === 'traveled');
      expect(t2 && t2.t === 'traveled' && t2.newTour).toBe(o === 13);
    }
    expect(sim.farm.ordinal).toBe(14);
    expect(sim.farm.tour).toBe(2);
    expect(sim.state.journey.tours).toBe(2);
    expect(sim.state.coins).toBe(WORLD.START_COINS);
    expect(sim.state.journey.completed).toBe(13);
  });
  it('a World Tour farm survives save and reload exactly; 100 farms keep the save small', () => {
    const sim = new Sim();
    for (let i = 0; i < STARTER_COUNT; i++) {
      finishHere(sim);
      goNext(sim);
    }
    for (let k = 0; k < 30; k++) sim.step(1 / 30, { throttleHeld: true });
    sim.execute({ c: 'clearFrontier', n: 3 });
    for (let k = 0; k < 90; k++) sim.step(1 / 30, { throttleHeld: true });
    sim.drainEvents();
    const sim2 = reload(sim);
    expect(sim2.state.farmId).toBe(sim.state.farmId);
    expect(sim2.farm.map).toEqual(sim.farm.map);
    expect(sim2.field.deadCount).toBe(sim.field.deadCount);
    expect(Array.from(sim2.terr.claimed)).toEqual(Array.from(sim.terr.claimed));
    // Journey of 100 farms: the save holds the live farm and a few stamps, not a history.
    let s = sim2;
    while (s.farm.ordinal < 100) {
      finishHere(s);
      goNext(s);
    }
    const json = JSON.stringify(serialize(s, newMeta(1), {}, 2));
    expect(s.state.journey.recent.length).toBeLessThanOrEqual(6);
    expect(Object.keys(s.state.farmsProgress).length).toBe(0);
    expect(json.length).toBeLessThan(40_000);
  });
});
