import { test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ready, g } from './helpers.ts';

/**
 * Frame pacing under load (not part of the normal run):  PACING=1 npx playwright test pacing --project=pixel7
 * The page's CPU is throttled 4× (Chrome's mobile emulation) and each scenario's frames are summarised as main-thread
 * work per frame and wall interval between frames: median / p95 / p99 / worst. GPU work runs in SwiftShader on this
 * machine, so the intervals say little about a phone's GPU — the work numbers are the main-thread cost that a slow
 * phone CPU pays. Report: capture/pacing.json.
 */
const veteran = "Object.assign(g.meta().tutorial, { add: true, merge: true, full: true, capacity: true, expand: true, tornado: true, grow: true })";

interface Summary {
  n: number;
  median: number;
  p95: number;
  p99: number;
  worst: number;
}
interface Row {
  scenario: string;
  work: Summary;
  interval: Summary;
  drawCalls: number;
  triangles: number;
}

const rows: Row[] = [];

async function measure(page: Page, scenario: string, trigger: string | null, ms: number) {
  await g(page, 'g.resetFrameStats()');
  if (trigger) await g(page, trigger);
  await page.waitForTimeout(ms);
  const s = await g<{ work: Summary; interval: Summary; drawCalls: number; triangles: number }>(page, 'g.frameStats()');
  const r = (x: Summary) => ({ n: x.n, median: +x.median.toFixed(2), p95: +x.p95.toFixed(2), p99: +x.p99.toFixed(2), worst: +x.worst.toFixed(2) });
  rows.push({ scenario, work: r(s.work), interval: r(s.interval), drawCalls: s.drawCalls, triangles: s.triangles });
}

test.beforeEach(({}, info) => {
  test.skip(!process.env.PACING, 'manual pacing run: set PACING=1');
  test.skip(info.project.name !== 'pixel7', 'one device');
  test.setTimeout(300_000);
});

test.afterAll(() => {
  if (!rows.length) return;
  mkdirSync('capture', { recursive: true });
  writeFileSync('capture/pacing.json', JSON.stringify(rows, null, 2));
  const f = (s: Summary) => `${s.median.toFixed(1)} / ${s.p95.toFixed(1)} / ${s.p99.toFixed(1)} / ${s.worst.toFixed(1)}`;
  console.log('\nscenario                         work ms (med/p95/p99/worst)     interval ms (med/p95/p99/worst)   calls  tris');
  for (const r of rows) console.log(`${r.scenario.padEnd(32)} ${f(r.work).padEnd(31)} ${f(r.interval).padEnd(33)} ${String(r.drawCalls).padStart(5)} ${String(r.triangles).padStart(7)}`);
});

test('frame pacing across the heavy moments (CPU 4× slower)', async ({ page }) => {
  await ready(page, '&quality=med');
  await g(page, veteran);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.waitForTimeout(1500);
  await measure(page, 'idle crawl', null, 4000);
  await measure(page, 'full speed harvesting', 'g.setThrottle(true)', 5000);
  await measure(page, 'route growth (3 plots)', 'g.clearFrontier(3)', 4000);
  await measure(page, 'merge', '(g.grant(1e5), g.state().maxLevelReached = 9, g.buy("add"), g.buy("add"), g.buy("merge"))', 2500);
  await measure(page, 'zone opening', '(g.grant(1e7), g.buy("expand"))', 3500);
  await measure(page, 'tornado', '(g.state().tornadoes += 1, g.sim.execute({ c: "useTornado" }))', 3500);
  await g(page, '(g.grant(1e8), g.buy("expand"), g.buy("expand"))');
  await g(page, 'g.growTerritory(60)');
  await g(page, 'Array.from({ length: 40 }, () => g.buy("add"))');
  await page.waitForTimeout(1500);
  await measure(page, 'long caterpillar, big farm', null, 4000);
  await measure(page, 'large unload', `(g.fillBasket(1), g.runUntil((st) => { const s = g.sim; const L = s.path.length; return ((s.path.barnS - st.headS) % L + L) % L < 2.5; }, 30))`, 3500);
  await measure(page, 'zoomed out (max visible crops)', 'g.app.renderer.rig.baseWidth = 30', 4000);
  await g(page, 'g.app.renderer.rig.baseWidth = 10');
  // The real travel flow: the farm swap and shader warm-up happen behind the cloud curtain (a compositor animation),
  // so what matters is the curtain itself staying smooth and the frames after it lifts.
  await measure(page, 'farm travel (behind the curtain)', `(g.state().unlockedFarms.push("pumpkin"), g.app.game.travelTo("pumpkin", () => g.sim.execute({ c: "travel", farm: "pumpkin" })))`, 2600);
  await measure(page, 'after travel (curtain lifted)', null, 4000);
  await g(page, 'g.setThrottle(null)');
});
