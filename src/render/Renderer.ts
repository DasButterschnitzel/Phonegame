import * as THREE from 'three';
import type { Sim } from '../game/sim.ts';
import { CameraRig } from './CameraRig.ts';
import { WorldView } from './views/WorldView.ts';
import { FieldView } from './views/FieldView.ts';
import { CaterpillarView } from './views/CaterpillarView.ts';
import { StackView } from './views/StackView.ts';
import { Particles } from './fx/Particles.ts';
import { TornadoView } from './views/TornadoView.ts';
import { TerritoryView } from './views/TerritoryView.ts';
import { DepotView } from './views/DepotView.ts';
import type { DebugView } from './views/DebugView.ts';
import { Shockwaves } from './fx/Shockwave.ts';
import { materialFlags, shared } from './materials.ts';
import { BIOMES } from './palette.ts';
import { DynamicResolution, detectTier, pixelBudgetRatio, settingsFor, type QualitySettings, type QualityTier } from './quality.ts';
import { sampleAt, type PathSample } from '../game/path.ts';
import type { PathTable } from '../game/types.ts';
import { vMax } from '../game/config.ts';
import { clamp, wrap } from '../shared/math.ts';

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
  territory: TerritoryView;
  depot: DepotView;
  field: FieldView;
  debug: DebugView | null = null;
  cat: CaterpillarView;
  stacks: StackView;
  fx: Particles;
  tornado = new TornadoView();
  waves = new Shockwaves();
  private dustAcc = 0;
  private depotBias = 0;
  private bodies = { poses: [] as { x: number; z: number }[], count: 0 };
  private sparkleAcc = 0;
  quality: QualitySettings;
  readonly dyn: DynamicResolution;
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
    // 'default' lets Android pick the battery-friendly path; 'high-performance' is mostly ignored there anyway.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality.antialias, powerPreference: 'default', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.dyn = new DynamicResolution(Math.min(this.quality.dprCap, window.devicePixelRatio || 1));
    this.renderer.setPixelRatio(this.dyn.ratio);

    // Toon ramp + strong key light from the camera's left gives crisp, readable shapes.
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x5d8a3c, 1.25);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.1);
    this.sun.position.set(-4, 12, 7);
    this.scene.add(this.hemi, this.sun, this.sun.target);

    materialFlags.wind = this.quality.wind;
    this.world = new WorldView(sim, this.scene, this.quality);
    this.territory = new TerritoryView(sim, this.quality.tier === 'low');
    this.depot = new DepotView(sim);
    this.field = new FieldView(sim);
    this.cat = new CaterpillarView(sim);
    this.bodies.poses = this.cat.poses;
    this.stacks = new StackView(sim, this.cat, this.quality.stackOutlines);
    this.fx = new Particles();
    this.fx.budget = this.quality.particleScale;
    this.scene.add(this.world.group, this.territory.group, this.depot.group, this.field.group, this.cat.group, this.stacks.group, this.fx.mesh, this.tornado.group, this.waves.group);
    // Cargo landing in the hopper: coin spray, ring, barn squash.
    this.stacks.target.copy(this.depot.hopperTop);
    this.stacks.onLand = (n) => {
      const t = shared.uTime.value;
      const h = this.depot.hopperTop;
      this.depot.bounce(t);
      this.fx.burst(h.x, h.y + 0.4, h.z, 0xffd23f, Math.min(8, 2 + n), 2.6, 0.15, 0.8, 5, 12);
      this.waves.spawn(h.x, h.z, 0xffe680, 1.8, t, 0.4);
    };
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
    this.territory.rebuild();
    this.depot.rebuild();
    this.field.rebuild();
    this.stacks.onFarmChanged();
    this.stacks.target.copy(this.depot.hopperTop);
    this.debug?.reset();
    this.applyBiome();
    const h = this.sim.headPosition(hs);
    this.rig.snap(h.x, h.z);
  }

  /** The route grew around freshly claimed plots: draw the new stretch, green the plots, pull the camera back. */
  onRouteGrew(plots: number[], prev: PathTable): void {
    const now = shared.uTime.value;
    this.world.setRoute(prev);
    this.territory.onClaimed(plots, now);
    this.field.onPlotsClaimed(plots);
    this.depot.rebuild();
    this.stacks.target.copy(this.depot.hopperTop);
    this.rig.zoomPulse(0.16 + Math.min(0.2, plots.length * 0.05), 0.55);
  }

  /** A zone fence opened: bigger reveal. */
  onZoneOpened(): void {
    this.rig.zoomPulse(0.6, 1.0);
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    // Tablets / foldables: cap the drawing-buffer size instead of rendering 4–6 M pixels.
    const ratio = this.dyn.setCap(pixelBudgetRatio(Math.min(this.quality.dprCap, window.devicePixelRatio || 1), w, h));
    if (ratio !== this.renderer.getPixelRatio()) this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.rig.camera.aspect = w / h;
    this.rig.camera.updateProjectionMatrix();
  }

  /** Interpolated head arc position for this frame. */
  headS(alpha: number): number {
    const st = this.sim.state;
    return st.prevHeadS + (st.headS - st.prevHeadS) * alpha;
  }

  /** `budgetMs`: the frame cap's interval (dynamic resolution compares real frame times against it). */
  frame(alpha: number, dt: number, now: number, budgetMs: number): void {
    const st = this.sim.state;
    const headS = this.headS(alpha);
    shared.uTime.value = now;
    this.cat.update(headS, this.rig.camera, dt, now);
    this.bodies.count = st.progress.segments.length + 1;
    this.field.update(now, this.bodies);
    this.territory.update(now);
    this.depot.update(now, dt);
    this.stacks.update(now, dt);
    this.fx.update(dt);
    this.tornado.update(now);
    this.waves.update(now);
    this.ambientFx(dt);
    this.world.update(now, dt);
    this.debug?.update(now, this.cat.poses);
    for (const x of this.extras) x.update(now, dt);
    sampleAt(this.sim.path, headS, hs);
    const n = st.progress.segments.length;
    // Look ahead along the path and towards the middle of the chain.
    const look = 2.2;
    const mid = this.cat.poses[Math.min(n, Math.ceil(n / 3))];
    let tx = (hs.x + hs.tx * look) * 0.75 + mid.x * 0.25;
    let tz = (hs.z + hs.tz * look) * 0.75 + mid.z * 0.25;
    // Carrying cargo towards the depot: lean the framing towards the barn so the drop-off is in view.
    const ahead = wrap(this.sim.path.barnS - headS, this.sim.path.length);
    const want = st.basket.mass > 0 ? clamp(1 - ahead / 12, 0, 1) * 0.22 : 0;
    this.depotBias += (want - this.depotBias) * Math.min(1, dt * 2.5);
    if (this.depotBias > 0.001) {
      const b = this.sim.farm.barn;
      tx += (b.bx - tx) * this.depotBias;
      tz += (b.bz - tz) * this.depotBias;
    }
    this.rig.update(tx, tz, n * 1.1, st.v / vMax(st.progress.speedLevel), dt, now);
    // Fog follows the camera distance so zooming out never drowns the farm.
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) {
      const d = this.rig.camera.position.y / Math.sin(this.rig.pitch);
      fog.near = d * 1.05;
      fog.far = d * 2.6;
    }
    this.renderer.render(this.scene, this.rig.camera);
    const r = this.dyn.sample(dt * 1000, budgetMs);
    // setPixelRatio already resizes the drawing buffer.
    if (r !== null) this.renderer.setPixelRatio(r);
  }

  /** Dust trail at speed and twinkles on golden crops. */
  private ambientFx(dt: number): void {
    const st = this.sim.state;
    const frac = st.v / vMax(st.progress.speedLevel);
    this.dustAcc += dt;
    if (frac > 0.6 && this.dustAcc > 0.09) {
      this.dustAcc = 0;
      const n = st.progress.segments.length;
      const p = this.cat.tailPoint(n, 0.6);
      this.fx.burst(p.x, 0.12, p.z, 0xe8cfa0, 1, 0.8, 0.22, 0.55, 1.2, 2);
    }
    this.sparkleAcc += dt;
    if (this.sparkleAcc > 0.35) {
      this.sparkleAcc = 0;
      const f = this.sim.field;
      for (let i = 0; i < f.count; i++) {
        if (f.golden[i] && !f.dead[i] && f.tier[i] <= st.progress.zone) this.fx.burst(f.x[i], 0.9, f.z[i], 0xfff3a0, 1, 0.4, 0.08, 0.7, 1.5, 0.5);
      }
    }
  }

  /** Compile every material once up front so first-time effects don't hitch. */
  warmup(): void {
    this.setWarm(true);
    this.renderer.compile(this.scene, this.rig.camera);
    this.setWarm(false);
  }

  /** Make every effect that is normally hidden part of the scene for a shader compile pass. */
  private setWarm(on: boolean): void {
    this.tornado.group.visible = on;
    this.waves.setAllVisible(on);
    this.world.useRevealMaterial(on);
  }

  /**
   * Same as `warmup`, but lets the driver compile in parallel (KHR_parallel_shader_compile) without freezing the
   * page, so the loading screen keeps animating on slow mobile GPUs.
   */
  async warmupAsync(): Promise<void> {
    this.setWarm(true);
    // compile() runs synchronously inside compileAsync, so the scene can be restored right away.
    const ready = this.renderer.compileAsync(this.scene, this.rig.camera);
    this.setWarm(false);
    await ready;
  }

  /** GL context came back: three re-uploads resources lazily; recompile up front to avoid hitches. */
  onContextRestored(): void {
    this.warmup();
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
