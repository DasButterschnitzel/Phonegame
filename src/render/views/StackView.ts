import * as THREE from 'three';
import type { Sim } from '../../game/sim.ts';
import { capacityPerSegment, maxBlocks, unloadAt } from '../../game/config.ts';
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
/** Chunk flight time range (s): short hops for nearby stacks, a little longer across the body. */
const CHUNK_MIN_S = 0.17;
const CHUNK_MAX_S = 0.34;
/** A landing squashes the stack this much (and the segment dips, see CaterpillarView.land). */
const LAND_SQUASH = 0.14;
const LAND_S = 0.18;

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
  /** Chunk: id of the segment whose stack it lands on (−1 = unload flier to a fixed end point). */
  seg: number;
  /** Cargo carried (chunks) — lands in the segment's load. */
  mass: number;
  /** Block scale in flight (the last chunk of a crop is the big one). */
  size: number;
  /** Counts towards the hopper landing callback (unloads). */
  land: boolean;
  arc: number;
  /** Sideways bow at mid-flight (world units), so a burst of chunks doesn't fly as one line. */
  side: number;
  /** Frame it was launched in (bites in the same frame share a flier). */
  frame: number;
}

/**
 * The loot stack on every segment — the game's key "look how much I'm hauling" reward.
 * Each segment keeps its own visible load: a chunk arcs from the bitten crop into the stack of the segment that ate it
 * (the head feeds the first segment; a full stack passes it to the nearest one with room) and the stack grows when it
 * lands, with a little squash. The simulation's basket is the truth: loads are reconciled to it whenever cargo
 * appears or vanishes without a flight (tornado, travel, merges). Stacks wobble on a spring driven by the segment's
 * acceleration. At the depot each segment tips its stack into the hopper.
 */
