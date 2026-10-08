import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
  /** CSS-px crop of the screen (e.g. just the upgrade bar). */
  region?: { x: number; y: number; width: number; height: number };
  /** Also frame-step DOM (WAAPI) animations: they run on the compositor clock, which the fake clock doesn't drive. */
  waapi?: boolean;
}

/** Pause every new WAAPI animation at its start, then move all of them on by one 60 fps frame. */
const stepWaapi = () => {
  const w = window as unknown as { __waapiSeen?: WeakSet<Animation> };
  const seen = (w.__waapiSeen ??= new WeakSet());
  for (const a of document.getAnimations()) {
    if (a instanceof CSSAnimation || a instanceof CSSTransition) continue;
    if (!seen.has(a)) {
      seen.add(a);
      a.pause();
      a.currentTime = 0;
    }
    const end = Number(a.effect?.getComputedTiming().endTime ?? 0);
    const t = Number(a.currentTime ?? 0) + 1000 / 60;
    if (t >= end) a.finish();
    else a.currentTime = t;
  }
};

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
    if (opts.waapi) await page.evaluate(stepWaapi);
    if (i % every !== 0) continue;
    const path = `${dir}/${String(k++).padStart(4, '0')}.png`;
    if (z) await page.screenshot({ path, scale: 'device', clip: { x: vp.width / 2 - z / 2, y: vp.height / 2 - z / 2, width: z, height: z } });
    else await page.screenshot({ path, scale: 'css', clip: opts.region });
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

