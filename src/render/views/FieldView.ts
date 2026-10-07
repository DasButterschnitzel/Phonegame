import * as THREE from 'three';
import type { Sim } from '../../game/sim.ts';
import { consumeDirty } from '../../game/field.ts';
import { cropGeometry } from '../geo/crops.ts';
import { sproutGeometry } from '../geo/world.ts';
import { lambert } from '../geo/lowpoly.ts';
import { C, E, M4, Q, S, UP, V, ZERO_SCALE } from '../scratch.ts';
import { easeOutBack } from '../../shared/math.ts';

interface Anim {
  crop: number;
  kind: 'hit' | 'pop';
  t: number;
  dur: number;
}

/**
 * Crops as one InstancedMesh per tier plus a sprout mesh for harvested crops.
 * Only crops reported dirty by the simulation (or animating) are touched each frame.
 */
export class FieldView {
  readonly group = new THREE.Group();
  private tierMeshes: THREE.InstancedMesh[] = [];
  private sprouts!: THREE.InstancedMesh;
  private inst!: Uint32Array;
  private lastHp!: Float32Array;
  private anims = new Map<number, Anim>();
  private dirtyRanges: Set<number>[] = [];
  private sproutDirty = false;
  /** Compact sprout instances: only harvested crops get one (crop → slot, slot → crop). */
  private sproutSlot!: Int32Array;
  private slotCrop!: Int32Array;
  private sproutCount = 0;
  private mat = lambert();
  private sim: Sim;

  constructor(sim: Sim) {
    this.sim = sim;
    this.rebuild();
  }

