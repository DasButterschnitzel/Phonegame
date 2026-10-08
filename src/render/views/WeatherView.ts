import * as THREE from 'three';
import type { Sim } from '../../game/sim.ts';
import { biomeLook, type WeatherKind } from '../palette.ts';
import { C, E, M4, Q, S, V } from '../scratch.ts';

/** Half-size of the box of air around the camera's focus that the particles live in (they wrap around inside it). */
const R = 13;
const LEAF_COLORS = [0xe8a33a, 0xd9682f, 0xc9a43c, 0xb5532f, 0xf2c14e];
const BUTTERFLY_COLORS = [0xffb03a, 0xffe14d, 0x5aa8ff, 0xffffff, 0xff7ab8];
const PETAL_COLORS = [0xffc0d8, 0xffd4e4, 0xffb0cc, 0xfff0f6];

interface Kind {
  n: number;
  geo: () => THREE.BufferGeometry;
  mat: () => THREE.Material;
  y: [number, number];
  size: [number, number];
}

const KINDS: Record<Exclude<WeatherKind, 'none'>, Kind> = {
  // Warm motes drifting low over the fields.
  dust: {
    n: 70,
    geo: () => new THREE.OctahedronGeometry(0.05, 0),
    mat: () => new THREE.MeshBasicMaterial({ color: 0xffe8b8, transparent: true, opacity: 0.75, depthWrite: false }),
    y: [0.3, 2.6],
    size: [0.6, 1.5],
  },
  // Soft banks of mist hanging just above the ground.
  mist: {
    n: 12,
    geo: () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    mat: () => new THREE.MeshBasicMaterial({ map: softTexture(), transparent: true, opacity: 0.2, depthWrite: false }),
    y: [0.35, 1.1],
    size: [4, 7.5],
  },
  // Snowflakes drifting down.
  snow: {
    n: 80,
    geo: () => new THREE.OctahedronGeometry(0.06, 0),
    mat: () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }),
    y: [0, 6],
    size: [0.7, 1.4],
  },
  // Pollen glinting in the sun over the blossoms.
  pollen: {
    n: 60,
    geo: () => new THREE.OctahedronGeometry(0.04, 0),
    mat: () => new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.85, depthWrite: false }),
    y: [0.4, 2.4],
    size: [0.7, 1.4],
  },
  // Butterflies wandering over the blossoms.
  butterflies: {
    n: 22,
    geo: () => new THREE.OctahedronGeometry(0.09, 0).scale(1.7, 0.12, 1),
    mat: () => new THREE.MeshLambertMaterial({ color: 0xffffff }),
    y: [0.5, 2.2],
    size: [0.9, 1.3],
  },
  // Cherry petals drifting down.
  petals: {
    n: 55,
    geo: () => new THREE.OctahedronGeometry(0.07, 0).scale(1.3, 0.18, 1),
    mat: () => new THREE.MeshLambertMaterial({ color: 0xffffff }),
    y: [0, 5],
    size: [0.8, 1.3],
  },
  // Bees zipping between the lavender rows.
  bees: {
    n: 30,
    geo: () => new THREE.OctahedronGeometry(0.05, 0).scale(1.4, 1, 1),
    mat: () => new THREE.MeshBasicMaterial({ color: 0xf2c12e }),
    y: [0.4, 1.4],
    size: [0.9, 1.2],
  },
  // Fireflies blinking over the marsh.
  fireflies: {
    n: 40,
    geo: () => new THREE.OctahedronGeometry(0.06, 0),
    mat: () => new THREE.MeshBasicMaterial({ color: 0xd8ff6a, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }),
    y: [0.3, 2.2],
    size: [0.8, 1.3],
  },
  // Embers rising from the volcanic ground.
  embers: {
    n: 70,
    geo: () => new THREE.OctahedronGeometry(0.05, 0),
    mat: () => new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }),
    y: [0, 4.5],
    size: [0.7, 1.3],
  },
  // Glittering dust under a black sky.
  stardust: {
    n: 40,
    geo: () => new THREE.OctahedronGeometry(0.045, 0),
    mat: () => new THREE.MeshBasicMaterial({ color: 0xf0f4ff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }),
    y: [0.3, 3.0],
    size: [0.7, 1.3],
  },
  // Golden vine leaves tumbling down.
  leaves: {
    n: 40,
    geo: () => new THREE.OctahedronGeometry(0.1, 0).scale(1.4, 0.22, 0.8),
    mat: () => new THREE.MeshLambertMaterial({ color: 0xffffff }),
    y: [0, 5.5],
    size: [0.8, 1.3],
  },
};

