import type { Page } from '@playwright/test';

export async function ready(page: Page, query = '') {
  const q = new URLSearchParams('seed=1&adms=300');
  for (const [k, v] of new URLSearchParams(query.replace(/^&/, ''))) q.set(k, v);
  await page.goto(`/?${q}`);
  await page.waitForFunction(() => (window as unknown as { __game?: { ready: boolean } }).__game?.ready === true);
  await page.waitForTimeout(150);
}

export const g = <T>(page: Page, fn: string): Promise<T> => page.evaluate(`(() => { const g = window.__game; return ${fn}; })()`) as Promise<T>;

export const shot = (page: Page, name: string, project: string) => page.screenshot({ path: `e2e-screens/${name}-${project}.png` });

/**
 * Real multi-touch through the browser's input pipeline (CDP), unlike dispatched PointerEvents: the browser does
 * its own gesture handling, so e.g. a tap made while another finger is down produces no click — as on a phone.
 */
export async function touchscreen(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const points = new Map<number, { x: number; y: number }>();
  const list = () => [...points].map(([id, p]) => ({ id, x: p.x, y: p.y }));
  return {
    async down(id: number, x: number, y: number) {
      points.set(id, { x, y });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: list() });
    },
    /** Lifts one finger; the others stay down (CDP releases the points listed in a touchEnd). */
    async up(id: number) {
      const p = points.get(id)!;
      points.delete(id);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ id, x: p.x, y: p.y }] });
    },
    async cancel() {
      points.clear();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    },
    async tap(id: number, x: number, y: number) {
      await this.down(id, x, y);
      await page.waitForTimeout(60);
      await this.up(id);
    },
  };
}

/** Centre of the first element matching `sel`. */
export async function centerOf(page: Page, sel: string): Promise<{ x: number; y: number }> {
  const b = (await page.locator(sel).first().boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
