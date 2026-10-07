import { test, expect } from '@playwright/test';
import { ready, g, shot } from './helpers.ts';

test('loot stacks grow with the basket and roll off at the depot @smoke', async ({ page }, info) => {
  await ready(page);
  await g(page, '(g.grant(200000), [0,1,2,3,4,5].forEach(() => g.buy("add")), g.buy("capacity"), g.buy("capacity"))');
  await g(page, 'g.fillBasket(0.9)');
  await page.waitForFunction(() => (window as any).__game.app.renderer.stacks.blockCount > 30, null, { timeout: 8000 });
  await shot(page, 'stacks', info.project.name);
  // Crawl until the cargo rolls off at the depot: segments unload one by one (a wave) while the pass is active.
  const before = await g<number>(page, 'g.state().coins');
  await g(page, 'g.setTimeScale(0)');
  expect(await g<boolean>(page, 'g.runUntil((st) => st.depot.active && st.depot.done > 0 && st.depot.done < st.depot.segs)')).toBe(true);
  const during = await g<number>(page, 'g.state().coins');
  expect(during).toBeGreaterThan(before);
  await g(page, 'g.setTimeScale(1)');
  await shot(page, 'unloading', info.project.name);
  await g(page, 'g.setThrottle(true)');
  await page.waitForFunction(() => (window as any).__game.state().stats.unloads > 0, null, { timeout: 30000 });
  expect(await g<number>(page, 'g.state().coins')).toBeGreaterThan(during);
  await g(page, 'g.setThrottle(null)');
});

test('collection shows discovered levels', async ({ page }, info) => {
  await ready(page);
  await page.locator('.btn-collection').click();
  await expect(page.locator('.modal-collection .coll-item:not(.unknown)')).toHaveCount(1);
  await page.locator('.modal-collection .close-x').click();
  await g(page, 'g.state().maxLevelReached = 6');
  await page.locator('.btn-collection').click();
  await expect(page.locator('.modal-collection .coll-item:not(.unknown)')).toHaveCount(6);
  // Discovered levels show their power; the next one is teased.
  await expect(page.locator('.modal-collection .coll-item').nth(1)).toContainText('×2.4');
  await expect(page.locator('.modal-collection .coll-item.next')).toContainText('7');
  await page.screenshot({ path: `e2e-screens/collection-${info.project.name}.png` });
});

test('tutorial suggests ADD when affordable', async ({ page }) => {
  await ready(page);
  await g(page, 'g.grant(80)');
  await expect(page.locator('.tut')).toContainText('ADD', { timeout: 3000 });
  await page.locator('.up-add').click();
  // Next hint in the sequence: merge the two level-1 segments.
  await expect(page.locator('.tut')).toContainText('MERGE', { timeout: 3000 });
});
