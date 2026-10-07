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

test('cleared land and a rolling unload survive a reload (no regrowth)', async ({ page }) => {
  await ready(page);
  await g(page, "Object.assign(g.meta().tutorial, { add: true, merge: true, full: true, capacity: true, expand: true, tornado: true, grow: true })");
  const claimed = await g<number>(page, 'g.growTerritory(14)');
  expect(claimed).toBeGreaterThanOrEqual(14);
  const dead = await g<number>(page, 'g.sim.field.deadCount');
  const route = await g<number>(page, 'g.sim.path.length');
  await g(page, 'g.saveNow()');
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready);
  expect(await g<number>(page, 'g.sim.terr.claimedCount')).toBe(claimed);
  expect(await g<number>(page, 'g.sim.field.deadCount')).toBeGreaterThanOrEqual(dead);
  expect(await g<number>(page, 'g.sim.path.length')).toBeCloseTo(route, 3);
  // Mid-unload: the pass resumes after the reload and pays out.
  await g(page, '(g.grant(500), g.buy("add"), g.buy("add"), g.fillBasket(0.8))');
  expect(await g<boolean>(page, 'g.runUntil((st) => st.depot.active && st.depot.done > 0)')).toBe(true);
  await g(page, 'g.saveNow()');
  const unloads = await g<number>(page, 'g.state().stats.unloads');
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready);
  expect(await g<boolean>(page, 'g.state().depot.active')).toBe(true);
  // Second session: the daily reward greets us first (the game pauses under it).
  const daily = page.locator('.modal-daily .close-x');
  if (await daily.isVisible({ timeout: 3000 }).catch(() => false)) await daily.click();
  await g(page, 'g.setThrottle(true)');
  await page.waitForFunction((u) => (window as any).__game.state().stats.unloads > u, unloads, { timeout: 20000 });
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
