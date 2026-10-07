import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cropMeshes } from './crops.ts';
import { FARMS } from '../../game/farms/index.ts';

const area = (g: THREE.BufferGeometry): number => {
  const p = g.getAttribute('position');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let s = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    s += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return s;
};

const crops = [...new Set(Object.values(FARMS).flatMap((f) => f.crops))];

describe('bitten crop geometry', () => {
  it.each(crops)('%s: the bitten copy is the same crop until bitten, tagged for the bite shader, within budget', (id) => {
    const m = cropMeshes(id);
    const n = m.bitten.getAttribute('position').count;
    // Subdivision keeps every sub-face in its parent's plane: same surface area, so swapping meshes never pops.
    expect(area(m.bitten)).toBeCloseTo(area(m.intact), 4);
    for (const name of ['aCen', 'aKind', 'aFlesh', 'normal', 'color']) expect(m.bitten.getAttribute(name).count).toBe(n);
    const kinds = new Set(Array.from(m.bitten.getAttribute('aKind').array));
    expect(kinds.has(0)).toBe(true);
    // A crop is a few hundred triangles once bitten (only the bitten few use this mesh).
    expect(n / 3).toBeLessThan(600);
    const s = m.shape;
    expect(s.r).toBeGreaterThan(0.1);
    expect(s.r).toBeLessThanOrEqual(0.5);
    expect(s.h).toBeGreaterThan(0.3);
    expect(s.eq).toBeGreaterThanOrEqual(0.3 * s.h - 1e-6);
    expect(s.eq).toBeLessThanOrEqual(0.6 * s.h + 1e-6);
  });
});
