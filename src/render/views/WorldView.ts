import * as THREE from 'three';
import type { Sim } from '../../game/sim.ts';
import { farmPaths } from '../../game/field.ts';
import { wrap } from '../../shared/math.ts';
import { BIOMES } from '../palette.ts';
import {
  arrowGeometry,
  barnGeometry,
  dashGeometry,
  decorGeometry,
  fencePostGeometry,
  fieldGround,
  flowerGeometry,
  pathRibbon,
  rockGeometry,
  snowmanGeometry,
  tuftGeometry,
  windmillSailsGeometry,
  windmillTowerGeometry,
} from '../geo/world.ts';
import { cloudShadowTexture, hullGeometry, outlineMaterial, shared, toon } from '../materials.ts';
import type { QualitySettings } from '../quality.ts';
import { E, M4, Q, S, V } from '../scratch.ts';
import { capacityOf } from '../../game/config.ts';
import { hashFloat } from '../../shared/hash.ts';
import { easeOutBack, easeOutCubic } from '../../shared/math.ts';

const FLOWER_COLORS = [0xff6fb5, 0xffffff, 0xffd23f, 0x9b5de5, 0xff5d5d];

/** Static farm scenery + ambient motion: sky, ground, path (with draw-in reveal), barn, windmills, foliage, clouds. */
export class WorldView {
  readonly group = new THREE.Group();
  private dynamic = new THREE.Group();
  private ribbon: THREE.Mesh | null = null;
  private dashes: THREE.InstancedMesh | null = null;
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
  private dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
  private sails: THREE.Mesh[] = [];
  private clouds: THREE.Mesh | null = null;
  private cloudTex: THREE.CanvasTexture | null = null;
  barn!: THREE.Mesh;
  private barnBounceT = -1;
  /** Bobbing arrow over the barn while the basket is full ("sell here"). */
  private arrow: THREE.Mesh;
  private arrowShown = 0;
  private sim: Sim;
  private scene: THREE.Scene;
  /** Ambient extras (flowers, dense foliage) are skipped on the low quality tier. */
  lowQuality = false;
  private cloudShadows: boolean;

