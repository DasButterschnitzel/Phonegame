import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { ready, g } from './helpers.ts';

/**
 * Frame-stepped clips for animation review (not part of the normal e2e run):
 *   CAPTURE=1 npx playwright test capture --project=pixel7
 * Time is faked with Playwright's clock and advanced exactly 1/60 s per frame, so the clips show the intended motion
 * even though software GL renders far slower than real time. Frames land in capture/<clip>/, and when ffmpeg is on
 * the PATH each clip is also encoded to capture/<clip>.mp4 plus a contact sheet capture/<clip>-sheet.png.
 */
test.beforeEach(({}, info) => {
  test.skip(!process.env.CAPTURE, 'manual capture tool: set CAPTURE=1');
  test.skip(info.project.name !== 'pixel7', 'one device');
  test.setTimeout(300_000);
});

const veteran = "Object.assign(g.meta().tutorial, { add: true, merge: true, full: true, capacity: true, expand: true, tornado: true, grow: true })";

async function start(page: Page, query = '') {
  await page.clock.install();
  await ready(page, query);
  await g(page, veteran);
  // From here on time only moves when a clip advances it.
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 50);
}

interface ClipOpts {
  every?: number;
  before?: (i: number) => Promise<void>;
  /** Device-resolution square crop around the screen centre (CSS px), for close animation review. */
  zoom?: number;
}