let soft: THREE.CanvasTexture | null = null;
function softTexture(): THREE.CanvasTexture {
  if (soft) return soft;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  soft = new THREE.CanvasTexture(c);
  soft.colorSpace = THREE.SRGBColorSpace;
  return soft;
}

/**
 * The biome's weather: a few dozen ambient particles (one draw call) in a box of air that follows the camera — warm
 * dust over the orchard, mist on the terraces, leaves over the vineyard, snow on the berry farm, pollen over the
 * sunflowers, butterflies in the plantation, cherry petals in the tea garden, bees over the lavender, fireflies in the
 * marsh, embers on the volcano, stardust on the moon. Purely decorative; thinned on low quality.
 */
export class WeatherView {
  readonly group = new THREE.Group();
  private sim: Sim;
  private density: number;
  private mesh: THREE.InstancedMesh | null = null;
  private kind: WeatherKind = 'none';
  private x = new Float32Array(0);
  private y = new Float32Array(0);
  private z = new Float32Array(0);
  private ph = new Float32Array(0);
  private sz = new Float32Array(0);
  private cx = 0;
  private cz = 0;

  /** `density`: share of the particles drawn (quality tier). */
  constructor(sim: Sim, density: number) {
    this.sim = sim;
    this.density = density;
    this.rebuild();
  }

  get active(): WeatherKind {
    return this.kind;
  }

