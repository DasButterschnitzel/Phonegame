import * as THREE from 'three';
import type { Sim } from '../../game/sim.ts';
import { ROCK, VOID } from '../../game/farms/layout.ts';
import { TERRITORY } from '../../game/config.ts';
import { BIOMES } from '../palette.ts';
import { decorGeometry, fenceSegmentGeometry, flowerClusterGeometry, plotFrameGeometry, rockGeometry, tuftGeometry } from '../geo/world.ts';
import { toon } from '../materials.ts';
import { C, E, M4, Q, S, V, ZERO_SCALE } from '../scratch.ts';
import { hashFloat } from '../../shared/hash.ts';
import { easeOutBack, easeOutCubic } from '../../shared/math.ts';

const INSET = 0.16;
/** Dressing stays this far inside a plot so the route ribbon never covers it. */
const DRESS_MARGIN = 0.85;
const CLAIM_ANIM = 0.9;
const FENCE_IN = 0.5;

interface DressItem {
  mesh: number;
  /** Instance slot, given when the plot is claimed (-1 before): only dressed plots are drawn. */
  slot: number;
  x: number;
  z: number;
  rot: number;
  scale: number;
  delay: number;
}

interface FallingFence {
  x: number;
  z: number;
  yaw: number;
  t0: number;
}

/**
 * The farm's plots: tilled beds (open zones), dark fenced beds (closed zones), fresh meadow on cleared territory
 * (with grass, clover and flowers popping in as each plot is claimed), glowing outlines on plots that are about to
 * join the territory, fences around closed zones, rocks and water.
 */
export class TerritoryView {
  readonly group = new THREE.Group();
  private sim: Sim;
  private mat = toon({ rim: 0 });
  private foliage = toon({ rim: 0.1, wind: 0.035 });
  private beds!: THREE.Mesh;
  private bedPos!: Float32Array;
  private bedCol!: Float32Array;
  private dress: THREE.InstancedMesh[] = [];
  private dressByPlot: DressItem[][] = [];
  /** Per plot: time the claim animation started (−1 = not claimed, 0 = claimed before this view existed). */
  private claimT!: Float64Array;
  private animating = new Set<number>();
  /** Slots handed out per dressing mesh (claimed plots only, in claim order). */
  private dressN: number[] = [];
  private glow!: THREE.InstancedMesh;
  private glowMat = new THREE.MeshBasicMaterial({ color: 0xfff1a0, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
  private fences: THREE.InstancedMesh | null = null;
  private fenceGeo: THREE.BufferGeometry | null = null;
  private falling: FallingFence[] = [];
  private fallMesh: THREE.InstancedMesh | null = null;
  private shownZone = -1;
  lowQuality = false;

  constructor(sim: Sim, lowQuality: boolean) {
    this.sim = sim;
    this.lowQuality = lowQuality;
    this.rebuild();
  }

  rebuild(): void {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      if (c instanceof THREE.InstancedMesh) c.dispose();
      if (c instanceof THREE.Mesh && c.geometry !== this.fenceGeo) c.geometry.dispose();
    }
    this.fenceGeo?.dispose();
    this.fenceGeo = null;
    this.fences = null;
    this.fallMesh = null;
    this.falling = [];
    this.dress = [];
    this.animating.clear();
    const { farm, terr } = this.sim;
    const l = farm.layout;
    const biome = BIOMES[farm.id];
    const n = l.cols * l.rows;
    const P = l.plot;

    // Alley ground under every plot (the darker soil between beds), water and rock cells.
    const base: number[] = [];
    const baseCol: number[] = [];
    const quad = (x0: number, z0: number, x1: number, z1: number, y: number, c: THREE.Color, pos: number[], col: number[]) => {
      pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
      for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
    };
    const alley = new THREE.Color(biome.groundB).multiplyScalar(0.86);
    const water = new THREE.Color(biome.water);
    const rockGround = new THREE.Color(biome.outside).multiplyScalar(0.92);
    const rocks: [number, number, number, number][] = [];
    const trees: [number, number, number, number][] = [];
    for (let p = 0; p < n; p++) {
      const c = p % l.cols;
      const r = (p - c) / l.cols;
      const x0 = l.x0 + c * P;
      const z0 = l.z0 + r * P;
      const z = l.zone[p];
      if (z === VOID) {
        // A tree or two in the gaps of the farm outline.
        if (hashFloat(p, 3, farm.seed) < 0.7) trees.push([x0 + P * (0.3 + 0.4 * hashFloat(p, 4, farm.seed)), z0 + P * (0.3 + 0.4 * hashFloat(p, 5, farm.seed)), hashFloat(p, 6, farm.seed) * 6.28, 1 + 0.3 * hashFloat(p, 7, farm.seed)]);
        continue;
      }
      if (z === ROCK) {
        if (l.water[p]) quad(x0 - 0.05, z0 - 0.05, x0 + P + 0.05, z0 + P + 0.05, 0.004, water, base, baseCol);
        else {
          quad(x0, z0, x0 + P, z0 + P, 0.002, rockGround, base, baseCol);
          for (let k = 0; k < 4; k++)
            rocks.push([x0 + P * (0.2 + 0.6 * hashFloat(p, 10 + k, farm.seed)), z0 + P * (0.2 + 0.6 * hashFloat(p, 20 + k, farm.seed)), hashFloat(p, 30 + k, farm.seed) * 6.28, 1.2 + 1.3 * hashFloat(p, 40 + k, farm.seed)]);
        }
        continue;
      }
      quad(x0, z0, x0 + P, z0 + P, 0.002, alley, base, baseCol);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(base, 3));
    bg.setAttribute('color', new THREE.Float32BufferAttribute(baseCol, 3));
    bg.computeVertexNormals();
    this.group.add(new THREE.Mesh(bg, this.mat));
    this.addStatic(rockGeometry(), this.mat, rocks);
    if (biome.decor !== 'cactus' || trees.length) this.addStatic(decorGeometry(biome.decor), this.foliage, trees);

    // Beds: one quad per plot (6 vertices), recoloured / resized as plots change state.
    this.bedPos = new Float32Array(n * 18);
    this.bedCol = new Float32Array(n * 18);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.bedPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.bedCol, 3).setUsage(THREE.DynamicDrawUsage));
    const normals = new Float32Array(n * 18);
    for (let i = 0; i < n * 6; i++) normals[i * 3 + 1] = 1;
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    this.beds = new THREE.Mesh(geo, this.mat);
    this.beds.frustumCulled = false;
    this.group.add(this.beds);

