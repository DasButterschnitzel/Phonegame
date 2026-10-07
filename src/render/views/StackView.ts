import * as THREE from 'three';
import type { Sim } from '../../game/sim.ts';
import { BODY, capacityOf, maxBlocks } from '../../game/config.ts';
import { blockGeometry } from '../geo/caterpillar.ts';
import { instancedOutline, toon } from '../materials.ts';
import { TIER_BLOCK_COLORS } from '../palette.ts';
import { C, E, M4, Q, S, V } from '../scratch.ts';
import type { CaterpillarView } from './CaterpillarView.ts';

const MAX_SEGS = 32;
const MAX_BLOCKS = 36; // 2 × the tallest stack (tornado overflow)
const PER_LAYER = 2;
const LAYER_H = 0.21;
const BASE_Y = 1.08;
const FLIERS = 480;

interface Spring {
  ox: number;
  oz: number;
  vx: number;
  vz: number;
  px: number;
  pz: number;
  pvx: number;
  pvz: number;
  init: boolean;
}

interface Snapshot {
  n: number;
  tiers: Uint8Array;
  /** Head arc position at which this segment passes the barn. */
  untilHeadS: number;
}

interface Flier {
  sx: number;
  sy: number;
  sz: number;
  ex: number;
  ey: number;
  ez: number;
  t0: number;
  dur: number;
  color: number;
  spin: number;
}

/**
 * The loot stack on every segment — the game's key "look how much I'm hauling" reward.
 * Wobbles on a damped spring driven by the segment's acceleration; unloads into the barn segment by segment.
 */
export class StackView {
  readonly group = new THREE.Group();
  private blocks: THREE.InstancedMesh;
  private blockOutline: THREE.InstancedMesh;
  private fliers: THREE.InstancedMesh;
  private springs = new Map<number, Spring>();
  private snaps = new Map<number, Snapshot>();
  private shown = new Map<number, number>();
  private popAt = new Map<number, number>();
  private flying: Flier[] = [];
  private sim: Sim;
  private cat: CaterpillarView;
  private tierColors: number[] = [];
  /** Called (throttled) when unloaded blocks land in the barn. */
  onLand: (count: number) => void = () => {};
  private landed = 0;
  private lastLandCall = 0;

  constructor(sim: Sim, cat: CaterpillarView) {
    this.sim = sim;
    this.cat = cat;
    const mat = toon({ rim: 0.3 });
    this.blocks = new THREE.InstancedMesh(blockGeometry(), mat, MAX_SEGS * MAX_BLOCKS);
    this.blocks.setColorAt(0, C.set(0xffffff));
    this.blockOutline = instancedOutline(this.blocks, 0.025);
    this.group.add(this.blockOutline);
    this.fliers = new THREE.InstancedMesh(blockGeometry(), mat, FLIERS);
    this.fliers.setColorAt(0, C.set(0xffffff));
    for (const m of [this.blocks, this.fliers]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      this.group.add(m);
    }
    this.onFarmChanged();
  }

  onFarmChanged(): void {
    this.tierColors = TIER_BLOCK_COLORS[this.sim.farm.id];
    this.snaps.clear();
  }

  /** Called on the unload event: each segment keeps showing its load until it passes the barn. */
  onUnload(massByTier: number[], mass: number): void {
    const st = this.sim.state;
    const segs = st.progress.segments;
    const n = this.stackHeight(mass);
    const tiers = this.layerTiers(massByTier, mass, n);
    segs.forEach((seg, i) => {
      const slot = this.cat.slotOf(seg.id) ?? i;
      this.snaps.set(seg.id, { n, tiers, untilHeadS: st.headS + BODY.HEAD_GAP + slot * BODY.SEG_SPACING });
    });
  }

  private stackHeight(mass: number): number {
    const cap = capacityOf(this.sim.state);
    const fill = Math.min(2, mass / Math.max(1, cap));
    const n = Math.round(fill * maxBlocks(this.sim.state.progress.capacityLevel));
    return Math.min(MAX_BLOCKS, mass > 0 ? Math.max(1, n) : 0);
  }