test('overdrive: second finger surge, cruise, release (device resolution)', async ({ page }) => {
  await start(page);
  await g(page, '(g.state().maxLevelReached = 9, g.grant(5000), [0,1,2,3,4,5].forEach(() => g.buy("add")))');
  await closeCam(page, 9);
  await g(page, 'g.setThrottle(true)');
  await page.clock.runFor(2500);
  await clip(page, 'overdrive', 300, {
    every: 3,
    zoom: 360,
    before: async (i) => {
      if (i === 30) await g(page, 'g.setOverdrive(true)');
      if (i === 240) await g(page, 'g.setOverdrive(false)');
    },
  });
  // A hot motor: the boost has faded, antennae glow red, steam.
  await g(page, '(g.state().heat = 0.96, g.setOverdrive(true))');
  await clip(page, 'overdrive-hot', 90, { every: 3, zoom: 360 });
  await g(page, '(g.setOverdrive(null), g.setThrottle(null))');
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

// ——— Pop hierarchy (goal 04): routine < upgrade < merge < route growth < field < farm finish ———

test('pop: upgrade buttons (ADD, CAPACITY, SPEED, MERGE) at device resolution', async ({ page }) => {
  await start(page);
  await g(page, '(g.state().maxLevelReached = 9, g.grant(1e6), [0,1,2,3].forEach(() => g.buy("add")))');
  await g(page, 'g.setThrottle(true)');
  await page.clock.runFor(2500);
  const vp = page.viewportSize()!;
  const tap = (sel: string) => page.locator(sel).click({ force: true });
  await clip(page, 'pop-buttons', 160, {
    every: 2,
    waapi: true,
    region: { x: 0, y: vp.height - 230, width: vp.width, height: 230 },
    before: async (i) => {
      if (i === 6) await tap('.up-add');
      if (i === 46) await tap('.up-capacity');
      if (i === 86) await tap('.up-speed');
      if (i === 126) await tap('.up-merge');
    },
  });
  await g(page, 'g.setThrottle(null)');
});

test('pop: speed purchase surge (world)', async ({ page }) => {
  await start(page);
  await g(page, '(g.state().maxLevelReached = 9, g.grant(1e6), [0,1,2,3,4,5].forEach(() => g.buy("add")))');
  await closeCam(page, 9);
  await g(page, 'g.setThrottle(true)');
  await page.clock.runFor(2500);
  await clip(page, 'pop-speed', 120, {
    every: 2,
    zoom: 380,
    before: async (i) => {
      if (i === 12) await g(page, '(g.state().progress.speedLevel = 4, g.buy("speed"))');
    },
  });
  await g(page, 'g.setThrottle(null)');
});

test('pop: merge ripple and a first-time level', async ({ page }) => {
  await start(page);
  await g(page, '(g.state().maxLevelReached = 9, g.grant(1e7), [0,1,2,3,4,5,6,7].forEach(() => g.buy("add")))');
  await closeCam(page, 9);
  await g(page, 'g.setThrottle(true)');
  await page.clock.runFor(2500);
  await clip(page, 'pop-merge', 90, { every: 2, zoom: 400, before: async (i) => void (i === 6 && (await g(page, 'g.buy("merge")'))) });
  // A level never seen before: the golden fountain lands before the "new segment" dialog covers it.
  await g(page, 'g.state().maxLevelReached = 1');
  await clip(page, 'pop-merge-first', 72, { every: 2, zoom: 400, before: async (i) => void (i === 6 && (await g(page, 'g.buy("merge")'))) });
  await g(page, 'g.setThrottle(null)');
});

test('pop: route growth (crops along the new border flinch)', async ({ page }) => {
  await start(page);
  await g(page, '(g.state().maxLevelReached = 9, g.grant(1e6), [0,1,2,3].forEach(() => g.buy("add")))');
  await g(page, 'g.growTerritory(4)');
  await page.clock.runFor(1500);
  // Clear the next plots and run the simulation (not the clock) up to the moment the route grows: the growth's
  // effects start with the clip. (A ready plot waits until the body has moved off it.)
  expect(await g<boolean>(page, '(() => { const n = g.sim.terr.claimedCount; g.clearFrontier(2); return g.runUntil(() => g.sim.terr.claimedCount > n, 40); })()')).toBe(true);
  await g(page, 'g.setThrottle(false)');
  await clip(page, 'pop-route', 90, { every: 2 });
  // Close-up on the plot that is claimed (not the head): the border flash, dust, and the living crops around it flinch.
  await closeCam(page, 7);
  const grow = `(() => {
    const t = g.sim.terr; const before = Array.from(t.claimed); const n = t.claimedCount;
    g.clearFrontier(2);
    if (!g.runUntil(() => t.claimedCount > n, 40)) return false;
    const p = before.findIndex((c, i) => !c && t.claimed[i]);
    const { cols, x0, z0, plot } = t.layout; const c = p % cols; const r = (p - c) / cols;
    const at = { x: x0 + (c + 0.5) * plot, z: z0 + (r + 0.5) * plot };
    g.app.renderer.focus = at; g.app.renderer.rig.snap(at.x, at.z);
    return true;
  })()`;
  expect(await g<boolean>(page, grow)).toBe(true);
  await clip(page, 'pop-route-close', 60, { every: 2, zoom: 400 });
  await g(page, 'g.app.renderer.focus = null');
});

test('pop: a big payout (gold cascade, counter, coin flash)', async ({ page }) => {
  await start(page);
  await g(page, '(g.state().maxLevelReached = 9, g.grant(1e6), [0,1,2,3,4,5].forEach(() => g.buy("add")), g.fillBasket(0.95))');
  expect(await g<boolean>(page, 'g.runUntil((st) => { const s = g.sim; const L = s.path.length; return ((s.path.barnS - st.headS) % L + L) % L < 3.2; })')).toBe(true);
  await g(page, 'g.setThrottle(true)');
  await clip(page, 'pop-payout', 150, { every: 2, waapi: true });
  await g(page, 'g.setThrottle(null)');
});

test('pop: farm finish celebration, then the dialog', async ({ page }) => {
  await start(page);
  await g(page, '(g.grant(1e9), g.buy("expand"), g.buy("expand"), g.buy("expand"), [0,1,2,3,4,5].forEach(() => g.buy("add")))');
  await page.clock.runFor(1500);
  // Clear just past the finish line, so some of the field is left to twinkle.
  await g(page, "(() => { for (let k = 0; k < 400 && !g.sim.check('finish').ok; k++) { g.sim.execute({ c: 'clearFrontier', n: 2 }); g.fastForward(0.6); } return g.sim.cleared; })()");
  await page.clock.runFor(500);
  await g(page, 'g.setThrottle(true)');
  await page.clock.runFor(1000);
  await clip(page, 'pop-finish', 150, { every: 2, waapi: true, before: async (i) => void (i === 4 && (await page.locator('.goal').click({ force: true }))) });
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

test('audio: listening clips and spectrograms', async ({ page }) => {
  await ready(page);
  const clips = await g<Record<string, number[]>>(page, 'g.audioClips()');
  mkdirSync('capture/audio', { recursive: true });
  for (const [name, pcm] of Object.entries(clips)) {
    // 16-bit mono WAV.
    const data = Buffer.alloc(pcm.length * 2);
    pcm.forEach((v, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, v)), i * 2));
    const h = Buffer.alloc(44);
    h.write('RIFF', 0);
    h.writeUInt32LE(36 + data.length, 4);
    h.write('WAVEfmt ', 8);
    h.writeUInt32LE(16, 16);
    h.writeUInt16LE(1, 20);
    h.writeUInt16LE(1, 22);
    h.writeUInt32LE(44100, 24);
    h.writeUInt32LE(88200, 28);
    h.writeUInt16LE(2, 32);
    h.writeUInt16LE(16, 34);
    h.write('data', 36);
    h.writeUInt32LE(data.length, 40);
    writeFileSync(`capture/audio/${name}.wav`, Buffer.concat([h, data]));
    try {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `capture/audio/${name}.wav`, '-lavfi', 'showspectrumpic=s=640x320:legend=1:scale=log:fscale=lin:stop=6000', `capture/audio/${name}-spectrum.png`]);
    } catch {
      /* ffmpeg missing */
    }
  }
});
