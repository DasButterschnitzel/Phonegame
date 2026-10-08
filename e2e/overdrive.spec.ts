import { test, expect, type Page } from '@playwright/test';
import { ready, g } from './helpers.ts';

const veteran = "Object.assign(g.meta().tutorial, { add: true, merge: true, full: true, capacity: true, expand: true, tornado: true, grow: true, od1: true, od2: true, od3: true })";

/** Fingers on the field (real pointer events), reported back with the heat arc's state read in the same task. */
const fingers = (page: Page, kind: 'pointerdown' | 'pointerup', ids: number[]) =>
  page.evaluate(
    ({ kind, ids }) => {
      const root = document.getElementById('gl')!;
      const x = innerWidth / 2;
      const y = innerHeight * 0.58;
      const t0 = performance.now();
      for (const id of ids) {
        const ev = new PointerEvent(kind, { pointerId: id, pointerType: 'touch', isPrimary: id === ids[0], clientX: x + (id % 2) * 60 - 30, clientY: y, bubbles: true });
        (kind === 'pointerdown' ? root : window).dispatchEvent(ev);
      }
      const arc = document.querySelector('.od-arc')!;
      return { on: arc.classList.contains('on'), body: arc.querySelector('.od-body')!.className, ms: performance.now() - t0 };
    },
    { kind, ids },
  );

const arcState = (page: Page) =>
  page.evaluate(() => {
    const arc = document.querySelector('.od-arc')!;
    const hot = arc.querySelector('.od-hot') as HTMLElement;
    return { cls: arc.className, hotShown: getComputedStyle(hot).opacity !== '0', heat: (window as unknown as { __game: { state(): { heat: number } } }).__game.state().heat };
  });

async function shotArc(page: Page, name: string) {
  // The camera eases after a fast-forward jump (and the arc with it): let it settle first.
  await page.waitForTimeout(1500);
  const box = await page.locator('.od-arc').boundingBox();
  if (box) await page.screenshot({ path: `e2e-screens/${name}.png`, clip: { x: Math.max(0, box.x - 60), y: Math.max(0, box.y - 40), width: box.width + 120, height: box.height + 140 } });
}

test('OVERDRIVE: the second finger shows at once; a heat arc above the head climbs cyan → yellow → orange → red HOT!, then fades away', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel7', 'one device');
  test.setTimeout(120_000);
  await ready(page);
  await g(page, veteran);
  // Game time only moves when the test steps it (software GL screenshots are slow; the motor would keep heating).
  await g(page, 'g.setTimeScale(0)');
  // Cold motor: nothing over the head (no permanent HUD bar).
  await expect(page.locator('.od-arc.on')).toHaveCount(0);
  // Two fingers land: the arc is on, popping, before the event handler even returns to the page.
  const r = await fingers(page, 'pointerdown', [11, 12]);
  expect(r.on).toBe(true);
  expect(r.body).toContain('pop');
  expect(r.ms).toBeLessThan(150);
  await g(page, 'g.fastForward(0.05)');
  await expect.poll(async () => (await arcState(page)).cls).toContain('cool');
  await shotArc(page, 'od-1-cool');
  // The motor heats while both fingers stay down (6 s from cold to hot): 0.37, 0.63, 0.9.
  await g(page, 'g.fastForward(2.2)');
  await expect.poll(async () => (await arcState(page)).cls).toContain('warm');
  await shotArc(page, 'od-2-warm');
  await g(page, 'g.fastForward(1.6)');
  await expect.poll(async () => (await arcState(page)).cls).toContain(' hot');
  expect((await arcState(page)).hotShown).toBe(false);
  await shotArc(page, 'od-3-hot');
  await g(page, 'g.fastForward(1.6)');
  await expect.poll(async () => (await arcState(page)).cls).toContain('max');
  expect((await arcState(page)).hotShown).toBe(true);
  await shotArc(page, 'od-4-max');
  // Let go: the arc cools down, then goes away.
  await fingers(page, 'pointerup', [11, 12]);
  await expect.poll(async () => (await arcState(page)).cls).toContain('cooling');
  await g(page, 'g.fastForward(7)');
  await expect(page.locator('.od-arc.on')).toHaveCount(0, { timeout: 5000 });
  // A hot motor refuses the second finger: the arc says so (red shake) instead of nothing happening.
  await fingers(page, 'pointerdown', [21]);
  await g(page, 'g.setOverdrive(true)');
  await g(page, 'g.fastForward(6)');
  await g(page, 'g.setOverdrive(null)');
  const d = await fingers(page, 'pointerdown', [22]);
  expect(d.body).toContain('deny');
  await fingers(page, 'pointerup', [21, 22]);
});
