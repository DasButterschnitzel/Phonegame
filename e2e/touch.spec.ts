import { test, expect, type Page } from '@playwright/test';
import { ready, g, touchscreen, centerOf } from './helpers.ts';

// Touch feel and robustness: the throttle can never get stuck, UI taps work while crawling, and an idle game drops
// to 30 fps until the next touch.

/** Dispatch a pointer event on the game root (multi-touch needs explicit pointer ids). */
const pointer = (page: Page, type: string, id: number, target = '#gl') =>
  page.evaluate(
    ([t, i, sel]) => {
      const el = document.querySelector(sel as string)!;
      const r = el.getBoundingClientRect();
      const ev = new PointerEvent(t as string, { pointerId: i as number, bubbles: true, cancelable: true, pointerType: 'touch', clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, isPrimary: i === 1 });
      el.dispatchEvent(ev);
    },
    [type, id, target],
  );
const held = (page: Page) => g<boolean>(page, 'g.app.input.held');

test('multi-touch: lifting one of two fingers keeps crawling; lifting both stops', async ({ page }) => {
  await ready(page);
  await pointer(page, 'pointerdown', 1);
  await pointer(page, 'pointerdown', 2);
  expect(await held(page)).toBe(true);
  await pointer(page, 'pointerup', 1);
  expect(await held(page)).toBe(true);
  await pointer(page, 'pointerup', 2);
  expect(await held(page)).toBe(false);
});

test('interruptions never leave the throttle stuck', async ({ page }) => {
  await ready(page);
  // A system gesture / palm rejection cancels the pointer.
  await pointer(page, 'pointerdown', 7);
  expect(await held(page)).toBe(true);
  await pointer(page, 'pointercancel', 7);
  expect(await held(page)).toBe(false);
  // Notification shade / app switch while holding: the window loses focus, pointerup never arrives.
  await pointer(page, 'pointerdown', 8);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await held(page)).toBe(false);
  // Home button while holding: the page is hidden; back in the game nothing is held.
  await pointer(page, 'pointerdown', 9);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await g<boolean>(page, 'g.app.pause.has("background")')).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await held(page)).toBe(false);
  expect(await g<boolean>(page, 'g.app.pause.has("background")')).toBe(false);
});

test('a second finger buys an upgrade while the first keeps crawling (real multi-touch, no click needed)', async ({ page }) => {
  await ready(page);
  await g(page, 'g.grant(500)');
  const ts = await touchscreen(page);
  const segs = await g<number>(page, 'g.state().progress.segments.length');
  await ts.down(1, 200, 420);
  expect(await held(page)).toBe(true);
  const add = await centerOf(page, '.up-add');
  await ts.down(2, add.x, add.y);
  await page.waitForTimeout(60);
  await ts.up(2);
  await expect.poll(() => g<number>(page, 'g.state().progress.segments.length')).toBe(segs + 1);
  // The button finger never counted as a field finger: still crawling, no OVERDRIVE.
  expect(await held(page)).toBe(true);
  expect(await g<boolean>(page, 'g.app.input.overdrive')).toBe(false);
  await ts.up(1);
  expect(await held(page)).toBe(false);
});

test('second finger on the field = OVERDRIVE; a third adds nothing; lifting one eases back', async ({ page }) => {
  await ready(page);
  const ts = await touchscreen(page);
  const vmax = await g<number>(page, 'g.vMax()');
  await ts.down(1, 120, 380);
  await expect.poll(() => g<number>(page, 'g.state().v'), { timeout: 8000 }).toBeGreaterThan(vmax * 0.9);
  await ts.down(2, 260, 460);
  expect(await g<boolean>(page, 'g.app.input.overdrive')).toBe(true);
  await expect.poll(() => g<number>(page, 'g.state().v'), { timeout: 8000 }).toBeGreaterThan(vmax * 1.18);
  await ts.down(3, 190, 300);
  await page.waitForTimeout(400);
  expect(await g<number>(page, 'g.state().v')).toBeLessThanOrEqual(vmax * 1.3 + 1e-6);
  await ts.up(3);
  await ts.up(2);
  expect(await g<boolean>(page, 'g.app.input.overdrive')).toBe(false);
  expect(await held(page)).toBe(true);
  // Eases back to normal top speed — no snap down to idle.
  await page.waitForTimeout(150);
  expect(await g<number>(page, 'g.state().v')).toBeGreaterThan(vmax * 0.95);
  await ts.up(1);
});

test('a finger landing right next to a button never overdrives (near-miss)', async ({ page }) => {
  await ready(page);
  const ts = await touchscreen(page);
  await ts.down(1, 150, 380);
  const b = (await page.locator('.up-speed').boundingBox())!;
  // Just above the speed card, on the field.
  await ts.down(2, b.x + b.width / 2, b.y - 10);
  expect(await held(page)).toBe(true);
  expect(await g<boolean>(page, 'g.app.input.overdrive')).toBe(false);
  await ts.up(2);
  await ts.up(1);
});

test('cancel or backgrounding during multi-touch leaves nothing stuck', async ({ page }) => {
  await ready(page);
  const ts = await touchscreen(page);
  await ts.down(1, 120, 380);
  await ts.down(2, 260, 460);
  expect(await g<boolean>(page, 'g.app.input.overdrive')).toBe(true);
  // A system gesture cancels every touch.
  await ts.cancel();
  expect(await held(page)).toBe(false);
  expect(await g<boolean>(page, 'g.app.input.overdrive')).toBe(false);
  // Home button with two fingers down: pointerup never arrives.
  await ts.down(1, 120, 380);
  await ts.down(2, 260, 460);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await held(page)).toBe(false);
  expect(await g<boolean>(page, 'g.app.input.overdrive')).toBe(false);
});

test('accessibility toggle mode: tap toggles the crawl, a two-finger hold still overdrives', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    (window as unknown as { __game: { app: { input: { toggleMode: boolean } } } }).__game.app.input.toggleMode = true;
  });
  const ts = await touchscreen(page);
  await ts.tap(1, 150, 380);
  expect(await held(page)).toBe(true);
  // A two-finger hold overdrives and is not a tap: the crawl stays on when the fingers leave.
  await ts.down(1, 150, 380);
  await ts.down(2, 260, 460);
  expect(await held(page)).toBe(true);
  expect(await g<boolean>(page, 'g.app.input.overdrive')).toBe(true);
  await ts.up(2);
  await ts.up(1);
  expect(await held(page)).toBe(true);
  expect(await g<boolean>(page, 'g.app.input.overdrive')).toBe(false);
  // One more single tap stops it.
  await ts.tap(1, 150, 380);
  expect(await held(page)).toBe(false);
});

test('idle power saver: 30 fps after half a minute untouched, 60 again on the next touch', async ({ page }) => {
  await page.clock.install();
  await ready(page);
  expect(await g<number>(page, 'g.app.loop.maxFps')).toBe(60);
  await page.clock.fastForward(31_000);
  await page.clock.runFor(200);
  expect(await g<number>(page, 'g.app.loop.maxFps')).toBe(30);
  await pointer(page, 'pointerdown', 3);
  await page.clock.runFor(100);
  expect(await g<number>(page, 'g.app.loop.maxFps')).toBe(60);
  await pointer(page, 'pointerup', 3);
});
