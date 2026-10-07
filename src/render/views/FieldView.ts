import * as THREE from 'three';
import type { Sim } from '../../game/sim.ts';
import { consumeDirty, markDirty } from '../../game/field.ts';
import { cropGeometry } from '../geo/crops.ts';
import { stubbleGeometry } from '../geo/world.ts';
import { toon } from '../materials.ts';
import { C, E, M4, Q, S, UP, V, ZERO_SCALE } from '../scratch.ts';
import { easeOutBack } from '../../shared/math.ts';

interface Anim {
  crop: number;
  kind: 'hit' | 'collapse' | 'grow';
  t: number;
  dur: number;
}

/** Positions of the caterpillar's bodies this frame (head first), for directional hits. */
export interface BodyPoints {
  readonly poses: readonly { x: number; z: number }[];
  count: number;
}

const COLLAPSE_S = 0.32;

/**
 * Crops as one InstancedMesh per tier plus stubble for destroyed crops.
 * Damage is staged and procedural: a crop shrinks, flattens, pales and leans away from the side it was bitten from;
 * each bite knocks it back; the last bite makes it tip over and collapse, leaving stubble until its plot is cleared.
 * Only crops reported dirty by the simulation (or animating) are touched each frame.
 */
export class FieldView {
  readonly group = new THREE.Group();
  private tierMeshes: THREE.InstancedMesh[] = [];
  private stubble!: THREE.InstancedMesh;
  private inst!: Uint32Array;
  private lastHp!: Float32Array;
  /** Unit direction the crop was last hit towards (away from the chomper). */
  private dirX!: Float32Array;
  private dirZ!: Float32Array;
  private anims = new Map<number, Anim>();
  /** Per tier: list of dirty instance slots + a mark array (no Set / array allocation per frame). */
  private dirtyList: Int32Array[] = [];
  private dirtyN = [0, 0, 0, 0];
  private dirtyMark: Uint8Array[] = [];
  private stubbleDirty = false;
  /** Compact stubble instances (crop → slot, slot → crop). */
  private stubbleSlot!: Int32Array;
  private slotCrop!: Int32Array;
  private stubbleCount = 0;
  private shownZone = 0;
  private mat = toon({ wind: 0.09, rim: 0.18 });
  private stubbleMat = toon({ rim: 0 });
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
    if (this.stubble) {
      this.group.remove(this.stubble);
      this.stubble.dispose();
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
    this.stubble = new THREE.InstancedMesh(stubbleGeometry(), this.stubbleMat, Math.max(1, field.count));
    this.stubble.count = 0;
    this.stubbleCount = 0;
    this.stubbleSlot = new Int32Array(field.count).fill(-1);
    this.slotCrop = new Int32Array(field.count).fill(-1);
    this.stubble.frustumCulled = false;
    this.stubble.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.stubble);
    this.lastHp = Float32Array.from(field.hp);
    this.dirX = new Float32Array(field.count);
    this.dirZ = new Float32Array(field.count);
    for (let i = 0; i < field.count; i++) {
      const a = field.seed[i] * 40;
      this.dirX[i] = Math.cos(a);
      this.dirZ[i] = Math.sin(a);
    }
    this.dirtyList = this.tierMeshes.map((m) => new Int32Array(Math.max(1, m.count)));
    this.dirtyMark = this.tierMeshes.map((m) => new Uint8Array(Math.max(1, m.count)));
    this.dirtyN = [0, 0, 0, 0];
    this.shownZone = this.sim.state.progress.zone;
    for (let i = 0; i < field.count; i++) {
      this.writeCrop(i, 0);
      this.writeStubble(i);
    }
    for (const m of this.tierMeshes) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.needsUpdate = true;
    }
    this.stubble.instanceMatrix.needsUpdate = true;
    for (let t = 0; t < 4; t++) this.clearDirty(t);
    this.stubbleDirty = false;
  }

  /** Stubble marks a destroyed crop until its plot joins the territory. */
  private writeStubble(i: number): void {
    const f = this.sim.field;
    const want = f.dead[i] === 1 && !this.sim.terr.claimed[f.plot[i]] && !this.anims.has(i);
    let slot = this.stubbleSlot[i];
    if (want) {
      if (slot < 0) {
        slot = this.stubbleCount++;
        this.stubbleSlot[i] = slot;
        this.slotCrop[slot] = i;
      }
      V.set(f.x[i], 0, f.z[i]);
      Q.setFromAxisAngle(UP, f.seed[i] * 6.28);
      S.setScalar(0.85 + 0.3 * f.seed[i]);
      this.stubble.setMatrixAt(slot, M4.compose(V, Q, S));
      this.stubbleDirty = true;
    } else if (slot >= 0) {
      // Swap-remove: move the last stubble into this slot.
      const last = --this.stubbleCount;
      const moved = this.slotCrop[last];
      if (last !== slot) {
        this.stubble.getMatrixAt(last, M4);
        this.stubble.setMatrixAt(slot, M4);
        this.slotCrop[slot] = moved;
        this.stubbleSlot[moved] = slot;
      }
      this.slotCrop[last] = -1;
      this.stubbleSlot[i] = -1;
      this.stubbleDirty = true;
    }
  }

  private writeCrop(i: number, now: number): void {
    const f = this.sim.field;
    const t = f.tier[i];
    const mesh = this.tierMeshes[t];
    const k = this.inst[i];
    if (!this.dirtyMark[t][k]) {
      this.dirtyMark[t][k] = 1;
      this.dirtyList[t][this.dirtyN[t]++] = k;
    }
    const a = this.anims.get(i);
    if (f.dead[i] && (!a || a.kind !== 'collapse')) {
      mesh.setMatrixAt(k, ZERO_SCALE);
      return;
    }
    // Staged damage: 1 = untouched … 0 = gone. Height drops faster than width (bitten down).
    const frac = f.dead[i] ? 0.25 : f.hp[i] / f.maxHp[i];
    const d = 1 - frac;
    const base = 0.85 + 0.3 * f.seed[i];
    let sxz = base * (1 - 0.28 * d);
    let sy = base * (1 - 0.5 * d ** 0.8);
    // Lean away from where it was bitten; more with damage.
    let lean = 0.38 * d;
    if (a) {
      const u = Math.min(1, (now - a.t) / a.dur);
      if (a.kind === 'hit') {
        // Knock-back away from the chomper, spring back with a wobble.
        lean += Math.sin(u * Math.PI) * (1 - u) * 0.55 + Math.sin(u * Math.PI * 3) * (1 - u) * 0.12;
        sy *= 1 - 0.15 * Math.sin(u * Math.PI);
        sxz *= 1 + 0.1 * Math.sin(u * Math.PI);
      } else if (a.kind === 'collapse') {
        // Tip over and crumple.
        lean = 0.3 + 1.2 * u * u;
        sy *= Math.max(0.05, 1 - u);
        sxz *= 1 + 0.25 * Math.sin(u * Math.PI) - 0.5 * u;
      } else {
        const g = Math.max(0.05, easeOutBack(u));
        sxz *= g;
        sy *= g;
      }
    }
    const dx = this.dirX[i];
    const dz = this.dirZ[i];
    V.set(f.x[i], 0, f.z[i]);
    // Tilt about the axis perpendicular to the push direction.
    E.set(lean * dz, f.seed[i] * 6.283, -lean * dx, 'YXZ');
    Q.setFromEuler(E);
    S.set(sxz, sy, sxz);
    mesh.setMatrixAt(k, M4.compose(V, Q, S));
    // Damaged crops pale and brown; golden crops glow; crops behind a closed fence are dimmed.
    if (f.golden[i]) C.setRGB(1.7, 1.35, 0.35);
    else C.setRGB(1 + 0.4 * d, 1 + 0.28 * d, 1 - 0.1 * d);
    if (t > this.sim.state.progress.zone) C.multiplyScalar(0.62);
    mesh.setColorAt(k, C);
  }

  /** Per frame: apply simulation changes and running animations. `bodies` aims knock-backs away from the chompers. */
  update(now: number, bodies?: BodyPoints): void {
    const f = this.sim.field;
    const zone = this.sim.state.progress.zone;
    if (zone !== this.shownZone) {
      // Fence opened: crops of the new zone light up.
      this.shownZone = zone;
      for (let i = 0; i < f.count; i++) if (f.tier[i] === zone && !f.dead[i]) markDirty(f, i);
    }
    consumeDirty(f, (i) => {
      const hp = f.hp[i];
      const prev = this.lastHp[i];
      if (hp < prev && bodies) this.aimAway(i, bodies);
      if (f.dead[i]) {
        if (prev > 0) this.anims.set(i, { crop: i, kind: 'collapse', t: now, dur: COLLAPSE_S });
      } else if (hp < prev && this.anims.get(i)?.kind !== 'hit') this.anims.set(i, { crop: i, kind: 'hit', t: now, dur: 0.32 });
      this.lastHp[i] = f.dead[i] ? 0 : hp;
      this.writeCrop(i, now);
      this.writeStubble(i);
    });
    for (const a of this.anims.values()) {
      if (now - a.t >= a.dur) {
        this.anims.delete(a.crop);
        this.writeCrop(a.crop, now);
        this.writeStubble(a.crop);
      } else this.writeCrop(a.crop, now);
    }
    this.flush();
  }

  /** Plots joined the territory: their stubble is cleared away (the meadow dressing takes over). */
  onPlotsClaimed(plots: number[]): void {
    const f = this.sim.field;
    for (const p of plots) for (let i = f.plotStart[p]; i < f.plotStart[p + 1]; i++) this.writeStubble(i);
  }

  private aimAway(i: number, bodies: BodyPoints): void {
    const f = this.sim.field;
    let best = Infinity;
    let bx = 0;
    let bz = 0;
    for (let b = 0; b < bodies.count; b++) {
      const p = bodies.poses[b];
      const d = (p.x - f.x[i]) ** 2 + (p.z - f.z[i]) ** 2;
      if (d < best) {
        best = d;
        bx = p.x;
        bz = p.z;
      }
    }
    const dx = f.x[i] - bx;
    const dz = f.z[i] - bz;
    const l = Math.hypot(dx, dz);
    if (l > 1e-3) {
      this.dirX[i] = dx / l;
      this.dirZ[i] = dz / l;
    }
  }

  private clearDirty(t: number): void {
    const list = this.dirtyList[t];
    const mark = this.dirtyMark[t];
    for (let j = 0; j < this.dirtyN[t]; j++) mark[list[j]] = 0;
    this.dirtyN[t] = 0;
  }

  private flush(): void {
    for (let t = 0; t < 4; t++) {
      const n = this.dirtyN[t];
      if (n === 0) continue;
      const mesh = this.tierMeshes[t];
      // Sort the dirty slots in place (typed-array sort is numeric) and merge near neighbours into upload ranges.
      const idx = this.dirtyList[t].subarray(0, n).sort();
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceColor!.clearUpdateRanges();
      let start = idx[0];
      let prev = idx[0];
      for (let j = 1; j <= n; j++) {
        const v = j < n ? idx[j] : -1;
        if (j < n && v - prev <= 6) {
          prev = v;
          continue;
        }
        mesh.instanceMatrix.addUpdateRange(start * 16, (prev - start + 1) * 16);
        mesh.instanceColor!.addUpdateRange(start * 3, (prev - start + 1) * 3);
        start = v;
        prev = v;
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
      this.clearDirty(t);
    }
    if (this.stubbleDirty) {
      this.stubble.count = this.stubbleCount;
      this.stubble.visible = this.stubbleCount > 0;
      this.stubble.instanceMatrix.needsUpdate = true;
      this.stubbleDirty = false;
    }
  }

  /** World position of crop i (for particles / floaters). */
  cropPos(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.sim.field.x[i], 0.35, this.sim.field.z[i]);
  }
}
