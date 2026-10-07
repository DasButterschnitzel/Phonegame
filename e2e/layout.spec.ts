import { test, expect, type Page } from '@playwright/test';
import { ready, g } from './helpers.ts';

// HUD layout across common Android portrait sizes (CSS px) in English and German: nothing overlaps, nothing
// leaves the screen, no label is clipped. Screenshots land in e2e-screens/ for visual review.

const SIZES: [number, number][] = [
  [360, 640],
  [360, 800],
  [375, 812],
  [390, 844],
  [412, 915],
  [432, 960],
  [800, 1280],
];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const boxes = (page: Page, sels: string[]) =>
  page.evaluate((ss) => {
    const out: Record<string, { x: number; y: number; w: number; h: number } | null> = {};
    for (const s of ss) {
      const el = document.querySelector(s) as HTMLElement | null;
      if (!el || el.offsetParent === null) {
        out[s] = null;
        continue;
      }
      const r = el.getBoundingClientRect();
      out[s] = { x: r.x, y: r.y, w: r.width, h: r.height };
    }
    return out;
  }, sels);

const overlap = (a: Box, b: Box) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;

for (const lang of ['en', 'de'] as const) {
  for (const [w, h] of SIZES) {
    if (lang === 'de' && w > 412) continue;
    test(`HUD fits ${w}x${h} (${lang})`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await ready(page, `&lang=${lang}`);
      // A mid-game state: a few segments, something affordable, boosts on offer.
      await g(page, 'g.grant(400)');
      await page.locator('.up-add').click();
      await page.locator('.up-add').click();
      await g(page, 'g.fillBasket(0.8)');
      await page.waitForTimeout(400);

      const sel = ['.farm-pill', '.coin-box', '.side-buttons', '.basket', '.rail-left', '.rail-right', '.goal', '.upgrades', '.full-badge'];
      const b = await boxes(page, sel);
      for (const s of sel) {
        const r = b[s];
        if (!r) continue;
        expect.soft(r.x, `${s} left edge`).toBeGreaterThanOrEqual(0);
        expect.soft(r.y, `${s} top edge`).toBeGreaterThanOrEqual(0);
        expect.soft(r.x + r.w, `${s} right edge`).toBeLessThanOrEqual(w + 0.5);
        expect.soft(r.y + r.h, `${s} bottom edge`).toBeLessThanOrEqual(h + 0.5);
      }
      const pairs: [string, string][] = [
        ['.farm-pill', '.coin-box'],
        ['.side-buttons', '.rail-right'],
        ['.side-buttons', '.coin-box'],
        ['.basket', '.rail-left'],
        ['.basket', '.farm-pill'],
        ['.goal', '.upgrades'],
        ['.goal', '.rail-left'],
        ['.goal', '.rail-right'],
        ['.rail-left', '.upgrades'],
        ['.rail-right', '.upgrades'],
      ];
      for (const [a, c] of pairs) {
        const ra = b[a];
        const rc = b[c];
        if (ra && rc) expect.soft(overlap(ra, rc), `${a} overlaps ${c}`).toBe(false);
      }
      // No clipped labels.
      const clipped = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.up .title, .goal .title, .up .cost, .up-lvl, .farm-name, .tornado-btn .outline')]
          .filter((el) => el.scrollWidth > el.clientWidth + 1)
          .map((el) => el.textContent),
      );
      expect.soft(clipped, 'clipped labels').toEqual([]);
      await page.screenshot({ path: `e2e-screens/layout-${w}x${h}-${lang}.png` });
    });
  }
}
