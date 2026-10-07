/**
 * Renders every app icon / splash / store image from SVG sources with Playwright's Chromium (no image tools needed).
 *   node scripts/gen-assets.ts
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const mascot = readFileSync('assets-src/mascot.svg', 'utf8');
const mascotUri = `data:image/svg+xml;base64,${Buffer.from(mascot).toString('base64')}`;
const GREEN = '#7cc56b';
const BG = 'radial-gradient(circle at 50% 30%, #c8f59a 0%, #8ed36b 45%, #5aae46 100%)';

type Kind = 'icon' | 'round' | 'foreground' | 'maskable' | 'splash' | 'feature';

function html(kind: Kind, w: number, h: number): string {
  const base = `<!doctype html><html><head><style>
    @font-face { font-family: Fredoka; src: url('${fredoka()}'); }
    html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:transparent}
    .bg{position:absolute;inset:0;background:${BG}}
    .m{position:absolute;background:url('${mascotUri}') center/contain no-repeat}
    .title{position:absolute;left:0;right:0;text-align:center;font-family:Fredoka,Arial Rounded MT Bold,sans-serif;font-weight:700;color:#fff;
      text-shadow:0 ${h * 0.006}px 0 #3d9a24, 0 0 ${h * 0.01}px rgba(0,0,0,.2);-webkit-text-stroke:${Math.max(2, h * 0.004)}px #2b2d42;paint-order:stroke fill}
  </style></head><body>`;
  const S = Math.min(w, h);
  switch (kind) {
    case 'icon':
      return `${base}<div class="bg" style="border-radius:${S * 0.22}px"></div><div class="m" style="inset:${S * 0.06}px"></div></body></html>`;
    case 'round':
      return `${base}<div class="bg" style="border-radius:50%"></div><div class="m" style="inset:${S * 0.1}px"></div></body></html>`;
    case 'maskable':
      return `${base}<div class="bg"></div><div class="m" style="inset:${S * 0.16}px"></div></body></html>`;
    case 'foreground':
      // Adaptive icons: keep content inside the central 66% safe zone.
      return `${base}<div class="m" style="inset:${S * 0.2}px"></div></body></html>`;
    case 'splash': {
      const m = S * 0.42;
      // Flat brand colour (not a gradient) keeps the huge splash PNGs small.
      return `${base}<div class="bg" style="background:${GREEN}"></div><div class="m" style="left:${(w - m) / 2}px;top:${h * 0.5 - m * 0.75}px;width:${m}px;height:${m}px"></div>
        <div class="title" style="top:${h * 0.5 + m * 0.3}px;font-size:${S * 0.11}px">Crop Crawler</div></body></html>`;
    }
    case 'feature':
      return `${base}<div class="bg"></div><div class="m" style="left:${w * 0.04}px;top:${h * 0.05}px;width:${h * 0.9}px;height:${h * 0.9}px"></div>
        <div class="title" style="left:${w * 0.42};top:${h * 0.24}px;font-size:${h * 0.2}px;text-align:left;padding-left:${w * 0.45}px">Crop<br>Crawler</div></body></html>`;
  }
}

function fredoka(): string {
  const p = 'node_modules/@fontsource/fredoka/files/fredoka-latin-700-normal.woff2';
  return existsSync(p) ? `data:font/woff2;base64,${readFileSync(p).toString('base64')}` : '';
}

interface Job {
  out: string;
  kind: Kind;
  w: number;
  h: number;
  opaque?: boolean;
}

const jobs: Job[] = [
  // PWA / web
  { out: 'public/icons/icon-192.png', kind: 'icon', w: 192, h: 192 },
  { out: 'public/icons/icon-512.png', kind: 'icon', w: 512, h: 512 },
  { out: 'public/icons/maskable-512.png', kind: 'maskable', w: 512, h: 512, opaque: true },
  { out: 'public/icons/apple-touch-icon.png', kind: 'maskable', w: 180, h: 180, opaque: true },
  { out: 'public/icons/favicon-32.png', kind: 'icon', w: 32, h: 32 },
  // Store listing
  { out: 'store/icon-512.png', kind: 'maskable', w: 512, h: 512, opaque: true },
  { out: 'store/feature-1024x500.png', kind: 'feature', w: 1024, h: 500, opaque: true },
  // iOS (opaque, no alpha)
  { out: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', kind: 'maskable', w: 1024, h: 1024, opaque: true },
  ...['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'].map((f) => ({
    out: `ios/App/App/Assets.xcassets/Splash.imageset/${f}`,
    kind: 'splash' as Kind,
    w: 2732,
    h: 2732,
    opaque: true,
  })),
];

// Android launcher icons (legacy, round, adaptive foreground) per density.
const dens: [string, number][] = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];
for (const [d, px] of dens) {
  const res = `android/app/src/main/res/mipmap-${d}`;
  jobs.push({ out: `${res}/ic_launcher.png`, kind: 'icon', w: px, h: px });
  jobs.push({ out: `${res}/ic_launcher_round.png`, kind: 'round', w: px, h: px });
  jobs.push({ out: `${res}/ic_launcher_foreground.png`, kind: 'foreground', w: px * 2.25, h: px * 2.25 });
}
// Android splash drawables at the template's sizes.
const splash: [string, number, number][] = [
  ['drawable', 480, 320],
  ['drawable-land-mdpi', 480, 320],
  ['drawable-land-hdpi', 800, 480],
  ['drawable-land-xhdpi', 1280, 720],
  ['drawable-land-xxhdpi', 1600, 960],
  ['drawable-land-xxxhdpi', 1920, 1280],
  ['drawable-port-mdpi', 320, 480],
  ['drawable-port-hdpi', 480, 800],
  ['drawable-port-xhdpi', 720, 1280],
  ['drawable-port-xxhdpi', 960, 1600],
  ['drawable-port-xxxhdpi', 1280, 1920],
];
for (const [d, w, h] of splash) jobs.push({ out: `android/app/src/main/res/${d}/splash.png`, kind: 'splash', w, h, opaque: true });

const browser = await chromium.launch();
const page = await browser.newPage();
for (const j of jobs) {
  if (j.out.startsWith('android/') && !existsSync('android')) continue;
  if (j.out.startsWith('ios/') && !existsSync('ios')) continue;
  mkdirSync(dirname(j.out), { recursive: true });
  await page.setViewportSize({ width: Math.round(j.w), height: Math.round(j.h) });
  await page.setContent(html(j.kind, Math.round(j.w), Math.round(j.h)));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: j.out, omitBackground: !j.opaque });
  console.log('✓', j.out);
}
await browser.close();
