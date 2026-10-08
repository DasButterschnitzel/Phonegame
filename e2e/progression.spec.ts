import { test, expect } from '@playwright/test';
import { ready, g, shot } from './helpers.ts';

test('open every field, clear the farm, finish it and travel @smoke', async ({ page }, info) => {
  await ready(page);
  // Seasoned player: no tutorial hints (they move the goal button aside while pointing at the upgrade bar).
  await g(page, "Object.assign(g.meta().tutorial, { add: true, merge: true, full: true, capacity: true, expand: true, tornado: true, grow: true })");
  await g(page, 'g.grant(1e8)');
  await expect(page.locator('.goal .title')).toHaveText('OPEN FIELD');
  for (let i = 0; i < 3; i++) {
    await page.locator('.goal').click({ force: true });
    await page.waitForTimeout(150);
  }
  expect(await g<number>(page, 'g.state().progress.zone')).toBe(3);
  // FINISH needs a cleared farm, not coins.
  await expect(page.locator('.goal .title')).toHaveText('FINISH FARM');
  await expect(page.locator('.goal')).not.toHaveClass(/ready/);
  await page.locator('.goal').click({ force: true });
  await expect(page.locator('.modal-farmcomplete')).toHaveCount(0);
  await g(page, 'g.clearAll()');
  await expect(page.locator('.goal')).toHaveClass(/ready/);
  await shot(page, 'cleared', info.project.name);
  await page.locator('.goal').click({ force: true });
  await expect(page.locator('.modal-farmcomplete')).toBeVisible();
  await page.locator('.modal-farmcomplete .btn-big.ad').click();
  await expect(page.locator('.modal-farmcomplete .btn-big.ad')).toBeDisabled({ timeout: 5000 });
  await page.locator('.modal-farmcomplete .btn-big:not(.ad)').click();
  await expect(page.locator('.modal-map')).toBeVisible();
  // The welcome banner is short-lived: record banners as they are inserted, before travelling.
  await page.evaluate(() => {
    const seen: string[] = ((window as unknown as { __banners: string[] }).__banners = []);
    new MutationObserver((recs) => {
      for (const r of recs) for (const n of r.addedNodes) if (n instanceof HTMLElement && n.classList.contains('banner')) seen.push(n.textContent ?? '');
    }).observe(document.getElementById('ui')!, { childList: true });
  });
  await page.locator('.farm-pumpkin').click();
  await expect(page.locator('.modal-map')).toBeHidden();
  // The farm swaps behind a cloud wipe, then a welcome banner.
  await expect(page.locator('.travel-wipe')).toBeVisible();
  await expect.poll(() => g<string>(page, 'g.state().farmId')).toBe('pumpkin');
  // The curtain stays up while the new farm's shaders compile (slow on software GL).
  await expect(page.locator('.travel-wipe')).toHaveCount(0, { timeout: 15000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __banners: string[] }).__banners.join('|')), { timeout: 15000 }).toContain('Pumpkin Patch');
  // Back on a finished farm the goal button points onwards.
  await page.waitForTimeout(400);
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

test('tornado clears its radius, overfills the basket and pays the rest', async ({ page }, info) => {
  await ready(page);
  const coins = await g<number>(page, 'g.state().coins');
  await page.locator('.tornado-btn').click();
  await page.waitForTimeout(300);
  expect(await g<number>(page, 'g.state().tornadoes')).toBe(0);
  expect(await g<number>(page, 'g.state().basket.mass')).toBeGreaterThan(await g<number>(page, 'g.sim.capacity'));
  expect(await g<number>(page, 'g.state().coins')).toBeGreaterThan(coins);
  await shot(page, 'tornado', info.project.name);
  // No tornado left → coins or an ad (here: the ad).
  await page.locator('.tornado-btn').click();
  await page.locator('.modal-bonus .bonus-ad').click();
  await expect(page.locator('.ad-overlay')).toBeVisible();
  await expect(page.locator('.ad-overlay')).toBeHidden({ timeout: 5000 });
  expect(await g<number>(page, 'g.state().stats.tornadoesUsed')).toBe(2);
});
