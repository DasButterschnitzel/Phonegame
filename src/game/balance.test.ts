import { describe, it, expect } from 'vitest';
import { Sim, newGameState } from './sim.ts';
import type { UpgradeId } from './types.ts';

/** Cheap pacing smoke test (the full report is `npm run balance`): a naive cheapest-first player on Meadow. */
describe('balance smoke', () => {
  it('early milestones happen in time', () => {
    const sim = new Sim(newGameState(99));
    const st = sim.state;
    let firstAdd = Infinity;
    let firstMerge = Infinity;
    let stage2 = Infinity;
    const dt = 1 / 15;
    let acc = 0;
    while (st.simTime < 12 * 60) {
      sim.step(dt, { throttleHeld: st.simTime % 7 < 6 });
      for (const e of sim.drainEvents()) {
        if (e.t === 'segAdded') firstAdd = Math.min(firstAdd, st.simTime);
        if (e.t === 'merged') firstMerge = Math.min(firstMerge, st.simTime);
        if (e.t === 'stageChanged') stage2 = Math.min(stage2, st.simTime);
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
    expect(firstMerge).toBeLessThan(240);
    expect(stage2).toBeLessThan(11 * 60);
  });
});
