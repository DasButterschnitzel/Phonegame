import { test, expect, type Page } from '@playwright/test';
import { ready, g } from './helpers.ts';

// Screenshot states for visual review (e2e-screens/state-*.png). Runs on the Pixel 7 project only.
const veteran = "Object.assign(g.meta().tutorial, { add: true, merge: true, full: true, capacity: true, expand: true, tornado: true, grow: true })";
const snap = (page: Page, name: string) => page.screenshot({ path: `e2e-screens/state-${name}.png` });

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'pixel7', 'screenshots on one device');
});

test('first minute: start, chomping, damage close-up, full basket', async ({ page }) => {
  await ready(page, '&fresh=1');
  await snap(page, '01-start');
  await g(page, 'g.fastForward(6, true)');
  await page.waitForTimeout(250);
  await snap(page, '02-first-chomps');
  // Close-up on staged damage (camera pushed in).
  await g(page, '(g.app.renderer.rig.baseWidth = 5.5, g.fastForward(5, true))');
  await page.waitForTimeout(300);
  await snap(page, '03-damage-closeup');
  await g(page, 'g.app.renderer.rig.baseWidth = 10');
  // Full basket: grinding, flashing stack tops, FULL badge, arrow over the hopper.
  await g(page, '(g.fillBasket(1), g.fastForward(1.5, true))');
  await page.waitForTimeout(300);
  await snap(page, '04-basket-full');
});

test('depot: approach and rolling unload', async ({ page }) => {
  await ready(page);
  await g(page, veteran);
  await g(page, '(g.grant(400), g.buy("add"), g.buy("add"), g.buy("add"), g.fillBasket(0.9))');
  // Just before the chute: bay glowing, doors open.
  expect(await g<boolean>(page, 'g.runUntil((st) => { const s = g.sim; const L = s.path.length; return ((s.path.barnS - st.headS) % L + L) % L < 3.5; })')).toBe(true);
  await page.waitForTimeout(250);
  await snap(page, '05-depot-approach');
  expect(await g<boolean>(page, 'g.runUntil((st) => st.depot.active && st.depot.done >= 2)')).toBe(true);
  await page.waitForTimeout(120);
  await snap(page, '06-depot-unloading');
});

test('route growth reveal and a fence opening', async ({ page }) => {
  await ready(page);
  await g(page, veteran);
  await g(page, 'g.clearFrontier(1)');
  // Stop right as the route grows: the new stretch is drawing itself, the plot greens, dust flies.
  await g(page, `g.runUntil(() => g.sim.terr.claimedCount > 8, 20)`);
  await page.waitForTimeout(280);
  await snap(page, '07-route-growing');
  await page.waitForTimeout(900);
  await snap(page, '08-route-grown');
  await g(page, '(g.grant(5000), g.buy("expand"))');
  await page.waitForTimeout(300);
  await snap(page, '09-fence-opens');
});

test('before / after: the farm transforms as it is cleared', async ({ page }) => {
  await ready(page);
  await g(page, veteran);
  // Bird's-eye framing for both shots.
  await g(page, 'g.app.renderer.rig.baseWidth = 34');
  await page.waitForTimeout(600);
  await snap(page, '10-farm-before');
  await g(page, '(g.grant(1e7), g.buy("expand"), g.buy("expand"), g.buy("expand"))');
  await g(page, 'g.growTerritory(80)');
  await page.waitForTimeout(2500);
  await snap(page, '11-farm-after');
  await g(page, 'g.overlay(true)');
  await page.waitForTimeout(400);
  await snap(page, '12-debug-overlay');
});

test('German HUD mid-game', async ({ page }) => {
  await ready(page, '&lang=de');
  await g(page, veteran);
  await g(page, '(g.grant(800), g.buy("add"), g.buy("add"), g.fillBasket(0.6), g.growTerritory(11))');
  await page.waitForTimeout(500);
  await snap(page, '13-german');
});
