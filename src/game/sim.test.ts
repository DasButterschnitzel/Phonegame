import { describe, it, expect } from 'vitest';
import { Sim, newGameState } from './sim.ts';
import { BODY, MOVE, SIM, capacityOf, power, vMax } from './config.ts';
import { buildBins } from './field.ts';
import { sampleAt } from './path.ts';
import { findMergePair } from './caterpillar.ts';
import { offlineReward } from './economy.ts';
import type { GameState } from './types.ts';

const run = (sim: Sim, seconds: number, held = true) => {
  const n = Math.round(seconds / SIM.DT);
  for (let i = 0; i < n; i++) sim.step(SIM.DT, { throttleHeld: held });
};

function stateHash(st: GameState): string {
  return JSON.stringify([st.coins, st.headS, st.v, st.basket, st.progress, st.rng, st.stats]);
}

describe('movement', () => {
  it('approaches full speed when held and idle crawl when released', () => {
    const sim = new Sim();
    run(sim, 3, true);
    expect(sim.state.v).toBeCloseTo(vMax(1), 1);
    run(sim, 4, false);
    expect(sim.state.v).toBeCloseTo(vMax(1) * MOVE.IDLE_FRAC, 1);
  });
  it('autopilot forces full speed', () => {
    const sim = new Sim();
    sim.enqueue({ c: 'boost', id: 'autopilot', seconds: 60 });
    run(sim, 3, false);
    expect(sim.state.v).toBeCloseTo(vMax(1), 1);
  });
});

describe('proximity bins', () => {
  it('candidate lists contain every crop in reach (vs brute force)', () => {
    const sim = new Sim();
    const { field, path } = sim;
    buildBins(field, path);
    const o = { x: 0, z: 0, tx: 0, tz: 0 };
    for (let k = 0; k < 400; k++) {
      const s = (k * 0.37) % path.length;
      sampleAt(path, s, o);
      const bin = Math.min(field.bins.n - 1, Math.floor(s / field.bins.binLen));
      const set = new Set(field.bins.items.subarray(field.bins.start[bin], field.bins.start[bin + 1]));
      for (let i = 0; i < field.count; i++) {
        if (field.paved[i]) continue;
        if ((field.x[i] - o.x) ** 2 + (field.z[i] - o.z) ** 2 <= BODY.REACH ** 2) expect(set.has(i)).toBe(true);
      }
    }
  });
});

describe('harvest', () => {
  it('per-pass damage is independent of speed (mower model)', () => {
    const dmgAt = (speedLevel: number) => {
      const sim = new Sim();
      sim.state.progress.speedLevel = speedLevel;
      sim.state.progress.capacityLevel = 40; // never full
      const hp0 = Float32Array.from(sim.field.hp);
      // Travel exactly a fixed distance at constant speed.
      sim.state.v = vMax(speedLevel);
      let travelled = 0;
      while (travelled < 10) {
        const before = sim.state.headS;
        sim.step(SIM.DT, { throttleHeld: true });
        travelled += sim.state.headS - before;
      }
      let d = 0;
      for (let i = 0; i < sim.field.count; i++) d += hp0[i] - sim.field.hp[i];
      return d / travelled;
    };
    const slow = dmgAt(1);
    const fast = dmgAt(20);
    expect(Math.abs(slow - fast) / slow).toBeLessThan(0.08);
  });
  it('fills the basket, wastes chunks when full and unloads at the barn', () => {
    const sim = new Sim();
    let full = false;
    let unloads = 0;
    for (let i = 0; i < 30 * 120; i++) {
      sim.step(SIM.DT, { throttleHeld: true });
      for (const e of sim.drainEvents()) {
        if (e.t === 'basketFull') full = true;
        if (e.t === 'unload') unloads++;
      }
      expect(sim.state.basket.mass).toBeLessThanOrEqual(capacityOf(sim.state));
    }
    expect(unloads).toBeGreaterThan(3);
    expect(full).toBe(true);
    expect(sim.state.coins).toBeGreaterThan(0);
  });
  it('unloads exactly once per barn crossing', () => {
    const sim = new Sim();
    sim.enqueue({ c: 'fillBasket', frac: 0.5 });
    const L = sim.path.length;
    let unloads = 0;
    // Exactly 3 laps.
    sim.state.v = 3;
    const start = sim.state.headS;
    while (sim.state.headS < start + 3 * L) {
      sim.step(SIM.DT, { throttleHeld: true });
      for (const e of sim.drainEvents()) if (e.t === 'unload') unloads++;
      sim.enqueue({ c: 'fillBasket', frac: 0.2 });
    }
    expect(unloads).toBe(3);
  });
  it('crops regrow', () => {
    const sim = new Sim();
    sim.state.progress.segments = Array.from({ length: 6 }, (_, i) => ({ id: 100 + i, level: 6 }));
    run(sim, 20);
    expect(sim.field.deadCount).toBeGreaterThan(0);
    run(sim, 200, false);
    // After a long idle stretch most crops that died early have regrown.
    let alive = 0;
    for (let i = 0; i < sim.field.count; i++) if (sim.field.regrowAt[i] === 0) alive++;
    expect(alive / sim.field.count).toBeGreaterThan(0.85);
  });
});

