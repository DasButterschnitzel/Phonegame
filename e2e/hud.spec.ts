import { test, expect } from '@playwright/test';
import { ready, g, shot } from './helpers.ts';

test('upgrade buttons add and merge segments @smoke', async ({ page }, info) => {
  await ready(page);
  await g(page, 'g.grant(5000)');
  await page.locator('.up-add').click();
  await page.locator('.up-add').click();
  expect(await g<number>(page, 'g.state().progress.segments.length')).toBe(3);
  await expect(page.locator('.up-merge + .up-lvl, .up-wrap:nth-child(2) .up-lvl')).toContainText('2');
  await page.locator('.up-merge').click();
  expect(await g<number[]>(page, 'g.state().progress.segments.map(s => s.level)')).toEqual([2, 1]);
  // First level-2 segment → "new segment unlocked" popup.
  await expect(page.locator('.modal-newlevel')).toBeVisible();
  await page.locator('.modal-newlevel .btn-big').click();
  await expect(page.locator('.modal-newlevel')).toBeHidden();
  await page.locator('.up-speed').click();
  await page.locator('.up-capacity').click();
  expect(await g<number>(page, 'g.state().progress.speedLevel')).toBe(2);
  expect(await g<number>(page, 'g.state().progress.capacityLevel')).toBe(2);
  await g(page, 'g.fillBasket(0.95)');
  await page.waitForTimeout(400);
  await shot(page, 'hud', info.project.name);
});

test('the shop quietly points at one upgrade: only the best affordable deal shimmers', async ({ page }) => {
  await ready(page);
  await g(page, "Object.assign(g.meta().tutorial, { add: true, merge: true, full: true, capacity: true, expand: true, tornado: true, grow: true })");
  await g(page, 'g.grant(500)');
  // ADD, SPEED and CAPACITY are affordable (no pair to MERGE yet): one of them shimmers, and it is ADD.
  await expect(page.locator('.upgrades .up.ok')).toHaveCount(3);
  await expect(page.locator('.upgrades .up.shine')).toHaveCount(1);
  await expect(page.locator('.up-add')).toHaveClass(/shine/);
  // Nothing affordable: nothing shimmers.
  await g(page, 'g.state().coins = 0');
  await expect(page.locator('.upgrades .up.shine')).toHaveCount(0);
});

test('German UI', async ({ page }, info) => {
  await ready(page, '&lang=de');
  await expect(page.locator('.up-add .title')).toHaveText('NEU');
  await expect(page.locator('.up-capacity .title')).toHaveText('KORB');
  await shot(page, 'hud-de', info.project.name);
});

test('rewarded boost via simulated ad', async ({ page }) => {
  await ready(page, '&adms=1500');
  await page.locator('.chip-incomeX2').click();
  // The dialog spells out the reward; the ad is one way to pay for it.
  await expect(page.locator('.modal-bonus .bonus-desc')).toBeVisible();
  await page.locator('.modal-bonus .bonus-ad').click();
  await expect(page.locator('.ad-overlay')).toBeVisible();
  await expect(page.locator('.ad-overlay')).toBeHidden({ timeout: 5000 });
  expect(await g<number>(page, 'g.state().boosts.incomeX2')).toBeGreaterThan(150);
});

test('closing a rewarded ad early gives no reward', async ({ page }) => {
  await page.goto('/?seed=1&adms=5000');
  await page.waitForFunction(() => (window as any).__game?.ready);
  await page.locator('.chip-autopilot').click();
  await page.locator('.modal-bonus .bonus-ad').click();
  await page.locator('.ad-overlay button').click();
  await expect(page.locator('.toast')).toBeVisible();
  expect(await g<number>(page, 'g.state().boosts.autopilot')).toBe(0);
});

test('settings modal opens and switches language', async ({ page }) => {
  await ready(page);
  await page.locator('.btn-settings').click();
  await expect(page.locator('.modal-settings')).toBeVisible();
  await page.locator('.modal-settings .seg button', { hasText: 'DE' }).click();
  await expect(page.locator('.up-add .title')).toHaveText('NEU');
  await page.locator('.modal-settings .close-x').click();
  await expect(page.locator('.modal-settings')).toBeHidden();
});

test('hidden developer switch: seven taps on the version show the performance overlay', async ({ page }, info) => {
  await ready(page);
  await expect(page.locator('.perf-overlay')).toHaveCount(0);
  await page.locator('.btn-settings').click();
  const version = page.locator('.modal-settings .version');
  // Seven quick taps (fired together: under load, seven separate Playwright clicks can outlast the 4 s window).
  const tap7 = () => version.evaluate((el) => Array.from({ length: 7 }, () => (el as HTMLElement).click()));
  await tap7();
  await page.locator('.modal-settings .close-x').click();
  await expect(page.locator('.perf-overlay')).toContainText('fps', { timeout: 3000 });
  await expect(page.locator('.perf-overlay')).toContainText('GPU');
  await expect(page.locator('.perf-overlay')).toContainText('tier');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `e2e-screens/perf-overlay-${info.project.name}.png` });
  // Saved with the settings; the same gesture switches it off.
  expect(await g<boolean>(page, 'g.app.settings.perfOverlay')).toBe(true);
  await page.locator('.btn-settings').click();
  await tap7();
  await page.locator('.modal-settings .close-x').click();
  await expect(page.locator('.perf-overlay')).toHaveCount(0);
});
