import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Sim } from '../../game/sim.ts';
import { SIM } from '../../game/config.ts';
import { plotRect } from '../../game/territory.ts';
import { TerritoryView } from './TerritoryView.ts';

interface Internals {
  dress: THREE.InstancedMesh[];
  dressByPlot: { mesh: number; slot: number; x: number; z: number }[][];
}

/** Only claimed plots' dressing is drawn: each item once, inside its plot, and nothing else in range. */
function expectDressedExactly(view: TerritoryView, sim: Sim): number {
  const v = view as unknown as Internals;
  const t = sim.terr;
  const want = v.dress.map(() => new Map<number, { x: number; z: number; p: number }>());
  for (let p = 0; p < t.claimed.length; p++) {
    for (const d of v.dressByPlot[p]) {
      if (!t.claimed[p]) {
        expect(d.slot).toBe(-1);
        continue;
      }
      expect(want[d.mesh].has(d.slot)).toBe(false);
      want[d.mesh].set(d.slot, { x: d.x, z: d.z, p });
    }
  }
  let drawn = 0;
  v.dress.forEach((m, i) => {
    expect(m.count).toBe(want[i].size);
    const a = m.instanceMatrix.array;
    for (const [slot, w] of want[i]) {
      expect(slot).toBeLessThan(m.count);
      expect(a[slot * 16 + 12]).toBeCloseTo(w.x, 4);
      expect(a[slot * 16 + 14]).toBeCloseTo(w.z, 4);
      const [x0, z0, x1, z1] = plotRect(t, w.p, 0);
      expect(w.x > x0 && w.x < x1 && w.z > z0 && w.z < z1).toBe(true);
      // Fully grown once the claim animation is over.
      expect(Math.hypot(a[slot * 16], a[slot * 16 + 1], a[slot * 16 + 2])).toBeGreaterThan(0.5);
    }
    drawn += m.count;
  });
  return drawn;
}

describe('TerritoryView dressing', () => {
  it('draws dressing for claimed plots only, as plots are claimed and after a reload', () => {
    const sim = new Sim();
    sim.state.progress.segments = Array.from({ length: 8 }, (_, i) => ({ id: 100 + i, level: 4 }));
    const view = new TerritoryView(sim, false);
    expectDressedExactly(view, sim);
    let now = 0;
    let claimed = sim.terr.claimedCount;
    for (let k = 0; k < 30 && sim.terr.claimedCount < claimed + 8; k++) {
      sim.execute({ c: 'clearFrontier', n: 2 });
      for (let s = 0; s < 1 / SIM.DT; s++) {
        sim.step(SIM.DT, { throttleHeld: true });
        for (const e of sim.drainEvents()) if (e.t === 'routeGrew') view.onClaimed(e.plots, now);
        now += SIM.DT;
        view.update(now);
      }
    }
    expect(sim.terr.claimedCount).toBeGreaterThan(claimed);
    view.update(now + 2);
    const drawn = expectDressedExactly(view, sim);
    expect(drawn).toBeGreaterThan(0);
    claimed = sim.terr.claimedCount;
    view.rebuild();
    expect(expectDressedExactly(view, sim)).toBe(drawn);
  });
});