    // Dressing for cleared plots.
    // Two meshes: grass tufts, and bloom patches (clover + a flower cluster) — few draw calls.
    const dressGeos = [tuftGeometry(), flowerClusterGeometry(undefined, true)];
    const perPlot = this.lowQuality ? [2, 1] : [4, 2];
    const counts = dressGeos.map(() => 0);
    this.dressByPlot = [];
    for (let p = 0; p < n; p++) {
      const items: DressItem[] = [];
      if (l.zone[p] >= 0) {
        const span = P - 2 * DRESS_MARGIN;
        const px = l.x0 + (p % l.cols) * P + DRESS_MARGIN;
        const pz = l.z0 + Math.floor(p / l.cols) * P + DRESS_MARGIN;
        let k = 0;
        const add = (mesh: number, scale: number) => {
          counts[mesh]++;
          items.push({
            mesh,
            slot: -1,
            x: px + span * hashFloat(p, 100 + k, farm.seed),
            z: pz + span * hashFloat(p, 200 + k, farm.seed),
            rot: hashFloat(p, 300 + k, farm.seed) * 6.28,
            scale,
            delay: hashFloat(p, 400 + k, farm.seed) * 0.45,
          });
          k++;
        };
        for (let j = 0; j < perPlot[0]; j++) add(0, 0.9 + 0.5 * hashFloat(p, 500 + j, farm.seed));
        for (let j = 0; j < perPlot[1]; j++) add(1, 0.9 + 0.4 * hashFloat(p, 600 + j, farm.seed));
      }
      this.dressByPlot.push(items);
    }
    this.dressN = dressGeos.map(() => 0);
    this.dress = dressGeos.map((g, i) => {
      const m = new THREE.InstancedMesh(g, this.foliage, Math.max(1, counts[i]));
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    });

    // Glowing outlines on plots that are about to join the territory.
    this.glow = new THREE.InstancedMesh(plotFrameGeometry(P - 0.2, 0.22), this.glowMat, 24);
    this.glow.count = 0;
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 2;
    this.glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.glow.setColorAt(0, C.set(0xffffff));
    this.group.add(this.glow);

