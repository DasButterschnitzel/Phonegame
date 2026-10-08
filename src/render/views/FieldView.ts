import * as THREE from 'three';
import type { Sim } from '../../game/sim.ts';
import { FIELD } from '../../game/config.ts';
import { consumeDirty, markDirty } from '../../game/field.ts';
import { nearestS, sampleAt, type PathSample } from '../../game/path.ts';
import { cropMeshes, type CropMeshes } from '../geo/crops.ts';
import { stubbleGeometry } from '../geo/world.ts';
import { toon } from '../materials.ts';
import { C, E, M4, Q, S, UP, V, ZERO_SCALE } from '../scratch.ts';

type AnimKind = 'chew' | 'hit' | 'collapse';

interface Anim {
  crop: number;
  kind: AnimKind;
  t: number;
  dur: number;
}

/** Positions of the caterpillar's bodies this frame (head first), for directional hits. */
export interface BodyPoints {
  readonly poses: readonly { x: number; z: number }[];
  count: number;
}

/** A new bite carves in over this long (the notch opens rather than popping). */
const BITE_OPEN_S = 0.09;
const HIT_S = 0.34;
const CHEW_S = 0.14;
/** Final bite: a short squash (anticipation), then the stump tips away from the biter and sinks. */
const ANTICIPATE_S = 0.07;
const COLLAPSE_S = 0.3;
const STUBBLE_POP_S = 0.2;

/** Intact slot of a crop that is no longer drawn by its tier's intact mesh (bitten or gone, for good). */
const NO_SLOT = 0xffffffff;

interface Tier {
  meshes: CropMeshes;
  /**
   * The tier's untouched crops, packed at the front (`count` of them): a crop that is bitten or destroyed never comes
   * back (no regrowth), so its slot is released and zero-scaled, and the tier is repacked once enough holes pile up.
   * Zero-scaled instances cost nothing on screen but still run the vertex shader (late in a farm most crops are gone).
   */
  intact: THREE.InstancedMesh;
  /** Released (zero-scaled) intact slots since the last pack. */
  holes: number;
  /** The whole intact buffer needs uploading (after a pack). */
  full: boolean;
  /** Compact list of bitten crops, drawn with the bite shader. */
  bitten: THREE.InstancedMesh;
  bite: THREE.InstancedBufferAttribute;
  n: number;
  /** Bitten slot → crop. */
  crop: Int32Array;
  bittenDirty: boolean;
  /** Dirty intact slots (list + mark array: no Set / allocation per frame). */
  dirtyList: Int32Array;
  dirtyN: number;
  dirtyMark: Uint8Array;
}

const ps: PathSample = { x: 0, z: 0, tx: 0, tz: 0 };

/**
 * Crops: per tier one InstancedMesh for untouched crops and one for bitten ones, plus stubble for destroyed crops.
 * A crop looks eaten, not wilted: the first contact nibbles a notch on the side the caterpillar touched, the first
 * chunk takes a big bite, the second leaves a stump, the last one topples what is left. Bites are carved by the bite
 * shader (see `toon({ bite })`) from a per-instance stage + angles, so every notch faces the body that made it.
 * Only crops reported dirty by the simulation (or animating) are touched each frame.
 */
