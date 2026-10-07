import { test, expect } from '@playwright/test';
import { ready, g } from './helpers.ts';

test('progress persists across reloads @smoke', async ({ page }) => {
  await ready(page);
  await g(page, 'g.grant(1000)');
  await page.locator('.up-add').click();
  await page.locator('.up-add').click();
  await g(page, 'g.saveNow()');
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready);
  expect(await g<number>(page, 'g.state().progress.segments.length')).toBe(3);
  expect(await g<number>(page, 'g.meta().sessions')).toBe(2);
});

test('offline earnings dialog with x3 ad', async ({ page }) => {
  await ready(page);
  const before = await g<number>(page, 'g.state().coins');
  await g(page, '(g.state().economy.ema = 10, g.simulateOffline(3600))');
  await expect(page.locator('.modal-offline')).toBeVisible();
  await expect(page.locator('.modal-offline .reward-big')).toContainText('18.0K');
  await page.locator('.modal-offline .btn-big.ad').click();
  await expect(page.locator('.modal-offline')).toBeHidden({ timeout: 5000 });
  const after = await g<number>(page, 'g.state().coins');
  expect(after - before).toBeGreaterThanOrEqual(54000);
});

test('offline earnings on reload after time away', async ({ page }) => {
  await ready(page);
  await g(page, '(g.state().economy.ema = 5, g.saveNow())');
  // Pretend the save was written two hours ago (rewritten before the app boots on the next load).
  await page.addInitScript(() => {
    if (sessionStorage.getItem('aged')) return;
    sessionStorage.setItem('aged', '1');
    const raw = JSON.parse(localStorage.getItem('cc.save')!);
    raw.savedAtWall -= 7200;
    localStorage.setItem('cc.save', JSON.stringify(raw));
  });
  await page.reload();
  await expect(page.locator('.modal-offline')).toBeVisible();
  await page.locator('.modal-offline .btn-big:not(.ad)').click();
  expect(await g<number>(page, 'g.state().coins')).toBeGreaterThanOrEqual(5 * 0.5 * 7200 - 1);
});

test('backgrounding pauses the game loop', async ({ page }) => {
  await ready(page);
  const setVis = (state: 'hidden' | 'visible') =>
    page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
  await setVis('hidden');
  const f1 = await g<number>(page, 'g.perf().frames');
  await page.waitForTimeout(500);
  const f2 = await g<number>(page, 'g.perf().frames');
  expect(f2 - f1).toBeLessThanOrEqual(1);
  await setVis('visible');
  await page.waitForFunction((f) => (window as any).__game.perf().frames > f + 3, f2, { timeout: 5000 });
  expect(await g<number>(page, 'g.lastSaved()')).toBeGreaterThan(0);
});
