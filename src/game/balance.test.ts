import { describe, it, expect } from 'vitest';
import { Sim, newGameState } from './sim.ts';
import type { UpgradeId } from './types.ts';
import { PROFILES, lateGameStats, runBot } from './bot/bot.ts';
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

  it('completion: without ads Meadow takes 15–24 min; each rewarded ×2 saves roughly 1–3 min', () => {
    const n = noAds.farms[0];
    expect(n.finished).toBe(true);
    expect(n.seconds).toBeGreaterThan(15 * 60);
    expect(n.seconds).toBeLessThan(24 * 60);
    expect(f.finished).toBe(true);
    expect(active.adsWatched).toBeGreaterThan(0);
    const perAd = (n.seconds - f.seconds) / active.adsWatched;
    expect(perAd).toBeGreaterThan(40);
    expect(perAd).toBeLessThan(200);
  });

  it('no waiting room: over three seeds the late game clears about as fast as the mid game, events every < 75 s', () => {
    const late = lateGameStats('noAds', 1, 'meadow', 240, 1 / 15, [1234, 2345, 3456]);
    expect(late.ratioMedian).toBeGreaterThan(0.85);
    expect(late.ratioWorst).toBeGreaterThan(0.5);
    expect(late.gapWorst).toBeLessThan(75);
  });

  it('afford gap: never more than ~2 min with nothing in the shop affordable', () => {
    expect(f.longestDrought).toBeLessThan(120);
    expect(noAds.farms[0].longestDrought).toBeLessThan(120);
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
