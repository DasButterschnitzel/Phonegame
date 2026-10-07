import { test, expect } from '@playwright/test';
import { ready, g, shot } from './helpers.ts';

test('expand all stages, finish the farm and travel @smoke', async ({ page }, info) => {
  await ready(page);
  await g(page, 'g.grant(1e8)');
  for (let i = 0; i < 3; i++) {
    await page.locator('.goal').click({ force: true });
    await page.waitForTimeout(150);
  }
  expect(await g<number>(page, 'g.state().progress.stage')).toBe(3);
  await expect(page.locator('.goal .title')).toHaveText('FINISH FARM');
  await shot(page, 'stage4', info.project.name);
  await page.locator('.goal').click({ force: true });
  await expect(page.locator('.modal-farmcomplete')).toBeVisible();
  await page.locator('.modal-farmcomplete .btn-big.ad').click();
  await expect(page.locator('.modal-farmcomplete .btn-big.ad')).toBeDisabled({ timeout: 5000 });
  await page.locator('.modal-farmcomplete .btn-big:not(.ad)').click();
  await expect(page.locator('.modal-map')).toBeVisible();
  await page.locator('.farm-pumpkin').click();
  await expect(page.locator('.modal-map')).toBeHidden();
  expect(await g<string>(page, 'g.state().farmId')).toBe('pumpkin');
  await page.waitForTimeout(600);
  await shot(page, 'pumpkin', info.project.name);
  // Every farm renders.
  for (const id of ['sunflower', 'snowyberry', 'desert']) {
    await g(page, `(g.state().unlockedFarms.push("${id}"), g.sim.execute({ c: 'travel', farm: "${id}" }))`);
    await page.waitForTimeout(500);
    await shot(page, id, info.project.name);
  }
});

test('daily reward claim', async ({ page }) => {
  await ready(page);
  await page.locator('.btn-daily').click();
  await expect(page.locator('.modal-daily .day.today')).toHaveCount(1);
  await page.locator('.modal-daily .btn-big:not(.ad)').click();
  expect(await g<number>(page, 'g.meta().daily.day')).toBe(1);
  await page.locator('.btn-daily').click();
  await expect(page.locator('.modal-daily')).toContainText('tomorrow');
  await page.locator('.modal-daily .close-x').click();
  await g(page, 'g.advanceWall(86400)');
  await page.locator('.btn-daily').click();
  await expect(page.locator('.modal-daily .day.today')).toHaveCount(1);
});

test('lucky bug gift', async ({ page }) => {
  await ready(page);
  await g(page, 'g.forceGift()');
  await expect(page.locator('.gift')).toBeVisible({ timeout: 3000 });
  await page.waitForTimeout(1500);
  await page.locator('.gift').click({ force: true });
  await expect(page.locator('.modal-gift')).toBeVisible();
  const before = await g<number>(page, 'g.state().coins');
  await page.locator('.modal-gift .btn-big:not(.ad)').click();
  expect(await g<number>(page, 'g.state().coins')).toBeGreaterThan(before);
});

test('tornado sweeps crops into the basket', async ({ page }, info) => {
  await ready(page);
  await page.locator('.tornado-btn').click();
  await page.waitForTimeout(300);
  expect(await g<number>(page, 'g.state().tornadoes')).toBe(0);
  expect(await g<number>(page, 'g.state().basket.mass')).toBeGreaterThan(25);
  await shot(page, 'tornado', info.project.name);
  // No tornado left → watch an ad for a free one.
  await page.locator('.tornado-btn').click();
  await expect(page.locator('.ad-overlay')).toBeVisible();
  await expect(page.locator('.ad-overlay')).toBeHidden({ timeout: 5000 });
  expect(await g<number>(page, 'g.state().stats.tornadoesUsed')).toBe(2);
});
