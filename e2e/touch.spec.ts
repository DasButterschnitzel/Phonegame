import { test, expect, type Page } from '@playwright/test';
import { ready, g } from './helpers.ts';

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

test('a UI tap with a second finger works and does not stop the crawl', async ({ page }) => {
  await ready(page);
  await g(page, 'g.grant(500)');
  // (Playwright's own click below is pointer 1: the field finger needs its own id.)
  await pointer(page, 'pointerdown', 11);
  const segs = await g<number>(page, 'g.state().progress.segments.length');
  // The button's own pointerdown must not count as a held finger on the field.
  await pointer(page, 'pointerdown', 2, '.up-add');
  await pointer(page, 'pointerup', 2, '.up-add');
  await page.locator('.up-add').click();
  await expect.poll(() => g<number>(page, 'g.state().progress.segments.length')).toBe(segs + 1);
  expect(await held(page)).toBe(true);
  await pointer(page, 'pointerup', 11);
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
