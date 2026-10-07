import type { Sim } from '../game/sim.ts';
import type { UpgradeId } from '../game/types.ts';
import type { App } from './boot.ts';
import { clock } from '../platform/clock.ts';
import { BIOMES } from '../render/palette.ts';
import { DebugView } from '../render/views/DebugView.ts';
import { AudioEngine } from '../platform/audio/AudioEngine.ts';

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
      const b = BIOMES[sim.farm.id];
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
     * Audio QA: renders each sound into an OfflineAudioContext and reports its loudness (RMS over the loud part and
     * peak, in dBFS). The motor is measured in its steady state at idle and full speed.
     */
    audioQA: async () => {
      const db = (x: number) => (x > 0 ? Math.round(20 * Math.log10(x) * 10) / 10 : -120);
      const render = async (play: (a: AudioEngine) => void, dur = 1.2, from = 0) => {
        const ctx = new OfflineAudioContext(1, Math.ceil(44100 * dur), 44100);
        const a = new AudioEngine();
        a.unlock(ctx);
        a.setEnabled(true, false);
        play(a);
        const d = (await ctx.startRendering()).getChannelData(0);
        let peak = 0;
        let sum = 0;
        let n = 0;
        // RMS over 50 ms windows; report the loudest window (what the ear notices).
        const win = 2205;
        let best = 0;
        for (let i = Math.floor(from * 44100); i < d.length; i++) {
          const v = Math.abs(d[i]);
          if (v > peak) peak = v;
          sum += v * v;
          if (++n === win) {
            best = Math.max(best, Math.sqrt(sum / n));
            sum = 0;
            n = 0;
          }
        }
        return { rms: db(best), peak: db(peak) };
      };
      const out: Record<string, { rms: number; peak: number }> = {};
      out.motorIdle = await render((a) => a.setSpeed(0.2), 1.5, 0.8);
      out.motorFull = await render((a) => a.setSpeed(1), 1.5, 0.8);
      out.legTick = await render((a) => (a.setSpeed(0.6), a.motion(0, false), a.motion(0.6, false)), 0.3);
      out.throttleChirp = await render((a) => (a.motion(0, false), a.motion(0, true)), 0.3);
      out.chomp = await render((a) => a.chomp(), 0.3);
      out.collapse = await render((a) => a.pop(0), 0.3);
      out.plotReady = await render((a) => a.plotReady(), 0.5);
      out.routeGrow = await render((a) => a.routeGrow(1), 0.8);
      out.zoneOpen = await render((a) => a.expand(), 1.2);
      out.unloadStart = await render((a) => a.unloadStart(), 0.4);
      out.unloadSeg = await render((a) => a.unloadSeg(3, false), 0.3);
      out.unloadDone = await render((a) => a.unload(60), 0.6);
      out.merge = await render((a) => a.merge(3), 0.8);
      out.full = await render((a) => a.full(), 0.5);
      out.coin = await render((a) => a.coin(), 0.4);
      return out;
    },
    /** Grow the territory to at least `plots` claimed plots (clears frontier plots and lets the route catch up). */
    growTerritory: (plots: number) => {
      for (let k = 0; k < 200 && sim.terr.claimedCount < plots; k++) {
        sim.execute({ c: 'clearFrontier', n: 3 });
        loop.fastForward(1.2);
      }
      return sim.terr.claimedCount;
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
