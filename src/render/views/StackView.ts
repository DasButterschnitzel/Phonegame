import * as THREE from 'three';
import type { Sim } from '../../game/sim.ts';
import { capacityPerSegment, maxBlocks } from '../../game/config.ts';
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
const WHITE = new THREE.Color(0xffffff);

/** Mark only the first `n` instances (matrix + colour) for upload. */
function uploadRange(m: THREE.InstancedMesh, n: number): void {
  const im = m.instanceMatrix;
  im.clearUpdateRanges();
  if (n > 0) im.addUpdateRange(0, n * 16);
  im.needsUpdate = true;
  const ic = m.instanceColor;
  if (ic) {
    ic.clearUpdateRanges();
    if (n > 0) ic.addUpdateRange(0, n * 3);
    ic.needsUpdate = true;
  }
}

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
  /** Body pose index to home in on (chunks flying into a stack), −1 = fixed end point. */
  track: number;
  /** Block scale in flight (the last chunk of a crop is the big one). */
  size: number;
  /** Counts towards the landing callback (unloads only). */
  land: boolean;
  arc: number;
}

/**
 * The loot stack on every segment — the game's key "look how much I'm hauling" reward.
 * Wobbles on a damped spring driven by the segment's acceleration. Chunks arc from the bitten crop into the stack;
 * at the depot each segment tips its stack into the hopper as it rolls past (the simulation's rolling unload).
 */
export class StackView {
  readonly group = new THREE.Group();
  private blocks: THREE.InstancedMesh;
  private blockOutline: THREE.InstancedMesh | null;
  private fliers: THREE.InstancedMesh;
  private springs = new Map<number, Spring>();
  private shown = new Map<number, number>();
  private popAt = new Map<number, number>();
  private flying: Flier[] = [];
  private sim: Sim;
  private cat: CaterpillarView;
  private tierColors: number[] = [];
  /** Where unloaded blocks fly (the depot hopper). */
  readonly target = new THREE.Vector3();
  /** Called (throttled) when unloaded blocks land in the hopper. */
  onLand: (count: number) => void = () => {};
  private landed = 0;
  private lastLandCall = 0;
  private liveTiers = new Uint8Array(MAX_BLOCKS);
  private prevBlocks = -1;
  private prevFliers = -1;

  constructor(sim: Sim, cat: CaterpillarView, outlines = true) {
    this.sim = sim;
    this.cat = cat;
    const mat = toon({ rim: 0.3 });
    this.blocks = new THREE.InstancedMesh(blockGeometry(), mat, MAX_SEGS * MAX_BLOCKS);
    this.blocks.setColorAt(0, C.set(0xffffff));
    this.blockOutline = outlines ? instancedOutline(this.blocks, 0.025) : null;
    if (this.blockOutline) this.group.add(this.blockOutline);
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
    this.flying.length = 0;
  }

  /** Segment k just tipped `mass` of cargo into the hopper (its stack is already empty in the simulation). */
  onUnloadSeg(k: number, mass: number, now: number): void {
    const pose = this.cat.poses[k + 1];
    if (!pose) return;
    const n = this.blocksFor(mass);
    const st = this.sim.state;
    const tiers = this.layerTiers(st.basket.massByTier, Math.max(1e-6, st.basket.mass), n);
    for (let b = 0; b < n; b++) {
      if (this.flying.length >= FLIERS) break;
      const layer = Math.floor(b / PER_LAYER);
      this.flying.push({
        sx: pose.x + ((b % 2) - 0.5) * 0.3,
        sy: pose.y + BASE_Y + layer * LAYER_H,
        sz: pose.z,
        ex: this.target.x + (Math.random() - 0.5) * 0.3,
        ey: this.target.y,
        ez: this.target.z + (Math.random() - 0.5) * 0.3,
        t0: now + (n - 1 - b) * 0.018,
        dur: 0.32 + Math.random() * 0.08,
        color: this.tierColors[st.basket.mass > 0 ? tiers[b] : 0] ?? 0xffffff,
        spin: (Math.random() - 0.5) * 12,
        track: -1,
        size: 1,
        land: true,
        arc: 1.1,
      });
    }
  }

  /** A chunk bitten off at (x, y, z) flies into body b's stack (the head feeds the first segment). */
  chunk(x: number, y: number, z: number, color: number, body: number, now: number, big = false): void {
    if (this.flying.length >= FLIERS) return;
    const nSegs = this.sim.state.progress.segments.length;
    const track = Math.max(1, Math.min(nSegs, body));
    this.flying.push({ sx: x, sy: y, sz: z, ex: 0, ey: 0, ez: 0, t0: now, dur: 0.3, color, spin: (Math.random() - 0.5) * 16, track, size: big ? 1.05 : 0.7, land: false, arc: 0.9 });
  }

