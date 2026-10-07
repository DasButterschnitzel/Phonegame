import type { Sim } from '../game/sim.ts';
import type { UpgradeId } from '../game/types.ts';
import type { App } from './boot.ts';
import { clock } from '../platform/clock.ts';
import { BIOMES } from '../render/palette.ts';

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
    ready: true,
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
  Object.assign(api, {
    app,
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
