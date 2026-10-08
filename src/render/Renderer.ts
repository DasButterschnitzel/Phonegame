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
import { biomeLook } from './palette.ts';
import { DynamicResolution, detectTier, pixelBudgetRatio, settingsFor, type QualitySettings, type QualityTier } from './quality.ts';
import { sampleAt, type PathSample } from '../game/path.ts';
import type { PathTable } from '../game/types.ts';
import { MOVE, vMax } from '../game/config.ts';
import { clamp, wrap } from '../shared/math.ts';

/** Detect GPU class on a throwaway context so the real one can be created with the right antialias setting. */
function probeTier(): QualityTier {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') ?? c.getContext('webgl');
  const tier = detectTier(gl);
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return tier;
}

const la: PathSample = { x: 0, z: 0, tx: 0, tz: 0 };
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
  private steamAcc = 0;
  /** 0..~0.25: how far the framing leans towards the depot hopper (approach with cargo, held through a wave). */
  private depotBias = 0;
  private depotHoldUntil = -1;
  private bodies = { poses: [] as { x: number; z: number }[], count: 0 };
  private sparkleAcc = 0;
  quality: QualitySettings;
  readonly dyn: DynamicResolution;
  /** GPU / driver name as WebGL reports it (perf overlay, bug reports). */
  readonly gpu: string;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private sim: Sim;
  private width = 1;
  private height = 1;
  /** Hook for extra views (stacks, particles) updated after the caterpillar. */
  readonly extras: { update(now: number, dt: number): void }[] = [];
  /** Debug / capture only: frame this point instead of following the caterpillar. */
  focus: { x: number; z: number } | null = null;

  constructor(canvas: HTMLCanvasElement, sim: Sim, tier?: QualityTier) {
    this.sim = sim;
    this.quality = settingsFor(tier ?? probeTier());
    // 'default' lets Android pick the battery-friendly path; 'high-performance' is mostly ignored there anyway.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality.antialias, powerPreference: 'default', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.dyn = new DynamicResolution(Math.min(this.quality.dprCap, window.devicePixelRatio || 1));
    const gl = this.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.gpu = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? 'unknown');
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
    this.fx.extra = this.quality.extraFx;
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
    const h = sim.headPosition(la);
    this.rig.snap(h.x, h.z);
  }

  applyBiome(): void {
    const b = biomeLook(this.sim.farm.biome);
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
    const h = this.sim.headPosition(la);
    this.rig.snap(h.x, h.z);
  }

  /** The route grew around freshly claimed plots: draw the new stretch, green the plots, pull the camera back. */
  onRouteGrew(plots: number[], prev: PathTable): void {
    const now = shared.uTime.value;
    this.world.setRoute(prev);
    this.territory.onClaimed(plots, now);
    this.field.onPlotsClaimed(plots);
    // The depot never moves (its side of the farm is always route), so nothing to rebuild there.
    this.rig.zoomPulse(0.16 + Math.min(0.2, plots.length * 0.05), 0.55);
  }

  /**
   * A depot wave starts (`dur` s until the last segment is paid): the framing holds on the hopper until it's over,
   * and a long caterpillar gets a slight pull-back so its whole wave is in view.
   */
  onUnloadStart(segs: number, dur: number): void {
    const now = shared.uTime.value;
    this.depotHoldUntil = now + Math.max(0, dur) + 0.3;
    if (segs >= 8) this.rig.zoomPulse(0.04 + Math.min(0.06, segs * 0.002), Math.max(0, dur));
  }

  /** A zone fence opened: bigger reveal. */
  onZoneOpened(): void {
    this.rig.zoomPulse(0.6, 1.0);
  }

  /** The farm is finished: the widest pull-back of all (held through the celebration) and the barn hops. */
  onFarmFinished(): void {
    this.rig.zoomPulse(0.8, 1.5);
    this.depot.bounce(shared.uTime.value);
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    // Tablets / foldables: cap the drawing-buffer size instead of rendering 4–6 M pixels.
    const ratio = this.dyn.setCap(pixelBudgetRatio(Math.min(this.quality.dprCap, window.devicePixelRatio || 1), w, h));
    if (ratio !== this.renderer.getPixelRatio()) this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.rig.camera.aspect = w / h;
    // Portrait: the controls take the bottom of the screen, so frame the action 8 % above the middle — the caterpillar
    // sits in the middle of the clear area instead of drifting behind the upgrade bar.
    if (w < h) this.rig.camera.setViewOffset(w, h, 0, h * 0.08, w, h);
    else this.rig.camera.clearViewOffset();
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
    const n = st.progress.segments.length;
    // Look ahead along the route (sampled on the path, so bends don't swing the view) and towards the middle of the
    // chain. The follow smoothing trails a moving target by ~0.28 s × speed, so the look-ahead grows with speed above
    // the base crawl: the view leads the head by the same margin at any speed, and a little more when very fast.
    const v = st.v;
    const look = 2.2 + 0.28 * Math.max(0, v - MOVE.V_BASE) + 0.1 * Math.max(0, v - 2 * MOVE.V_BASE);
    sampleAt(this.sim.path, headS + look, la);
    const mid = this.cat.poses[Math.min(n, Math.ceil(n / 3))];
    let tx = la.x * 0.75 + mid.x * 0.25;
    let tz = la.z * 0.75 + mid.z * 0.25;
    // Approaching the depot with a real load: lean the framing towards the hopper; hold it there while the wave
    // runs, then let go slowly (no snap, nothing on a near-empty lap).
    const ahead = wrap(this.sim.path.barnS - headS, this.sim.path.length);
    const fill = st.basket.mass / Math.max(1, this.sim.capacity);
    let want = 0;
    if (now < this.depotHoldUntil) want = Math.max(this.depotBias, 0.18);
    else if (fill >= 0.25) want = clamp(1 - ahead / 12, 0, 1) * (0.12 + 0.12 * Math.min(1, fill));
    this.depotBias += (want - this.depotBias) * Math.min(1, dt * (want > this.depotBias ? 2.2 : 1.1));
    if (this.depotBias > 0.001) {
      const hop = this.depot.hopperTop;
      tx += (hop.x - tx) * this.depotBias;
      tz += (hop.z - tz) * this.depotBias;
    }
    if (this.focus) {
      tx = this.focus.x;
      tz = this.focus.z;
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
    const od = this.sim.overdrive;
    this.dustAcc += dt;
    // OVERDRIVE kicks up twice the dust, a little bigger, plus a puff from under the head.
    if (frac > 0.6 && this.dustAcc > (od > 0.2 ? 0.045 : 0.09)) {
      this.dustAcc = 0;
      const n = st.progress.segments.length;
      const p = this.cat.tailPoint(n, 0.6);
      this.fx.burst(p.x, 0.12, p.z, 0xe8cfa0, 1, 0.8 + od * 0.6, 0.22 + od * 0.06, 0.55, 1.2, 2);
      if (od > 0.2 && this.fx.extra > 0) {
        // The head's blades kick dirt out to both sides as it digs in (a decorative extra).
        const h = this.cat.poses[0];
        for (const side of [1, -1]) {
          const sx = -h.tz * side;
          const sz = h.tx * side;
          this.fx.spray(h.x + sx * 0.7, 0.15, h.z + sz * 0.7, sx * 0.7 - h.tx, sz * 0.7 - h.tz, 0xe2c79a, 1, 3.2, 0.17, 0.42, 1.4, 6, 0.25, 3);
        }
      }
    }
    // A hot motor lets off steam from the antennae.
    this.steamAcc += dt;
    if (st.heat > 0.92 && this.steamAcc > 0.18) {
      this.steamAcc = 0;
      const h = this.cat.poses[0];
      this.fx.burst(h.x - h.tx * 0.2, 1.9, h.z - h.tz * 0.2, 0xffffff, 2, 0.6, 0.26, 0.55, 2.2, -1.2);
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
    this.renderer.render(this.scene, this.rig.camera);
    this.setWarm(false);
  }

  /**
   * Make everything that is normally hidden part of the scene for a shader compile pass: effects (tornado, waves, the
   * route reveal) and every mesh that only shows up later (bitten crops, stubble, the depot arrow, fences, empty
   * dressing...). A material first drawn mid-game compiles synchronously — a 50–300 ms hitch on a phone.
   */
  private setWarm(on: boolean): void {
    this.tornado.group.visible = on;
    this.waves.setAllVisible(on);
    this.world.useRevealMaterial(on);
    if (on) {
      this.warmHidden.length = 0;
      this.warmCulled.length = 0;
      this.scene.traverse((o) => {
        // The warm-up frame may be drawn before the camera has been placed: nothing may be culled away.
        if (o.frustumCulled) {
          o.frustumCulled = false;
          this.warmCulled.push(o);
        }
        if (o.visible) return;
        o.visible = true;
        this.warmHidden.push(o);
      });
    } else {
      for (const o of this.warmHidden) o.visible = false;
      for (const o of this.warmCulled) o.frustumCulled = true;
      this.warmHidden.length = 0;
      this.warmCulled.length = 0;
    }
  }
  private warmHidden: THREE.Object3D[] = [];
  private warmCulled: THREE.Object3D[] = [];

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
    // Without KHR_parallel_shader_compile, compileAsync resolves before anything is linked (the link then blocks the
    // first frame that draws with it — measured 0.2–0.8 s mid-game). Draw one frame of everything while the loading
    // screen still covers the canvas: every program links and every buffer uploads now.
    this.setWarm(true);
    this.renderer.render(this.scene, this.rig.camera);
    this.setWarm(false);
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
