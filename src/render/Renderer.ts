import * as THREE from 'three';
import type { Sim } from '../game/sim.ts';
import { CameraRig } from './CameraRig.ts';
import { WorldView } from './views/WorldView.ts';
import { FieldView } from './views/FieldView.ts';
import { CaterpillarView } from './views/CaterpillarView.ts';
import { StackView } from './views/StackView.ts';
import { Particles } from './fx/Particles.ts';
import { TornadoView } from './views/TornadoView.ts';
import { BIOMES } from './palette.ts';
import { DynamicResolution, detectTier, settingsFor, type QualitySettings, type QualityTier } from './quality.ts';
import { sampleAt, type PathSample } from '../game/path.ts';
import { vMax } from '../game/config.ts';

/** Detect GPU class on a throwaway context so the real one can be created with the right antialias setting. */
function probeTier(): QualityTier {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') ?? c.getContext('webgl');
  const tier = detectTier(gl);
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return tier;
}

const hs: PathSample = { x: 0, z: 0, tx: 0, tz: 0 };
const proj = new THREE.Vector3();

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig = new CameraRig();
  world: WorldView;
  field: FieldView;
  cat: CaterpillarView;
  stacks: StackView;
  fx: Particles;
  tornado = new TornadoView();
  quality: QualitySettings;
  private dyn: DynamicResolution;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private sim: Sim;
  private width = 1;
  private height = 1;
  /** Hook for extra views (stacks, particles) updated after the caterpillar. */
  readonly extras: { update(now: number, dt: number): void }[] = [];

  constructor(canvas: HTMLCanvasElement, sim: Sim, tier?: QualityTier) {
    this.sim = sim;
    this.quality = settingsFor(tier ?? probeTier());
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality.antialias, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.dyn = new DynamicResolution(Math.min(this.quality.dprCap, window.devicePixelRatio || 1));
    this.renderer.setPixelRatio(this.dyn.ratio);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x5d8a3c, 1.9);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
    this.sun.position.set(6, 12, 4);
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.world = new WorldView(sim, this.scene);
    this.field = new FieldView(sim);
    this.cat = new CaterpillarView(sim);
    this.stacks = new StackView(sim, this.cat);
    this.fx = new Particles();
    this.fx.budget = this.quality.particleScale;
    this.scene.add(this.world.group, this.field.group, this.cat.group, this.stacks.group, this.fx.mesh, this.tornado.group);
    this.applyBiome();
    const h = sim.headPosition(hs);
    this.rig.snap(h.x, h.z);
  }

  applyBiome(): void {
    const b = BIOMES[this.sim.farm.id];
    this.hemi.color.setHex(b.hemiSky);
    this.hemi.groundColor.setHex(b.hemiGround);
    this.sun.color.setHex(b.sun);
    this.rig.yaw = b.yaw;
  }

  /** Call after travel: rebuild everything for the new farm. */
  onFarmChanged(): void {
    this.world.rebuild();
    this.field.rebuild();
    this.stacks.onFarmChanged();
    this.applyBiome();
    const h = this.sim.headPosition(hs);
    this.rig.snap(h.x, h.z);
  }

  onStageChanged(): void {
    this.world.setStage();
    this.stacks.onFarmChanged();
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.rig.camera.aspect = w / h;
    this.rig.camera.updateProjectionMatrix();
  }

  /** Interpolated head arc position for this frame. */
  headS(alpha: number): number {
    const st = this.sim.state;
    return st.prevHeadS + (st.headS - st.prevHeadS) * alpha;
  }

  frame(alpha: number, dt: number, now: number, frameMs: number): void {
    const st = this.sim.state;
    const headS = this.headS(alpha);
    this.field.update(now);
    this.cat.update(headS, this.rig.camera, dt, now);
    this.stacks.update(now, dt, headS);
    this.fx.update(dt);
    this.tornado.update(now);
    this.world.update(now);
    for (const x of this.extras) x.update(now, dt);
    sampleAt(this.sim.path, headS, hs);
    const n = st.progress.segments.length;
    // Look ahead along the path and towards the middle of the chain.
    const look = 2.2;
    const mid = this.cat.poses[Math.min(n, Math.ceil(n / 3))];
    const tx = hs.x + hs.tx * look;
    const tz = hs.z + hs.tz * look;
    this.rig.update(tx * 0.75 + mid.x * 0.25, tz * 0.75 + mid.z * 0.25, n * 1.1, st.v / vMax(st.progress.speedLevel), dt, now);
    // Fog follows the camera distance so zooming out never drowns the farm.
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) {
      const d = this.rig.camera.position.y / Math.sin(this.rig.pitch);
      fog.near = d * 1.05;
      fog.far = d * 2.6;
    }
    this.renderer.render(this.scene, this.rig.camera);
    const r = this.dyn.sample(frameMs, dt);
    if (r !== null) {
      this.renderer.setPixelRatio(r);
      this.renderer.setSize(this.width, this.height, false);
    }
  }

  /** World → CSS pixel coordinates (for DOM floaters). Returns false when behind the camera. */
  project(x: number, y: number, z: number, out: { x: number; y: number }): boolean {
    proj.set(x, y, z).project(this.rig.camera);
    out.x = ((proj.x + 1) / 2) * this.width;
    out.y = ((1 - proj.y) / 2) * this.height;
    return proj.z < 1;
  }

  get info(): { drawCalls: number; triangles: number } {
    return { drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
  }
}
