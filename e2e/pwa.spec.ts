import { test, expect } from '@playwright/test';

test('installable PWA works offline after the first visit', async ({ page, context }) => {
  await page.goto('/?debug=1');
  await page.waitForFunction(() => (window as any).__game?.ready);
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]')?.getAttribute('href');
    return href ? (await fetch(href)).json() : null;
  });
  expect(manifest).toMatchObject({ name: 'Crop Crawler', display: 'fullscreen', orientation: 'portrait' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Let the service worker take control, then go offline.
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready, null, { timeout: 20000 });
  await expect(page.locator('.up-add')).toBeVisible();
  // No ad network on the plain web build: ad-only offers are hidden.
  await expect(page.locator('.chip-incomeX2')).toBeHidden();
});