  constructor(sim: Sim, scene: THREE.Scene, quality: Pick<QualitySettings, 'tier' | 'cloudShadows'>) {
    this.sim = sim;
    this.scene = scene;
    this.lowQuality = quality.tier === 'low';
    this.cloudShadows = quality.cloudShadows;
    this.ribbonMat = toon({ rim: 0, side: THREE.DoubleSide });
    // Path "draws itself": fragments beyond the reveal radius are discarded, the front edge glows.
    const base = this.ribbonMat.onBeforeCompile;
    this.ribbonMat.onBeforeCompile = (sh, r) => {
      base.call(this.ribbonMat, sh, r);
      sh.uniforms.uReveal = this.reveal;
      sh.vertexShader = `attribute float aArc;\nvarying float vArc;\n${sh.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\n vArc = aArc;');
      sh.fragmentShader = `uniform float uReveal;\nvarying float vArc;\n${sh.fragmentShader}`
        .replace('void main() {', 'void main() {\n if (vArc > uReveal) discard;')
        .replace('#include <opaque_fragment>', 'outgoingLight += vec3(1.0, 0.9, 0.5) * smoothstep(uReveal - 1.5, uReveal, vArc) * step(uReveal, 900.0) * 0.6;\n#include <opaque_fragment>');
    };
    this.ribbonMat.customProgramCacheKey = () => 'ribbon-reveal';
    this.arrow = new THREE.Mesh(arrowGeometry(), this.mat);
    this.arrow.add(new THREE.Mesh(hullGeometry(this.arrow.geometry), outlineMaterial(0.05)));
    this.arrow.visible = false;
    this.dynamic.add(this.arrow);
    this.group.add(this.dynamic);
    this.rebuild();
  }

  rebuild(): void {
    for (const c of [...this.group.children]) {
      if (c === this.dynamic) continue;
      this.group.remove(c);
      c.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
        // Frees the instance buffers on the GPU too.
        if (o instanceof THREE.InstancedMesh) o.dispose();
      });
    }
    for (const m of this.owned) m.dispose();
    this.owned = [];
    this.sails = [];
    const { farm } = this.sim;
    const biome = BIOMES[farm.id];
    // The tilted camera never sees the horizon, so a plain clear colour (free) matches the fog.
    this.scene.background = new THREE.Color(biome.fog);
    this.scene.fog = new THREE.Fog(biome.fog, 38, 80);
    const { x0, z0, x1, z1 } = farm.bounds;
    const outsideMat = new THREE.MeshLambertMaterial({ color: biome.outside });
    const outlineMat = outlineMaterial(0.05);
    this.owned.push(outsideMat, outlineMat);
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), outsideMat);
    outside.position.y = -0.02;
    this.group.add(outside);
    this.group.add(new THREE.Mesh(fieldGround(x0 - 1, z0 - 1, x1 + 1, z1 + 1, biome.groundA, biome.groundB), this.mat));

    // Barn faces the unload point; outlined for the sticker look.
    this.barn = new THREE.Mesh(barnGeometry(), this.mat);
    this.barn.add(new THREE.Mesh(hullGeometry(this.barn.geometry), outlineMat));
    this.barn.position.set(farm.barn.bx, 0, farm.barn.bz);
    this.barn.rotation.y = Math.atan2(farm.barn.x - farm.barn.bx, farm.barn.z - farm.barn.bz);
    this.group.add(this.barn);

    // Fence around the field.
    const posts: [number, number, number][] = [];
    for (let x = x0 - 1.5; x < x1 + 1.5; x += 2) posts.push([x, z0 - 1.5, 0], [x, z1 + 1.5, 0]);
    for (let z = z0 - 1.5; z < z1 + 1.5; z += 2) posts.push([x0 - 1.5, z, -Math.PI / 2], [x1 + 1.5, z, -Math.PI / 2]);
    this.addInstanced(fencePostGeometry(), this.mat, posts, () => 1);

    // Decor ring outside the fence: trees, rocks, grass tufts, flowers.
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
      return out;
    };
    const jitter = (i: number) => 0.8 + 0.5 * hashFloat(i, 9, farm.seed);
    this.addInstanced(decorGeometry(biome.decor), this.foliageMat, ring(this.lowQuality ? 120 : 210, 10, 4, 18), (i) => 1.1 * jitter(i));
    this.addInstanced(rockGeometry(), this.mat, ring(40, 20, 2.5, 16), jitter);
    this.addInstanced(tuftGeometry(), this.foliageMat, ring(this.lowQuality ? 120 : 320, 30, 2.2, 14), (i) => 0.9 + jitter(i) * 0.6);
    if (!this.lowQuality && biome.decor !== 'cactus') {
      FLOWER_COLORS.forEach((c, k) => this.addInstanced(flowerGeometry(c), this.foliageMat, ring(40, 40 + k * 7, 2.2, 12), jitter));
    }

    // Windmills at the field corners (sails spin), snowmen on the snowy farm.
    const corners: [number, number][] = [
      [x0 - 4.5, z1 + 3.5],
      [x1 + 4.5, z1 + 3.5],
      [x1 + 4.5, z0 - 4.5],
    ];
    const towerGeo = windmillTowerGeometry();
    const sailGeo = windmillSailsGeometry();
    corners.forEach(([x, z], i) => {
      const tower = new THREE.Mesh(towerGeo, this.mat);
      tower.position.set(x, 0, z);
      // Face roughly towards the field centre.
      tower.rotation.y = Math.atan2((x0 + x1) / 2 - x, (z0 + z1) / 2 - z) + (i - 1) * 0.3;
      const sails = new THREE.Mesh(sailGeo, this.mat);
      sails.position.set(0, 3.55, 0.85);
      tower.add(sails);
      this.sails.push(sails);
      this.group.add(tower);
    });
    if (farm.id === 'snowyberry') {
      this.addInstanced(snowmanGeometry(), this.mat, ring(10, 60, 3, 9), () => 1);
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
    this.setStage(false);
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

  /** Path ribbon for the current stage + dashed preview of the next expansion. `animate` draws it in from the head. */
  setStage(animate = true): void {
    const { farm, path } = this.sim;
    const biome = BIOMES[farm.id];
    if (this.ribbon) {
      this.dynamic.remove(this.ribbon);
      this.ribbon.geometry.dispose();
    }
    const headS = wrap(this.sim.state.headS, path.length);
    this.ribbon = new THREE.Mesh(pathRibbon(path, 1.3, biome.path, biome.pathEdge, 0.02, headS), animate ? this.ribbonMat : this.ribbonPlain);
    this.dynamic.add(this.ribbon);
    if (animate) {
      this.revealT0 = shared.uTime.value;
      this.revealMax = path.length / 2 + 2;
      this.reveal.value = 0;
    } else {
      this.revealT0 = -1;
      this.reveal.value = 1e6;
    }
    if (this.dashes) {
      this.dynamic.remove(this.dashes);
      this.dashes.dispose();
      this.dashes = null;
    }
    const stage = this.sim.state.progress.stage;
    if (stage < 3) {
      const next = farmPaths(farm)[stage + 1];
      const pts: number[] = [];
      for (let i = 0; i < next.n; i += 6) {
        // Skip stretches shared with the current loop.
        let near = false;
        for (let j = 0; j < path.n; j += 2) {
          if ((path.x[j] - next.x[i]) ** 2 + (path.z[j] - next.z[i]) ** 2 < 1) {
            near = true;
            break;
          }
        }
        if (!near) pts.push(i);
      }
      const m = new THREE.InstancedMesh(dashGeometry(), this.dashMat, Math.max(1, pts.length));
      m.count = pts.length;
      pts.forEach((i, k) => {
        V.set(next.x[i], 0.05, next.z[i]);
        E.set(0, Math.atan2(-next.tz[i], next.tx[i]), 0);
        Q.setFromEuler(E);
        S.setScalar(1);
        m.setMatrixAt(k, M4.compose(V, Q, S));
      });
      m.renderOrder = 1;
      this.dashes = m;
      this.dynamic.add(m);
    }
  }

  /** Shader warm-up: temporarily show the path with its draw-in material so that program is compiled up front. */
  useRevealMaterial(on: boolean): void {
    if (!this.ribbon || this.revealT0 >= 0) return;
    this.ribbon.material = on ? this.ribbonMat : this.ribbonPlain;
  }

  /** Barn squash-and-stretch when a load arrives. */
  bounceBarn(now: number): void {
    this.barnBounceT = now;
  }

  update(now: number, dt: number): void {
    // "Sell here" arrow: eases in while the basket is full, bobs and spins over the barn.
    const st = this.sim.state;
    const full = st.basket.mass >= capacityOf(st);
    this.arrowShown += ((full ? 1 : 0) - this.arrowShown) * Math.min(1, dt * 8);
    this.arrow.visible = this.arrowShown > 0.02;
    if (this.arrow.visible) {
      const b = this.sim.farm.barn;
      this.arrow.position.set(b.bx, 4.6 + Math.abs(Math.sin(now * 3.2)) * 0.7, b.bz);
      this.arrow.rotation.y = now * 1.6;
      this.arrow.scale.setScalar(this.arrowShown * (1 + 0.08 * Math.sin(now * 6.4)));
    }
    this.dashMat.opacity = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(now * 3));
    for (let i = 0; i < this.sails.length; i++) this.sails[i].rotation.z -= dt * (0.9 + i * 0.15);
    if (this.cloudTex) {
      this.cloudTex.offset.x = now * 0.004;
      this.cloudTex.offset.y = now * 0.0025;
    }
    if (this.revealT0 >= 0) {
      const u = Math.min(1, (now - this.revealT0) / 1.4);
      this.reveal.value = easeOutCubic(u) * this.revealMax;
      if (u >= 1) {
        this.revealT0 = -1;
        this.reveal.value = 1e6;
        if (this.ribbon) this.ribbon.material = this.ribbonPlain;
      }
    }
    if (this.barnBounceT >= 0) {
      const u = (now - this.barnBounceT) / 0.5;
      if (u >= 1) {
        this.barnBounceT = -1;
        this.barn.scale.set(1, 1, 1);
      } else {
        const k = easeOutBack(u) - u;
        const sq = Math.sin(u * Math.PI * 2) * (1 - u) * 0.12 + k * 0.02;
        this.barn.scale.set(1 + sq, 1 - sq, 1 + sq);
      }
    }
  }
}
