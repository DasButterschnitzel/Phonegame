import { test, expect } from '@playwright/test';
import { ready, g, shot } from './helpers.ts';

test('loot stacks grow with the basket and unload at the barn @smoke', async ({ page }, info) => {
  await ready(page);
  await g(page, '(g.grant(200000), [0,1,2,3,4,5].forEach(() => g.buy("add")), g.buy("capacity"), g.buy("capacity"))');
  await g(page, 'g.fillBasket(0.9)');
  await page.waitForFunction(() => (window as any).__game.app.renderer.stacks.blockCount > 30, null, { timeout: 8000 });
  await shot(page, 'stacks', info.project.name);
  // Crawl until the basket has been sold.
  await g(page, 'g.setThrottle(true)');
  await page.waitForFunction(() => (window as any).__game.state().stats.unloads > 0, null, { timeout: 30000 });
  await g(page, 'g.setThrottle(null)');
});

test('collection shows discovered levels', async ({ page }) => {
  await ready(page);
  await page.locator('.btn-collection').click();
  await expect(page.locator('.modal-collection .coll-item:not(.unknown)')).toHaveCount(1);
});

test('tutorial suggests ADD when affordable', async ({ page }) => {
  await ready(page);
  await g(page, 'g.grant(50)');
  await expect(page.locator('.tut')).toContainText('ADD', { timeout: 3000 });
  await page.locator('.up-add').click();
  // Next hint in the sequence: merge the two level-1 segments.
  await expect(page.locator('.tut')).toContainText('MERGE', { timeout: 3000 });
});
