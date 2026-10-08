import { test, expect, type Page } from '@playwright/test';
import { ready, g, shot } from './helpers.ts';

const veteran = "Object.assign(g.meta().tutorial, { add: true, merge: true, full: true, capacity: true, expand: true, tornado: true, grow: true })";

async function openMap(page: Page) {
  await page.locator('.side-buttons .btn-map').click();
  await expect(page.locator('.modal-map')).toBeVisible();
  // The trail scrolls the next stop into view; let it settle for the screenshot.
  await page.waitForTimeout(250);
}
const closeMap = (page: Page) => page.locator('.modal-map .close-x').click();

test('journey map: a short trail — behind you, here, ahead, the Tour finale; never grey locked rows', async ({ page }, info) => {
  test.setTimeout(180_000);
  await ready(page);
  await g(page, veteran);

  // The Starter Tour: five farms and the World Tour waiting at the end.
  await openMap(page);
  await expect(page.locator('.modal-map h2')).toHaveText('Starter Tour');
  await expect(page.locator('.modal-map .stop')).toHaveCount(6);
  await expect(page.locator('.modal-map .farm-card.current')).toHaveCount(1);
  await expect(page.locator('.modal-map .farm-card.teaser')).toContainText('World Tour');
  await expect(page.locator('.modal-map .locked')).toHaveCount(0);
  await shot(page, 'map-starter', info.project.name);
  await closeMap(page);

  // World Tour 2, fourth farm: three behind, here, five ahead (the finale among them), Core Rank and pips.
  await g(page, 'g.jumpToFarm(14)');
  for (let i = 0; i < 3; i++) {
    // The debug hook finishes and travels at once; each farm's dialog still follows its celebration.
    await g(page, 'g.nextFarm()');
    await expect(page.locator('.modal-farmcomplete')).toBeVisible({ timeout: 10_000 });
    await page.locator('.modal-farmcomplete .btn-map').click();
    await expect(page.locator('.modal-map')).toBeVisible();
    await closeMap(page);
  }
  expect(await g<number>(page, 'g.farmInfo().ordinal')).toBe(17);
  await openMap(page);
  await expect(page.locator('.modal-map h2')).toHaveText('World Tour 2');
  await expect(page.locator('.modal-map .tour-pips .pip')).toHaveCount(8);
  await expect(page.locator('.modal-map .tour-pips .pip.done')).toHaveCount(3);
  await expect(page.locator('.modal-map .tour-pips .pip.here')).toHaveCount(1);
  await expect(page.locator('.modal-map .rank-chip')).toContainText('Core Rank');
  await expect(page.locator('.modal-map .stop.s-done')).toHaveCount(3);
  await expect(page.locator('.modal-map .stop.s-current')).toHaveCount(1);
  await expect(page.locator('.modal-map .stop.s-next')).toHaveCount(1);
  await expect(page.locator('.modal-map .stop.s-future')).toHaveCount(4);
  await expect(page.locator('.modal-map .farm-card.finale')).toHaveCount(1);
  await expect(page.locator('.modal-map .s-milestone')).toHaveCount(0);
  // Not finished here yet: the next stop says so instead of offering travel.
  await expect(page.locator('.modal-map .farm-card.next .hint')).toBeVisible();
  await expect(page.locator('.modal-map .stamps .stamp')).toHaveCount(18);
  await expect(page.locator('.modal-map .locked')).toHaveCount(0);
  await shot(page, 'map-world', info.project.name);
  await closeMap(page);

  // Finished here: the next stop is one tap away.
  await g(page, 'g.completeCurrentFarm()');
  await expect(page.locator('.modal-farmcomplete')).toBeVisible({ timeout: 10_000 });
  await page.locator('.modal-farmcomplete .btn-map').click();
  await expect(page.locator('.modal-map .farm-card.next .go')).toBeVisible();
  await closeMap(page);

  // First farm of a Tour: the finale is a milestone further on.
  await g(page, 'g.jumpToFarm(22)');
  await openMap(page);
  await expect(page.locator('.modal-map h2')).toHaveText('World Tour 3');
  await expect(page.locator('.modal-map .s-milestone .farm-card.finale')).toHaveCount(1);
  await expect(page.locator('.modal-map .trail-gap')).toContainText(/more farm/);
  await shot(page, 'map-world-milestone', info.project.name);
});

test('journey map in German fits a small phone', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel7', 'one device');
  await page.setViewportSize({ width: 360, height: 640 });
  await ready(page, '&lang=de');
  await g(page, veteran);
  await g(page, 'g.jumpToFarm(21)');
  await openMap(page);
  await expect(page.locator('.modal-map h2')).toHaveText('Welttournee 2');
  // Nothing in a card spills out sideways (long German words, tags).
  const spill = await page.evaluate(() =>
    [...document.querySelectorAll('.modal-map .farm-card')].filter((c) => c.scrollWidth > c.clientWidth + 1).map((c) => c.textContent),
  );
  expect(spill).toEqual([]);
  await shot(page, 'map-world-de', info.project.name);
});

test('arrival beat: a short entrance card (0.8–1.5 s) that never blocks play; NEW BIOME on a first visit', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel7', 'one device');
  test.setTimeout(120_000);
  await ready(page);
  await g(page, veteran);
  // Record the card's life (inserted → removed) as it happens.
  await page.evaluate(() => {
    const w = window as unknown as { __arrival: { text: string; stamp: boolean; t0: number; t1: number } | null };
    w.__arrival = null;
    new MutationObserver((recs) => {
      for (const r of recs) {
        for (const n of r.addedNodes)
          if (n instanceof HTMLElement && n.classList.contains('arrival')) w.__arrival = { text: n.textContent ?? '', stamp: !!n.querySelector('.arr-stamp'), t0: performance.now(), t1: 0 };
        for (const n of r.removedNodes) if (n instanceof HTMLElement && n.classList.contains('arrival') && w.__arrival) w.__arrival.t1 = performance.now();
      }
    }).observe(document.getElementById('ui')!, { childList: true });
  });
  await g(page, 'g.completeCurrentFarm()');
  await expect(page.locator('.modal-farmcomplete')).toBeVisible({ timeout: 10_000 });
  await page.locator('.modal-farmcomplete .btn-map').click();
  await page.locator('.modal-map .farm-pumpkin').click();
  await expect(page.locator('.arrival')).toBeVisible({ timeout: 15_000 });
  // The crawler moves while the card is up (its pointer events pass through): press right on it.
  const box = (await page.locator('.arrival').boundingBox({ timeout: 1000 }))!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await shot(page, 'arrival-starter', info.project.name);
  await expect.poll(() => g<number>(page, 'g.state().v'), { timeout: 3000 }).toBeGreaterThan(0.5);
  await page.mouse.up();
  await expect(page.locator('.arrival')).toHaveCount(0, { timeout: 5000 });
  const a = await page.evaluate(() => (window as unknown as { __arrival: { text: string; stamp: boolean; t0: number; t1: number } }).__arrival);
  expect(a.text).toContain('Pumpkin Patch');
  expect(a.text).toContain('Farm 2/5');
  expect(a.stamp).toBe(true);
  // Software GL renders a few fps: allow a frame of slack around the 1.45 s card.
  expect(a.t1 - a.t0).toBeGreaterThanOrEqual(800);
  expect(a.t1 - a.t0).toBeLessThanOrEqual(1700);
});
