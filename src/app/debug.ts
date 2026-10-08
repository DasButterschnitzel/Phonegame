import type { Sim } from '../game/sim.ts';
import type { BiomeId, SizeClass, UpgradeId } from '../game/types.ts';
import { STARTER_FARMS } from '../game/types.ts';
import { checkMap, generateBlueprint } from '../game/world/generate.ts';
import { makeWorldSeed } from '../game/world/journey.ts';
import { STARTER_COUNT, planFarm, worldKey } from '../game/world/plan.ts';
import type { App } from './boot.ts';
import { clock } from '../platform/clock.ts';
import { biomeLook } from '../render/palette.ts';
import { DebugView } from '../render/views/DebugView.ts';
import { markDirty } from '../game/field.ts';
import { vMax } from '../game/config.ts';
import { AudioEngine } from '../platform/audio/AudioEngine.ts';
import { AMBIENCE_KINDS, FLAVOURS, type AmbienceKind } from '../platform/audio/flavours.ts';

export interface DebugApi {
  ready: boolean;
  sim: Sim;
  state: () => Sim['state'];
  grant: (coins: number) => void;
  fillBasket: (frac: number) => void;
  setThrottle: (held: boolean | null) => void;
  fastForward: (sec: number, throttle?: boolean) => void;
  setTimeScale: (x: number) => void;
  buy: (id: UpgradeId) => void;
  forceGift: () => void;
  forceGolden: (n: number) => void;
  perf: () => { fps: number; drawCalls: number; triangles: number; frames: number };
  pixelStats: () => { uniqueColors: number; nonSkyFrac: number };
  [k: string]: unknown;
}

