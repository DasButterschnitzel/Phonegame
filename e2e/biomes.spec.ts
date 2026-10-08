import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { ready, g } from './helpers.ts';
import { readyBiomes } from '../src/game/world/biomes.ts';

// Screenshot matrix of the biome families (e2e-screens/biome-<id>-*.png): a generated farm of each family, in the
// game camera at arrival, ~25 % and ~70 % cleared, and a bird's-eye view at the finish. Pixel 7 only.
// BIOMES=orchard,rice limits the run to some families.
const only = process.env.BIOMES?.split(',').filter(Boolean);
const biomes = readyBiomes()
  .map((b) => b.id)
  .filter((id) => !only || only.includes(id));

const veteran = 'Object.assign(g.meta().tutorial, { add: true, merge: true, full: true, capacity: true, expand: true, tornado: true, grow: true })';
const snap = (page: Page, name: string) => page.screenshot({ path: `e2e-screens/biome-${name}.png` });
/** Clear frontier plots (opening zones as needed) until the farm is `share` cleared. */
const clearTo = (page: Page, share: number) =>
  g(page, `(() => { for (let k = 0; k < 300 && g.sim.cleared < ${share}; k++) { if (g.sim.state.progress.zone < 3) { g.grant(1e15); g.buy('expand'); } g.clearFrontier(3); g.fastForward(1.2, true); } return g.sim.cleared; })()`);

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'pixel7', 'screenshots on one device');
});

for (const id of biomes) {
  test(`biome ${id}: arrival, 25 %, 70 %, finish`, async ({ page }) => {
    test.setTimeout(120_000);
    await ready(page);
    await g(page, veteran);
    await g(page, `g.visitFarm('${id}', 4242, 'standard')`);
    await g(page, '(g.grant(2000), g.buy("add"), g.buy("add"), g.buy("add"), g.fastForward(4, true))');
    await page.waitForTimeout(700);
    await snap(page, `${id}-1-arrival`);
    await clearTo(page, 0.25);
    await g(page, 'g.fastForward(2, true)');
    await page.waitForTimeout(500);
    await snap(page, `${id}-2-25pct`);
    await clearTo(page, 0.7);
    await g(page, 'g.fastForward(2, true)');
    await page.waitForTimeout(500);
    await snap(page, `${id}-3-70pct`);
    await clearTo(page, 0.97);
    await g(page, 'g.app.renderer.rig.baseWidth = 34');
    await g(page, 'g.fastForward(3, true)');
    await page.waitForTimeout(900);
    await snap(page, `${id}-4-finish`);
  });
}

// Close-ups of each crop tier of a family (e2e-screens/biome-<id>-tier<t>.png): zones open, crops untouched.
for (const id of biomes) {
  test(`biome ${id}: crop tiers close up`, async ({ page }) => {
    await ready(page);
    await g(page, veteran);
    await g(page, `g.visitFarm('${id}', 4242, 'standard')`);
    await g(page, '(g.grant(1e15), g.buy("expand"), g.buy("expand"), g.buy("expand"), g.app.renderer.rig.baseWidth = 6.5)');
    for (let t = 0; t < 4; t++) {
      const at = await g<{ x: number; z: number } | null>(
        page,
        `(() => { const f = g.sim.field; let best = -1, bd = Infinity; for (let i = 0; i < f.count; i++) { if (f.tier[i] !== ${t} || f.dead[i]) continue; const d = Math.hypot(f.x[i], f.z[i]); if (d < bd) { bd = d; best = i; } } return best < 0 ? null : (g.app.renderer.focus = { x: f.x[best], z: f.z[best] }); })()`,
      );
      if (!at) continue;
      await g(page, 'g.fastForward(1.5)');
      await page.waitForTimeout(500);
      await page.screenshot({ path: `e2e-screens/biome-${id}-tier${t}.png`, clip: { x: 0, y: 220, width: 412, height: 420 } });
    }
  });
}

// Draw calls and triangles per family on the high quality tier (the heaviest), on a grand farm with every zone open, in
// the game camera and the bird's-eye view (e2e-screens/biome-perf.json). The starter Meadow measures 50 draw calls /
// ~124k triangles in this kind of scene at f9425ec (goal 04): families may add a few calls (second tree, props,
// weather) — budget ≤ 60 draw calls, ≤ 180k triangles.
test('biome render budgets (high tier)', async ({ page }) => {
  test.setTimeout(240_000);
  const out: Record<string, { game: { drawCalls: number; triangles: number }; birdsEye: { drawCalls: number; triangles: number } }> = {};
  await ready(page, '&quality=high');
  await g(page, veteran);
  for (const id of biomes) {
    await g(page, `g.visitFarm('${id}', 4242, 'grand')`);
    await g(page, '(g.grant(1e15), g.buy("expand"), g.buy("expand"), g.buy("expand"), g.buy("add"), g.buy("add"), g.buy("add"), g.app.renderer.rig.baseWidth = 10, g.fastForward(3, true))');
    await page.waitForTimeout(400);
    const game = await g<{ drawCalls: number; triangles: number }>(page, 'g.app.renderer.info');
    await g(page, '(g.app.renderer.rig.baseWidth = 34, g.fastForward(1, true))');
    await page.waitForTimeout(400);
    const birdsEye = await g<{ drawCalls: number; triangles: number }>(page, 'g.app.renderer.info');
    out[id] = { game, birdsEye };
    await g(page, 'g.app.renderer.rig.baseWidth = 10');
  }
  writeFileSync('e2e-screens/biome-perf.json', JSON.stringify(out, null, 1));
  for (const [id, r] of Object.entries(out)) {
    expect(r.game.drawCalls, id).toBeLessThanOrEqual(60);
    expect(r.birdsEye.drawCalls, id).toBeLessThanOrEqual(60);
    expect(r.game.triangles, id).toBeLessThanOrEqual(180_000);
    expect(r.birdsEye.triangles, id).toBeLessThanOrEqual(180_000);
  }
});

