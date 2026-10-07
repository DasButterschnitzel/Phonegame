import type { PathTable } from './types.ts';
import { wrap } from '../shared/math.ts';

export type Pt = readonly [number, number];

/**
 * Builds a closed loop from polygon corners: straight edges joined by circular fillets of radius `r`
 * (like a model-railway layout), resampled at uniform arc length `ds`.
 */
export function buildLoop(corners: readonly Pt[], r: number, ds = 0.25, barn?: Pt): PathTable {
  const dense = filletPolyline(corners, r);
  return resample(dense, ds, barn);
}

function filletPolyline(corners: readonly Pt[], r: number): number[] {
  const n = corners.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = corners[(i - 1 + n) % n];
    const p1 = corners[i];
    const p2 = corners[(i + 1) % n];
    let d1x = p1[0] - p0[0];
    let d1z = p1[1] - p0[1];
    let d2x = p2[0] - p1[0];
    let d2z = p2[1] - p1[1];
    const l1 = Math.hypot(d1x, d1z);
    const l2 = Math.hypot(d2x, d2z);
    d1x /= l1;
    d1z /= l1;
    d2x /= l2;
    d2z /= l2;
    const cross = d1x * d2z - d1z * d2x;
    const dot = d1x * d2x + d1z * d2z;
    const theta = Math.atan2(Math.abs(cross), dot); // turning angle
    if (theta < 1e-4) {
      out.push(p1[0], p1[1]);
      continue;
    }
    const maxT = Math.min(l1, l2) * 0.5;
    const rr = Math.min(r, maxT / Math.tan(theta / 2));
    const t = rr * Math.tan(theta / 2);
    const ax = p1[0] - d1x * t;
    const az = p1[1] - d1z * t;
    // Arc centre lies along the inward normal of the incoming edge.
    const side = cross > 0 ? 1 : -1;
    const nx = -d1z * side;
    const nz = d1x * side;
    const cx = ax + nx * rr;
    const cz = az + nz * rr;
    const a0 = Math.atan2(az - cz, ax - cx);
    const steps = Math.max(4, Math.ceil((theta * rr) / 0.05));
    for (let k = 0; k <= steps; k++) {
      const a = a0 + side * theta * (k / steps);
      out.push(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr);
    }
  }
  return out;
}

function resample(dense: number[], ds: number, barn?: Pt): PathTable {
  const m = dense.length / 2;
  const cum = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    cum[i + 1] = cum[i] + Math.hypot(dense[j * 2] - dense[i * 2], dense[j * 2 + 1] - dense[i * 2 + 1]);
  }
  const total = cum[m];
  const n = Math.max(8, Math.round(total / ds));
  const step = total / n;
  const x = new Float32Array(n);
  const z = new Float32Array(n);
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const s = k * step;
    while (seg < m - 1 && cum[seg + 1] < s) seg++;
    const j = (seg + 1) % m;
    const segLen = cum[seg + 1] - cum[seg];
    const u = segLen > 0 ? (s - cum[seg]) / segLen : 0;
    x[k] = dense[seg * 2] + (dense[j * 2] - dense[seg * 2]) * u;
    z[k] = dense[seg * 2 + 1] + (dense[j * 2 + 1] - dense[seg * 2 + 1]) * u;
  }
  const tx = new Float32Array(n);
  const tz = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const a = (k - 1 + n) % n;
    const b = (k + 1) % n;
    const dx = x[b] - x[a];
    const dz = z[b] - z[a];
    const l = Math.hypot(dx, dz) || 1;
    tx[k] = dx / l;
    tz[k] = dz / l;
  }
  const path: PathTable = { length: total, ds: step, n, x, z, tx, tz, barnS: 0 };
  if (barn) path.barnS = nearestS(path, barn[0], barn[1]);
  return path;
}

export interface PathSample {
  x: number;
  z: number;
  tx: number;
  tz: number;
}

/** O(1) sample at arc position s (wraps). */
export function sampleAt(p: PathTable, s: number, out: PathSample): PathSample {
  const u = wrap(s, p.length) / p.ds;
  const i = Math.floor(u) % p.n;
  const j = (i + 1) % p.n;
  const f = u - Math.floor(u);
  out.x = p.x[i] + (p.x[j] - p.x[i]) * f;
  out.z = p.z[i] + (p.z[j] - p.z[i]) * f;
  const tx = p.tx[i] + (p.tx[j] - p.tx[i]) * f;
  const tz = p.tz[i] + (p.tz[j] - p.tz[i]) * f;
  const l = Math.hypot(tx, tz) || 1;
  out.tx = tx / l;
  out.tz = tz / l;
  return out;
}

/** Arc position of the sample nearest to (x, z). Brute force — only used at build/stage change. */
export function nearestS(p: PathTable, x: number, z: number): number {
  let best = Infinity;
  let bi = 0;
  for (let i = 0; i < p.n; i++) {
    const d = (p.x[i] - x) ** 2 + (p.z[i] - z) ** 2;
    if (d < best) {
      best = d;
      bi = i;
    }
  }
  return bi * p.ds;
}

/** Distance from (x, z) to the closest path sample (sample spacing ≤ ds, so error ≤ ds/2). */
export function distanceToPath(p: PathTable, x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < p.n; i++) {
    const d = (p.x[i] - x) ** 2 + (p.z[i] - z) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/** Signed arc distance a→b along the loop in (-L/2, L/2]. */
export function arcDelta(p: PathTable, a: number, b: number): number {
  let d = wrap(b - a, p.length);
  if (d > p.length / 2) d -= p.length;
  return d;
}
