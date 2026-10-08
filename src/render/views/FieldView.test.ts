import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Sim } from '../../game/sim.ts';
import { SIM } from '../../game/config.ts';
import { FieldView } from './FieldView.ts';

interface Internals {
  tiers: { intact: THREE.InstancedMesh; bitten: THREE.InstancedMesh; n: number; crop: Int32Array }[];
  inst: Uint32Array;
  stage: Uint8Array;
  bslot: Int32Array;
}

const m = new THREE.Matrix4();
const p = new THREE.Vector3();
const q = new THREE.Quaternion();
const s = new THREE.Vector3();

/**
 * The intact meshes draw exactly the untouched living crops — each once, at its own spot; every other slot in range is
 * a zero-scale hole waiting for the next repack (and there are only a few) — and the bitten meshes exactly the bitten
 * ones: packing the buffers must not change what is on screen.
 */
function expectDrawnExactly(view: FieldView, sim: Sim): number {
  const f = sim.field;
  const v = view as unknown as Internals;
  let drawn = 0;
  for (let t = 0; t < v.tiers.length; t++) {
    const { intact, bitten } = v.tiers[t];
    const want: number[] = [];
    for (let i = 0; i < f.count; i++) if (f.tier[i] === t && !f.dead[i] && v.stage[i] === 0 && v.bslot[i] < 0) want.push(i);
    expect(intact.count).toBeGreaterThanOrEqual(want.length);
    expect(intact.count - want.length).toBeLessThanOrEqual(Math.max(16, intact.count * 0.15));
    const used = new Set<number>();
    for (const i of want) {
      const k = v.inst[i];
      expect(k).toBeLessThan(intact.count);
      expect(used.has(k)).toBe(false);
      used.add(k);
      intact.getMatrixAt(k, m);
      m.decompose(p, q, s);
      expect(p.x).toBeCloseTo(f.x[i], 4);
      expect(p.z).toBeCloseTo(f.z[i], 4);
      expect(s.y).toBeGreaterThan(0.3);
    }
    // (Raw elements: Matrix4.decompose reports scale 1 for a singular matrix.)
    const a = intact.instanceMatrix.array;
    for (let k = 0; k < intact.count; k++) {
      if (used.has(k)) continue;
      let sum = 0;
      for (let e = 0; e < 11; e++) sum += Math.abs(a[k * 16 + e]);
      expect(sum).toBe(0);
    }
    // Every bitten crop that is still standing is in the bitten list.
    for (let i = 0; i < f.count; i++) if (f.tier[i] === t && !f.dead[i] && v.stage[i] > 0) expect(v.tiers[t].crop[v.bslot[i]]).toBe(i);
    drawn += intact.count + bitten.count;
  }
  return drawn;
}

function crawl(sim: Sim, view: FieldView, seconds: number): void {
  for (let k = 0; k < seconds / SIM.DT; k++) {
    sim.step(SIM.DT, { throttleHeld: true });
    sim.drainEvents();
    view.update(sim.state.simTime);
  }
}

describe('FieldView instance packing', () => {
  it('draws exactly the crops that are there while the field is eaten, cleared, reopened and reloaded', () => {
    const sim = new Sim();
    sim.state.progress.segments = Array.from({ length: 8 }, (_, i) => ({ id: 100 + i, level: 4 }));
    const view = new FieldView(sim);
    const v = view as unknown as Internals;
    const total = v.tiers.reduce((a, t) => a + t.intact.count, 0);
    expect(expectDrawnExactly(view, sim)).toBe(total);
    crawl(sim, view, 20);
    expectDrawnExactly(view, sim);
    // Big kills (cleared plots, a new field) force repacks.
    sim.execute({ c: 'clearFrontier', n: 4 });
    crawl(sim, view, 5);
    expectDrawnExactly(view, sim);
    sim.execute({ c: 'grantCoins', amount: 1e9, reason: 'debug' });
    sim.execute({ c: 'buy', id: 'expand' });
    crawl(sim, view, 15);
    expectDrawnExactly(view, sim);
    // Late in the farm most crops are gone: the meshes hold far fewer instances than the farm has crops.
    sim.execute({ c: 'buy', id: 'expand' });
    sim.execute({ c: 'buy', id: 'expand' });
    for (let k = 0; k < 40 && sim.cleared < 0.6; k++) {
      sim.execute({ c: 'clearFrontier', n: 3 });
      crawl(sim, view, 1);
    }
    expect(sim.cleared).toBeGreaterThan(0.6);
    const drawn = expectDrawnExactly(view, sim);
    expect(drawn).toBeLessThan(total * 0.5);
    // A reload builds the packed layout straight away.
    view.rebuild();
    expectDrawnExactly(view, sim);
  });
});
