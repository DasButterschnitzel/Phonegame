# Crop Crawler 🐛🌽

A hold-to-crawl idle/merge farming game: a **robot caterpillar** chomps its way round the farm, piles crops onto its
back and rolls them through the depot to sell. Crops never grow back — every plot you clear becomes meadow and your
route grows out around it, so the farm visibly transforms as you play. Add segments, merge them into stronger ones,
upgrade speed and baskets, open new fields and move on to new biomes. Inspired by the gameplay loop of *Train Miner*,
with its own theme and twists (route growth by clearing, wobbling loot stacks, rolling depot payout, passive income
from finished farms, lucky bugs, tornadoes). Design: `docs/GAME_DESIGN.md`, `docs/TRAIN_MINER_ANALYSIS.md`.

- **Platforms:** Android (primary), iOS, web/PWA (installable on Windows), YouTube Playables, CrazyGames
- **Stack:** TypeScript · Vite · Three.js (all 3D models are generated in code) · Capacitor 8
- **Monetization:** free to play with opt-in rewarded ads plus gentle, policy-limited interstitials (AdMob on mobile,
  portal SDKs on the web). No in-app purchases.
- **Languages:** English, German
- **Controls:** hold anywhere to crawl (Space on a keyboard); tap upgrades with another finger while crawling; a
  second finger on the field is OVERDRIVE (Shift + Space), a short burst that heats the motor; accessibility
  setting: tap to start/stop

## Quick start

```bash
npm ci
npm run dev            # http://localhost:5173 — simulated ads, ?debug=1 hooks
npm run typecheck && npm test
npm run e2e            # Playwright (Chromium, SwiftShader WebGL)
npm run balance -- --profile all   # headless pacing report
```

Useful URL parameters (dev / e2e builds): `?lang=de`, `?seed=1`, `?quality=low|med|high`, `?fresh` (ignore save),
`?ads=fail|noreward`, `?adms=500` (simulated ad length), `?debug=1` (`window.__game` helpers), `?perf=1`
(performance overlay, any build).

Feel and performance tools (not part of `npm run e2e`):

```bash
CAPTURE=1 npx playwright test capture --project=pixel7   # frame-stepped clips → capture/*.mp4, bite lineup, audio WAVs
PACING=1 npx playwright test pacing --project=pixel7     # frame pacing of the heavy moments, CPU throttled 4×
```

## Project layout

| Path | What |
|---|---|
| `src/game/` | Pure, deterministic simulation (no DOM / three.js): path, crops, harvest, economy, upgrades, saves. All balance numbers in `config.ts`. |
| `src/render/` | Three.js views: procedural low-poly crops, caterpillar, loot stacks, particles, camera. |
| `src/ui/` | Vanilla DOM HUD and modals. |
| `src/platform/` | Ads (AdMob, CrazyGames, YouTube, simulated), storage, i18n, audio (procedural WebAudio), haptics, lifecycle. |
| `src/app/` | Composition root: boot, fixed-step loop, input, game controller, tutorial, juice. |
| `scripts/` | `balance.ts`, `sim-bench.ts`, `gen-assets.ts` (icons/splash), `check-bundle.ts`, `package-portal.ts`, `setup-android-sdk.sh`. |
| `android/`, `ios/` | Capacitor native projects (committed). |
| `docs/GAME_DESIGN.md` | Design, economy and monetization rules. `STORE.md` — store listing & release checklist. |

## Build flavors

| Command | Output | Ads | Saves |
|---|---|---|---|
| `npm run build:web` | `dist/web` (PWA) | none | localStorage |
| `npm run build:native` | `dist/native` → Capacitor | AdMob + UMP consent | Capacitor Preferences |
| `npm run build:crazygames` | `dist/crazygames` | CrazyGames SDK v3 | CrazyGames cloud data |
| `npm run build:youtube` | `dist/youtube` | YouTube Playables SDK | Playables cloud save |

`npm run bundle:check` enforces the initial JS budget (≤ 350 KB gzip, currently ~176 KB) and that each flavor only
contains its own ad SDK. `npm run package:portals` zips the two portal builds into `portals/`.

## Android

```bash
scripts/setup-android-sdk.sh /opt/android-sdk   # once: cmdline-tools, platform 36, build-tools
npm run android:debug                           # → android/app/build/outputs/apk/debug/app-debug.apk
```

- `minSdk 24`, `targetSdk 36` (Google Play requirement from 2026-08-31), portrait, edge-to-edge, WebGL 2 required.
- **Testing on a phone:** `docs/DEVICE_TESTING.md` (performance overlay: Settings → tap the version 7×).
- **Release:** see `docs/RELEASE_CHECKLIST.md` (signing secrets, versionCode, the manual production workflow).
- **AdMob:** configured per build type by Gradle (`android/app/admob.gradle`, `docs/ADMOB_TESTING.md`). Debug APKs
  always use Google's demo units; release builds use `ADMOB_MODE=test|production|disabled`, and production fails the
  build unless every ID is present and well-formed. The web bundle never contains ad IDs.

## iOS (needs macOS + Xcode 26)

```bash
npm run build:native && npx cap sync ios && npx cap open ios
```

Ads are **off on iOS** (`ADMOB MODE: DISABLED`): ad IDs come only from a native build configuration, and the iOS
counterpart of `AdConfigPlugin.java` still has to be written on a Mac. Before an iOS release: port that plugin (per
build configuration, like `admob.gradle`), replace `GADApplicationIdentifier` in `ios/App/App/Info.plist`, add the
`InfoPlist.strings` (en/de) files to the target for a localised tracking prompt, and configure signing in Xcode.

## Custom music

The music is procedural (a tune per biome family). To use your own files instead: put them in `public/music/`
(`.ogg`/`.m4a`/`.mp3`) and set `MUSIC.source` in `src/platform/audio/music.ts` — one `track` looped everywhere, or a
`playlist` played in order, optionally with its own track per biome family (crossfaded on travel). Files are streamed,
paused with ads and in the background, follow the music setting, and a file that fails falls back to the procedural
tunes. Try files without rebuilding in a dev build: `?music={"kind":"track","file":"theme.ogg"}`.

## Windows / desktop

Install the web build as a PWA from Edge or Chrome (`dist/web`, also deployed to GitHub Pages by `pages.yml`).
For a Microsoft Store package, wrap the PWA with PWABuilder; a Tauri shell is a later option.

## CI

- `ci.yml` — typecheck, unit tests, all flavor builds, bundle check, Playwright e2e (screenshots uploaded), balance
  report in the job summary, portal zips.
- `android.yml` — debug APK artifact on every relevant push; signed release AAB when the keystore secrets exist
  (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`; repo variables
  `ADMOB_REAL`, `ADMOB_APP_ID_ANDROID`, `ADMOB_ANDROID_REWARDED`, `ADMOB_ANDROID_INTERSTITIAL`).
- `pages.yml` — publishes a playable web demo (simulated ads) and `privacy.html` from the default branch.
  One-time setup: *Settings → Pages → Source: GitHub Actions*, then add the repository variable `PAGES_ENABLED=true`.
