import * as THREE from 'three';
import { build, box } from '../geo/lowpoly.ts';
import { C, E, M4, Q, S, V } from '../scratch.ts';

const MAX = 600;

/**
 * Pooled confetti/leaf bits (one InstancedMesh, ring allocation, typed arrays — no per-frame allocation).
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
  private next = 0;
  private active = 0;
  budget = 1;

  constructor() {
    const geo = build([{ geo: box(1, 0.35, 1), color: 0xffffff }]);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), MAX);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, C.set(0xffffff));
    // Nothing is drawn while idle; bursts switch the full pool on until every particle has died.
    this.mesh.count = 0;
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, M4.makeScale(0, 0, 0));
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
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
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
      C.setHex(color);
      const j = 0.85 + Math.random() * 0.3;
      C.r *= j;
      C.g *= j;
      C.b *= j;
      this.mesh.setColorAt(i, C);
    }
    this.active = MAX;
    this.mesh.count = MAX;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** A low ring of dust hugging the ground (a crop's base giving way). */
  puff(x: number, z: number, color: number, n = 7, radius = 0.35, size = 0.14, life = 0.45): void {
    const count = Math.max(2, Math.round(n * this.budget));
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + Math.random() * 0.5;
      this.spray(x + Math.cos(a) * radius * 0.4, 0.06, z + Math.sin(a) * radius * 0.4, Math.cos(a), Math.sin(a), color, 1, radius * 5, size, life, 0.5, 1.5, 0.05, 7);
    }
  }

  /** Ring of sparkles rising (merges, golden crops). */
  ring(x: number, y: number, z: number, color: number, n = 18, r = 0.6): void {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      this.burst(x + Math.cos(a) * r, y, z + Math.sin(a) * r, color, 1, 1.5, 0.1, 0.8, 4, 4);
    }
  }

  update(dt: number): void {
    if (this.active === 0) return;
    let alive = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += dt;
      const u = this.age[i] / this.life[i];
      if (u >= 1) {
        this.mesh.setMatrixAt(i, M4.makeScale(0, 0, 0));
        continue;
      }
      alive++;
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
      M4.compose(V, Q, S);
      this.mesh.setMatrixAt(i, M4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (alive === 0) {
      this.active = 0;
      this.mesh.count = 0;
    }
  }
}
