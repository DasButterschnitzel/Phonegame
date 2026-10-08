import { describe, it, expect } from 'vitest';
import { Sim, newGameState } from './sim.ts';
import type { UpgradeId } from './types.ts';
import { PROFILES, runBot } from './bot/bot.ts';
import { MOVE, speedMilestone, vMax } from './config.ts';

/** Cheap pacing smoke test (the full report is `npm run balance`): a naive cheapest-first player on Meadow. */
describe('balance smoke', () => {
  it('early milestones happen in time', () => {
    const sim = new Sim(newGameState(99));
    const st = sim.state;
    let firstAdd = Infinity;
    let firstMerge = Infinity;
    let stage2 = Infinity;
    let firstGrowth = Infinity;
    const dt = 1 / 15;
    let acc = 0;
    while (st.simTime < 12 * 60) {
      sim.step(dt, { throttleHeld: st.simTime % 7 < 6 });
      for (const e of sim.drainEvents()) {
        if (e.t === 'segAdded') firstAdd = Math.min(firstAdd, st.simTime);
        if (e.t === 'merged') firstMerge = Math.min(firstMerge, st.simTime);
        if (e.t === 'zoneOpened') stage2 = Math.min(stage2, st.simTime);
        if (e.t === 'routeGrew') firstGrowth = Math.min(firstGrowth, st.simTime);
      }
      acc += dt;
      if (acc < 1) continue;
      acc = 0;
      if (sim.check('expand').ok) {
        sim.execute({ c: 'buy', id: 'expand' });
        continue;
      }
      const opts = (['add', 'merge', 'speed', 'capacity'] as UpgradeId[])
        .map((id) => ({ id, c: sim.check(id) }))
        .filter((o) => o.c.ok)
        .sort((a, b) => a.c.cost - b.c.cost);
      // Save once EXPAND is within reach.
      if (opts[0] && st.coins - opts[0].c.cost > sim.check('expand').cost * 0.5) sim.execute({ c: 'buy', id: opts[0].id });
      else if (opts[0] && sim.check('expand').cost > st.coins * 4) sim.execute({ c: 'buy', id: opts[0].id });
    }
    expect(firstAdd).toBeLessThan(60);
    expect(firstGrowth).toBeLessThan(120);
    expect(firstMerge).toBeLessThan(360);
    expect(stage2).toBeLessThan(8 * 60);
  });
});

describe('balance targets (bots on Meadow; the full report is `npm run balance -- --profile all --bands`)', () => {
  const opts = { farms: 1, startFarm: 'meadow' as const, minutes: 240, dt: 1 / 15, seed: 1234 };
  const active = runBot(PROFILES.active, opts);
  const noAds = runBot(PROFILES.noAds, opts);
  const f = active.farms[0];
  const rate = (names: string[]) => {
    const bs = f.bands.filter((b) => names.includes(b.name) && b.seconds > 5);
    return bs.reduce((s, b) => s + b.clearPerMin * b.seconds, 0) / bs.reduce((s, b) => s + b.seconds, 0);
  };

  it('completion: an active player finishes Meadow in 15–24 min; without ads at most 20 % slower', () => {
    expect(f.finished).toBe(true);
    expect(f.seconds).toBeGreaterThan(15 * 60);
    expect(f.seconds).toBeLessThan(24 * 60);
    expect(noAds.farms[0].finished).toBe(true);
    expect(noAds.farms[0].seconds).toBeLessThan(f.seconds * 1.2);
  });

  it('no waiting room: the late game clears at least ~3/4 as fast as the first half, with events every < 60 s', () => {
    expect(rate(['70–80%', '80–90%'])).toBeGreaterThan(rate(['0–25%', '25–50%']) * 0.7);
    for (const b of f.bands.filter((x) => x.name === '70–80%' || x.name === '80–90%')) expect(b.longestEventGap).toBeLessThan(60);
  });

  it('afford gap: never more than 90 s with nothing in the shop affordable', () => {
    expect(f.longestDrought).toBeLessThan(90);
    expect(noAds.farms[0].longestDrought).toBeLessThan(90);
  });

  it('SPEED: every level is felt (≥ 7 %, milestones ≥ 14 %) and late levels take ≤ 2 min of income to save for', () => {
    for (let L = 1; L < MOVE.MAX_LVL; L++) {
      const gain = vMax(L + 1) / vMax(L) - 1;
      expect(gain).toBeGreaterThanOrEqual(0.069);
      if (speedMilestone(L + 1)) expect(gain).toBeGreaterThanOrEqual(0.14);
    }
    const saves: number[] = [];
    runBot(PROFILES.active, {
      ...opts,
      sampleEvery: 30,
      onSample: (sim) => {
        if (sim.cleared < 0.5 || sim.state.progress.speedLevel >= MOVE.MAX_LVL) return;
        saves.push(sim.check('speed').cost / Math.max(1, sim.state.economy.ema));
      },
    });
    saves.sort((a, b) => a - b);
    expect(saves.length).toBeGreaterThan(5);
    expect(saves[Math.floor(saves.length / 2)]).toBeLessThan(120);
  });

  it('no softlock: casual and idle players finish too', () => {
    expect(runBot(PROFILES.casual, opts).farms[0].finished).toBe(true);
    expect(runBot(PROFILES.idle, { ...opts, dt: 1 / 10 }).farms[0].finished).toBe(true);
  });
});
