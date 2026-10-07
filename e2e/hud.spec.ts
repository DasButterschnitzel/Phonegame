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

test('German UI', async ({ page }, info) => {
  await ready(page, '&lang=de');
  await expect(page.locator('.up-add .title')).toHaveText('NEU');
  await expect(page.locator('.up-capacity .title')).toHaveText('KAPAZITÄT');
  await shot(page, 'hud-de', info.project.name);
});

test('rewarded boost via simulated ad', async ({ page }) => {
  await ready(page);
  await page.locator('.chip-incomeX2').click();
  await expect(page.locator('.ad-overlay')).toBeVisible();
  await expect(page.locator('.ad-overlay')).toBeHidden({ timeout: 5000 });
  expect(await g<number>(page, 'g.state().boosts.incomeX2')).toBeGreaterThan(150);
});

test('closing a rewarded ad early gives no reward', async ({ page }) => {
  await page.goto('/?seed=1&adms=5000');
  await page.waitForFunction(() => (window as any).__game?.ready);
  await page.locator('.chip-autopilot').click();
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