  /** Cargo carried by segment i (index in the chain), honouring a rolling unload in progress. */
  private segMass(i: number, nSegs: number): number {
    const st = this.sim.state;
    const d = st.depot;
    if (!d.active) return st.basket.mass / Math.max(1, nSegs);
    const pending = Math.max(0, d.mass - d.paidMass);
    const fresh = Math.max(0, st.basket.mass - pending);
    if (i < d.done) return fresh / Math.max(1, d.done);
    return i < d.segs ? pending / Math.max(1, d.segs - d.done) : 0;
  }

  private blocksFor(mass: number): number {
    const cap = capacityPerSegment(this.sim.state.progress.capacityLevel);
    const fill = Math.min(2, mass / Math.max(1, cap));
    const n = Math.round(fill * maxBlocks(this.sim.state.progress.capacityLevel));
    return Math.min(MAX_BLOCKS, mass > 0.01 ? Math.max(1, n) : 0);
  }

  private layerTiers(massByTier: number[], mass: number, n: number, out = new Uint8Array(n)): Uint8Array {
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

  update(now: number, dt: number): void {
    const st = this.sim.state;
    const segs = st.progress.segments;
    const liveTiers = this.layerTiers(st.basket.massByTier, st.basket.mass, MAX_BLOCKS, this.liveTiers);
    const k = 70;
    const c = 7;
    let idx = 0;
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

      const segMass = this.segMass(i, segs.length);
      const n = this.blocksFor(segMass);
      const tiers = liveTiers;
      // A full stack's top flashes: "I can't take more — go unload".
      const full = segMass >= capacityPerSegment(st.progress.capacityLevel) - 0.01;
      const flash = full ? 0.5 + 0.5 * Math.sin(now * 9 + i * 0.7) : 0;
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
        C.setHex(this.tierColors[tiers[b]] ?? 0xffffff);
        if (flash > 0 && b >= n - PER_LAYER) C.lerp(WHITE, flash * 0.6);
        this.blocks.setColorAt(idx, C);
        idx++;
      }
    }
    this.blocks.count = idx;
    if (this.blockOutline) this.blockOutline.count = idx;
    // Upload only the instances in use (the full buffers are ~90 KB).
    if (idx > 0 || this.prevBlocks !== 0) uploadRange(this.blocks, idx);
    this.prevBlocks = idx;
    // Forget springs / pop state of merged-away segments.
    if (this.springs.size > segs.length + 8) {
      const ids = new Set(segs.map((s) => s.id));
      for (const id of [...this.springs.keys()]) {
        if (ids.has(id)) continue;
        this.springs.delete(id);
        this.shown.delete(id);
        this.popAt.delete(id);
      }
    }
    this.updateFliers(now);
  }

  private updateFliers(now: number): void {
    if (this.flying.length === 0 && this.prevFliers === 0) return;
    let idx = 0;
    // Compact landed fliers in place (no per-frame array allocation).
    let w = 0;
    let landedNow = 0;
    for (const f of this.flying) {
      if (now - f.t0 >= f.dur) {
        if (f.land) landedNow++;
      } else this.flying[w++] = f;
    }
    this.flying.length = w;
    if (landedNow) this.landed += landedNow;
    if (this.landed && now - this.lastLandCall > 0.12) {
      this.lastLandCall = now;
      this.onLand(this.landed);
      this.landed = 0;
    }
    for (const f of this.flying) {
      const u = Math.max(0, (now - f.t0) / f.dur);
      if (f.track >= 0) {
        // Home in on the (moving) stack top.
        const p = this.cat.poses[f.track];
        f.ex = p.x;
        f.ez = p.z;
        f.ey = p.y + BASE_Y + Math.ceil((this.shown.get(this.sim.state.progress.segments[f.track - 1]?.id ?? -1) ?? 0) / PER_LAYER) * LAYER_H;
      }
      const e = f.track >= 0 ? u * u * (3 - 2 * u) : u;
      const x = f.sx + (f.ex - f.sx) * e;
      const z = f.sz + (f.ez - f.sz) * e;
      const y = f.sy + (f.ey - f.sy) * e + Math.sin(u * Math.PI) * f.arc;
      V.set(x, y, z);
      E.set(f.spin * u, f.spin * u * 0.7, 0);
      Q.setFromEuler(E);
      S.setScalar(f.size * (u > 0.85 ? (1 - u) / 0.15 : u < 0 ? 0 : 1));
      M4.compose(V, Q, S);
      this.fliers.setMatrixAt(idx, M4);
      this.fliers.setColorAt(idx, C.setHex(f.color));
      idx++;
    }
    this.fliers.count = idx;
    uploadRange(this.fliers, idx);
    this.prevFliers = idx;
  }

  /** Number of blocks currently drawn (tests / debug). */
  get blockCount(): number {
    return this.blocks.count;
  }
}