  rebuild(): void {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh.dispose();
      this.mesh = null;
    }
    this.kind = biomeLook(this.sim.farm.biome).weather ?? 'none';
    if (this.kind === 'none') return;
    const k = KINDS[this.kind];
    const n = Math.max(4, Math.round(k.n * this.density));
    this.mesh = new THREE.InstancedMesh(k.geo(), k.mat(), n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = this.kind === 'mist' ? 3 : 1;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.z = new Float32Array(n);
    this.ph = new Float32Array(n);
    this.sz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.x[i] = (Math.random() * 2 - 1) * R;
      this.z[i] = (Math.random() * 2 - 1) * R;
      this.y[i] = k.y[0] + Math.random() * (k.y[1] - k.y[0]);
      this.ph[i] = Math.random() * Math.PI * 2;
      this.sz[i] = k.size[0] + Math.random() * (k.size[1] - k.size[0]);
      const tint = this.kind === 'leaves' ? LEAF_COLORS : this.kind === 'butterflies' ? BUTTERFLY_COLORS : this.kind === 'petals' ? PETAL_COLORS : null;
      if (tint) this.mesh.setColorAt(i, C.setHex(tint[i % tint.length]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.group.add(this.mesh);
  }

  /** (cx, cz): where the camera looks — the air box is centred there. */
  update(now: number, dt: number, cx: number, cz: number): void {
    const m = this.mesh;
    if (!m) return;
    this.cx = cx;
    this.cz = cz;
    const k = KINDS[this.kind as Exclude<WeatherKind, 'none'>];
    const n = m.count;
    const wrapAxis = (v: number, c: number) => {
      const d = v - c;
      return d > R ? v - 2 * R : d < -R ? v + 2 * R : v;
    };
    for (let i = 0; i < n; i++) {
      const p = this.ph[i];
      let rx = 0;
      let ry = 0;
      let rz = 0;
      let flicker = 1;
      if (this.kind === 'dust' || this.kind === 'pollen') {
        const slow = this.kind === 'pollen' ? 0.5 : 1;
        this.x[i] += (0.35 + 0.15 * Math.sin(now * 0.7 + p)) * dt * slow;
        this.z[i] += 0.12 * dt * slow;
        this.y[i] += Math.sin(now * 1.3 + p * 3) * 0.12 * dt;
      } else if (this.kind === 'snow') {
        this.y[i] -= (0.7 + 0.2 * Math.sin(p * 7)) * dt;
        this.x[i] += 0.25 * Math.sin(now * 0.9 + p) * dt;
        this.z[i] += 0.12 * dt;
        if (this.y[i] < 0.05) {
          this.y[i] = k.y[1];
          this.x[i] = cx + (Math.random() * 2 - 1) * R;
          this.z[i] = cz + (Math.random() * 2 - 1) * R;
        }
      } else if (this.kind === 'bees') {
        // Quick zig-zags.
        const hd = p * 6 + now * 2.2 + Math.sin(now * 5 + p * 4) * 1.5;
        this.x[i] += Math.cos(hd) * 1.4 * dt;
        this.z[i] += Math.sin(hd) * 1.4 * dt;
        this.y[i] = k.y[0] + (k.y[1] - k.y[0]) * (0.5 + 0.5 * Math.sin(now * 2.3 + p * 5));
        ry = -hd;
      } else if (this.kind === 'fireflies' || this.kind === 'stardust') {
        // Slow wander; they blink (fireflies) or twinkle (stardust).
        const hd = p * 6 + now * 0.25;
        this.x[i] += Math.cos(hd) * 0.25 * dt;
        this.z[i] += Math.sin(hd) * 0.25 * dt;
        this.y[i] += Math.sin(now * 0.9 + p * 3) * 0.15 * dt;
        const blink = this.kind === 'fireflies' ? Math.max(0, Math.sin(now * 1.8 + p * 7)) : 0.5 + 0.5 * Math.sin(now * 3.1 + p * 11);
        flicker = 0.15 + 0.85 * blink;
      } else if (this.kind === 'embers') {
        // Rise, sway and fade out up high; back to the ground.
        this.y[i] += (0.55 + 0.25 * Math.sin(p * 5)) * dt;
        this.x[i] += 0.3 * Math.sin(now * 1.5 + p * 3) * dt;
        if (this.y[i] > k.y[1]) {
          this.y[i] = k.y[0];
          this.x[i] = cx + (Math.random() * 2 - 1) * R;
          this.z[i] = cz + (Math.random() * 2 - 1) * R;
        }
        flicker = 1 - this.y[i] / k.y[1];
      } else if (this.kind === 'butterflies') {
        // Wander on a slowly turning heading, bobbing, wings flapping.
        const hd = p * 6 + now * (0.35 + 0.2 * Math.sin(p * 3));
        this.x[i] += Math.cos(hd) * 0.7 * dt;
        this.z[i] += Math.sin(hd) * 0.7 * dt;
        this.y[i] = k.y[0] + (k.y[1] - k.y[0]) * (0.5 + 0.5 * Math.sin(now * 0.8 + p * 5));
        ry = -hd;
        rz = Math.sin(now * 22 + p * 9) * 0.9;
      } else if (this.kind === 'mist') {
        this.x[i] += 0.16 * dt;
        this.z[i] += 0.05 * Math.sin(now * 0.2 + p) * dt;
        ry = p;
      } else {
        // Leaves and petals: fall, sway, tumble; back to the top when they reach the ground.
        this.y[i] -= (this.kind === 'petals' ? 0.3 : 0.45 + 0.15 * Math.sin(p * 5)) * dt;
        this.x[i] += (0.25 + 0.5 * Math.sin(now * 1.7 + p)) * dt;
        this.z[i] += 0.3 * Math.cos(now * 1.3 + p * 2) * dt;
        if (this.y[i] < 0.05) {
          this.y[i] = k.y[1];
          this.x[i] = cx + (Math.random() * 2 - 1) * R;
          this.z[i] = cz + (Math.random() * 2 - 1) * R;
        }
        rx = now * 2.1 + p;
        ry = now * 1.3 + p * 2;
        rz = Math.sin(now * 2.5 + p) * 0.8;
      }
      this.x[i] = wrapAxis(this.x[i], cx);
      this.z[i] = wrapAxis(this.z[i], cz);
      V.set(this.x[i], this.y[i], this.z[i]);
      Q.setFromEuler(E.set(rx, ry, rz));
      S.setScalar(this.sz[i] * flicker);
      m.setMatrixAt(i, M4.compose(V, Q, S));
    }
    m.instanceMatrix.needsUpdate = true;
  }

  /** Where the air box was last centred (tests). */
  get centre(): [number, number] {
    return [this.cx, this.cz];
  }
}
