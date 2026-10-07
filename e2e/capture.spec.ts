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

/** Advance `frames` frames at 60 fps, saving every `every`-th one. `before(i)` runs ahead of frame i. */
async function clip(page: Page, name: string, frames: number, opts: { every?: number; before?: (i: number) => Promise<void> } = {}) {
  const every = opts.every ?? 1;
  const dir = `capture/${name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  let k = 0;
  for (let i = 0; i < frames; i++) {
    await opts.before?.(i);
    await page.clock.runFor(1000 / 60);
    if (i % every === 0) await page.screenshot({ path: `${dir}/${String(k++).padStart(4, '0')}.png`, scale: 'css' });
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
  await clip(page, 'motion-accel-brake', 180, {
    every: 2,
    before: async (i) => {
      if (i === 10) await g(page, 'g.setThrottle(true)');
      if (i === 110) await g(page, 'g.setThrottle(false)');
    },
  });
});

test('depot: a loaded crawler rolls through the unload', async ({ page }) => {
  await start(page);
  await g(page, '(g.grant(5000), [0,1,2,3,4,5].forEach(() => g.buy("add")), g.fillBasket(0.95))');
  expect(await g<boolean>(page, 'g.runUntil((st) => { const s = g.sim; const L = s.path.length; return ((s.path.barnS - st.headS) % L + L) % L < 6; })')).toBe(true);
  await g(page, 'g.setThrottle(true)');
  await clip(page, 'depot-unload', 200, { every: 2 });
  await g(page, 'g.setThrottle(null)');
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
