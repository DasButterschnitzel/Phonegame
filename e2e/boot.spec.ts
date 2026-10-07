import { test, expect } from '@playwright/test';
import { ready } from './helpers.ts';

test('boots and renders the farm @smoke', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await ready(page);
  await page.waitForTimeout(600);
  const stats = await page.evaluate(() => (window as any).__game.pixelStats());
  expect(stats.uniqueColors).toBeGreaterThan(40);
  expect(stats.nonSkyFrac).toBeGreaterThan(0.3);
  const perf = await page.evaluate(() => (window as any).__game.perf());
  expect(perf.drawCalls).toBeLessThan(45);
  await page.screenshot({ path: `e2e-screens/boot-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('hold to crawl speeds up, release slows down', async ({ page }) => {
  await ready(page);
  const box = (await page.locator('#gl').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  const fast = await page.evaluate(() => (window as any).__game.state().v);
  await page.mouse.up();
  await page.waitForTimeout(2000);
  const slow = await page.evaluate(() => (window as any).__game.state().v);
  expect(fast).toBeGreaterThan(2.5);
  expect(slow).toBeLessThan(1);
});

test('long caterpillar on a big farm renders within budget', async ({ page }, info) => {
  await ready(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.grant(1e9);
    for (let i = 0; i < 3; i++) g.buy('expand');
    g.growTerritory(70);
    for (let i = 0; i < 31; i++) g.buy('add');
    for (let i = 0; i < 12; i++) g.buy('merge');
    g.fastForward(8, true);
  });
  // Let transient effects (shockwaves from the last growth/merges) finish; software GL runs at a few fps.
  await page.waitForTimeout(1600);
  const perf = await page.evaluate(() => (window as any).__game.perf());
  expect(perf.drawCalls).toBeLessThan(45);
  expect(perf.triangles).toBeLessThan(220_000);
  await page.screenshot({ path: `e2e-screens/bigfarm-${info.project.name}.png` });
});

test('a failed start explains itself instead of an endless loading screen', async ({ page }) => {
  // Simulate a WebView that cannot load the game bundle.
  await page.route(/\/assets\/index-[^/]*\.js$/, (r) => r.abort());
  await page.goto('/');
  const diag = page.locator('#boot-diag');
  await expect(diag).toBeVisible({ timeout: 8000 });
  await expect(diag).toContainText('failed to load index-');
  await expect(diag).toContainText('engine: Chrome/');
  await expect(page.locator('#boot-splash button')).toHaveText('Retry');
});