export class StackView {
  readonly group = new THREE.Group();
  private blocks: THREE.InstancedMesh;
  private blockOutline: THREE.InstancedMesh | null;
  private fliers: THREE.InstancedMesh;
  private springs = new Map<number, Spring>();
  private shown = new Map<number, number>();
  private popAt = new Map<number, number>();
  /** Per segment id: cargo shown in its stack, cargo in the air towards it, and the last landing time. */
  private load = new Map<number, number>();
  private pending = new Map<number, number>();
  private landAt = new Map<number, number>();
  /** Segment id → index in the chain, rebuilt each frame. */
  private index = new Map<number, number>();
  /** Cargo that has left the stacks for the hopper but is still in the basket (not paid yet). */
  private unloading = 0;
  /** Depot wave in progress: when it started (render clock), how many segments, how many have tipped so far. */
  private wave = { active: false, start: 0, n: 0, launched: 0 };
  private flying: Flier[] = [];
  private sim: Sim;
  private cat: CaterpillarView;
  private tierColors: number[] = [];
  /** Where unloaded blocks fly (the depot hopper). */
  readonly target = new THREE.Vector3();
  /** Called (throttled) when unloaded blocks land in the hopper. */
  onLand: (count: number) => void = () => {};
  /** Called when a chunk lands on a stack: chain index of the segment and the stack's height (blocks). */
  onChunkLand: (seg: number, height: number) => void = () => {};
  private landed = 0;
  private lastLandCall = 0;
  private liveTiers = new Uint8Array(MAX_BLOCKS);
  private prevBlocks = -1;
  private prevFliers = -1;
  private frame = 0;

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
    this.load.clear();
    this.pending.clear();
    this.unloading = 0;
    this.wave.active = false;
  }

  private cap(): number {
    return capacityPerSegment(this.sim.state.progress.capacityLevel);
  }

  /** Index of the segment to receive a chunk aimed at chain index `k`: k itself, or the nearest with room. */
  private pickSeg(k: number): number {
    const segs = this.sim.state.progress.segments;
    const cap = this.cap();
    const room = (i: number) => {
      const id = segs[i].id;
      return (this.load.get(id) ?? 0) + (this.pending.get(id) ?? 0) + 1 <= cap + 1e-6;
    };
    if (room(k)) return k;
    for (let d = 1; d < segs.length; d++) {
      if (k + d < segs.length && room(k + d)) return k + d;
      if (k - d >= 0 && room(k - d)) return k - d;
    }
    return k;
  }

  /** Top of segment i's stack in world space (where a landing chunk aims). */
  private stackTop(i: number, out: THREE.Vector3): THREE.Vector3 {
    const p = this.cat.poses[i + 1];
    const id = this.sim.state.progress.segments[i]?.id ?? -1;
    const layers = Math.ceil((this.shown.get(id) ?? 0) / PER_LAYER);
    return out.set(p.x, p.y + BASE_Y + layers * LAYER_H, p.z);
  }

  /** A chunk bitten off at (x, y, z) flies into the stack of body b (the head feeds the first segment). */
  chunk(x: number, y: number, z: number, color: number, body: number, now: number, big = false): void {
    const segs = this.sim.state.progress.segments;
    if (segs.length === 0) return;
    const k = this.pickSeg(Math.max(0, Math.min(segs.length - 1, body - 1)));
    const id = segs[k].id;
    this.pending.set(id, (this.pending.get(id) ?? 0) + 1);
    // Many bites in one frame (strong segments, crowded rows): ride along on a chunk already launched this frame.
    for (let j = this.flying.length - 1; j >= 0 && this.flying[j].frame === this.frame; j--) {
      const f = this.flying[j];
      if (f.seg === id && f.mass < 4) {
        f.mass++;
        f.size = Math.min(1.25, f.size + 0.12);
        return;
      }
    }
    if (this.flying.length >= FLIERS) {
      // Out of fliers: land it straight away rather than lose it.
      this.arrive(id, k, 1, now);
      return;
    }
    const top = this.stackTop(k, V);
    const d = Math.hypot(top.x - x, top.y - y, top.z - z);
    const r = Math.random();
    this.flying.push({
      sx: x,
      sy: y,
      sz: z,
      ex: top.x,
      ey: top.y,
      ez: top.z,
      t0: now,
      dur: Math.min(CHUNK_MAX_S, Math.max(CHUNK_MIN_S, 0.15 + d * 0.05)) * (0.93 + 0.14 * r),
      color,
      spin: (Math.random() - 0.5) * 16,
      seg: id,
      mass: 1,
      size: big ? 1.1 : 0.8,
      land: false,
      arc: (0.3 + d * 0.16) * (0.85 + 0.3 * Math.random()),
      side: (Math.random() - 0.5) * 0.35,
      frame: this.frame,
    });
  }

  /** Cargo arrives on segment `id` (chain index k): the stack grows and gives a little. */
  private arrive(id: number, k: number, mass: number, now: number): void {
    this.load.set(id, (this.load.get(id) ?? 0) + mass);
    this.pending.set(id, Math.max(0, (this.pending.get(id) ?? 0) - mass));
    this.landAt.set(id, now);
    this.cat.land(k + 1, now);
    this.onChunkLand(k, this.blocksFor(this.load.get(id) ?? 0));
  }

  /**
   * The head crossed the chute: the cargo leaves head → tail on the simulation's schedule (`unloadAt`). Each segment
   * tips its stack early enough that the blocks land in the hopper exactly when that segment is paid.
   */
  beginUnload(n: number, elapsed: number, now: number): void {
    if (this.wave.active) while (this.wave.launched < this.wave.n) this.launchSeg(this.wave.launched++, now, now);
    this.wave = { active: true, start: now - elapsed, n, launched: 0 };
  }

  /** Segment k's share was paid. If its stack hasn't left yet (a pass resumed from a save), it goes now. */
  onUnloadSeg(k: number, now: number): void {
    if (this.wave.active && k < this.wave.launched) return;
    if (this.wave.active) this.wave.launched = Math.max(this.wave.launched, k + 1);
    this.launchSeg(k, now + 0.25, now);
  }

  /** Lift segment k's whole stack off (top block first) on arcs that land in the hopper at `landT`. */
  private launchSeg(k: number, landT: number, now: number): void {
    const segs = this.sim.state.progress.segments;
    const pose = this.cat.poses[k + 1];
    if (!pose || !segs[k]) return;
    const id = segs[k].id;
    const mass = this.load.get(id) ?? 0;
    const n = this.blocksFor(mass);
    this.load.set(id, 0);
    this.cat.tip(k + 1, now);
    if (n === 0) return;
    const st = this.sim.state;
    const tiers = this.layerTiers(st.basket.massByTier, Math.max(1e-6, st.basket.mass), n);
    const cy = Math.cos(pose.yaw);
    const sy = Math.sin(pose.yaw);
    const d = Math.hypot(this.target.x - pose.x, this.target.z - pose.z);
    for (let b = n - 1; b >= 0; b--) {
      if (this.flying.length >= FLIERS) break;
      const layer = Math.floor(b / PER_LAYER);
      const fromTop = Math.floor((n - 1 - b) / PER_LAYER);
      const lx = ((b % PER_LAYER) - 0.5) * 0.31;
      const delay = fromTop * 0.02;
      this.unloading += mass / n;
      this.flying.push({
        sx: pose.x + lx * cy,
        sy: pose.y + BASE_Y + layer * LAYER_H,
        sz: pose.z - lx * sy,
        ex: this.target.x + (Math.random() - 0.5) * 0.3,
        ey: this.target.y,
        ez: this.target.z + (Math.random() - 0.5) * 0.3,
        t0: now + delay,
        dur: Math.max(0.22, landT - now),
        color: this.tierColors[st.basket.mass > 0 ? tiers[b] : 0] ?? 0xffffff,
        spin: (Math.random() - 0.5) * 12,
        seg: -1,
        mass: mass / n,
        size: 1,
        land: true,
        arc: Math.min(3.5, 0.9 + d * 0.12) * (0.9 + 0.2 * Math.random()),
        side: (Math.random() - 0.5) * 0.25,
        frame: this.frame,
      });
    }
  }

  /** Per frame while a wave runs: tip each segment once its cargo would need to leave now to land on time. */
  private runWave(now: number): void {
    const w = this.wave;
    if (!w.active) return;
    const segs = this.sim.state.progress.segments;
    while (w.launched < w.n) {
      const k = w.launched;
      const landT = w.start + unloadAt(k, w.n);
      const pose = this.cat.poses[k + 1];
      if (!pose || !segs[k]) {
        w.launched++;
        continue;
      }
      // Far stacks fly a little longer (and higher): 0.3–0.55 s.
      const d = Math.hypot(this.target.x - pose.x, this.target.z - pose.z);
      const dur = Math.min(0.55, Math.max(0.3, 0.26 + d * 0.012));
      if (now < landT - dur) break;
      this.launchSeg(k, landT, now);
      w.launched++;
    }
    if (w.launched >= w.n && !this.sim.state.depot.active) w.active = false;
  }

  /**
   * Keep the stacks honest: whatever the basket holds that isn't in the air must be on the stacks. Cargo that appears
   * without a flight (tornado, debug, a reload) fills the stacks with room evenly; cargo that vanishes (travel, a
   * merge) is taken proportionally. Suspended while a depot pass runs (the stacks empty one by one there).
   */
  private reconcile(): void {
    const st = this.sim.state;
    const segs = st.progress.segments;
    if (st.depot.active || this.wave.active || this.unloading > 1e-6 || segs.length === 0) return;
    let inAir = 0;
    for (const v of this.pending.values()) inAir += v;
    let sum = 0;
    for (const s of segs) sum += this.load.get(s.id) ?? 0;
    let diff = Math.max(0, st.basket.mass - inAir) - sum;
    if (Math.abs(diff) < 1e-3) return;
    if (diff < 0) {
      const k = sum > 0 ? Math.max(0, (sum + diff) / sum) : 0;
      for (const s of segs) this.load.set(s.id, (this.load.get(s.id) ?? 0) * k);
      return;
    }
    // Fill the emptiest stacks first, then spread any overflow evenly.
    const cap = this.cap();
    for (let pass = 0; pass < 2 && diff > 1e-6; pass++) {
      let room = 0;
      for (const s of segs) room += pass === 0 ? Math.max(0, cap - (this.load.get(s.id) ?? 0)) : 1;
      if (room <= 1e-6) continue;
      const k = Math.min(1, diff / room);
      let used = 0;
      for (const s of segs) {
        const add = (pass === 0 ? Math.max(0, cap - (this.load.get(s.id) ?? 0)) : diff / segs.length) * (pass === 0 ? k : 1);
        this.load.set(s.id, (this.load.get(s.id) ?? 0) + add);
        used += add;
      }
      diff -= used;
    }
  }

  private blocksFor(mass: number): number {
    const fill = Math.min(2, mass / Math.max(1, this.cap()));
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
    this.frame++;
    const st = this.sim.state;
    const segs = st.progress.segments;
    this.index.clear();
    for (let i = 0; i < segs.length; i++) this.index.set(segs[i].id, i);
    this.runWave(now);
    this.updateFliers(now);
    this.reconcile();
    const liveTiers = this.layerTiers(st.basket.massByTier, st.basket.mass, MAX_BLOCKS, this.liveTiers);
    const cap = this.cap();
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
      // ≤ 1/60 s sub-steps keep the spring stable through long frames.
      const subs = Math.min(16, Math.max(1, Math.ceil(d * 60)));
      const hs = d / subs;
      for (let j = 0; j < subs; j++) {
        sp.vx += (-k * sp.ox - c * sp.vx - ax * gain * k) * hs;
        sp.vz += (-k * sp.oz - c * sp.vz - az * gain * k) * hs;
        sp.ox += sp.vx * hs;
        sp.oz += sp.vz * hs;
      }
      const lim = 0.35;
      sp.ox = Math.max(-lim, Math.min(lim, sp.ox));
      sp.oz = Math.max(-lim, Math.min(lim, sp.oz));

      const segMass = this.load.get(seg.id) ?? 0;
      const n = this.blocksFor(segMass);
      // A full stack's top flashes: "I can't take more — go unload".
      const full = segMass >= cap - 0.01;
      const flash = full ? 0.5 + 0.5 * Math.sin(now * 9 + i * 0.7) : 0;
      const prevShown = this.shown.get(seg.id) ?? 0;
      if (n > prevShown) this.popAt.set(seg.id, now);
      this.shown.set(seg.id, n);
      const pop = this.popAt.get(seg.id);
      // Landing squash: the stack gives under the new chunk and springs back.
      const lu = (now - (this.landAt.get(seg.id) ?? -9)) / LAND_S;
      const squash = lu >= 0 && lu < 1 ? Math.sin(lu * Math.PI) * (1 - lu) * LAND_SQUASH * 2 : 0;
      const layerH = LAYER_H * (1 - squash);
      const layers = Math.ceil(n / PER_LAYER);
      const sway = Math.sin(now * 2.3 + i) * 0.015 * Math.min(1, st.v);
      // Secondary motion: the load bounces a beat behind the body's stride, more when it is heavy.
      const bounce = Math.sin(this.cat.bobPhase - (i + 1) * 0.8 - 1.3) * (0.015 + 0.03 * Math.min(1, segMass / cap)) * Math.min(1, st.v);
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
          // Takes over from the landing chunk (which arrives at ~0.7–1 scale), with a small overshoot.
          const u = Math.min(1, (now - pop) / 0.18);
          scale = 0.65 + 0.35 * u + Math.sin(u * Math.PI) * 0.2;
        }
        V.set(
          pose.x + lx * cy + lz * sy + (sp.ox + sway * -sy) * bend,
          pose.y + BASE_Y + layer * layerH + bounce * h,
          pose.z - lx * sy + lz * cy + (sp.oz + sway * -cy) * bend,
        );
        E.set(sp.oz * bend * 0.6, pose.yaw + (layer % 2) * 0.12, -sp.ox * bend * 0.6);
        Q.setFromEuler(E);
        S.set(scale * (1 + squash * 0.5), scale * (1 - squash), scale * (1 + squash * 0.5));
        M4.compose(V, Q, S);
        this.blocks.setMatrixAt(idx, M4);
        C.setHex(this.tierColors[liveTiers[b]] ?? 0xffffff);
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
    // Forget state of merged-away segments.
    if (this.springs.size > segs.length + 8 || this.load.size > segs.length + 8) {
      for (const m of [this.springs, this.shown, this.popAt, this.load, this.pending, this.landAt] as Map<number, unknown>[]) {
        for (const id of [...m.keys()]) if (!this.index.has(id)) m.delete(id);
      }
    }
  }

  private updateFliers(now: number): void {
    if (this.flying.length === 0 && this.prevFliers === 0) return;
    // Land arrived fliers and compact the rest in place (no per-frame array allocation).
    let w = 0;
    let landedNow = 0;
    for (const f of this.flying) {
      if (now - f.t0 >= f.dur) {
        if (f.land) {
          landedNow++;
          this.unloading = Math.max(0, this.unloading - f.mass);
        }
        if (f.seg >= 0) {
          const k = this.index.get(f.seg);
          if (k !== undefined) this.arrive(f.seg, k, f.mass, now);
          else this.pending.set(f.seg, 0);
        }
      } else this.flying[w++] = f;
    }
    this.flying.length = w;
    if (landedNow) this.landed += landedNow;
    if (this.landed && now - this.lastLandCall > 0.12) {
      this.lastLandCall = now;
      this.onLand(this.landed);
      this.landed = 0;
    }
    let idx = 0;
    for (const f of this.flying) {
      const u = Math.max(0, (now - f.t0) / f.dur);
      if (f.seg >= 0) {
        // Home in on the (moving) stack top.
        const k = this.index.get(f.seg);
        if (k !== undefined) {
          this.stackTop(k, V);
          f.ex = V.x;
          f.ey = V.y;
          f.ez = V.z;
        }
      }
      // Chunks ease in and out (a hop); unloads accelerate into the hopper.
      const e = f.seg >= 0 ? u * u * (3 - 2 * u) : u;
      let x = f.sx + (f.ex - f.sx) * e;
      let z = f.sz + (f.ez - f.sz) * e;
      const y = f.sy + (f.ey - f.sy) * e + Math.sin(u * Math.PI) * f.arc;
      if (f.side !== 0) {
        // Bow sideways, perpendicular to the flight.
        const dx = f.ex - f.sx;
        const dz = f.ez - f.sz;
        const l = Math.hypot(dx, dz) || 1;
        const b = Math.sin(u * Math.PI) * f.side;
        x += (-dz / l) * b;
        z += (dx / l) * b;
      }
      V.set(x, y, z);
      E.set(f.spin * u, f.spin * u * 0.7, 0);
      Q.setFromEuler(E);
      // Chunks arrive at full size (they become part of the stack); unloads shrink into the chute.
      const s = f.seg >= 0 ? (u < 0 ? 0 : 1) : u > 0.85 ? (1 - u) / 0.15 : u < 0 ? 0 : 1;
      S.setScalar(f.size * s);
      M4.compose(V, Q, S);
      this.fliers.setMatrixAt(idx, M4);
      // Chunks in the air are a touch brighter than the crops they left, so the flight reads against the field.
      C.setHex(f.color);
      if (f.seg >= 0) C.lerp(WHITE, 0.18);
      this.fliers.setColorAt(idx, C);
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
