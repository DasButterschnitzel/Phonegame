import * as THREE from 'three';
import type { Sim } from '../../game/sim.ts';
import { farmPaths } from '../../game/field.ts';
import { BIOMES } from '../palette.ts';
import { barnGeometry, dashGeometry, decorGeometry, fencePostGeometry, fieldGround, pathRibbon, rockGeometry } from '../geo/world.ts';
import { lambert } from '../geo/lowpoly.ts';
import { E, M4, Q, S, V } from '../scratch.ts';
import { hashFloat } from '../../shared/hash.ts';

/** Static farm scenery: ground, path ribbon, next-stage outline, barn, fence and decor. */
export class WorldView {
  readonly group = new THREE.Group();
  private dynamic = new THREE.Group();
  private ribbon: THREE.Mesh | null = null;
  private dashes: THREE.InstancedMesh | null = null;
  private mat = lambert();
  private ribbonMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
  barn!: THREE.Mesh;
  private sim: Sim;
  private scene: THREE.Scene;

  constructor(sim: Sim, scene: THREE.Scene) {
    this.sim = sim;
    this.scene = scene;
    this.group.add(this.dynamic);
    this.rebuild();
  }

  rebuild(): void {
    for (const c of [...this.group.children]) {
      if (c === this.dynamic) continue;
      this.group.remove(c);
      if (c instanceof THREE.Mesh) c.geometry.dispose();
    }
    const { farm } = this.sim;
    const biome = BIOMES[farm.id];
    this.scene.background = new THREE.Color(biome.sky);
    this.scene.fog = new THREE.Fog(biome.fog, 38, 80);
    const { x0, z0, x1, z1 } = farm.bounds;
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: biome.outside }));
    outside.position.y = -0.02;
    this.group.add(outside);
    this.group.add(new THREE.Mesh(fieldGround(x0 - 1, z0 - 1, x1 + 1, z1 + 1, biome.groundA, biome.groundB), this.mat));

    // Barn faces the unload point.
    this.barn = new THREE.Mesh(barnGeometry(), this.mat);
    this.barn.position.set(farm.barn.bx, 0, farm.barn.bz);
    this.barn.rotation.y = Math.atan2(farm.barn.x - farm.barn.bx, farm.barn.z - farm.barn.bz);
    this.group.add(this.barn);

    // Fence around the field.
    const posts: [number, number, number][] = [];
    for (let x = x0 - 1.5; x < x1 + 1.5; x += 2) posts.push([x, z0 - 1.5, 0], [x, z1 + 1.5, 0]);
    for (let z = z0 - 1.5; z < z1 + 1.5; z += 2) posts.push([x0 - 1.5, z, -Math.PI / 2], [x1 + 1.5, z, -Math.PI / 2]);
    const fence = new THREE.InstancedMesh(fencePostGeometry(), this.mat, posts.length);
    posts.forEach(([x, z, r], i) => {
      V.set(x, 0, z);
      E.set(0, r, 0);
      Q.setFromEuler(E);
      S.setScalar(1);
      fence.setMatrixAt(i, M4.compose(V, Q, S));
    });
    this.group.add(fence);

    // Decor ring outside the fence.
    const decor: [number, number, number][] = [];
    const rocks: [number, number, number][] = [];
    for (let i = 0; i < 260; i++) {
      const a = hashFloat(i, 1, farm.seed) * Math.PI * 2;
      const side = Math.floor(hashFloat(i, 2, farm.seed) * 4);
      const u = hashFloat(i, 3, farm.seed);
      const d = 3 + hashFloat(i, 4, farm.seed) * 14;
      let x = 0;
      let z = 0;
      if (side === 0) [x, z] = [x0 - 1 + (x1 - x0 + 2) * u, z0 - d];
      else if (side === 1) [x, z] = [x0 - 1 + (x1 - x0 + 2) * u, z1 + d];
      else if (side === 2) [x, z] = [x0 - d, z0 - 1 + (z1 - z0 + 2) * u];
      else [x, z] = [x1 + d, z0 - 1 + (z1 - z0 + 2) * u];
      (i % 5 === 0 ? rocks : decor).push([x, z, a]);
    }
    const addInstanced = (geo: THREE.BufferGeometry, items: [number, number, number][], scaleBase: number) => {
      const m = new THREE.InstancedMesh(geo, this.mat, items.length);
      items.forEach(([x, z, a], i) => {
        V.set(x, 0, z);
        E.set(0, a, 0);
        Q.setFromEuler(E);
        S.setScalar(scaleBase * (0.8 + 0.5 * hashFloat(i, 9, farm.seed)));
        m.setMatrixAt(i, M4.compose(V, Q, S));
      });
      this.group.add(m);
    };
    addInstanced(decorGeometry(biome.decor), decor, 1.1);
    addInstanced(rockGeometry(), rocks, 1);
    this.setStage();
  }

  /** Path ribbon for the current stage + dashed preview of the next expansion. */
  setStage(): void {
    const { farm, path } = this.sim;
    const biome = BIOMES[farm.id];
    if (this.ribbon) {
      this.dynamic.remove(this.ribbon);
      this.ribbon.geometry.dispose();
    }
    this.ribbon = new THREE.Mesh(pathRibbon(path, 1.3, biome.path, biome.pathEdge), this.ribbonMat);
    this.dynamic.add(this.ribbon);
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

  /** Gently pulse the expansion outline so it reads as a goal. */
  update(now: number): void {
    this.dashMat.opacity = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(now * 3));
  }
}
