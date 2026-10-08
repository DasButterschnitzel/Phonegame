import { test, expect } from '@playwright/test';
import { ready, g, shot } from './helpers.ts';

const veteran = "Object.assign(g.meta().tutorial, { add: true, merge: true, full: true, capacity: true, expand: true, tornado: true, grow: true })";

test('Starter Tour → World Tour: the journey goes on after Cactus Ranch @smoke', async ({ page }, info) => {
  test.setTimeout(240_000);
  await ready(page);
  await g(page, veteran);
  for (let i = 0; i < 5; i++) {
    await g(page, 'g.completeCurrentFarm()');
    // The celebration plays, then the dialog; its map button leads on.
    await expect(page.locator('.modal-farmcomplete')).toBeVisible({ timeout: 10_000 });
    if (i === 4) {
      await expect(page.locator('.modal-farmcomplete h2')).toHaveText('Starter Tour complete!');
      await expect(page.locator('.modal-farmcomplete .tour-badge')).toContainText('Core Rank 1');
      await expect(page.locator('.modal-farmcomplete')).toContainText('Next destination');
      await shot(page, 'world-starter-done', info.project.name);
    }
    await page.locator('.modal-farmcomplete .btn-big:not(.ad)').click();
    await expect(page.locator('.modal-map')).toBeVisible();
    if (i === 4) {
      await expect(page.locator('.modal-map')).toContainText('World Tour');
      await shot(page, 'world-map-unlocked', info.project.name);
    }
    await page.locator('.modal-map .farm-card.next').first().click();
    await expect(page.locator('.modal-map')).toBeHidden();
    await expect(page.locator('.travel-wipe')).toHaveCount(0, { timeout: 15_000 });
  }
  const info6 = await g<{ ordinal: number; tour: number; coreRank: number; key: string }>(page, 'g.farmInfo()');
  expect(info6).toMatchObject({ ordinal: 6, tour: 1, coreRank: 1 });
  expect(info6.key).toMatch(/^w6-/);
  // The HUD names the new farm (never "Farm 6").
  await expect(page.locator('.farm-pill .farm-name, .farm-name').first()).not.toHaveText('');
  // A reload lands on the same World Tour farm.
  await page.waitForTimeout(500);
  await g(page, 'g.saveNow()');
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __game?: { ready: boolean } }).__game?.ready === true, undefined, { timeout: 30_000 });
  expect(await g<string>(page, 'g.farmInfo().key')).toBe(info6.key);
});
