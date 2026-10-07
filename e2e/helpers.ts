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