/** Advance `frames` frames at 60 fps, saving every `every`-th one. `before(i)` runs ahead of frame i. */
async function clip(page: Page, name: string, frames: number, opts: ClipOpts = {}) {
  const every = opts.every ?? 1;
  const dir = `capture/${name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const vp = page.viewportSize()!;
  const z = opts.zoom;
  let k = 0;
  for (let i = 0; i < frames; i++) {
    await opts.before?.(i);
    await page.clock.runFor(1000 / 60);
    if (i % every !== 0) continue;
    const path = `${dir}/${String(k++).padStart(4, '0')}.png`;
    if (z) await page.screenshot({ path, scale: 'device', clip: { x: vp.width / 2 - z / 2, y: vp.height / 2 - z / 2, width: z, height: z } });
    else await page.screenshot({ path, scale: 'css' });
  }
  encode(name, 60 / every, k);
}

function encode(name: string, fps: number, frames: number) {
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', `capture/${name}/%04d.png`, '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', `capture/${name}.mp4`]);
    // Contact sheet: 12 evenly spaced frames, 6 per row.
    const step = Math.max(1, Math.floor(frames / 12));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `capture/${name}/%04d.png`, '-vf', `select='not(mod(n\\,${step}))',scale=206:-1,tile=6x2`, '-frames:v', '1', `capture/${name}-sheet.png`]);
  } catch {
    /* ffmpeg missing: frames are still on disk */
  }
}

/** Frame `pose` of the camera close to the head (smaller = closer). */
const closeCam = (page: Page, width: number) => g(page, `g.app.renderer.rig.baseWidth = ${width}`);

test('harvest: first chomps, close-up', async ({ page }) => {
  await start(page, '&fresh=1');
  await closeCam(page, 6);
  await g(page, 'g.setThrottle(true)');
  await clip(page, 'harvest-close', 150, { every: 1 });
  await g(page, 'g.setThrottle(null)');
});

test('harvest: bite, chunk flight and landing at device resolution', async ({ page }) => {
  await start(page, '&fresh=1');
  await page.addStyleTag({ content: '#ui { visibility: hidden !important; }' });
  await g(page, '(g.state().maxLevelReached = 9, g.grant(400), g.buy("add"), g.buy("add"))');
  // Locked-off camera on a stretch of route just ahead: the crawler drives through the frame, chewing.
  await g(page, `(() => { const s = g.sim; const p = { x: 0, z: 0, tx: 0, tz: 0 }; const L = s.path.length; const at = ((s.state.headS + 4.5) % L + L) % L; const i = Math.floor(at / 0.25); g.app.renderer.focus = { x: s.path.x[i], z: s.path.z[i] }; return p; })()`);
  await closeCam(page, 5.5);
  await page.clock.runFor(1500);
  await g(page, 'g.setThrottle(true)');
  await clip(page, 'bite-device', 150, { zoom: 330 });
  await g(page, '(g.setThrottle(null), g.app.renderer.focus = null)');
});

test('harvest: gameplay camera with a longer crawler', async ({ page }) => {
  await start(page);
  // Levels already discovered: no "new segment" celebration covering the clip.
  await g(page, '(g.state().maxLevelReached = 9, g.grant(5000), [0,1,2,3,4].forEach(() => g.buy("add")), g.buy("merge"))');
  await g(page, 'g.setThrottle(true)');
  await page.clock.runFor(2000);
  await clip(page, 'harvest-game', 180, { every: 2 });
  await g(page, 'g.setThrottle(null)');
});

test('motion: accelerate, cruise, brake', async ({ page }) => {
  await start(page);
  await g(page, '(g.grant(5000), [0,1,2,3,4,5].forEach(() => g.buy("add")))');
  await closeCam(page, 9);
  await g(page, 'g.setThrottle(false)');
  await page.clock.runFor(1500);
  await clip(page, "motion-accel-brake", 180, {
    every: 2,
    before: async (i) => {
      if (i === 10) await g(page, 'g.setThrottle(true)');
      if (i === 110) await g(page, 'g.setThrottle(false)');
    },
  });
});

async function depotClip(page: Page, name: string, adds: number) {
  await start(page);
  await g(page, `(g.state().maxLevelReached = 9, g.grant(1e6), Array.from({ length: ${adds} }, () => g.buy("add")), g.fillBasket(0.95))`);
  // Stop well before the chute so the approach (glow, doors, camera lean) is in the clip.
  expect(await g<boolean>(page, 'g.runUntil((st) => { const s = g.sim; const L = s.path.length; return ((s.path.barnS - st.headS) % L + L) % L < 3.2; })')).toBe(true);
  await g(page, 'g.setThrottle(true)');
  await clip(page, name, 150, { every: 2 });
  await g(page, 'g.setThrottle(null)');
}

test('motion: accelerate into a bend, corner, brake (device resolution)', async ({ page }) => {
  await start(page);
  await page.addStyleTag({ content: '#ui { visibility: hidden !important; }' });
  await g(page, '(g.state().maxLevelReached = 9, g.grant(5000), [0,1,2,3,4,5].forEach(() => g.buy("add")))');
  // Lock the camera on the first sharp bend a few units ahead of the head.
  await g(page, `(() => {
    const s = g.sim; const p = s.path; const n = p.n; const h = Math.floor((((s.state.headS) % p.length) + p.length) % p.length / p.ds);
    for (let k = 8; k < n; k++) {
      const i = (h + k) % n; const j = (i + 6) % n;
      let d = Math.atan2(p.tz[j], p.tx[j]) - Math.atan2(p.tz[i], p.tx[i]);
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) > 0.6) { g.app.renderer.focus = { x: p.x[(i + 3) % n], z: p.z[(i + 3) % n] }; return k; }
    }
    return -1;
  })()`);
  await closeCam(page, 6.5);
  await g(page, 'g.setThrottle(false)');
  await page.clock.runFor(1500);
  await clip(page, 'motion-close', 200, {
    every: 2,
    zoom: 400,
    before: async (i) => {
      if (i === 6) await g(page, 'g.setThrottle(true)');
      if (i === 120) await g(page, 'g.setThrottle(false)');
    },
  });
  await g(page, '(g.setThrottle(null), g.app.renderer.focus = null)');
});

test('depot: a loaded crawler rolls through the unload', async ({ page }) => {
  await depotClip(page, 'depot-unload', 6);
});

test('depot: a long crawler unloads in one capped wave', async ({ page }) => {
  await depotClip(page, 'depot-long', 15);
});

test('bite lineup: every crop at stages 0–3', async ({ page }) => {
  await start(page);
  await page.addStyleTag({ content: '#ui { visibility: hidden !important; }' });
  await g(page, 'g.setThrottle(false)');
  mkdirSync('capture/lineup', { recursive: true });
  const shots: string[] = [];
  for (const farm of ['meadow', 'pumpkin', 'sunflower', 'snowyberry', 'desert']) {
    if (farm !== 'meadow') {
      await g(page, `(g.state().unlockedFarms.push("${farm}"), g.sim.execute({ c: 'travel', farm: "${farm}" }))`);
      await page.clock.runFor(2500);
    }
    await g(page, '(g.state().progress.zone = 3, g.app.renderer.rig.baseWidth = 3.6)');
    for (let tier = 0; tier < 4; tier++) {
      const at = await g<{ x: number; z: number } | null>(page, `g.biteLineup(${tier})`);
      if (!at) continue;
      for (let k = 0; k < 40; k++) await page.clock.runFor(1000 / 60);
      const vp = page.viewportSize()!;
      const file = `capture/lineup/${farm}-${tier}.png`;
      await page.screenshot({ path: file, scale: 'css', clip: { x: vp.width / 2 - 150, y: vp.height / 2 - 150, width: 300, height: 300 } });
      shots.push(file);
    }
  }
  try {
    execFileSync('montage', [...shots, '-tile', '4x', '-geometry', '+2+2', 'capture/lineup-sheet.png']);
  } catch {
    /* ImageMagick missing */
  }
});
