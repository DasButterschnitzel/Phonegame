import * as THREE from 'three';
import type { Sim } from '../../game/sim.ts';
import type { PathTable } from '../../game/types.ts';
import { DEFAULT_FLOWERS, DEFAULT_TUFT, biomeLook } from '../palette.ts';
import { flowerClusterGeometry, pathRibbon } from '../geo/world.ts';
import { landmarkGeometry, propGeometry, rockGeometry, treeGeometry, tuftGeometry } from '../geo/scenery.ts';
import { cloudShadowTexture, shared, toon } from '../materials.ts';
import type { QualitySettings } from '../quality.ts';
import { E, M4, Q, S, V } from '../scratch.ts';
import { hashFloat } from '../../shared/hash.ts';
import { easeOutCubic } from '../../shared/math.ts';

const RIBBON_W = 1.3;
/** Seconds for a new stretch of route to draw itself. */
const REVEAL_S = 0.85;

/** Static farm scenery + ambient motion: sky, grass, the biome's decor ring and landmarks, clouds, the route ribbon. */
export class WorldView {
  readonly group = new THREE.Group();
  private dynamic = new THREE.Group();
  private ribbon: THREE.Mesh | null = null;
  private ghost: THREE.Mesh | null = null;
  private ghostMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide });
  private ghostT0 = -1;
  private mat = toon({ rim: 0.12 });
  private foliageMat = toon({ rim: 0.12, wind: 0.035 });
  private ribbonMat: THREE.MeshToonMaterial;
  /** Same look without the reveal `discard` (which defeats early-z on mobile GPUs) — used once the path is drawn. */
  private ribbonPlain = toon({ rim: 0, side: THREE.DoubleSide });
  /** Per-farm materials disposed on rebuild. */
  private owned: THREE.Material[] = [];
  private reveal = { value: 1e6 };
  private revealT0 = -1;
  private revealMax = 0;
  /** Landmark rotors (windmill sails, wind-pump fans: one instanced mesh) spun about each landmark's hub. */
  private sails: THREE.InstancedMesh | null = null;
  private towerM: THREE.Matrix4[] = [];
  private hub: [number, number, number] = [0, 0, 0];
  private spin = 1;
  private sailAngle = 0;
  private clouds: THREE.Mesh | null = null;
  private cloudTex: THREE.CanvasTexture | null = null;
  private sim: Sim;
  private scene: THREE.Scene;
  /** Ambient extras (flowers, dense foliage) are skipped on the low quality tier. */
  lowQuality = false;
  private cloudShadows: boolean;
  private shownStyle = -1;

  constructor(sim: Sim, scene: THREE.Scene, quality: Pick<QualitySettings, 'tier' | 'cloudShadows'>) {
    this.sim = sim;
    this.scene = scene;
    this.lowQuality = quality.tier === 'low';
    this.cloudShadows = quality.cloudShadows;
    this.ribbonMat = toon({ rim: 0, side: THREE.DoubleSide });
    // New route "draws itself": fragments beyond the reveal distance are discarded, the front edge glows.
    const base = this.ribbonMat.onBeforeCompile;
    this.ribbonMat.onBeforeCompile = (sh, r) => {
      base.call(this.ribbonMat, sh, r);
      sh.uniforms.uReveal = this.reveal;
      sh.vertexShader = `attribute float aArc;\nvarying float vArc;\n${sh.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\n vArc = aArc;');
      sh.fragmentShader = `uniform float uReveal;\nvarying float vArc;\n${sh.fragmentShader}`
        .replace('void main() {', 'void main() {\n if (vArc > uReveal) discard;')
        .replace(
          '#include <opaque_fragment>',
          'outgoingLight += vec3(1.0, 0.9, 0.5) * smoothstep(uReveal - 1.5, uReveal, vArc) * step(0.001, vArc) * step(uReveal, 900.0) * 0.7;\n#include <opaque_fragment>',
        );
    };
    this.ribbonMat.customProgramCacheKey = () => 'ribbon-reveal';
    this.group.add(this.dynamic);
    this.rebuild();
  }

  rebuild(): void {
    for (const c of [...this.group.children]) {
      if (c === this.dynamic) continue;
      this.group.remove(c);
      c.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
        if (o instanceof THREE.InstancedMesh) o.dispose();
      });
    }
    for (const m of this.owned) m.dispose();
    this.owned = [];
    this.sails = null;
    this.towerM = [];
    const { farm } = this.sim;
    const biome = biomeLook(farm.biome);
    // The tilted camera never sees the horizon, so a plain clear colour (free) matches the fog.
    this.scene.background = new THREE.Color(biome.fog);
    this.scene.fog = new THREE.Fog(biome.fog, 38, 80);
    const { x0, z0, x1, z1 } = farm.bounds;
    const outsideMat = new THREE.MeshLambertMaterial({ color: biome.outside });
    this.owned.push(outsideMat);
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), outsideMat);
    outside.position.y = -0.02;
    this.group.add(outside);

    // Decor ring around the farm: the biome's trees, rocks, grass tufts, flowers and props.
    const ring = (n: number, salt: number, dMin: number, dMax: number): [number, number, number][] => {
      const out: [number, number, number][] = [];
      for (let i = 0; i < n; i++) {
        const side = Math.floor(hashFloat(i, salt, farm.seed) * 4);
        const u = hashFloat(i, salt + 1, farm.seed);
        const d = dMin + hashFloat(i, salt + 2, farm.seed) * (dMax - dMin);
        const a = hashFloat(i, salt + 3, farm.seed) * Math.PI * 2;
        if (side === 0) out.push([x0 - 1 + (x1 - x0 + 2) * u, z0 - d, a]);
        else if (side === 1) out.push([x0 - 1 + (x1 - x0 + 2) * u, z1 + d, a]);
        else if (side === 2) out.push([x0 - d, z0 - 1 + (z1 - z0 + 2) * u, a]);
        else out.push([x1 + d, z0 - 1 + (z1 - z0 + 2) * u, a]);
      }
      // Keep the depot's surroundings clear.
      return out.filter(([x, z]) => (x - farm.barn.bx) ** 2 + (z - farm.barn.bz) ** 2 > 20);
    };
    const jitter = (i: number) => 0.8 + 0.5 * hashFloat(i, 9, farm.seed);
    const trees = this.lowQuality ? 120 : 210;
    if (biome.decor2) {
      // Two kinds of tree, the second one rarer.
      this.addInstanced(treeGeometry(biome.decor), this.foliageMat, ring(Math.round(trees * 0.62), 10, 4, 18), (i) => 1.1 * jitter(i));
      this.addInstanced(treeGeometry(biome.decor2), this.foliageMat, ring(Math.round(trees * 0.38), 15, 4.5, 18), (i) => 1.05 * jitter(i + 500));
    } else this.addInstanced(treeGeometry(biome.decor), this.foliageMat, ring(trees, 10, 4, 18), (i) => 1.1 * jitter(i));
    this.addInstanced(rockGeometry(biome.rock), this.mat, ring(40, 20, 2.5, 16), jitter);
    this.addInstanced(tuftGeometry(biome.tuft ?? DEFAULT_TUFT), this.foliageMat, ring(this.lowQuality ? 120 : 320, 30, 1.4, 14), (i) => 0.9 + jitter(i) * 0.6);
    if (!this.lowQuality && biome.flowers !== null) {
      this.addInstanced(flowerClusterGeometry(biome.flowers ?? DEFAULT_FLOWERS), this.foliageMat, ring(90, 40, 1.6, 12), jitter);
    }
    (biome.props ?? []).forEach((pr, k) => {
      const n = this.lowQuality ? Math.ceil(pr.n / 2) : pr.n;
      this.addInstanced(propGeometry(pr.kind), pr.kind === 'tallgrass' ? this.foliageMat : this.mat, ring(n, 60 + k * 10, pr.dMin, pr.dMax), (i) => 0.85 + 0.3 * hashFloat(i, 70 + k, farm.seed));
    });

    // Landmarks beyond the field corners (windmills, wind pumps, granaries, a farmhouse); rotors spin.
    const lm = landmarkGeometry(biome.landmark ?? 'windmill');
    const corners: [number, number][] = [
      [x0 - 4.5, z1 + 3.5],
      [x1 + 4.5, z1 + 3.5],
      [x1 + 4.5, z0 - 4.5],
      [x0 - 4.5, z0 - 4.5],
    ];
    const order = lm.count === 3 ? [0, 1, 2] : lm.count === 2 ? [1, 3] : [2];
    // Bodies and rotors are one instanced mesh each (≤ 2 draw calls for all landmarks).
    const towers: [number, number, number][] = order.map((k, i) => {
      const [x, z] = corners[k];
      return [x, z, Math.atan2((x0 + x1) / 2 - x, (z0 + z1) / 2 - z) + (i - 1) * 0.3];
    });
    this.addInstanced(lm.base, this.mat, towers, () => 1);
    this.towerM = towers.map(([x, z, a]) => new THREE.Matrix4().compose(V.set(x, 0, z), Q.setFromEuler(E.set(0, a, 0)), S.setScalar(1)));
    this.hub = lm.hub;
    this.spin = lm.spin;
    if (lm.rotor) {
      this.sails = new THREE.InstancedMesh(lm.rotor, this.mat, towers.length);
      this.sails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(this.sails);
      this.spinSails(0);
    }

    // Drifting cloud shadows (one transparent full-screen layer: high tier only).
    this.clouds = null;
    if (this.cloudShadows) {
      this.cloudTex ??= cloudShadowTexture();
      this.cloudTex.repeat.set(5, 5);
      const mat = new THREE.MeshBasicMaterial({ map: this.cloudTex, transparent: true, opacity: 0.35, depthWrite: false });
      this.owned.push(mat);
      this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(240, 240).rotateX(-Math.PI / 2), mat);
      this.clouds.position.y = 0.06;
      this.clouds.renderOrder = 2;
      this.group.add(this.clouds);
    }
    this.clearGhost();
    this.setRoute(null);
  }

  private addInstanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: [number, number, number][], scale: (i: number) => number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
    m.count = items.length;
    items.forEach(([x, z, a], i) => {
      V.set(x, 0, z);
      E.set(0, a, 0);
      Q.setFromEuler(E);
      S.setScalar(scale(i));
      m.setMatrixAt(i, M4.compose(V, Q, S));
    });
    this.group.add(m);
    return m;
  }

  /**
   * (Re)builds the route ribbon. With the previous route given, the stretches that are new draw themselves from
   * where they leave the old route, and the abandoned stretches fade into the meadow.
   */
  setRoute(prev: PathTable | null): void {
    const { farm, path, state } = this.sim;
    const biome = biomeLook(farm.biome);
    const style = state.progress.zone;
    this.shownStyle = style;
    let arcOf: (i: number) => number = () => 0;
    let maxArc = 0;
    if (prev) {
      const fresh = freshness(path, prev);
      const arcs = new Float32Array(path.n);
      // Walk the loop starting at an old sample so every fresh stretch is measured from its own start.
      let start = 0;
      while (start < path.n && fresh[start]) start++;
      let run = 0;
      for (let k = 0; k < path.n; k++) {
        const i = (start + k) % path.n;
        if (fresh[i]) {
          run += path.ds;
          arcs[i] = run;
          if (run > maxArc) maxArc = run;
        } else run = 0;
      }
      arcOf = (i) => arcs[i];
    }
    if (this.ribbon) {
      this.dynamic.remove(this.ribbon);
      if (prev && maxArc > 0) {
        // Keep the old ribbon as a fading ghost underneath.
        this.clearGhost();
        this.ghost = this.ribbon;
        this.ghost.material = this.ghostMat;
        this.ghost.position.y = -0.006;
        this.ghostMat.opacity = 1;
        this.ghostT0 = shared.uTime.value;
        this.dynamic.add(this.ghost);
      } else this.ribbon.geometry.dispose();
    }
    const animate = maxArc > 0;
    this.ribbon = new THREE.Mesh(pathRibbon(path, RIBBON_W, biome.path, biome.pathEdge, 0.02, arcOf, style), animate ? this.ribbonMat : this.ribbonPlain);
    this.dynamic.add(this.ribbon);
    if (animate) {
      this.revealT0 = shared.uTime.value;
      this.revealMax = maxArc + 0.5;
      this.reveal.value = 0;
    } else {
      this.revealT0 = -1;
      this.reveal.value = 1e6;
    }
  }

  private clearGhost(): void {
    if (!this.ghost) return;
    this.dynamic.remove(this.ghost);
    this.ghost.geometry.dispose();
    this.ghost = null;
    this.ghostT0 = -1;
  }

  private spinSails(a: number): void {
    if (!this.sails) return;
    for (let i = 0; i < this.towerM.length; i++) {
      // Hub offset on the tower, then spin about the local z axis (each at its own pace).
      M4.makeRotationZ(a * this.spin * (0.9 + i * 0.15)).setPosition(this.hub[0], this.hub[1], this.hub[2]);
      this.sails.setMatrixAt(i, M4.premultiply(this.towerM[i]));
    }
    this.sails.instanceMatrix.needsUpdate = true;
  }

  /** Shader warm-up: temporarily show the path with its draw-in material so that program is compiled up front. */
  useRevealMaterial(on: boolean): void {
    if (this.warmGhost) {
      this.dynamic.remove(this.warmGhost);
      this.warmGhost = null;
    }
    if (!this.ribbon) return;
    // The fading ghost of the old ribbon (first route growth) must compile up front too.
    if (on) {
      this.warmGhost = new THREE.Mesh(this.ribbon.geometry, this.ghostMat);
      this.dynamic.add(this.warmGhost);
    }
    if (this.revealT0 >= 0) return;
    this.ribbon.material = on ? this.ribbonMat : this.ribbonPlain;
  }
  private warmGhost: THREE.Mesh | null = null;

  update(now: number, dt: number): void {
    if (this.shownStyle !== this.sim.state.progress.zone && this.revealT0 < 0) this.setRoute(null);
    this.sailAngle -= dt;
    this.spinSails(this.sailAngle);
    if (this.cloudTex) {
      this.cloudTex.offset.x = now * 0.004;
      this.cloudTex.offset.y = now * 0.0025;
    }
    if (this.revealT0 >= 0) {
      const u = Math.min(1, (now - this.revealT0) / REVEAL_S);
      this.reveal.value = easeOutCubic(u) * this.revealMax;
      if (u >= 1) {
        this.revealT0 = -1;
        this.reveal.value = 1e6;
        if (this.ribbon) this.ribbon.material = this.ribbonPlain;
      }
    }
    if (this.ghost) {
      const u = (now - this.ghostT0) / 1.1;
      if (u >= 1) this.clearGhost();
      else this.ghostMat.opacity = 1 - easeOutCubic(u);
    }
  }
}

/** 1 for samples of `p` that are not on `prev` (new stretches of the route). */
function freshness(p: PathTable, prev: PathTable): Uint8Array {
  const cell = 1;
  const grid = new Map<number, number[]>();
  const key = (x: number, z: number) => (Math.floor(x / cell) + 4096) * 8192 + (Math.floor(z / cell) + 4096);
  for (let i = 0; i < prev.n; i++) {
    const k = key(prev.x[i], prev.z[i]);
    let a = grid.get(k);
    if (!a) grid.set(k, (a = []));
    a.push(i);
  }
  const out = new Uint8Array(p.n);
  const r2 = 0.35 * 0.35;
  for (let i = 0; i < p.n; i++) {
    const cx = Math.floor(p.x[i] / cell);
    const cz = Math.floor(p.z[i] / cell);
    let near = false;
    for (let dz = -1; dz <= 1 && !near; dz++)
      for (let dx = -1; dx <= 1 && !near; dx++) {
        const a = grid.get((cx + dx + 4096) * 8192 + (cz + dz + 4096));
        if (a) for (const j of a) if ((prev.x[j] - p.x[i]) ** 2 + (prev.z[j] - p.z[i]) ** 2 < r2) (near = true);
      }
    out[i] = near ? 0 : 1;
  }
  return out;
}