  /** Rebuild meshes for the current farm (call after travel). */
  rebuild(): void {
    for (const m of this.tierMeshes) {
      this.group.remove(m);
      m.dispose();
    }
    if (this.sprouts) {
      this.group.remove(this.sprouts);
      this.sprouts.dispose();
    }
    this.anims.clear();
    const { field, farm } = this.sim;
    const counts = [0, 0, 0, 0];
    this.inst = new Uint32Array(field.count);
    for (let i = 0; i < field.count; i++) this.inst[i] = counts[field.tier[i]]++;
    this.tierMeshes = farm.crops.map((cropId, t) => {
      const m = new THREE.InstancedMesh(cropGeometry(cropId), this.mat, Math.max(1, counts[t]));
      m.count = counts[t];
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.setColorAt(0, C.set(0xffffff));
      m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      m.name = `crops-${cropId}`;
      this.group.add(m);
      return m;
    });
    this.sprouts = new THREE.InstancedMesh(sproutGeometry(), this.mat, field.count);
    this.sprouts.count = 0;
    this.sproutCount = 0;
    this.sproutSlot = new Int32Array(field.count).fill(-1);
    this.slotCrop = new Int32Array(field.count).fill(-1);
    this.sprouts.frustumCulled = false;
    this.sprouts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.sprouts);
    this.lastHp = Float32Array.from(field.hp);
    this.dirtyRanges = [new Set(), new Set(), new Set(), new Set()];
    for (let i = 0; i < field.count; i++) {
      this.writeCrop(i, 0);
      this.writeSprout(i);
    }
    for (const m of this.tierMeshes) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.needsUpdate = true;
    }
    this.sprouts.instanceMatrix.needsUpdate = true;
    for (const s of this.dirtyRanges) s.clear();
    this.sproutDirty = false;
  }

  private writeSprout(i: number): void {
    const f = this.sim.field;
    const want = f.regrowAt[i] !== 0 && !f.paved[i];
    let slot = this.sproutSlot[i];
    if (want) {
      if (slot < 0) {
        slot = this.sproutCount++;
        this.sproutSlot[i] = slot;
        this.slotCrop[slot] = i;
      }
      V.set(f.x[i], 0, f.z[i]);
      Q.setFromAxisAngle(UP, f.seed[i] * 6.28);
      S.setScalar(1);
      M4.compose(V, Q, S);
      this.sprouts.setMatrixAt(slot, M4);
      this.sproutDirty = true;
    } else if (slot >= 0) {
      // Swap-remove: move the last sprout into this slot.
      const last = --this.sproutCount;
      const moved = this.slotCrop[last];
      if (last !== slot) {
        this.sprouts.getMatrixAt(last, M4);
        this.sprouts.setMatrixAt(slot, M4);
        this.slotCrop[slot] = moved;
        this.sproutSlot[moved] = slot;
      }
      this.slotCrop[last] = -1;
      this.sproutSlot[i] = -1;
      this.sproutDirty = true;
    }
  }

  private writeCrop(i: number, now: number): void {
    const f = this.sim.field;
    const t = f.tier[i];
    const mesh = this.tierMeshes[t];
    const k = this.inst[i];
    this.dirtyRanges[t].add(k);
    if (f.paved[i] || f.regrowAt[i] !== 0) {
      mesh.setMatrixAt(k, ZERO_SCALE);
      return;
    }
    const frac = f.hp[i] / f.maxHp[i];
    let scale = (0.55 + 0.45 * frac) * (0.85 + 0.3 * f.seed[i]);
    let tiltX = 0;
    let tiltZ = 0;
    const a = this.anims.get(i);
    if (a) {
      const u = Math.min(1, (now - a.t) / a.dur);
      if (a.kind === 'pop') scale *= Math.max(0.05, easeOutBack(u));
      else {
        const w = Math.sin(u * Math.PI * 3) * (1 - u) * 0.35;
        tiltX = w * Math.cos(f.seed[i] * 40);
        tiltZ = w * Math.sin(f.seed[i] * 40);
        scale *= 1 - 0.12 * Math.sin(u * Math.PI);
      }
    }
    V.set(f.x[i], 0, f.z[i]);
    E.set(tiltX, f.seed[i] * 6.283, tiltZ);
    Q.setFromEuler(E);
    S.setScalar(scale);
    M4.compose(V, Q, S);
    mesh.setMatrixAt(k, M4);
    // Damaged crops turn pale; golden crops glow.
    const d = 1 - frac;
    if (f.golden[i]) C.setRGB(1.7, 1.35, 0.35);
    else C.setRGB(1 + 0.45 * d, 1 + 0.4 * d, 1 + 0.25 * d);
    mesh.setColorAt(k, C);
  }

  /** Per frame: apply simulation changes and running animations. */
  update(now: number): void {
    const f = this.sim.field;
    consumeDirty(f, (i) => {
      const hp = f.hp[i];
      const prev = this.lastHp[i];
      if (f.regrowAt[i] === 0 && !f.paved[i]) {
        if (prev <= 0 || (hp >= f.maxHp[i] && prev < hp)) this.anims.set(i, { crop: i, kind: 'pop', t: now, dur: 0.45 });
        else if (hp < prev && !this.anims.has(i)) this.anims.set(i, { crop: i, kind: 'hit', t: now, dur: 0.3 });
      } else this.anims.delete(i);
      this.lastHp[i] = f.regrowAt[i] !== 0 ? 0 : hp;
      this.writeCrop(i, now);
      this.writeSprout(i);
    });
    for (const a of this.anims.values()) {
      this.writeCrop(a.crop, now);
      if (now - a.t >= a.dur) this.anims.delete(a.crop);
    }
    this.flush();
  }

  private flush(): void {
    for (let t = 0; t < 4; t++) {
      const set = this.dirtyRanges[t];
      if (set.size === 0) continue;
      const mesh = this.tierMeshes[t];
      const idx = [...set].sort((a, b) => a - b);
      let start = idx[0];
      let prev = idx[0];
      const ranges: [number, number][] = [];
      for (let j = 1; j <= idx.length; j++) {
        const v = idx[j];
        if (v !== undefined && v - prev <= 6) {
          prev = v;
          continue;
        }
        ranges.push([start, prev - start + 1]);
        start = v;
        prev = v;
      }
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceColor!.clearUpdateRanges();
      for (const [s, n] of ranges) {
        mesh.instanceMatrix.addUpdateRange(s * 16, n * 16);
        mesh.instanceColor!.addUpdateRange(s * 3, n * 3);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
      set.clear();
    }
    if (this.sproutDirty) {
      this.sprouts.count = this.sproutCount;
      this.sprouts.instanceMatrix.needsUpdate = true;
      this.sproutDirty = false;
    }
  }

  /** World position of crop i (for particles / floaters). */
  cropPos(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.sim.field.x[i], 0.35, this.sim.field.z[i]);
  }
}
