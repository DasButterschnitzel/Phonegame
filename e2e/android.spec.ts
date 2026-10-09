import { test, expect, type Page } from '@playwright/test';
import { androidShell, type ShellOptions } from './android-shell.ts';

// The release *native* flavor (AdMob provider, Preferences storage, no debug hooks) inside a simulated Android
// Capacitor shell. These paths never run in the plain web tests — and that is where the device-only startup
// hang lived (step "save").

const native = <T>(page: Page, expr: string) => page.evaluate(`(() => { const n = window.__native; return ${expr}; })()`) as Promise<T>;

const logs: string[] = [];

async function launch(page: Page, opts: ShellOptions = {}): Promise<string[]> {
  const errors: string[] = [];
  logs.length = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => (m.type() === 'error' ? errors.push(m.text()) : logs.push(m.text())));
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
  await page.locator('.modal-bonus .bonus-ad').click();
  await expect(chip).toHaveClass(/active/, { timeout: 5000 });
  expect(await native<string[]>(page, 'n.calls')).toContain('AdMob.showRewardVideoAd');
});

test('no ad fill: the game still starts and hides ad-only offers', async ({ page }) => {
  const errors = await launch(page, { adsFail: true });
  await expect(page.locator('.up-add')).toBeVisible();
  await expect(page.locator('.chip-incomeX2')).toBeHidden();
  expect(errors).toEqual([]);
});

const DEMO_REWARDED = 'ca-app-pub-3940256099942544/5224354917';
const REAL = { appId: 'ca-app-pub-1234567890123456~1111111111', rewarded: 'ca-app-pub-1234567890123456/2222222222', interstitial: 'ca-app-pub-1234567890123456/3333333333' };

test('a release build in TEST mode says so and only loads Google demo units', async ({ page }) => {
  await launch(page);
  await expect.poll(() => native<string[]>(page, 'n.calls')).toContain('AdMob.prepareRewardVideoAd');
  expect(logs).toContain('ADMOB MODE: TEST');
  expect(await native<{ adId: string; isTesting: boolean }>(page, "n.args['AdMob.prepareRewardVideoAd']")).toMatchObject({ adId: DEMO_REWARDED, isTesting: false });
});

test('a production build loads its own units', async ({ page }) => {
  await launch(page, { adConfig: { mode: 'production', ...REAL } });
  await expect.poll(() => native<string[]>(page, 'n.calls')).toContain('AdMob.prepareRewardVideoAd');
  expect(logs).toContain('ADMOB MODE: PRODUCTION');
  expect(await native<{ adId: string }>(page, "n.args['AdMob.prepareRewardVideoAd'].adId")).toBe(REAL.rewarded);
});

test('debug safety: a debuggable build carrying production units requests no ads at all', async ({ page }) => {
  const errors = await launch(page, { adConfig: { debuggable: true, mode: 'production', ...REAL } });
  await expect(page.locator('.up-add')).toBeVisible();
  await page.waitForTimeout(1500);
  const calls = await native<string[]>(page, 'n.calls');
  expect(calls.filter((c) => c.startsWith('AdMob.'))).toEqual([]);
  expect(logs.some((l) => l.startsWith('ADMOB MODE: DISABLED'))).toBe(true);
  expect(logs.join('\n')).not.toContain('ca-app-pub');
  await expect(page.locator('.chip-incomeX2')).toBeHidden();
  expect(errors).toEqual([]);
});

/** SDK start and ad requests (consent calls are not ad requests). */
const adRequests = async (page: Page) =>
  (await native<string[]>(page, 'n.calls')).filter((c) => /^AdMob\.(initialize|prepareRewardVideoAd|prepareInterstitial|showRewardVideoAd|showInterstitial)$/.test(c));

test('first launch offline: the game runs, nothing asks for ads, ad-only offers stay hidden', async ({ page }) => {
  const errors = await launch(page, { consent: { update: 'fail', stored: false } });
  await expect(page.locator('.up-add')).toBeVisible();
  await page.waitForTimeout(2500);
  expect(await adRequests(page)).toEqual([]);
  await expect(page.locator('.chip-incomeX2')).toBeHidden();
  expect(errors).toEqual([]);
});

test('offline with an earlier consent: the stored decision lets ads load', async ({ page }) => {
  await launch(page, { consent: { update: 'fail', stored: true } });
  await expect.poll(() => native<string[]>(page, 'n.calls')).toContain('AdMob.prepareRewardVideoAd');
});

test('consent required: the form comes before the SDK starts or any ad is requested', async ({ page }) => {
  await launch(page, { consent: { status: 'REQUIRED', form: 'answer' } });
  await expect.poll(() => native<string[]>(page, 'n.calls')).toContain('AdMob.prepareRewardVideoAd');
  const calls = (await native<string[]>(page, 'n.calls')).filter((c) => c.startsWith('AdMob.') || c.startsWith('AdConfig.'));
  const at = (c: string) => calls.indexOf(c);
  expect(at('AdMob.requestConsentInfo')).toBeGreaterThan(at('AdConfig.get'));
  expect(at('AdMob.showConsentForm')).toBeGreaterThan(at('AdMob.requestConsentInfo'));
  expect(at('AdMob.initialize')).toBeGreaterThan(at('AdMob.showConsentForm'));
  expect(at('AdMob.prepareRewardVideoAd')).toBeGreaterThan(at('AdMob.initialize'));
});

test('a consent form that fails to load: no ads, and the game is not stuck', async ({ page }) => {
  const errors = await launch(page, { consent: { status: 'REQUIRED', form: 'fail' } });
  await expect(page.locator('.up-add')).toBeVisible();
  await page.waitForTimeout(2000);
  expect(await adRequests(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('privacy options in Settings: withdrawing consent takes ad offers away without a restart', async ({ page }) => {
  await launch(page, { consent: { status: 'REQUIRED', form: 'answer', privacyRequired: true, privacyForm: 'withdraw' } });
  const chip = page.locator('.chip-incomeX2');
  await expect(chip).toBeVisible({ timeout: 8000 });
  await page.locator('.btn-settings').click();
  await page.locator('.modal-settings button', { hasText: 'Privacy options' }).click();
  await expect.poll(() => native<string[]>(page, 'n.calls')).toContain('AdMob.showPrivacyOptionsForm');
  await page.locator('.modal-settings .close-x').click();
  await expect(chip).toBeHidden({ timeout: 5000 });
});
