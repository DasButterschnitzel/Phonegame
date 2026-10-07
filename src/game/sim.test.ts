import { describe, it, expect } from 'vitest';
import { Sim, newGameState } from './sim.ts';
import { BODY, MOVE, SIM, TERRITORY, capacityOf, power, vMax } from './config.ts';
import { sampleAt } from './path.ts';
import { bodyOffset, findMergePair } from './caterpillar.ts';
import { offlineReward } from './economy.ts';
import type { GameState, SimEvent } from './types.ts';

const run = (sim: Sim, seconds: number, held = true, onEvent?: (e: SimEvent) => void) => {
  const n = Math.round(seconds / SIM.DT);
  for (let i = 0; i < n; i++) {
    sim.step(SIM.DT, { throttleHeld: held });
    const ev = sim.drainEvents();
    if (onEvent) for (const e of ev) onEvent(e);
  }
};

function stateHash(st: GameState): string {
  return JSON.stringify([st.coins, st.headS, st.v, st.basket, st.depot, st.progress, st.rng, st.stats]);
}

/** Nothing left to chomp (isolates depot behaviour from harvesting and route growth). */
function barren(sim: Sim) {
  sim.field.dead.fill(1);
}

function strongCaterpillar(sim: Sim, n = 6, level = 6) {
  sim.state.progress.segments = Array.from({ length: n }, (_, i) => ({ id: 100 + i, level }));
}

describe('movement', () => {
  it('approaches full speed when held and idle crawl when released', () => {
    const sim = new Sim();
    run(sim, 3, true);
    expect(sim.state.v).toBeGreaterThan(vMax(1) * 0.8);
    run(sim, 5, false);
    expect(sim.state.v).toBeLessThan(vMax(1) * MOVE.IDLE_FRAC * 1.05);
  });
  it('autopilot forces full speed', () => {
    const sim = new Sim();
    sim.enqueue({ c: 'boost', id: 'autopilot', seconds: 60 });
    run(sim, 3, false);
    expect(sim.state.v).toBeGreaterThan(vMax(1) * 0.8);
  });
});