  private layerTiers(massByTier: number[], mass: number, n: number): Uint8Array {
    const out = new Uint8Array(n);
    let acc = 0;
    let tier = 0;
    for (let k = 0; k < n; k++) {
      const target = ((k + 0.5) / n) * mass;
      while (tier < 4 && acc + massByTier[tier] < target) {
        acc += massByTier[tier];
        tier++;
      }
      out[k] = tier;
    }
    return out;
  }

  update(now: number, dt: number, headS: number): void {
    const st = this.sim.state;
    const segs = st.progress.segments;
    const live = this.stackHeight(st.basket.mass);
    const liveTiers = this.layerTiers(st.basket.massByTier, st.basket.mass, live);
    const k = 70;
    const c = 7;
    let idx = 0;
    const barn = this.sim.farm.barn;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const pose = this.cat.poses[i + 1];
      // Spring driven by the segment's acceleration (inertia makes the stack lean the other way).
      let sp = this.springs.get(seg.id);
      if (!sp) {
        sp = { ox: 0, oz: 0, vx: 0, vz: 0, px: pose.x, pz: pose.z, pvx: 0, pvz: 0, init: false };
        this.springs.set(seg.id, sp);
      }
      const d = Math.max(1e-3, dt);
      const vx = (pose.x - sp.px) / d;
      const vz = (pose.z - sp.pz) / d;
      let ax = sp.init ? (vx - sp.pvx) / d : 0;
      let az = sp.init ? (vz - sp.pvz) / d : 0;
      const amax = 60;
      ax = Math.max(-amax, Math.min(amax, ax));
      az = Math.max(-amax, Math.min(amax, az));
      sp.init = true;
      sp.px = pose.x;
      sp.pz = pose.z;
      sp.pvx = vx;
      sp.pvz = vz;
      const gain = 0.012;
      sp.vx += (-k * sp.ox - c * sp.vx - ax * gain * k) * d;
      sp.vz += (-k * sp.oz - c * sp.vz - az * gain * k) * d;
      sp.ox += sp.vx * d;
      sp.oz += sp.vz * d;
      const lim = 0.35;
      sp.ox = Math.max(-lim, Math.min(lim, sp.ox));
      sp.oz = Math.max(-lim, Math.min(lim, sp.oz));

      // Which load does this segment show? Its pre-unload snapshot until it reaches the barn.
      let n = live;
      let tiers = liveTiers;
      const snap = this.snaps.get(seg.id);
      if (snap) {
        if (headS >= snap.untilHeadS) {
          this.launch(snap, pose.x, pose.z, barn.bx, barn.bz, now);
          this.snaps.delete(seg.id);
        } else {
          n = snap.n;
          tiers = snap.tiers;
        }
      }
      const prevShown = this.shown.get(seg.id) ?? 0;
      if (n > prevShown) this.popAt.set(seg.id, now);
      this.shown.set(seg.id, n);
      const pop = this.popAt.get(seg.id);
      const layers = Math.ceil(n / PER_LAYER);
      const sway = Math.sin(now * 2.3 + i) * 0.015 * Math.min(1, st.v);
      const cy = Math.cos(pose.yaw);
      const sy = Math.sin(pose.yaw);
      for (let b = 0; b < n && idx < MAX_SEGS * MAX_BLOCKS; b++) {
        const layer = Math.floor(b / PER_LAYER);
        const side = (b % PER_LAYER) - 0.5;
        const h = layers > 1 ? layer / (layers - 1) : 0;
        const bend = h ** 1.5;
        const lx = side * 0.31 + (layer % 2 ? 0.04 : -0.04);
        const lz = (layer % 2 ? 0.05 : -0.05) * (side > 0 ? 1 : -1);
        let scale = 1;
        if (pop !== undefined && b >= prevShown) {
          const u = Math.min(1, (now - pop) / 0.18);
          scale = 0.2 + 0.8 * u + Math.sin(u * Math.PI) * 0.25;
        }
        V.set(
          pose.x + lx * cy + lz * sy + (sp.ox + sway * -sy) * bend,
          pose.y + BASE_Y + layer * LAYER_H,
          pose.z - lx * sy + lz * cy + (sp.oz + sway * -cy) * bend,
        );
        E.set(sp.oz * bend * 0.6, pose.yaw + (layer % 2) * 0.12, -sp.ox * bend * 0.6);
        Q.setFromEuler(E);
        S.setScalar(scale);
        M4.compose(V, Q, S);
        this.blocks.setMatrixAt(idx, M4);
        this.blocks.setColorAt(idx, C.setHex(this.tierColors[tiers[b]] ?? 0xffffff));
        idx++;
      }
    }
    this.blocks.count = idx;
    this.blockOutline.count = idx;
    this.blocks.instanceMatrix.needsUpdate = true;
    if (this.blocks.instanceColor) this.blocks.instanceColor.needsUpdate = true;
    // Forget springs of merged-away segments.
    if (this.springs.size > segs.length + 8) {
      const ids = new Set(segs.map((s) => s.id));
      for (const id of [...this.springs.keys()]) if (!ids.has(id)) this.springs.delete(id);
    }
    this.updateFliers(now);
  }

  private launch(snap: Snapshot, x: number, z: number, bx: number, bz: number, now: number): void {
    const dx = bx - x;
    const dz = bz - z;
    const L = Math.hypot(dx, dz) || 1;
    // Aim at the barn door (the side facing the path).
    const ex = bx - (dx / L) * 1.2;
    const ez = bz - (dz / L) * 1.2;
    for (let b = 0; b < snap.n; b++) {
      if (this.flying.length >= FLIERS) this.flying.shift();
      const layer = Math.floor(b / PER_LAYER);
      this.flying.push({
        sx: x + ((b % 2) - 0.5) * 0.3,
        sy: BASE_Y + layer * LAYER_H,
        sz: z,
        ex,
        ey: 0.8,
        ez,
        t0: now + b * 0.025,
        dur: 0.45 + Math.random() * 0.1,
        color: this.tierColors[snap.tiers[b]] ?? 0xffffff,
        spin: (Math.random() - 0.5) * 12,
      });
    }
  }

  private updateFliers(now: number): void {
    let idx = 0;
    let landedNow = 0;
    for (const f of this.flying) if (now - f.t0 >= f.dur) landedNow++;
    if (landedNow) {
      this.landed += landedNow;
      if (now - this.lastLandCall > 0.12) {
        this.lastLandCall = now;
        this.onLand(this.landed);
        this.landed = 0;
      }
      this.flying = this.flying.filter((f) => now - f.t0 < f.dur);
    }
    for (const f of this.flying) {
      const u = Math.max(0, (now - f.t0) / f.dur);
      const x = f.sx + (f.ex - f.sx) * u;
      const z = f.sz + (f.ez - f.sz) * u;
      const y = f.sy + (f.ey - f.sy) * u + Math.sin(u * Math.PI) * 1.6;
      V.set(x, y, z);
      E.set(f.spin * u, f.spin * u * 0.7, 0);
      Q.setFromEuler(E);
      S.setScalar(u > 0.85 ? (1 - u) / 0.15 : 1);
      M4.compose(V, Q, S);
      this.fliers.setMatrixAt(idx, M4);
      this.fliers.setColorAt(idx, C.setHex(f.color));
      idx++;
    }
    this.fliers.count = idx;
    this.fliers.instanceMatrix.needsUpdate = true;
    if (this.fliers.instanceColor) this.fliers.instanceColor.needsUpdate = true;
  }

  /** Number of blocks currently drawn (tests / debug). */
  get blockCount(): number {
    return this.blocks.count;
  }
}