export class FieldView {
  readonly group = new THREE.Group();
  private tiers: Tier[] = [];
  private stubble!: THREE.InstancedMesh;
  /** Slot in its tier's intact mesh. */
  private inst!: Uint32Array;
  /** Slot in its tier's bitten mesh (−1 = still intact). */
  private bslot!: Int32Array;
  private stage!: Uint8Array;
  private fromStage!: Uint8Array;
  private stageT!: Float32Array;
  /** Bite angles (crop-local) per stage: 3 per crop. */
  private ang!: Float32Array;
  private lastHp!: Float32Array;
  /** Unit direction away from the body that bit last (the crop bends and topples this way). */
  private dirX!: Float32Array;
  private dirZ!: Float32Array;
  /** Set by `strike` (a chunk came off) and consumed by the next update. */
  private struck!: Uint8Array;
  private anims = new Map<number, Anim>();
  private stubbleDirty = false;
  /** Compact stubble instances (crop → slot, slot → crop) and the ones still popping up. */
  private stubbleSlot!: Int32Array;
  private slotCrop!: Int32Array;
  private stubbleCount = 0;
  private stubbleBorn!: Float32Array;
  private popping: number[] = [];
  private shownZone = 0;
  private now = 0;
  private mat = toon({ wind: 0.09, rim: 0.18 });
  private stubbleMat = toon({ rim: 0 });
  private sim: Sim;

  constructor(sim: Sim) {
    this.sim = sim;
    this.rebuild();
  }

