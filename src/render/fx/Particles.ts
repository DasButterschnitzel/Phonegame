import * as THREE from 'three';
import { build, box } from '../geo/lowpoly.ts';
import { C, E, M4, Q, S, V } from '../scratch.ts';

const MAX = 600;

/**
 * Pooled confetti/leaf bits: one InstancedMesh, typed arrays, no per-frame allocation. Live particles are kept packed
 * at the front of the arrays (a dead one swaps with the last live one), so a frame only touches — and uploads — the
 * few dozen that are actually flying, not the whole pool (the dust trail keeps a handful alive all the time).
 */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private px = new Float32Array(MAX);
  private py = new Float32Array(MAX);
  private pz = new Float32Array(MAX);
  private vx = new Float32Array(MAX);
  private vy = new Float32Array(MAX);
  private vz = new Float32Array(MAX);
  private rot = new Float32Array(MAX);
  private spin = new Float32Array(MAX);
  private size = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private age = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  /** Horizontal drag (1/s): puffs slow down and hang instead of flying off. */
  private drag = new Float32Array(MAX);
  private cr = new Float32Array(MAX);
  private cg = new Float32Array(MAX);
  private cb = new Float32Array(MAX);
  /** Live particles occupy [0, n). When the pool is full the oldest slot is reused. */
  private n = 0;
  private recycle = 0;
  private uploaded = 0;
  budget = 1;

  constructor() {
    const geo = build([{ geo: box(1, 0.35, 1), color: 0xffffff }]);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), MAX);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, C.set(0xffffff));
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    // Nothing is drawn while idle.
    this.mesh.count = 0;
  }

  /** Spawn `n` particles at (x, y, z), flying out in every direction. */
  burst(x: number, y: number, z: number, color: number, n: number, speed = 2.5, size = 0.12, life = 0.7, up = 3, gravity = 9): void {
    this.spray(x, y, z, 0, 0, color, n, speed, size, life, up, gravity, 1);
  }

  /**
   * Directional spray: horizontal velocity along (dx, dz) (unit or zero), fanned out by `spread` (0 = a tight jet,
   * 1 = all around), plus `up`. Debris from a bite flies off the way the blade was moving, not out of the crop's middle.
   */
  spray(x: number, y: number, z: number, dx: number, dz: number, color: number, n: number, speed = 2.5, size = 0.12, life = 0.7, up = 3, gravity = 9, spread = 0.5, drag = 0): void {
    const count = Math.max(1, Math.round(n * this.budget));
    const base = Math.atan2(dz, dx);
    const free = dx === 0 && dz === 0 ? 1 : spread;
    C.setHex(color);
    for (let k = 0; k < count; k++) {
      let i: number;
      if (this.n < MAX) i = this.n++;
      else {
        i = this.recycle;
        this.recycle = (this.recycle + 1) % MAX;
      }
      const a = base + (Math.random() - 0.5) * Math.PI * 2 * free;
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.px[i] = x;
      this.py[i] = y;
      this.pz[i] = z;
      this.vx[i] = Math.cos(a) * sp;
      this.vz[i] = Math.sin(a) * sp;
      this.vy[i] = up * (0.6 + Math.random() * 0.6);
      this.rot[i] = Math.random() * 6;
      this.spin[i] = (Math.random() - 0.5) * 14;
      this.size[i] = size * (0.6 + Math.random() * 0.8);
      this.life[i] = life * (0.7 + Math.random() * 0.6);
      this.age[i] = 0;
      this.grav[i] = gravity;
      this.drag[i] = drag;
      const j = 0.85 + Math.random() * 0.3;
      this.cr[i] = C.r * j;
      this.cg[i] = C.g * j;
      this.cb[i] = C.b * j;
    }
  }

  /** Ring of sparkles rising (merges, golden crops). */
  ring(x: number, y: number, z: number, color: number, n = 18, r = 0.6): void {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      this.burst(x + Math.cos(a) * r, y, z + Math.sin(a) * r, color, 1, 1.5, 0.1, 0.8, 4, 4);
    }
  }

  /** A low ring of dust hugging the ground (a crop's base giving way). */
  puff(x: number, z: number, color: number, n = 7, radius = 0.35, size = 0.14, life = 0.45): void {
    const count = Math.max(2, Math.round(n * this.budget));
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + Math.random() * 0.5;
      this.spray(x + Math.cos(a) * radius * 0.4, 0.06, z + Math.sin(a) * radius * 0.4, Math.cos(a), Math.sin(a), color, 1, radius * 5, size, life, 0.5, 1.5, 0.05, 7);
    }
  }

  /** Move a particle from slot `from` into slot `to` (packing the live range). */
  private move(from: number, to: number): void {
    this.px[to] = this.px[from];
    this.py[to] = this.py[from];
    this.pz[to] = this.pz[from];
    this.vx[to] = this.vx[from];
    this.vy[to] = this.vy[from];
    this.vz[to] = this.vz[from];
    this.rot[to] = this.rot[from];
    this.spin[to] = this.spin[from];
    this.size[to] = this.size[from];
    this.life[to] = this.life[from];
    this.age[to] = this.age[from];
    this.grav[to] = this.grav[from];
    this.drag[to] = this.drag[from];
    this.cr[to] = this.cr[from];
    this.cg[to] = this.cg[from];
    this.cb[to] = this.cb[from];
  }

  update(dt: number): void {
    if (this.n === 0 && this.uploaded === 0) return;
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      const u = this.age[i] / this.life[i];
      if (u >= 1) {
        // Dead: the last live particle takes its slot (and is processed next).
        this.n--;
        if (i !== this.n) this.move(this.n, i);
        if (this.recycle >= this.n) this.recycle = 0;
        continue;
      }
      this.vy[i] -= this.grav[i] * dt;
      if (this.drag[i] > 0) {
        const k = Math.exp(-this.drag[i] * dt);
        this.vx[i] *= k;
        this.vz[i] *= k;
      }
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < 0.03) {
        this.py[i] = 0.03;
        this.vy[i] *= -0.35;
        this.vx[i] *= 0.6;
        this.vz[i] *= 0.6;
      }
      this.rot[i] += this.spin[i] * dt;
      V.set(this.px[i], this.py[i], this.pz[i]);
      E.set(this.rot[i], this.rot[i] * 0.7, 0);
      Q.setFromEuler(E);
      S.setScalar(this.size[i] * (u > 0.7 ? (1 - u) / 0.3 : 1));
      this.mesh.setMatrixAt(i, M4.compose(V, Q, S));
      this.mesh.setColorAt(i, C.setRGB(this.cr[i], this.cg[i], this.cb[i]));
      i++;
    }
    const n = this.n;
    this.mesh.count = n;
    const im = this.mesh.instanceMatrix;
    const ic = this.mesh.instanceColor!;
    im.clearUpdateRanges();
    ic.clearUpdateRanges();
    if (n > 0) {
      im.addUpdateRange(0, n * 16);
      ic.addUpdateRange(0, n * 3);
    }
    im.needsUpdate = true;
    ic.needsUpdate = true;
    this.uploaded = n;
  }
}