    this.claimT = new Float64Array(n).fill(-1);
    for (let p = 0; p < n; p++) {
      if (terr.claimed[p]) {
        this.claimT[p] = 0;
        this.allocDress(p);
        this.writeDress(p, 1);
      }
      this.writeBed(p, 1);
    }
    for (const m of this.dress) m.instanceMatrix.needsUpdate = true;
    this.shownZone = -1;
    this.buildFences();
  }

  private addStatic(geo: THREE.BufferGeometry, mat: THREE.Material, items: [number, number, number, number][]): void {
    if (!items.length) return;
    const m = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach(([x, z, a, s], i) => {
      V.set(x, 0, z);
      E.set(0, a, 0);
      Q.setFromEuler(E);
      S.setScalar(s);
      m.setMatrixAt(i, M4.compose(V, Q, S));
    });
    this.group.add(m);
  }

  /** Bed quad of plot p; `u` is the claim animation progress (0 → 1) for claimed plots. */
  private writeBed(p: number, u: number): void {
    const { farm, terr, state } = this.sim;
    const l = farm.layout;
    const biome = BIOMES[farm.id];
    const zone = l.zone[p];
    const o = p * 18;
    if (zone < 0) {
      this.bedPos.fill(0, o, o + 18);
      return;
    }
    const c = p % l.cols;
    const r = (p - c) / l.cols;
    const claimed = terr.claimed[p] === 1;
    const inset = claimed ? INSET * (1 - easeOutCubic(u)) : INSET;
    const x0 = l.x0 + c * l.plot + inset;
    const z0 = l.z0 + r * l.plot + inset;
    const x1 = l.x0 + (c + 1) * l.plot - inset;
    const z1 = l.z0 + (r + 1) * l.plot - inset;
    const y = claimed ? 0.008 : 0.006;
    const v = [x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0];
    for (let k = 0; k < 18; k++) this.bedPos[o + k] = v[k];
    const jitter = 0.96 + 0.08 * hashFloat(p, 1, farm.seed);
    const soil = C.setHex((c + r) % 2 ? biome.groundA : biome.groundB);
    if (zone > state.progress.zone && !claimed) soil.multiplyScalar(0.72);
    if (claimed) {
      const g = new THREE.Color(biome.cleared).multiplyScalar(jitter);
      soil.lerp(g, easeOutCubic(u));
    } else soil.multiplyScalar(jitter);
    for (let k = 0; k < 6; k++) {
      this.bedCol[o + k * 3] = soil.r;
      this.bedCol[o + k * 3 + 1] = soil.g;
      this.bedCol[o + k * 3 + 2] = soil.b;
    }
  }

  /** Plot p was claimed: its dressing gets the next slots of each mesh (unclaimed plots draw nothing at all). */
  private allocDress(p: number): void {
    for (const d of this.dressByPlot[p]) {
      if (d.slot >= 0) continue;
      d.slot = this.dressN[d.mesh]++;
      this.dress[d.mesh].count = this.dressN[d.mesh];
    }
  }

  private writeDress(p: number, u: number): void {
    for (const d of this.dressByPlot[p]) {
      if (d.slot < 0) continue;
      const k = Math.min(1, Math.max(0, (u * CLAIM_ANIM - d.delay) / (CLAIM_ANIM - 0.45)));
      const s = k <= 0 ? 0 : d.scale * easeOutBack(k);
      V.set(d.x, 0, d.z);
      E.set(0, d.rot, 0);
      Q.setFromEuler(E);
      S.setScalar(Math.max(0, s));
      this.dress[d.mesh].setMatrixAt(d.slot, s <= 0 ? ZERO_SCALE : M4.compose(V, Q, S));
    }
  }

  /** Plots just joined the territory: their beds turn to meadow and dressing pops in. */
  onClaimed(plots: number[], now: number): void {
    for (const p of plots) {
      this.claimT[p] = now;
      this.allocDress(p);
      this.writeDress(p, 0);
      this.animating.add(p);
    }
  }

  /** Zone fence opened: the old fence topples, beds of the new zone brighten. */
  onZoneOpened(now: number): void {
    if (this.fences) {
      for (let i = 0; i < this.fences.count; i++) {
        this.fences.getMatrixAt(i, M4);
        M4.decompose(V, Q, S);
        E.setFromQuaternion(Q);
        this.falling.push({ x: V.x, z: V.z, yaw: E.y, t0: now + (i % 7) * 0.03 });
      }
    }
    this.buildFences();
    const l = this.sim.farm.layout;
    for (let p = 0; p < l.cols * l.rows; p++) this.writeBed(p, 1);
    (this.beds.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Fence runs on every edge between reachable ground and a closed zone, set back into the closed plot. */
  private buildFences(): void {
    const { farm, state, terr } = this.sim;
    const l = farm.layout;
    const open = state.progress.zone;
    if (this.fences) {
      this.group.remove(this.fences);
      this.fences.dispose();
    }
    this.fenceGeo ??= fenceSegmentGeometry(l.plot);
    const items: [number, number, number][] = [];
    const locked = (c: number, r: number) => {
      if (c < 0 || r < 0 || c >= l.cols || r >= l.rows) return false;
      const z = l.zone[r * l.cols + c];
      return z > open && !terr.claimed[r * l.cols + c];
    };
    const reachable = (c: number, r: number) => {
      if (c < 0 || r < 0 || c >= l.cols || r >= l.rows) return false;
      const z = l.zone[r * l.cols + c];
      return z >= 0 && (z <= open || terr.claimed[r * l.cols + c] === 1);
    };
    for (let r = 0; r < l.rows; r++)
      for (let c = 0; c < l.cols; c++) {
        if (!locked(c, r)) continue;
        const x0 = l.x0 + c * l.plot;
        const z0 = l.z0 + r * l.plot;
        // Fence runs along +x from (x, z) rotated by yaw.
        if (reachable(c, r - 1)) items.push([x0, z0 + FENCE_IN, 0]);
        if (reachable(c, r + 1)) items.push([x0, z0 + l.plot - FENCE_IN, 0]);
        if (reachable(c - 1, r)) items.push([x0 + FENCE_IN, z0, -Math.PI / 2]);
        if (reachable(c + 1, r)) items.push([x0 + l.plot - FENCE_IN, z0, -Math.PI / 2]);
      }
    const m = new THREE.InstancedMesh(this.fenceGeo, this.mat, Math.max(1, items.length));
    m.count = items.length;
    items.forEach(([x, z, yaw], i) => {
      V.set(x, 0, z);
      E.set(0, yaw, 0);
      Q.setFromEuler(E);
      S.setScalar(1);
      m.setMatrixAt(i, M4.compose(V, Q, S));
    });
    m.visible = items.length > 0;
    this.fences = m;
    this.group.add(m);
    if (!this.fallMesh) {
      this.fallMesh = new THREE.InstancedMesh(this.fenceGeo, this.mat, 160);
      this.fallMesh.count = 0;
      this.fallMesh.visible = false;
      this.fallMesh.frustumCulled = false;
      this.fallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(this.fallMesh);
    }
    this.shownZone = open;
  }

  update(now: number): void {
    const { terr, state } = this.sim;
    if (this.shownZone !== state.progress.zone) this.onZoneOpened(now);
    // Claim animations: bed grows to full size and greens, dressing pops in.
    if (this.animating.size) {
      for (const p of this.animating) {
        const u = Math.min(1, (now - this.claimT[p]) / CLAIM_ANIM);
        this.writeBed(p, u);
        this.writeDress(p, u);
        if (u >= 1) this.animating.delete(p);
      }
      (this.beds.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (this.beds.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
      for (const m of this.dress) m.instanceMatrix.needsUpdate = true;
    }
    // Ready plots: pulsing outline, brightening in the last beat before the route grows into them.
    let g = 0;
    const pulse = 0.5 + 0.5 * Math.sin(now * 7);
    const l = this.sim.farm.layout;
    for (let p = 0; p < terr.readySince.length && g < this.glow.instanceMatrix.count; p++) {
      const since = terr.readySince[p];
      if (since < 0) continue;
      const age = state.simTime - since;
      const k = Math.min(1, age / TERRITORY.CLAIM_DELAY_S);
      const c = p % l.cols;
      const r = (p - c) / l.cols;
      V.set(l.x0 + (c + 0.5) * l.plot, 0.03, l.z0 + (r + 0.5) * l.plot);
      S.setScalar(0.92 + 0.08 * easeOutBack(Math.min(1, age / 0.35)));
      Q.identity();
      this.glow.setMatrixAt(g, M4.compose(V, Q, S));
      const b = (0.35 + 0.45 * pulse) * (0.6 + 0.4 * k);
      this.glow.setColorAt(g, C.setRGB(b, b * 0.92, b * 0.55));
      g++;
    }
    this.glow.visible = g > 0;
    if (g || this.glow.count) {
      this.glow.count = g;
      this.glow.instanceMatrix.needsUpdate = true;
      if (this.glow.instanceColor) this.glow.instanceColor.needsUpdate = true;
    }
    // Toppling fences.
    if (this.fallMesh && (this.falling.length || this.fallMesh.count)) {
      let w = 0;
      let i = 0;
      for (const f of this.falling) {
        const u = (now - f.t0) / 0.75;
        if (u >= 1) continue;
        this.falling[w++] = f;
        if (i >= this.fallMesh.instanceMatrix.count) continue;
        const k = Math.max(0, u);
        V.set(f.x, -0.6 * k * k, f.z);
        E.set(-1.5 * easeOutCubic(Math.min(1, k * 1.6)), f.yaw, 0, 'YXZ');
        Q.setFromEuler(E);
        S.setScalar(1 - 0.3 * k);
        this.fallMesh.setMatrixAt(i++, M4.compose(V, Q, S));
      }
      this.falling.length = w;
      this.fallMesh.count = i;
      this.fallMesh.visible = i > 0;
      this.fallMesh.instanceMatrix.needsUpdate = true;
    }
  }
}