  /** Rebuild meshes for the current farm (call after travel). */
  rebuild(): void {
    for (const t of this.tiers) {
      this.group.remove(t.intact, t.bitten);
      t.intact.dispose();
      t.bitten.dispose();
      // The bitten geometry wraps the shared crop attributes: release only its own instanced one.
      const g = t.bitten.geometry;
      for (const name of Object.keys(g.attributes)) if (name !== 'aBite') g.deleteAttribute(name);
      g.dispose();
      (t.bitten.material as THREE.Material).dispose();
    }
    if (this.stubble) {
      this.group.remove(this.stubble);
      this.stubble.dispose();
    }
    this.anims.clear();
    this.popping.length = 0;
    const { field, farm } = this.sim;
    const n = field.count;
    const counts = [0, 0, 0, 0];
    this.inst = new Uint32Array(n);
    for (let i = 0; i < n; i++) this.inst[i] = counts[field.tier[i]]++;
    this.tiers = farm.crops.map((cropId, t) => {
      const meshes = cropMeshes(cropId);
      const cap = Math.max(1, counts[t]);
      const intact = new THREE.InstancedMesh(meshes.intact, this.mat, cap);
      intact.count = counts[t];
      intact.name = `crops-${cropId}`;
      const bite = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      bite.setUsage(THREE.DynamicDrawUsage);
      const g = new THREE.BufferGeometry();
      for (const [name, a] of Object.entries(meshes.bitten.attributes)) g.setAttribute(name, a);
      g.boundingSphere = meshes.bitten.boundingSphere;
      g.setAttribute('aBite', bite);
      const shape = { value: new THREE.Vector4(meshes.shape.r, meshes.shape.h, meshes.shape.mid, meshes.shape.eq) };
      const bitten = new THREE.InstancedMesh(g, toon({ wind: 0.09, rim: 0.18, bite: shape }), cap);
      bitten.count = 0;
      bitten.visible = false;
      bitten.name = `bitten-${cropId}`;
      for (const m of [intact, bitten]) {
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        m.setColorAt(0, C.set(0xffffff));
        m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
        this.group.add(m);
      }
      return {
        meshes,
        intact,
        holes: 0,
        full: false,
        bitten,
        bite,
        n: 0,
        crop: new Int32Array(cap).fill(-1),
        bittenDirty: false,
        dirtyList: new Int32Array(cap),
        dirtyN: 0,
        dirtyMark: new Uint8Array(cap),
      };
    });
    this.stubble = new THREE.InstancedMesh(stubbleGeometry(), this.stubbleMat, Math.max(1, n));
    this.stubble.count = 0;
    this.stubbleCount = 0;
    this.stubbleSlot = new Int32Array(n).fill(-1);
    this.slotCrop = new Int32Array(n).fill(-1);
    // Stubble restored from a save is simply there (no pop).
    this.stubbleBorn = new Float32Array(n).fill(-1e9);
    this.stubble.frustumCulled = false;
    this.stubble.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.stubble);
    this.bslot = new Int32Array(n).fill(-1);
    this.stage = new Uint8Array(n);
    this.fromStage = new Uint8Array(n);
    this.stageT = new Float32Array(n).fill(-1e9);
    this.ang = new Float32Array(n * 3);
    this.struck = new Uint8Array(n);
    this.lastHp = Float32Array.from(field.hp);
    this.dirX = new Float32Array(n);
    this.dirZ = new Float32Array(n);
    this.shownZone = this.sim.state.progress.zone;
    const path = this.sim.path;
    for (let i = 0; i < n; i++) {
      const s = this.visualStage(i);
      if (s > 0 && !field.dead[i]) {
        // Crops chewed before a reload face the route (where their bites came from).
        sampleAt(path, nearestS(path, field.x[i], field.z[i]), ps);
        this.setAway(i, ps.x, ps.z);
        const a = this.localBiteAngle(i);
        for (let k = 0; k < s; k++) this.ang[i * 3 + k] = a + (k - 1) * 0.35;
        this.stage[i] = this.fromStage[i] = s;
        this.enterBitten(i);
      } else {
        const a = field.seed[i] * 40;
        this.dirX[i] = Math.cos(a);
        this.dirZ[i] = Math.sin(a);
      }
      this.writeCrop(i);
      this.writeStubble(i);
    }
    for (let t = 0; t < this.tiers.length; t++) this.pack(t);
    this.flush();
  }

  /** Packs tier t's untouched crops to the front of its intact buffer (keeping field order) and drops the rest. */
  private pack(t: number): void {
    const f = this.sim.field;
    const tier = this.tiers[t];
    let k = 0;
    for (let i = 0; i < f.count; i++) {
      if (f.tier[i] !== t) continue;
      this.inst[i] = !f.dead[i] && this.bslot[i] < 0 && this.stage[i] === 0 ? k++ : NO_SLOT;
    }
    this.clearDirty(tier);
    tier.intact.count = k;
    tier.holes = 0;
    tier.full = true;
    for (let i = 0; i < f.count; i++) if (f.tier[i] === t && this.inst[i] !== NO_SLOT) this.writeCrop(i);
    this.clearDirty(tier);
  }

  /** 0 untouched · 1 nibbled · 2 bitten (one chunk gone) · 3 stump (two gone). Dead crops count as a stump. */
  private visualStage(i: number): number {
    const f = this.sim.field;
    if (f.dead[i]) return 3;
    const hpc = f.maxHp[i] / FIELD.CHUNKS;
    const left = Math.ceil(f.hp[i] / hpc - 1e-6);
    if (left >= FIELD.CHUNKS) return f.hp[i] < f.maxHp[i] - 1e-6 ? 1 : 0;
    return Math.min(3, FIELD.CHUNKS - left + 1);
  }

  /** Bite direction (towards the biter, i.e. against dirX/dirZ) in the crop's own rotated frame. */
  private localBiteAngle(i: number): number {
    const yaw = this.sim.field.seed[i] * 6.283;
    const ux = -this.dirX[i];
    const uz = -this.dirZ[i];
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return Math.atan2(ux * s + uz * c, ux * c - uz * s);
  }

  private setAway(i: number, bx: number, bz: number): void {
    const f = this.sim.field;
    const dx = f.x[i] - bx;
    const dz = f.z[i] - bz;
    const l = Math.hypot(dx, dz);
    if (l > 1e-3) {
      this.dirX[i] = dx / l;
      this.dirZ[i] = dz / l;
    }
  }

  /**
   * A chunk was just bitten off crop i by the body at (bx, bz): the crop recoils away from it and the next bite faces
   * it. Call before `update` in the same frame (simulation events are handled first).
   */
  strike(i: number, bx: number, bz: number): void {
    this.setAway(i, bx, bz);
    this.struck[i] = 1;
  }

  /** No bite, just a shove: crop i flinches away from (fx, fz) (land pushing out, a shockwave passing). */
  nudge(i: number, fx: number, fz: number, now: number): void {
    if (this.sim.field.dead[i] || this.anims.has(i)) return;
    this.setAway(i, fx, fz);
    this.anims.set(i, { crop: i, kind: 'hit', t: now, dur: HIT_S });
  }

  /** World point on crop i's surface facing whoever bit it last (debris and the chunk start here). */
  contact<T extends { x: number; y: number; z: number }>(i: number, out: T): T {
    const f = this.sim.field;
    const sh = this.tiers[f.tier[i]].meshes.shape;
    const base = 0.85 + 0.3 * f.seed[i];
    const k = base * sh.r * 0.85;
    out.x = f.x[i] - this.dirX[i] * k;
    out.y = Math.max(sh.mid, sh.eq) * 1.05 * base;
    out.z = f.z[i] - this.dirZ[i] * k;
    return out;
  }

  private enterBitten(i: number): void {
    if (this.bslot[i] >= 0) return;
    const tier = this.tiers[this.sim.field.tier[i]];
    const slot = tier.n++;
    tier.crop[slot] = i;
    this.bslot[i] = slot;
    tier.bittenDirty = true;
    // The untouched copy disappears in the same frame the bitten one appears, and gives up its slot.
    if (this.inst[i] !== NO_SLOT) {
      tier.intact.setMatrixAt(this.inst[i], ZERO_SCALE);
      this.markIntact(i);
      this.inst[i] = NO_SLOT;
      tier.holes++;
    }
  }

  /** Swap-remove crop i from its tier's bitten list (after it has collapsed). */
  private leaveBitten(i: number): void {
    const slot = this.bslot[i];
    if (slot < 0) return;
    const tier = this.tiers[this.sim.field.tier[i]];
    const last = --tier.n;
    const moved = tier.crop[last];
    tier.crop[last] = -1;
    this.bslot[i] = -1;
    if (last !== slot) {
      tier.crop[slot] = moved;
      this.bslot[moved] = slot;
      this.writeCrop(moved);
    }
    tier.bittenDirty = true;
  }

  private markIntact(i: number): void {
    const t = this.tiers[this.sim.field.tier[i]];
    const k = this.inst[i];
    if (k !== NO_SLOT && !t.dirtyMark[k]) {
      t.dirtyMark[k] = 1;
      t.dirtyList[t.dirtyN++] = k;
    }
  }

  /** Stubble marks a destroyed crop until its plot joins the territory; it pops up as the crop goes down. */
  private writeStubble(i: number): void {
    const f = this.sim.field;
    const want = f.dead[i] === 1 && !this.sim.terr.claimed[f.plot[i]] && this.anims.get(i)?.kind !== 'collapse';
    let slot = this.stubbleSlot[i];
    if (want) {
      if (slot < 0) {
        slot = this.stubbleCount++;
        this.stubbleSlot[i] = slot;
        this.slotCrop[slot] = i;
        if (this.lastHp[i] === 0 && this.stubbleBorn[i] < -1e8 && this.now > 0) {
          this.stubbleBorn[i] = this.now;
          this.popping.push(i);
        }
      }
      const u = (this.now - this.stubbleBorn[i]) / STUBBLE_POP_S;
      // Pops up with a little overshoot.
      const pop = u >= 1 ? 1 : Math.max(0.05, Math.sin(Math.min(1, u * 1.3) * Math.PI * 0.5) * (1 + 0.18 * Math.sin(u * Math.PI)));
      V.set(f.x[i], 0, f.z[i]);
      Q.setFromAxisAngle(UP, f.seed[i] * 6.28);
      S.setScalar((0.85 + 0.3 * f.seed[i]) * pop);
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

  /** Writes crop i's matrix, colour and bite into whichever mesh shows it. */
  private writeCrop(i: number): void {
    const f = this.sim.field;
    const t = f.tier[i];
    const tier = this.tiers[t];
    const now = this.now;
    const a = this.anims.get(i);
    const slot = this.bslot[i];
    // Neither bitten nor holding an intact slot: gone (dead, collapse over).
    if (slot < 0 && this.inst[i] === NO_SLOT) return;
    if (slot < 0) this.markIntact(i);
    else tier.bittenDirty = true;
    const mesh = slot >= 0 ? tier.bitten : tier.intact;
    const k = slot >= 0 ? slot : this.inst[i];
    if ((f.dead[i] && (!a || a.kind !== 'collapse')) || (slot < 0 && this.stage[i] > 0)) {
      // Gone, or drawn by the bitten mesh.
      mesh.setMatrixAt(k, ZERO_SCALE);
      return;
    }
    // The geometry shows the bites; the crop itself only droops a little and leans away from the side it lost.
    const raw = f.dead[i] ? 0.15 : f.hp[i] / f.maxHp[i];
    const d = 1 - raw;
    const base = 0.85 + 0.3 * f.seed[i];
    let sxz = base * (1 - 0.05 * d);
    let sy = base * (1 - 0.1 * d);
    let lean = slot >= 0 ? 0.06 + 0.22 * d : 0;
    let sink = 0;
    if (a) {
      const u = Math.min(1, (now - a.t) / a.dur);
      if (a.kind === 'hit') {
        // Recoil away from the bite, swing back past upright, settle; a short impact squash on contact.
        const env = Math.exp(-5 * u);
        lean += Math.sin(u * Math.PI * 2.6) * env * 0.42;
        const sq = u < 0.25 ? Math.sin((u / 0.25) * Math.PI) : 0;
        sy *= 1 - 0.16 * sq;
        sxz *= 1 + 0.1 * sq;
      } else if (a.kind === 'chew') {
        // Being chewed: a small shiver against the blades.
        const env = 1 - u;
        lean += Math.sin(now * 58 + f.seed[i] * 20) * 0.05 * env;
        sxz *= 1 + Math.sin(now * 47 + f.seed[i] * 9) * 0.025 * env;
      } else {
        // Final bite: squash (anticipation) → tip away and sink, fast → gone; the stubble pops up underneath.
        const ta = ANTICIPATE_S / a.dur;
        if (u < ta) {
          const v = Math.sin((u / ta) * Math.PI * 0.5);
          sy *= 1 - 0.22 * v;
          sxz *= 1 + 0.14 * v;
          lean -= 0.12 * v;
        } else {
          const e = ((u - ta) / (1 - ta)) ** 2;
          lean = lean - 0.12 + 1.45 * e;
          sy *= 0.78 * (1 - 0.9 * e);
          sxz *= 1.14 * (1 - 0.55 * e);
          sink = 0.12 * e;
        }
      }
    }
    const dx = this.dirX[i];
    const dz = this.dirZ[i];
    V.set(f.x[i], -sink, f.z[i]);
    // Tilt about the axis perpendicular to the push direction.
    E.set(lean * dz, f.seed[i] * 6.283, -lean * dx, 'YXZ');
    Q.setFromEuler(E);
    S.set(sxz, sy, sxz);
    mesh.setMatrixAt(k, M4.compose(V, Q, S));
    // Golden crops glow; chewed crops pale a little; crops behind a closed fence are dimmed.
    if (f.golden[i]) C.setRGB(1.7, 1.35, 0.35);
    else C.setRGB(1 + 0.05 * d, 1 - 0.07 * d, 1 - 0.22 * d);
    if (t > this.sim.state.progress.zone) C.multiplyScalar(0.62);
    mesh.setColorAt(k, C);
    if (slot >= 0) {
      const s = this.stage[i];
      const from = this.fromStage[i];
      const u = Math.min(1, (now - this.stageT[i]) / BITE_OPEN_S);
      tier.bite.setXYZW(slot, from + (s - from) * u, this.ang[i * 3], this.ang[i * 3 + 1], this.ang[i * 3 + 2]);
    }
  }

  /** Per frame: apply simulation changes and running animations. `bodies` aims bites at the chompers. */
  update(now: number, bodies?: BodyPoints): void {
    this.now = now;
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
      const strong = this.struck[i] === 1;
      this.struck[i] = 0;
      if (hp < prev && bodies && !strong) this.aimAway(i, bodies);
      const s = f.dead[i] ? 3 : this.visualStage(i);
      let opened = false;
      if (s > this.stage[i]) {
        // New bites face the body that made them (later bites fan out a little so the notches don't overlap).
        const ang = this.localBiteAngle(i);
        for (let k = this.stage[i]; k < s; k++) this.ang[i * 3 + k] = ang + (k - this.stage[i]) * 0.45;
        this.fromStage[i] = this.stage[i];
        this.stage[i] = s;
        this.stageT[i] = now;
        this.enterBitten(i);
        opened = true;
      }
      if (f.dead[i]) {
        if (prev > 0) this.anims.set(i, { crop: i, kind: 'collapse', t: now, dur: COLLAPSE_S });
      } else if (hp < prev) {
        // A bite (a chunk, or the first nibble) knocks the crop back; chewing in between only makes it shiver.
        const cur = this.anims.get(i);
        if (strong || opened) this.anims.set(i, { crop: i, kind: 'hit', t: now, dur: HIT_S });
        else if (!cur || cur.kind === 'chew') this.anims.set(i, { crop: i, kind: 'chew', t: now, dur: CHEW_S });
      }
      this.lastHp[i] = f.dead[i] ? 0 : hp;
      this.writeCrop(i);
      this.writeStubble(i);
    });
    for (const a of this.anims.values()) {
      const i = a.crop;
      if (now - a.t >= a.dur && now - this.stageT[i] >= BITE_OPEN_S) {
        this.anims.delete(i);
        if (f.dead[i]) this.leaveBitten(i);
        this.writeCrop(i);
        this.writeStubble(i);
      } else this.writeCrop(i);
    }
    if (this.popping.length) {
      let w = 0;
      for (const i of this.popping) {
        this.writeStubble(i);
        if (now - this.stubbleBorn[i] < STUBBLE_POP_S && this.stubbleSlot[i] >= 0) this.popping[w++] = i;
      }
      this.popping.length = w;
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
    this.setAway(i, bx, bz);
  }

  private clearDirty(t: Tier): void {
    for (let j = 0; j < t.dirtyN; j++) t.dirtyMark[t.dirtyList[j]] = 0;
    t.dirtyN = 0;
  }

  private flush(): void {
    for (let ti = 0; ti < this.tiers.length; ti++) {
      const t = this.tiers[ti];
      // Enough released slots: repack (rare — a full upload of a few hundred matrices).
      if (t.holes > Math.max(16, t.intact.count * 0.15)) this.pack(ti);
      if (t.full) {
        t.full = false;
        const mesh = t.intact;
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceColor!.clearUpdateRanges();
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor!.needsUpdate = true;
        this.clearDirty(t);
      }
      const n = t.dirtyN;
      if (n > 0) {
        const mesh = t.intact;
        // Sort the dirty slots in place (typed-array sort is numeric) and merge near neighbours into upload ranges.
        const idx = t.dirtyList.subarray(0, n).sort();
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
      if (t.bittenDirty) {
        t.bittenDirty = false;
        const b = t.bitten;
        b.count = t.n;
        b.visible = t.n > 0;
        for (const attr of [b.instanceMatrix, b.instanceColor!, t.bite]) {
          attr.clearUpdateRanges();
          if (t.n > 0) attr.addUpdateRange(0, t.n * attr.itemSize);
          attr.needsUpdate = true;
        }
      }
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

  /** Number of crops currently drawn with the bite shader (tests / debug). */
  get bittenCount(): number {
    let n = 0;
    for (const t of this.tiers) n += t.n;
    return n;
  }
}
