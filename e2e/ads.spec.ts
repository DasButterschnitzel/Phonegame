import { test, expect } from '@playwright/test';
import { ready, g } from './helpers.ts';

/** Tutorial hints suppress interstitials — mark them all seen for policy tests. */
const skipTutorial = "Object.assign(g.meta().tutorial, { add: true, merge: true, full: true, expand: true, tornado: true, grow: true })";

async function unloadWithoutThrottle(page: import('@playwright/test').Page) {
  const before = await g<number>(page, 'g.state().stats.unloads');
  await g(page, 'g.fillBasket(0.5)');
  await page.waitForFunction(
    (b) => {
      const gg = (window as any).__game;
      if (gg.state().stats.unloads > b) return true;
      gg.fastForward(2, false);
      return false;
    },
    before,
    { timeout: 20000, polling: 50 },
  );
}

test('no interstitial during the first minutes of play', async ({ page }) => {
  await ready(page);
  await g(page, '(g.setPlaytime(0), g.app.ads.policy.sessionStart = -1000, g.app.ads.policy.unloadsSinceInterstitial = 5)');
  await unloadWithoutThrottle(page);
  await page.waitForTimeout(1600);
  await expect(page.locator('.ad-overlay')).toHaveCount(0);
});

test('interstitial at a barn break once the policy allows it', async ({ page }) => {
  await ready(page);
  await g(page, skipTutorial);
  await g(page, '(g.setPlaytime(600), g.app.ads.policy.sessionStart = -1000, g.app.ads.policy.unloadsSinceInterstitial = 5, g.app.game.lastBigMomentAt = -1e12)');
  await unloadWithoutThrottle(page);
  await page.waitForFunction(() => (window as any).__game.app.ads.lastCheck !== null, null, { timeout: 4000 });
  expect(await g(page, 'g.app.ads.lastCheck')).toMatchObject({ ok: true, kind: 'barn_unload' });
  // The simulated interstitial lasts only 300 ms — assert on the recorded impression.
  await page.waitForFunction(() => (window as any).__game.app.ads.policy.interstitialWall.length === 1, null, { timeout: 5000 });
  await expect(page.locator('.ad-overlay')).toBeHidden({ timeout: 5000 });
  // Cooldown: the next unload does not show another one.
  await unloadWithoutThrottle(page);
  await page.waitForTimeout(1600);
  await expect(page.locator('.ad-overlay')).toHaveCount(0);
});

test('no interstitial right after a rewarded ad', async ({ page }) => {
  await ready(page);
  await g(page, '(g.setPlaytime(600), g.app.ads.policy.sessionStart = -1000, g.app.ads.policy.unloadsSinceInterstitial = 5, g.app.game.lastBigMomentAt = -1e12)');
  await page.locator('.chip-incomeX2').click();
  await page.locator('.modal-bonus .bonus-ad').click();
  await expect(page.locator('.ad-overlay')).toBeHidden({ timeout: 5000 });
  expect(await g<number>(page, 'g.state().boosts.incomeX2')).toBeGreaterThan(0);
  await unloadWithoutThrottle(page);
  await page.waitForTimeout(1600);
  await expect(page.locator('.ad-overlay')).toHaveCount(0);
});

test('free upgrade offer appears when stuck and grants the upgrade', async ({ page }) => {
  await ready(page);
  // Spend everything and wait past the offer delay.
  await g(page, '(g.state().coins = 0, g.app.game.offers.poorSince = performance.now() / 1000 - 60)');
  await expect(page.locator('.free-badge:visible')).toHaveCount(1, { timeout: 3000 });
  const btn = page.locator('.up-wrap:has(.free-badge:visible) .up');
  const cls = (await btn.getAttribute('class')) ?? '';
  await btn.click();
  await expect(page.locator('.ad-overlay')).toBeHidden({ timeout: 5000 });
  const st = await g<{ segments: number; speed: number; cap: number }>(page, '({ segments: g.state().progress.segments.length, speed: g.state().progress.speedLevel, cap: g.state().progress.capacityLevel })');
  expect(st.segments + st.speed + st.cap).toBe(4);
  expect(cls).toContain('up-');
});

test('ads failing to load hide ad-only offers gracefully; coins still work', async ({ page }) => {
  await ready(page, '&ads=fail');
  await page.locator('.tornado-btn').click(); // uses the free tornado
  await g(page, 'g.state().coins = 0');
  await page.locator('.tornado-btn').click(); // none left: coins (none) or an ad (not available)
  await expect(page.locator('.modal-bonus')).toBeVisible();
  await expect(page.locator('.modal-bonus .bonus-ad')).toBeHidden();
  await expect(page.locator('.modal-bonus .bonus-buy')).toHaveClass(/grey/);
  await page.locator('.modal-bonus .bonus-buy').click();
  await expect(page.locator('.toast')).toBeVisible();
  await page.locator('.modal-bonus .close-x').click();
  // ×2 can only be paid by an ad (or a free charge): with no ads and no charge the chip is hidden.
  await expect(page.locator('.chip-incomeX2')).toBeHidden();
});

test('a free charge starts its boost with one tap — no ad, no coins', async ({ page }) => {
  await ready(page);
  await g(page, "g.sim.execute({ c: 'grantCharge', id: 'incomeX2', n: 1 })");
  await expect(page.locator('.chip-incomeX2 .bonus-tag.free')).toBeVisible();
  const coins = await g<number>(page, 'g.state().coins');
  await page.locator('.chip-incomeX2').click();
  await expect(page.locator('.modal-bonus')).toHaveCount(0);
  await expect(page.locator('.ad-overlay')).toHaveCount(0);
  expect(await g<number>(page, 'g.state().boosts.incomeX2')).toBeGreaterThan(170);
  expect(await g<number>(page, 'g.state().charges.incomeX2')).toBe(0);
  expect(await g<number>(page, 'g.state().coins')).toBeGreaterThanOrEqual(coins);
});

test('autopilot: pay with coins (the price is shown) or an ad; a skipped ad gives nothing and costs nothing', async ({ page }) => {
  await ready(page, '&ads=noreward');
  await g(page, 'g.grant(100000)');
  const coins = await g<number>(page, 'g.state().coins');
  const price = await g<number>(page, 'g.sim.autopilotPrice');
  // Skipped ad: no autopilot, coins untouched.
  await page.locator('.chip-autopilot').click();
  await page.locator('.modal-bonus .bonus-ad').click();
  await expect(page.locator('.ad-overlay')).toBeHidden({ timeout: 5000 });
  expect(await g<number>(page, 'g.state().boosts.autopilot')).toBe(0);
  expect(await g<number>(page, 'g.state().coins')).toBeGreaterThanOrEqual(coins);
  // Coins: the price is taken, autopilot runs.
  await page.locator('.chip-autopilot').click();
  await page.locator('.modal-bonus .bonus-buy').click();
  await expect.poll(() => g<number>(page, 'g.state().boosts.autopilot')).toBeGreaterThan(170);
  expect(await g<number>(page, 'g.state().coins')).toBeLessThan(coins - price + 1000);
});

test('tornado: bought with coins when none are left, then it fires', async ({ page }) => {
  await ready(page);
  await g(page, '(g.state().tornadoes = 0, g.grant(100000))');
  const used = await g<number>(page, 'g.state().stats.tornadoesUsed');
  await expect(page.locator('.tornado-btn .bonus-tag.coin')).toBeVisible();
  await page.locator('.tornado-btn').click();
  await page.locator('.modal-bonus .bonus-buy').click();
  await expect.poll(() => g<number>(page, 'g.state().stats.tornadoesUsed')).toBe(used + 1);
});
