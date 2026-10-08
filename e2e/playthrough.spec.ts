import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ready, g } from './helpers.ts';

/**
 * A 100-farm journey through the real UI (not part of the normal e2e run):
 *   PLAYTHROUGH=1 npx playwright test playthrough --project=pixel7
 * Each farm is cleared and finished with the debug hook, then the player's own path: the farm-complete dialog's
 * "Next farm", the travel curtain, the arrival card. Every ten farms it records the renderer's resources, the JS heap
 * (after a forced GC), the DOM size and the save size; any page error fails the run. Results land in
 * e2e-screens/playthrough.json.
 */
const gpuArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
test.use({ launchOptions: { args: [...gpuArgs, '--js-flags=--expose-gc', '--enable-precise-memory-info'] } });

const veteran = "Object.assign(g.meta().tutorial, { add: true, merge: true, full: true, capacity: true, expand: true, tornado: true, grow: true, od1: true, od2: true, od3: true })";
const FARMS = Number(process.env.PLAYTHROUGH_FARMS ?? 100);

interface Sample {
  farm: number;
  ordinal: number;
  key: string;
  geometries: number;
  textures: number;
  programs: number;
  heapMB: number;
  dom: number;
  saveKB: number;
  travelMs: number;
}

test('a 100-farm journey through the real UI: resources, heap, DOM and save stay flat', async ({ page }, info) => {
  test.skip(!process.env.PLAYTHROUGH, 'long run: set PLAYTHROUGH=1');
  test.skip(info.project.name !== 'pixel7', 'one device');
  test.setTimeout(90 * 60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await ready(page);
  await g(page, veteran);
  const samples: Sample[] = [];
  const sample = async (farm: number, travelMs: number) => {
    await g(page, 'g.saveNow()');
    const m = await g<Omit<Sample, 'farm' | 'ordinal' | 'key' | 'saveKB' | 'travelMs'>>(page, 'g.memory()');
    const info2 = await g<{ ordinal: number; key: string }>(page, 'g.farmInfo()');
    const saveKB = await page.evaluate(() => Math.round(((localStorage.getItem('cc.save') ?? '').length / 1024) * 10) / 10);
    samples.push({ farm, ordinal: info2.ordinal, key: info2.key, ...m, saveKB, travelMs });
  };
  await sample(0, 0);
  for (let farm = 1; farm <= FARMS; farm++) {
    await g(page, 'g.completeCurrentFarm()');
    await expect(page.locator('.modal-farmcomplete')).toBeVisible({ timeout: 20_000 });
    const t0 = Date.now();
    await page.locator('.modal-farmcomplete .btn-next').click();
    await expect(page.locator('.travel-wipe')).toHaveCount(0, { timeout: 30_000 });
    const travelMs = Date.now() - t0;
    await expect(page.locator('.arrival')).toHaveCount(0, { timeout: 10_000 });
    expect(await g<number>(page, 'g.farmInfo().ordinal')).toBe(farm + 1);
    if (farm % 10 === 0 || farm <= 2) await sample(farm, travelMs);
  }
  mkdirSync('e2e-screens', { recursive: true });
  writeFileSync('e2e-screens/playthrough.json', JSON.stringify({ errors, samples }, null, 1));
  expect(errors).toEqual([]);
  // Flat once the first farms have warmed every shader. What a farm needs depends on its family (a meadow has fewer
  // models than an orchard), so the last three samples are held to the most that farms 10–30 needed: a leak of even
  // one geometry per farm fails (the one fixed here added ~11 per farm), and so does ~0.1 MB of heap per farm.
  const early = samples.filter((s) => s.farm >= 10 && s.farm <= 30);
  const late = samples.slice(-3);
  const most = (xs: Sample[], k: 'geometries' | 'textures' | 'programs' | 'heapMB' | 'dom' | 'saveKB') => Math.max(...xs.map((s) => s[k]));
  expect(most(late, 'geometries'), 'geometries').toBeLessThanOrEqual(most(early, 'geometries') + 30);
  expect(most(late, 'textures'), 'textures').toBeLessThanOrEqual(most(early, 'textures') + 4);
  expect(most(late, 'programs'), 'shader programs').toBeLessThanOrEqual(most(early, 'programs') + 6);
  if (most(early, 'heapMB') > 0) expect(most(late, 'heapMB'), 'JS heap (MB)').toBeLessThanOrEqual(most(early, 'heapMB') + 6);
  expect(most(late, 'dom'), 'DOM nodes').toBeLessThanOrEqual(most(early, 'dom') + 60);
  expect(most(late, 'saveKB'), 'save (KB)').toBeLessThan(16);
});
