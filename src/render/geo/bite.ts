import * as THREE from 'three';
import type { Part } from './lowpoly.ts';

/** Where the bite shader carves, in crop-local units (see `biteShape`). */
export interface BiteShape {
  r: number;
  h: number;
  mid: number;
  eq: number;
}

const FLESH_TINT = new THREE.Color(0xfff4d2);
const tc = new THREE.Color();

/**
 * Derives the "bitten" version of a low-poly crop: the same triangles (same colours, so swapping meshes never pops),
 * with solid parts subdivided so a bite can carve a readable notch, plus per-vertex data for the bite shader:
 *   aCen   centroid used for every per-face decision (so a face's three corners always agree): the triangle's own
 *          centroid for solid parts, the whole part's centroid for leaves (they are bitten off in one piece)
 *   aKind  0 = solid (dented by bites, cut flat at the stump stage, shows flesh), 1 = leaf/fruit bit (removed)
 *   aFlesh colour of the cut surface
 * Built once per crop type at load; nothing is carved on the CPU at runtime.
 */
export function bittenGeometry(intact: THREE.BufferGeometry, triPart: readonly number[], parts: readonly Part[], maxEdge: number): THREE.BufferGeometry {
  const P = intact.getAttribute('position');
  const Cl = intact.getAttribute('color');
  const pos: number[] = [];
  const col: number[] = [];
  const nor: number[] = [];
  const cen: number[] = [];
  const kind: number[] = [];
  const flesh: number[] = [];
  // Whole-part centroids for leaves.
  const partSum = parts.map(() => [0, 0, 0, 0]);
  for (let t = 0; t < triPart.length; t++) {
    const s = partSum[triPart[t]];
    for (let k = 0; k < 3; k++) {
      s[0] += P.getX(t * 3 + k);
      s[1] += P.getY(t * 3 + k);
      s[2] += P.getZ(t * 3 + k);
      s[3]++;
    }
  }
  const fleshOf = parts.map((p) => {
    if (p.flesh !== undefined) return tc.setHex(p.flesh).toArray() as [number, number, number];
    return tc.setHex(p.color).lerp(FLESH_TINT, 0.6).toArray() as [number, number, number];
  });
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  type V = [number, number, number, number, number, number];
  const emit = (va: V, vb: V, vc: V, part: number, leaf: boolean) => {
    a.set(va[0], va[1], va[2]);
    b.set(vb[0], vb[1], vb[2]);
    c.set(vc[0], vc[1], vc[2]);
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    const s = partSum[part];
    const cx = leaf ? s[0] / s[3] : (va[0] + vb[0] + vc[0]) / 3;
    const cy = leaf ? s[1] / s[3] : (va[1] + vb[1] + vc[1]) / 3;
    const cz = leaf ? s[2] / s[3] : (va[2] + vb[2] + vc[2]) / 3;
    for (const v of [va, vb, vc]) {
      pos.push(v[0], v[1], v[2]);
      col.push(v[3], v[4], v[5]);
      nor.push(n.x, n.y, n.z);
      cen.push(cx, cy, cz);
      kind.push(leaf ? 1 : 0);
      flesh.push(...fleshOf[part]);
    }
  };
  const mid = (p: V, q: V): V => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2, (p[3] + q[3]) / 2, (p[4] + q[4]) / 2, (p[5] + q[5]) / 2];
  const len = (p: V, q: V) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  // Longest-edge bisection keeps every sub-face in its parent's plane (identical silhouette and colours until bitten)
  // and only splits where faces are long, so tall slivers don't explode into hundreds of tiny triangles.
  const split = (va: V, vb: V, vc: V, part: number, depth: number) => {
    const ab = len(va, vb);
    const bc = len(vb, vc);
    const ca = len(vc, va);
    const m = Math.max(ab, bc, ca);
    if (depth >= 8 || m <= maxEdge) return emit(va, vb, vc, part, false);
    if (m === ab) {
      const p = mid(va, vb);
      split(va, p, vc, part, depth + 1);
      split(p, vb, vc, part, depth + 1);
    } else if (m === bc) {
      const p = mid(vb, vc);
      split(va, vb, p, part, depth + 1);
      split(va, p, vc, part, depth + 1);
    } else {
      const p = mid(vc, va);
      split(va, vb, p, part, depth + 1);
      split(p, vb, vc, part, depth + 1);
    }
  };
  for (let t = 0; t < triPart.length; t++) {
    const part = triPart[t];
    const v = (k: number): V => [P.getX(t * 3 + k), P.getY(t * 3 + k), P.getZ(t * 3 + k), Cl.getX(t * 3 + k), Cl.getY(t * 3 + k), Cl.getZ(t * 3 + k)];
    if (parts[part].leaf) emit(v(0), v(1), v(2), part, true);
    else split(v(0), v(1), v(2), part, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aCen', new THREE.Float32BufferAttribute(cen, 3));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setAttribute('aFlesh', new THREE.Float32BufferAttribute(flesh, 3));
  g.computeBoundingSphere();
  return g;
}

/**
 * Horizontal reach, height, area-weighted bulk height and "equator" (height of the widest solid section: the stump is
 * cut there, so what remains is the bottom half of the crop with a flat top). Takes the bitten geometry (`aKind`).
 */
export function biteShape(g: THREE.BufferGeometry): BiteShape {
  const P = g.getAttribute('position');
  const K = g.getAttribute('aKind');
  let r = 0;
  let h = 0;
  let wy = 0;
  let w = 0;
  let solidR = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < P.count; i += 3) {
    a.fromBufferAttribute(P, i);
    b.fromBufferAttribute(P, i + 1);
    c.fromBufferAttribute(P, i + 2);
    for (const v of [a, b, c]) {
      r = Math.max(r, Math.hypot(v.x, v.z));
      h = Math.max(h, v.y);
      if (K.getX(i) === 0) solidR = Math.max(solidR, Math.hypot(v.x, v.z));
    }
    const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    wy += ((a.y + b.y + c.y) / 3) * area;
    w += area;
  }
  let ey = 0;
  let en = 0;
  for (let i = 0; i < P.count; i++) {
    if (K.getX(i) !== 0) continue;
    a.fromBufferAttribute(P, i);
    if (Math.hypot(a.x, a.z) >= solidR * 0.92) {
      ey += a.y;
      en++;
    }
  }
  const mid = Math.min(0.7 * h, Math.max(0.3 * h, w > 0 ? wy / w : h / 2));
  const eq = Math.min(0.6 * h, Math.max(0.3 * h, en ? ey / en : h / 2));
  return { r: Math.min(r, 0.5), h, mid, eq };
}