describe('proximity bins', () => {
  it('candidate lists contain every alive crop of an open zone in reach (vs brute force)', () => {
    const sim = new Sim();
    const { field, path } = sim;
    const o = { x: 0, z: 0, tx: 0, tz: 0 };
    for (let k = 0; k < 400; k++) {
      const s = (k * 0.37) % path.length;
      sampleAt(path, s, o);
      const bin = Math.min(field.bins.n - 1, Math.floor(s / field.bins.binLen));
      const set = new Set(field.bins.items.subarray(field.bins.start[bin], field.bins.start[bin + 1]));
      for (let i = 0; i < field.count; i++) {
        if (field.dead[i] || field.tier[i] > sim.state.progress.zone) continue;
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
  it('a full basket takes no bites: crops hold, nothing is wasted, chomping resumes after unloading', () => {
    const sim = new Sim();
    strongCaterpillar(sim, 3, 8);
    sim.state.progress.capacityLevel = 1;
    let full = 0;
    let chunkValue = 0;
    let paid = 0;
    run(sim, 120, true, (e) => {
      if (e.t === 'basketFull') full++;
      if (e.t === 'chunk') chunkValue += e.value;
      if (e.t === 'unloadSeg') paid += e.value;
    });
    expect(full).toBeGreaterThan(0);
    expect(sim.state.basket.mass).toBeLessThanOrEqual(capacityOf(sim.state) + 1e-9);
    // Every harvested chunk is either paid out or still in the basket.
    expect(paid + sim.state.basket.value).toBeCloseTo(chunkValue, 6);
    expect(sim.state.coins).toBeCloseTo(paid, 6);
  });
  it('crops never grow back', () => {
    const sim = new Sim();
    strongCaterpillar(sim);
    run(sim, 40);
    const dead = sim.field.deadCount;
    expect(dead).toBeGreaterThan(20);
    const deadSet = Uint8Array.from(sim.field.dead);
    run(sim, 600, false, (e) => expect((e as { t: string }).t).not.toBe('regrow'));
    for (let i = 0; i < sim.field.count; i++) if (deadSet[i]) expect(sim.field.dead[i]).toBe(1);
    expect(sim.field.deadCount).toBeGreaterThanOrEqual(dead);
  });
  it('fenced crops of closed zones are never touched', () => {
    const sim = new Sim();
    strongCaterpillar(sim, 10, 12);
    sim.state.progress.capacityLevel = 40;
    run(sim, 300);
    for (let i = 0; i < sim.field.count; i++) if (sim.field.tier[i] > 0) expect(sim.field.hp[i]).toBe(sim.field.maxHp[i]);
  });
});

describe('route growth', () => {
  it('a cleared plot joins the territory after the anticipation beat; the head never jumps', () => {
    const sim = new Sim();
    const claimed0 = sim.terr.claimedCount;
    const L0 = sim.path.length;
    sim.execute({ c: 'clearFrontier', n: 1 });
    let ready = -1;
    let grew = -1;
    let jump = 0;
    const t0 = sim.state.simTime;
    for (let i = 0; i < 30 * 20 && grew < 0; i++) {
      const before = sim.headPosition({ x: 0, z: 0, tx: 0, tz: 0 });
      sim.step(SIM.DT, { throttleHeld: false });
      const after = sim.headPosition({ x: 0, z: 0, tx: 0, tz: 0 });
      jump = Math.max(jump, Math.hypot(after.x - before.x, after.z - before.z));
      for (const e of sim.drainEvents()) {
        if (e.t === 'plotReady' && ready < 0) ready = sim.state.simTime;
        if (e.t === 'routeGrew') {
          grew = sim.state.simTime;
          expect(e.prevLength).toBeCloseTo(L0, 3);
        }
      }
    }
    expect(grew).toBeGreaterThan(0);
    expect(grew - t0).toBeGreaterThanOrEqual(TERRITORY.CLAIM_DELAY_S - 1e-6);
    expect(sim.terr.claimedCount).toBe(claimed0 + 1);
    expect(sim.path.length).toBeGreaterThan(L0);
    expect(jump).toBeLessThan(0.5);
  });
  it('the territory spreads through every zone without softlocking (strong caterpillar, free gates)', () => {
    const sim = new Sim();
    strongCaterpillar(sim, 10, 14);
    sim.state.progress.capacityLevel = 60;
    sim.state.progress.speedLevel = 15;
    for (let k = 0; k < 40 && !sim.check('finish').ok; k++) {
      run(sim, 30);
      if (sim.check('expand').ok && sim.check('expand').cost === 0) sim.execute({ c: 'buy', id: 'expand' });
    }
    expect(sim.state.progress.zone).toBe(3);
    expect(sim.cleared).toBeGreaterThanOrEqual(TERRITORY.FINISH_AT);
    expect(sim.check('finish')).toMatchObject({ ok: true, cost: 0 });
  });
});

describe('depot (rolling unload)', () => {
  it('each segment unloads its share as it passes the chute; coins equal the unloaded value', () => {
    const sim = new Sim();
    barren(sim);
    strongCaterpillar(sim, 5, 1);
    sim.state.basket.mass = 50;
    sim.state.basket.value = 500;
    sim.state.basket.massByTier = [50, 0, 0, 0, 0];
    sim.state.progress.capacityLevel = 40;
    const segs: number[] = [];
    let start: Extract<SimEvent, { t: 'unloadStart' }> | null = null;
    let end = 0;
    const coins0 = sim.state.coins;
    let paidFirst = 0;
    for (let i = 0; i < 30 * 60 && !end; i++) {
      sim.step(SIM.DT, { throttleHeld: true });
      for (const e of sim.drainEvents()) {
        if (e.t === 'unloadStart' && !start) {
          start = e;
          paidFirst = sim.state.coins;
        }
        if (e.t === 'unloadSeg' && start) segs.push(e.value);
        if (e.t === 'unload' && start) end = e.value;
      }
    }
    expect(start?.segs).toBe(5);
    expect(segs.length).toBe(5);
    expect(segs.reduce((a, b) => a + b, 0)).toBeCloseTo(500, 6);
    expect(end).toBeCloseTo(500, 6);
    expect(sim.state.coins - coins0).toBeCloseTo(500 + 0, 0);
    // Rolling, not instant: the first payment lands before the last segment reaches the chute.
    expect(paidFirst - coins0).toBeLessThan(500);
  });
  it('high speed: never pays twice, never skips a segment', () => {
    const sim = new Sim();
    barren(sim);
    strongCaterpillar(sim, 12, 1);
    sim.state.progress.speedLevel = MOVE.MAX_LVL;
    sim.state.progress.capacityLevel = 60;
    let started = 0;
    let segs = 0;
    let ends = 0;
    let paid = 0;
    let filled = 0;
    for (let i = 0; i < 30 * 90; i++) {
      if (i % 45 === 0) {
        filled += 40;
        sim.state.basket.mass += 40;
        sim.state.basket.value += 40;
        sim.state.basket.massByTier[0] += 40;
      }
      sim.step(1 / 10, { throttleHeld: true });
      for (const e of sim.drainEvents()) {
        if (e.t === 'unloadStart') started++;
        if (e.t === 'unloadSeg') (segs++, (paid += e.value));
        if (e.t === 'unload') ends++;
      }
    }
    expect(started).toBeGreaterThan(3);
    expect(ends).toBeGreaterThanOrEqual(started - 1);
    expect(segs).toBeGreaterThanOrEqual(ends * 12);
    // Value conservation: everything ever loaded is paid or still aboard.
    expect(paid + sim.state.basket.value).toBeGreaterThan(filled * 0.999);
  });
  it('one pass per chute crossing; the pass length follows the caterpillar length', () => {
    const sim = new Sim();
    barren(sim);
    strongCaterpillar(sim, 4, 1);
    const L = sim.path.length;
    sim.state.v = 3;
    let passes = 0;
    const start = sim.state.headS;
    let dist0 = -1;
    let distEnd = -1;
    while (sim.state.headS < start + 3 * L) {
      sim.enqueue({ c: 'fillBasket', frac: 0.3 });
      sim.step(SIM.DT, { throttleHeld: true });
      for (const e of sim.drainEvents()) {
        if (e.t === 'unloadStart' && ++passes === 1) dist0 = sim.state.odometer;
        if (e.t === 'unload' && passes === 1) distEnd = sim.state.odometer;
      }
    }
    expect(passes).toBe(3);
    expect(distEnd - dist0).toBeGreaterThan(bodyOffset(4) - 0.5);
    expect(distEnd - dist0).toBeLessThan(bodyOffset(4) + 0.5);
  });
  it('travelling mid-unload pays out the rest at once', () => {
    const sim = new Sim();
    barren(sim);
    strongCaterpillar(sim, 8, 1);
    sim.state.unlockedFarms.push('pumpkin');
    sim.state.basket.mass = 80;
    sim.state.basket.value = 800;
    sim.state.basket.massByTier = [80, 0, 0, 0, 0];
    sim.state.progress.capacityLevel = 40;
    for (let i = 0; i < 30 * 60 && !sim.state.depot.active; i++) (sim.step(SIM.DT, { throttleHeld: true }), sim.drainEvents());
    expect(sim.state.depot.active).toBe(true);
    sim.execute({ c: 'travel', farm: 'pumpkin' });
    expect(sim.state.coins).toBeCloseTo(800, 3);
    expect(sim.state.depot.active).toBe(false);
  });
});

describe('upgrades and zones', () => {
  it('add / merge / speed / capacity follow the rules', () => {
    const sim = new Sim();
    sim.enqueue({ c: 'grantCoins', amount: 1e6, reason: 'debug' });
    sim.enqueue({ c: 'buy', id: 'merge' });
    run(sim, SIM.DT);
    sim.enqueue({ c: 'buy', id: 'add' });
    sim.enqueue({ c: 'buy', id: 'add' });
    sim.enqueue({ c: 'buy', id: 'merge' });
    const ev: SimEvent[] = [];
    run(sim, SIM.DT, true, (e) => ev.push(e));
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
  it('costs increase and ADD respects the zone cap', () => {
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
    expect(sim.state.progress.segments.length).toBeLessThanOrEqual(sim.farm.maxSegments[0]);
    expect(sim.check('add').reason).toBe('maxSegments');
  });
  it('EXPAND opens fences for coins or for free once cleared; FINISH needs a cleared farm', () => {
    const sim = new Sim();
    expect(sim.check('expand').cost).toBeGreaterThan(0);
    expect(sim.check('finish').reason).toBe('notCleared');
    sim.enqueue({ c: 'grantCoins', amount: 1e12, reason: 'debug' });
    const ev: SimEvent[] = [];
    sim.enqueue({ c: 'buy', id: 'expand' });
    run(sim, SIM.DT, true, (e) => ev.push(e));
    expect(sim.state.progress.zone).toBe(1);
    expect(ev.find((e) => e.t === 'zoneOpened')).toMatchObject({ zone: 1, free: false });
    // Clearing the open area makes the next fence free.
    const f = sim.field;
    for (let i = 0; i < f.count; i++) if (f.tier[i] <= 1) ((f.dead[i] = 1), sim.terr.zoneDead[f.tier[i]]++);
    expect(sim.check('expand')).toMatchObject({ ok: true, cost: 0 });
    sim.execute({ c: 'buy', id: 'expand' });
    sim.execute({ c: 'buy', id: 'expand' });
    expect(sim.state.progress.zone).toBe(3);
    expect(sim.check('expand').reason).toBe('finalZone');
    expect(sim.check('finish').reason).toBe('notCleared');
  });
  it('finish unlocks the next farm; travel keeps coins and each farm keeps its cleared land', () => {
    const sim = new Sim();
    strongCaterpillar(sim);
    run(sim, 60);
    sim.execute({ c: 'clearFrontier', n: 2 });
    run(sim, 10);
    const claimed = sim.terr.claimedCount;
    const dead = sim.field.deadCount;
    expect(claimed).toBeGreaterThan(8);
    sim.state.unlockedFarms.push('pumpkin');
    const coins = sim.state.coins;
    sim.execute({ c: 'travel', farm: 'pumpkin' });
    expect(sim.state.farmId).toBe('pumpkin');
    expect(sim.state.progress.zone).toBe(0);
    expect(sim.state.coins).toBeGreaterThanOrEqual(coins);
    sim.execute({ c: 'travel', farm: 'meadow' });
    expect(sim.terr.claimedCount).toBe(claimed);
    expect(sim.field.deadCount).toBe(dead);
  });
});

describe('tornado', () => {
  it('destroys every open crop around the head, overfills the basket and pays the rest at once', () => {
    const sim = new Sim();
    sim.state.tornadoes = 1;
    sim.enqueue({ c: 'useTornado' });
    let ev: SimEvent | undefined;
    let paid = 0;
    run(sim, SIM.DT, false, (e) => {
      if (e.t === 'tornado') ev = e;
      if (e.t === 'coins' && e.reason === 'tornado') paid += e.delta;
    });
    expect(ev && ev.t === 'tornado' && ev.crops.length).toBeGreaterThan(15);
    if (ev?.t === 'tornado') for (const i of ev.crops) expect(sim.field.dead[i]).toBe(1);
    expect(sim.state.basket.mass).toBeGreaterThan(capacityOf(sim.state));
    expect(paid).toBeGreaterThan(0);
    expect(sim.state.coins).toBeCloseTo(paid, 6);
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
    expect(offlineReward(st, 100).coins).toBe(550);
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
      return stateHash(sim.state) + sim.terr.claimed.join('');
    };
    expect(script(new Sim(newGameState(42)))).toBe(script(new Sim(newGameState(42))));
  });
});
