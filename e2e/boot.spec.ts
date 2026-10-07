import { test, expect } from '@playwright/test';

test('boots and renders @smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __booted?: boolean }).__booted === true);
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});