describe('upgrades', () => {
  it('add / merge / speed / capacity follow the rules', () => {
    const sim = new Sim();
    sim.enqueue({ c: 'grantCoins', amount: 1e6, reason: 'debug' });
    sim.enqueue({ c: 'buy', id: 'merge' });
    run(sim, SIM.DT);
    expect(sim.drainEvents().some((e) => e.t === 'buyFailed')).toBe(true);
    sim.enqueue({ c: 'buy', id: 'add' });
    sim.enqueue({ c: 'buy', id: 'add' });
    sim.enqueue({ c: 'buy', id: 'merge' });
    run(sim, SIM.DT);
    const ev = sim.drainEvents();
    const merged = ev.find((e) => e.t === 'merged');
    expect(merged && merged.t === 'merged' && merged.level === 2 && merged.firstTime).toBe(true);
    expect(sim.state.progress.segments.map((s) => s.level)).toEqual([2, 1]);
    expect(sim.state.maxLevelReached).toBe(2);
    sim.enqueue({ c: 'buy', id: 'speed' });
    sim.enqueue({ c: 'buy', id: 'capacity' });
    run(sim, SIM.DT);
    expect(sim.state.progress.speedLevel).toBe(2);
    expect(sim.state.progress.capacityLevel).toBe(2);
  });
  it('merge picks the lowest pair and the rearmost two', () => {
    const segs = [
      { id: 1, level: 3 },
      { id: 2, level: 3 },
      { id: 3, level: 2 },
      { id: 4, level: 1 },
      { id: 5, level: 2 },
      { id: 6, level: 2 },
    ];
    expect(findMergePair(segs)).toEqual({ level: 2, a: 4, b: 5 });
  });
  it('costs increase and ADD respects the stage cap', () => {
    const sim = new Sim();
    sim.enqueue({ c: 'grantCoins', amount: 1e9, reason: 'debug' });
    let last = 0;
    for (let i = 0; i < 20; i++) {
      const c = sim.check('add').cost;
      expect(c).toBeGreaterThanOrEqual(last);
      last = c;
      sim.enqueue({ c: 'buy', id: 'add' });
      run(sim, SIM.DT);
    }
    expect(sim.state.progress.segments.length).toBe(sim.farm.stages[0].maxSegments);
    expect(sim.check('add').reason).toBe('maxSegments');
  });
  it('expand changes the loop and finish unlocks the next farm; travel keeps coins', () => {
    const sim = new Sim();
    sim.enqueue({ c: 'grantCoins', amount: 1e12, reason: 'debug' });
    for (let k = 0; k < 3; k++) sim.enqueue({ c: 'buy', id: 'expand' });
    run(sim, SIM.DT);
    expect(sim.state.progress.stage).toBe(3);
    expect(sim.check('expand').reason).toBe('finalStage');
    sim.enqueue({ c: 'buy', id: 'finish' });
    run(sim, SIM.DT);
    expect(sim.state.completedFarms).toEqual(['meadow']);
    expect(sim.state.unlockedFarms).toContain('pumpkin');
    const coins = sim.state.coins;
    sim.enqueue({ c: 'travel', farm: 'pumpkin' });
    run(sim, SIM.DT);
    expect(sim.state.farmId).toBe('pumpkin');
    expect(sim.state.progress.stage).toBe(0);
    expect(sim.state.coins).toBeGreaterThanOrEqual(coins);
    // Going back restores meadow progress.
    sim.enqueue({ c: 'travel', farm: 'meadow' });
    run(sim, SIM.DT);
    expect(sim.state.progress.stage).toBe(3);
  });
});

describe('tornado', () => {
  it('harvests crops around the head and may overflow capacity', () => {
    const sim = new Sim();
    sim.state.tornadoes = 1;
    sim.enqueue({ c: 'useTornado' });
    run(sim, SIM.DT, false);
    const ev = sim.drainEvents().find((e) => e.t === 'tornado');
    expect(ev && ev.t === 'tornado' && ev.crops.length).toBeGreaterThan(10);
    expect(sim.state.basket.mass).toBeGreaterThan(capacityOf(sim.state));
    expect(sim.state.tornadoes).toBe(0);
  });
});

describe('economy', () => {
  it('offline reward respects minimum, efficiency and cap', () => {
    const st = newGameState();
    st.economy.ema = 10;
    expect(offlineReward(st, 30).coins).toBe(0);
    expect(offlineReward(st, 3600).coins).toBe(18000);
    expect(offlineReward(st, 99999).seconds).toBe(7200);
    st.economy.passive.meadow = 1;
    expect(offlineReward(st, 100).coins).toBe(600);
  });
  it('power grows 2.4× per level', () => {
    expect(power(2) / power(1)).toBeCloseTo(2.4);
  });
});

describe('determinism', () => {
  it('same seed + inputs → identical state', () => {
    const script = (sim: Sim) => {
      for (let i = 0; i < 30 * 240; i++) {
        if (i % 300 === 0) {
          sim.enqueue({ c: 'buy', id: 'add' });
          sim.enqueue({ c: 'buy', id: 'merge' });
          sim.enqueue({ c: 'buy', id: 'capacity' });
        }
        sim.step(SIM.DT, { throttleHeld: i % 200 < 150 });
        sim.drainEvents();
      }
      return stateHash(sim.state);
    };
    expect(script(new Sim(newGameState(42)))).toBe(script(new Sim(newGameState(42))));
  });
});