/** window.__game hooks for e2e tests and manual debugging (enabled by VITE_DEBUG_HOOKS or ?debug=1). */
export function installDebug(app: App): DebugApi {
  const { sim, renderer, loop, input } = app;
  // Software-GL test runs are slow; keep screenshots at full resolution unless asked otherwise.
  renderer.dyn.enabled = new URLSearchParams(location.search).has('dynres');
  let fps = 0;
  let lastFrames = loop.frames;
  let lastT = performance.now();
  setInterval(() => {
    const now = performance.now();
    fps = ((loop.frames - lastFrames) * 1000) / (now - lastT);
    lastFrames = loop.frames;
    lastT = now;
  }, 1000);
  const api: DebugApi = {
    // Playable = the loading screen is gone (taps before that land on the splash).
    get ready() {
      return document.documentElement.dataset.ready === '1' && !document.getElementById('boot-splash');
    },
    sim,
    state: () => sim.state,
    grant: (coins) => sim.execute({ c: 'grantCoins', amount: coins, reason: 'debug' }),
    fillBasket: (frac) => sim.execute({ c: 'fillBasket', frac }),
    setThrottle: (held) => {
      input.force = held;
    },
    setOverdrive: (on: boolean | null) => input.setForceOverdrive(on),
    vMax: () => vMax(sim.state.progress.speedLevel),
    fastForward: (sec, throttle) => {
      const prev = input.force;
      if (throttle !== undefined) input.force = throttle;
      loop.fastForward(sec);
      input.force = prev;
    },
    setTimeScale: (x) => {
      loop.timeScale = x;
    },
    buy: (id) => sim.execute({ c: 'buy', id }),
    forceGift: () => sim.execute({ c: 'forceGift' }),
    forceGolden: (n) => sim.execute({ c: 'forceGolden', n }),
    perf: () => ({ fps, ...renderer.info, frames: loop.frames }),
    /** Draw calls and triangles per view: renders the frame again with each view hidden in turn (budget work). */
    drawBreakdown: () => {
      const r = renderer.renderer;
      const R = renderer as unknown as Record<string, { group?: { visible: boolean }; mesh?: { visible: boolean } }>;
      const measure = () => {
        r.render(renderer.scene, renderer.rig.camera);
        return { calls: r.info.render.calls, tris: r.info.render.triangles };
      };
      const all = measure();
      const out: Record<string, { calls: number; tris: number }> = { all };
      for (const k of ['world', 'territory', 'depot', 'field', 'cat', 'stacks', 'fx', 'tornado', 'waves', 'weather']) {
        const o = R[k]?.group ?? R[k]?.mesh;
        if (!o?.visible) continue;
        o.visible = false;
        const m = measure();
        o.visible = true;
        out[k] = { calls: all.calls - m.calls, tris: all.tris - m.tris };
      }
      return out;
    },
    pixelStats: () => {
      const r = renderer.renderer;
      r.render(renderer.scene, renderer.rig.camera);
      const gl = r.getContext();
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const colors = new Set<number>();
      let nonSky = 0;
      // Sky is a vertical gradient between the biome's sky and fog colours.
      const b = biomeLook(sim.farm.biome);
      const refs = [b.sky, b.fog].map((h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255]);
      for (let i = 0; i < px.length; i += 4 * 7) {
        colors.add((px[i] >> 3) | ((px[i + 1] >> 3) << 5) | ((px[i + 2] >> 3) << 10));
        const near = refs.some(([r, g, bl]) => Math.abs(px[i] - r) + Math.abs(px[i + 1] - g) + Math.abs(px[i + 2] - bl) < 30);
        if (!near) nonSky++;
      }
      return { uniqueColors: colors.size, nonSkyFrac: nonSky / (px.length / (4 * 7)) };
    },
  };
  // Route / plot / reach overlay (off unless asked for: never ship overlays enabled).
  const overlay = new DebugView(sim);
  overlay.group.visible = new URLSearchParams(location.search).has('overlay');
  renderer.debug = overlay;
  renderer.scene.add(overlay.group);
  Object.assign(api, {
    app,
    overlay: (on: boolean) => {
      overlay.group.visible = on;
      if (on) overlay.reset();
    },
    clearFrontier: (n: number) => sim.execute({ c: 'clearFrontier', n }),
    clearAll: () => sim.execute({ c: 'clearAll' }),
    // ── World Tour QA ──
    /** Clear the farm you are on and press FINISH (no yield). */
    completeCurrentFarm: () => {
      sim.execute({ c: 'grantCoins', amount: 1e15, reason: 'debug' });
      while (sim.state.progress.zone < 3) sim.execute({ c: 'buy', id: 'expand' });
      sim.execute({ c: 'clearAll' });
      sim.execute({ c: 'buy', id: 'finish' });
    },
    /** Finish (if needed) and travel on; returns the new farm key. */
    nextFarm: () => {
      const st = sim.state;
      if (!st.progress.finished) (api.completeCurrentFarm as () => void)();
      const next = sim.nextDestination ?? STARTER_FARMS.find((f) => f !== st.farmId && st.unlockedFarms.includes(f) && !st.completedFarms.includes(f));
      if (next) sim.execute({ c: 'travel', farm: next });
      return sim.state.farmId;
    },
    /** Jump the journey to World Tour farm number n (≥ 6) and travel there. */
    jumpToFarm: (n: number) => {
      const st = sim.state;
      const j = st.journey;
      if (!j.seed) j.seed = makeWorldSeed(st.rng, 7);
      const target = planFarm(j.seed, Math.max(STARTER_COUNT + 1, n));
      sim.visitBlueprint(generateBlueprint(target));
      return target.key;
    },
    /** A farm of a biome/seed/size without travelling (previews, the generator stress test). */
    generateFarm: (biome: BiomeId, seed: number, size: SizeClass = 'standard') =>
      generateBlueprint({ key: worldKey(6, biome, seed), ordinal: 6, tour: 1, slot: 0, biome, seed, size, modifier: null, showcase: false, name: 0, variant: 0 }),
    /** Visit any generated blueprint right now (screenshots of a biome). */
    visitFarm: (biome: BiomeId, seed: number, size: SizeClass = 'standard') => {
      const bp = (api.generateFarm as (b: BiomeId, s: number, z: SizeClass) => ReturnType<typeof generateBlueprint>)(biome, seed, size);
      sim.visitBlueprint(bp);
      return bp.key;
    },
    /** The next n destinations of a journey seed. */
    farmPreview: (seed: number, n = 8) => Array.from({ length: n }, (_, i) => planFarm(seed, STARTER_COUNT + 1 + i)),
    /** Plan and generate Tours 1..n of a seed: farms, validation failures, attempts. */
    validateTour: (n: number, seed = sim.state.journey.seed || 1) => {
      let farms = 0;
      let failures = 0;
      for (let o = STARTER_COUNT + 1; o < STARTER_COUNT + 1 + n * 8; o++) {
        const bp = generateBlueprint(planFarm(seed, o));
        farms++;
        if (!checkMap(bp.map, bp.size).ok) failures++;
      }
      return { farms, failures };
    },
    /** What the farm you are on is. */
    farmInfo: () => ({
      key: sim.farm.id,
      ordinal: sim.farm.ordinal,
      tour: sim.farm.tour,
      slot: sim.farm.slot,
      biome: sim.farm.biome,
      size: sim.farm.size,
      modifier: sim.farm.modifier,
      archetype: sim.farm.bp?.archetype ?? 'authored',
      crops: sim.farm.crops,
      cropCount: sim.field.count,
      pathLength: Math.round(sim.path.length),
      seed: sim.farm.seed,
      coreRank: sim.state.journey.tours,
    }),
    /** Advance the simulation in fixed steps (throttle held) until `cond(state)` holds; returns whether it did. */
    runUntil: (cond: (st: Sim['state']) => boolean, maxSec = 60) => {
      const prev = input.force;
      input.force = true;
      let ok = false;
      for (let t = 0; t < maxSec && !(ok = cond(sim.state)); t += 1 / 30) loop.fastForward(1 / 30);
      input.force = prev;
      return ok;
    },
    /**
     * Audio QA: renders each sound into an OfflineAudioContext and reports its loudness (loudest 50 ms RMS and peak,
     * dBFS), how long it rings (ms above peak − 20 dB), its spectral centroid (Hz) and the share of its energy below
     * 150 / 300 Hz (what phone speakers can't play). The motor is measured in its steady state at idle and full speed.
     * `variety`: centroid spread over six renders of the same bite (repeats must not be identical).
     */
    audioQA: async () => {
      const db = (x: number) => (x > 0 ? Math.round(20 * Math.log10(x) * 10) / 10 : -120);
      const SR = 44100;
      const fft = (re: Float64Array, im: Float64Array) => {
        const n = re.length;
        for (let i = 1, j = 0; i < n; i++) {
          let bit = n >> 1;
          for (; j & bit; bit >>= 1) j ^= bit;
          j ^= bit;
          if (i < j) {
            [re[i], re[j]] = [re[j], re[i]];
            [im[i], im[j]] = [im[j], im[i]];
          }
        }
        for (let len = 2; len <= n; len <<= 1) {
          const a = (-2 * Math.PI) / len;
          for (let i = 0; i < n; i += len)
            for (let k = 0; k < len / 2; k++) {
              const wr = Math.cos(a * k);
              const wi = Math.sin(a * k);
              const xr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
              const xi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
              re[i + k + len / 2] = re[i + k] - xr;
              im[i + k + len / 2] = im[i + k] - xi;
              re[i + k] += xr;
              im[i + k] += xi;
            }
        }
      };
      const spectrum = (d: Float32Array, from: number) => {
        const N = 4096;
        const re = new Float64Array(N);
        const im = new Float64Array(N);
        const pow = new Float64Array(N / 2);
        for (let st = Math.floor(from * SR); st < d.length; st += N / 2) {
          for (let i = 0; i < N; i++) {
            re[i] = (d[st + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
            im[i] = 0;
          }
          fft(re, im);
          for (let k = 0; k < N / 2; k++) pow[k] += re[k] * re[k] + im[k] * im[k];
        }
        let tot = 0;
        let lo150 = 0;
        let lo300 = 0;
        let cen = 0;
        for (let k = 1; k < N / 2; k++) {
          const f = (k * SR) / N;
          tot += pow[k];
          cen += f * pow[k];
          if (f < 150) lo150 += pow[k];
          if (f < 300) lo300 += pow[k];
        }
        return { centroid: Math.round(tot > 0 ? cen / tot : 0), low150: tot > 0 ? +(lo150 / tot).toFixed(4) : 0, low300: tot > 0 ? +(lo300 / tot).toFixed(4) : 0 };
      };
      const render = async (play: (a: AudioEngine) => void, dur = 1.2, from = 0, music = false) => {
        const ctx = new OfflineAudioContext(1, Math.ceil(SR * dur), SR);
        const a = new AudioEngine();
        a.unlock(ctx);
        a.setEnabled(!music, music);
        play(a);
        const d = (await ctx.startRendering()).getChannelData(0);
        let peak = 0;
        let sum = 0;
        let n = 0;
        let all = 0;
        for (let i = Math.floor(from * SR); i < d.length; i++) all += d[i] * d[i];
        // RMS over 50 ms windows; report the loudest window (what the ear notices).
        const win = 2205;
        let best = 0;
        for (let i = Math.floor(from * SR); i < d.length; i++) {
          const v = Math.abs(d[i]);
          if (v > peak) peak = v;
          sum += v * v;
          if (++n === win) {
            best = Math.max(best, Math.sqrt(sum / n));
            sum = 0;
            n = 0;
          }
        }
        let first = -1;
        let last = -1;
        for (let i = Math.floor(from * SR); i < d.length; i++) {
          if (Math.abs(d[i]) < peak * 0.1) continue;
          if (first < 0) first = i;
          last = i;
        }
        const mean = db(Math.sqrt(all / Math.max(1, d.length - Math.floor(from * SR))));
        return { rms: db(best), mean, peak: db(peak), ms: first < 0 ? 0 : Math.round(((last - first) / SR) * 1000), ...spectrum(d, from) };
      };
      type R = Awaited<ReturnType<typeof render>>;
      const out: Record<string, R | { spread: number }> = {};
      out.motorIdle = await render((a) => a.setSpeed(0.2), 1.5, 0.8);
      out.motorFull = await render((a) => a.setSpeed(1), 1.5, 0.8);
      out.legTick = await render((a) => (a.setSpeed(0.6), a.motion(0, false), a.motion(0.4, false)), 0.3);
      out.throttleChirp = await render((a) => (a.motion(0, false), a.motion(0, true)), 0.3);
      out.chompBig = await render((a) => a.chomp(false, 3), 0.3);
      out.land = await render((a) => a.land(4), 0.2);
      out.collapse = await render((a) => a.pop(0), 0.3);
      out.plotReady = await render((a) => a.plotReady(), 0.5);
      out.routeGrow = await render((a) => a.routeGrow(1), 0.8);
      out.zoneOpen = await render((a) => a.expand(), 1.2);
      out.unloadStart = await render((a) => a.unloadStart(), 0.4);
      out.unloadSeg = await render((a) => a.unloadSeg(3, false), 0.3);
      out.unloadDone = await render((a) => a.unload(60), 0.6);
      out.merge = await render((a) => a.merge(3), 0.8);
      out.upgrade = await render((a) => a.upgrade('add'), 0.4);
      out.upgradeSpeed = await render((a) => a.upgrade('speed'), 0.5);
      out.full = await render((a) => a.full(), 0.5);
      out.coin = await render((a) => a.coin(), 0.4);
      // Bites vary on purpose: measure six, report the median one and the spread of their spectral centroids.
      const bites: R[] = [];
      for (let k = 0; k < 6; k++) bites.push(await render((a) => a.chomp(false, 0), 0.3));
      bites.sort((x, y) => x.rms - y.rms);
      out.chomp = bites[3];
      const cents = bites.map((b) => b.centroid);
      out.variety = { spread: +((Math.max(...cents) - Math.min(...cents)) / (cents.reduce((p, c) => p + c, 0) / cents.length)).toFixed(3) };
      // Each family's tune (8 s, music only) and one sound of each ambience kind.
      type Sched = { scheduleMusic: (horizon: number) => void; ambient: (k: AmbienceKind, pitch: number, when: number) => void };
      const music: Record<string, R> = {};
      for (const id of Object.keys(FLAVOURS) as BiomeId[]) music[id] = await render((a) => (a.setFlavour(id), (a as unknown as Sched).scheduleMusic(8)), 8, 0.1, true);
      const ambience: Record<string, R> = {};
      for (const k of AMBIENCE_KINDS) ambience[k] = await render((a) => (a as unknown as Sched).ambient(k, 1, 0.05), 4.8);
      return { ...out, music, ambience };
    },
    /**
     * Listening clips (mono, 44.1 kHz) for a human to audition on a phone: the motor at crawl and full speed with its
     * leg ticks, a row of bites ending in a collapse, and a full unload wave. Returns raw samples per clip.
     */
    audioClips: async () => {
      const SR = 44100;
      const clip = async (dur: number, play: (a: AudioEngine) => void, music = false) => {
        const ctx = new OfflineAudioContext(1, Math.ceil(SR * dur), SR);
        const a = new AudioEngine();
        a.unlock(ctx);
        a.setEnabled(!music, music);
        play(a);
        return Array.from((await ctx.startRendering()).getChannelData(0), (v) => Math.round(v * 32767));
      };
      type Priv = { legTick: (left: boolean, when: number) => void; speed: number; lastPlay: Map<string, number> };
      const motor = (speed: number, v: number) => (a: AudioEngine) => {
        a.setSpeed(speed);
        const p = a as unknown as Priv;
        // One tick per 0.35 world units travelled at v units/s (at most ~9/s), alternating feet.
        const gap = Math.max(0.11, 0.35 / v);
        for (let t = 0.3, k = 0; t < 3.8; t += gap, k++) p.legTick(k % 2 === 0, t);
      };
      const bites = (a: AudioEngine) => {
        const p = a as unknown as Priv;
        const tiers = [0, 0, 1, 0, 2, 0, 1, 3];
        // Each bite is scheduled by temporarily shifting the engine's clock reference (play at t = k * 0.16 s).
        tiers.forEach((tier, k) => {
          p.lastPlay.clear();
          const ctx = (a as unknown as { ctx: BaseAudioContext }).ctx;
          const base = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'currentTime')!;
          Object.defineProperty(ctx, 'currentTime', { configurable: true, get: () => k * 0.16 });
          a.chomp(false, tier, false);
          if (k === tiers.length - 1) a.pop(tier);
          Object.defineProperty(ctx, 'currentTime', base);
        });
      };
      const wave = (a: AudioEngine) => {
        const p = a as unknown as Priv;
        const ctx = (a as unknown as { ctx: BaseAudioContext }).ctx;
        const base = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'currentTime')!;
        const at = (t: number, f: () => void) => {
          p.lastPlay.clear();
          Object.defineProperty(ctx, 'currentTime', { configurable: true, get: () => t });
          f();
          Object.defineProperty(ctx, 'currentTime', base);
        };
        at(0.1, () => a.unloadStart());
        for (let k = 0; k < 8; k++) at(0.1 + 0.36 + k * 0.053, () => a.unloadSeg(k, k === 7));
        at(0.1 + 0.36 + 7 * 0.053 + 0.02, () => a.unload(80));
      };
      // Each family's tune (6 s) and three sounds of each ambience kind.
      type Sched = { scheduleMusic: (horizon: number) => void; ambient: (k: AmbienceKind, pitch: number, when: number) => void };
      const tunes: Record<string, number[]> = {};
      for (const id of Object.keys(FLAVOURS) as BiomeId[]) tunes[`music-${id}`] = await clip(6, (a) => (a.setFlavour(id), (a as unknown as Sched).scheduleMusic(6)), true);
      for (const k of AMBIENCE_KINDS) tunes[`ambience-${k}`] = await clip(9, (a) => [0.2, 3.2, 6.2].forEach((t) => (a as unknown as Sched).ambient(k, 1, t)));
      return {
        'motor-crawl': await clip(4, motor(0.2, 0.6)),
        'motor-full': await clip(4, motor(1, 3)),
        bites: await clip(1.8, bites),
        'unload-wave': await clip(2, wave),
        ...tunes,
      };
    },
    /** Grow the territory to at least `plots` claimed plots (clears frontier plots and lets the route catch up). */
    growTerritory: (plots: number) => {
      for (let k = 0; k < 200 && sim.terr.claimedCount < plots; k++) {
        sim.execute({ c: 'clearFrontier', n: 3 });
        loop.fastForward(1.2);
      }
      return sim.terr.claimedCount;
    },
    /**
     * Visual check of the bite stages: picks an untouched plot of `tier` (nearest the start), bites its nine crops to
     * stages 0,1,2,3,0,1,2,3,3 facing the camera, and frames it. Returns the plot centre.
     */
    biteLineup: (tier: number) => {
      const f = sim.field;
      const l = sim.farm.layout;
      let best = -1;
      let bestD = Infinity;
      for (let p = 0; p < l.cols * l.rows; p++) {
        const a = f.plotStart[p];
        const b = f.plotStart[p + 1];
        if (b - a < 9 || f.tier[a] !== tier) continue;
        let ok = true;
        for (let i = a; i < b; i++) if (f.dead[i] || f.hp[i] < f.maxHp[i]) ok = false;
        const c = f.x[a + 4] ** 2 + f.z[a + 4] ** 2;
        if (ok && c < bestD) {
          bestD = c;
          best = p;
        }
      }
      if (best < 0) return null;
      const a = f.plotStart[best];
      const yaw = renderer.rig.yaw;
      for (let k = 0; k < 9; k++) {
        const i = a + k;
        const stage = k === 8 ? 3 : k % 4;
        const frac = [1, 0.95, 0.6, 0.25][stage];
        f.hp[i] = f.maxHp[i] * frac;
        renderer.field.strike(i, f.x[i] + Math.sin(yaw) * 3, f.z[i] + Math.cos(yaw) * 3);
        markDirty(f, i);
      }
      renderer.focus = { x: f.x[a + 4], z: f.z[a + 4] };
      return renderer.focus;
    },
    /** Frame timing over the last `n` frames (ms): wall interval between frames and main-thread work per frame. */
    frameStats: (n?: number) => ({ interval: loop.interval.summary(n), work: loop.work.summary(n), dpr: renderer.renderer.getPixelRatio(), ...renderer.info }),
    resetFrameStats: () => {
      loop.interval.clear();
      loop.work.clear();
    },
    territory: () => ({ claimed: sim.terr.claimedCount, ready: Array.from(sim.terr.readySince).filter((t) => t >= 0).length, cleared: sim.cleared, routeLength: sim.path.length }),
    advanceWall: (sec: number) => clock.advance(sec),
    simulateOffline: (sec: number) => app.checkOffline(sec),
    saveNow: () => app.saves.saveNow(),
    resetSave: () => app.saves.wipe(),
    setPlaytime: (sec: number) => {
      app.ads.policy.playtimeSec = sec;
    },
    meta: () => app.meta,
    lastSaved: () => app.saves.lastSavedAt,
  });
  (window as unknown as { __game: DebugApi }).__game = api;
  return api;
}
