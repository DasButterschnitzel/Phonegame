import { test, expect, type Page } from '@playwright/test';
import { androidShell, type ShellOptions } from './android-shell.ts';

// The release *native* flavor (AdMob provider, Preferences storage, no debug hooks) inside a simulated Android
// Capacitor shell. These paths never run in the plain web tests — and that is where the device-only startup
// hang lived (step "save").

const native = <T>(page: Page, expr: string) => page.evaluate(`(() => { const n = window.__native; return ${expr}; })()`) as Promise<T>;

async function launch(page: Page, opts: ShellOptions = {}): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript({ content: androidShell(opts) });
  await page.goto('/');
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 20_000 });
  return errors;
}

test('fresh install boots into gameplay', async ({ page }, info) => {
  const errors = await launch(page);
  expect(await page.evaluate(() => (window as unknown as { Capacitor: { getPlatform(): string } }).Capacitor.getPlatform())).toBe('android');
  await expect(page.locator('#boot-splash')).toHaveCount(0, { timeout: 3000 });
  await expect(page.locator('#boot-diag')).toHaveCount(0);
  await expect(page.locator('.up-add')).toBeVisible();
  expect(await native<boolean>(page, 'n.splashHidden')).toBe(true);
  const calls = await native<string[]>(page, 'n.calls');
  expect(calls).toContain('Preferences.get');
  expect(calls).toContain('App.addListener');
  // Ads initialise in the background and never gate startup.
  await expect.poll(() => native<string[]>(page, 'n.calls')).toContain('AdMob.prepareRewardVideoAd');
  await page.screenshot({ path: `e2e-screens/android-boot-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('progress is saved to SharedPreferences on pause and restored on the next launch', async ({ page }) => {
  const errors = await launch(page);
  // Earn something, then background the app.
  await page.locator('#app').dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true });
  await page.waitForTimeout(2500);
  await page.locator('#app').dispatchEvent('pointerup', { pointerId: 1, isPrimary: true });
  await page.evaluate(() => (window as unknown as { __native: { fire(p: string, e: string): void } }).__native.fire('App', 'pause'));
  await expect.poll(() => native<string | undefined>(page, "n.store['cc.save']")).toBeTruthy();
  // Edit the stored save (as if more had been earned), then "restart" the app.
  await page.evaluate(() => {
    const prefs = JSON.parse(sessionStorage.getItem('__prefs') ?? '{}') as Record<string, string>;
    const save = JSON.parse(prefs['cc.save']) as { game: { coins: number } };
    save.game.coins = 123456;
    prefs['cc.save'] = JSON.stringify(save);
    sessionStorage.setItem('__prefs', JSON.stringify(prefs));
  });
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 20_000 });
  await expect(page.locator('.coin-pill')).toContainText('123', { timeout: 5000 });
  expect(errors).toEqual([]);
});

test('Android back button opens the quit dialog, and a second press closes it', async ({ page }) => {
  await launch(page);
  const fire = (e: string) => page.evaluate((ev) => (window as unknown as { __native: { fire(p: string, e: string): void } }).__native.fire('App', ev), e);
  await fire('backButton');
  await expect(page.locator('.modal-quit')).toBeVisible();
  await fire('backButton');
  await expect(page.locator('.modal-quit')).toHaveCount(0);
});

test('rewarded ad through the AdMob plugin grants the boost', async ({ page }) => {
  await launch(page);
  const chip = page.locator('.chip-incomeX2');
  await expect(chip).toBeVisible({ timeout: 8000 });
  await chip.click();
  await expect(chip).toHaveClass(/active/, { timeout: 5000 });
  expect(await native<string[]>(page, 'n.calls')).toContain('AdMob.showRewardVideoAd');
});

test('no ad fill: the game still starts and hides ad-only offers', async ({ page }) => {
  const errors = await launch(page, { adsFail: true });
  await expect(page.locator('.up-add')).toBeVisible();
  await expect(page.locator('.chip-incomeX2')).toBeHidden();
  expect(errors).toEqual([]);
});
