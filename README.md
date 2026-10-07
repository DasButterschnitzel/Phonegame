# Crop Crawler 🐛🌽

A hold-to-crawl idle/merge farming game: a **robot caterpillar** chomps its way round a garden path, piles crops
onto its back and sells them at the barn. Add segments, merge them into stronger ones, upgrade speed and baskets,
expand the farm and move on to new biomes. Inspired by the gameplay loop of *Train Miner*, with its own theme and
twists (regrowing crops, wobbling loot stacks, passive income from finished farms, lucky bugs, tornadoes).

- **Platforms:** Android (primary), iOS, web/PWA (installable on Windows), YouTube Playables, CrazyGames
- **Stack:** TypeScript · Vite · Three.js (all 3D models are generated in code) · Capacitor 8
- **Monetization:** free to play with opt-in rewarded ads plus gentle, policy-limited interstitials (AdMob on mobile,
  portal SDKs on the web). No in-app purchases.
- **Languages:** English, German

## Quick start

```bash
npm ci
npm run dev            # http://localhost:5173 — simulated ads, ?debug=1 hooks
npm run typecheck && npm test
npm run e2e            # Playwright (Chromium, SwiftShader WebGL)
npm run balance -- --profile all   # headless pacing report
```

Useful URL parameters (dev / e2e builds): `?lang=de`, `?seed=1`, `?quality=low|med|high`, `?fresh` (ignore save),
`?ads=fail|noreward`, `?adms=500` (simulated ad length), `?debug=1` (`window.__game` helpers).

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
- **Release:** set `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`,
  `VERSION_CODE`, `VERSION_NAME` and run `cd android && ./gradlew bundleRelease`.
- **AdMob:** Google's test IDs are used until you set real ones:
  - app ID → env `ADMOB_APP_ID_ANDROID` (Gradle `resValue`, ends up in the manifest)
  - ad units → `VITE_ADMOB_REAL=true`, `VITE_ADMOB_ANDROID_REWARDED`, `VITE_ADMOB_ANDROID_INTERSTITIAL` (see `.env.example`)

## iOS (needs macOS + Xcode 26)

```bash
npm run build:native && npx cap sync ios && npx cap open ios
```

Before release: replace `GADApplicationIdentifier` in `ios/App/App/Info.plist` with your AdMob iOS app ID, set the
iOS ad unit env vars, add the `InfoPlist.strings` (en/de) files to the target for a localised tracking prompt, and
configure signing in Xcode.

## Windows / desktop

Install the web build as a PWA from Edge or Chrome (`dist/web`, also deployed to GitHub Pages by `pages.yml`).
For a Microsoft Store package, wrap the PWA with PWABuilder; a Tauri shell is a later option.

## CI

- `ci.yml` — typecheck, unit tests, all flavor builds, bundle check, Playwright e2e (screenshots uploaded), balance
  report in the job summary, portal zips.
- `android.yml` — debug APK artifact on every relevant push; signed release AAB when the keystore secrets exist
  (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`; repo variables
  `ADMOB_REAL`, `ADMOB_APP_ID_ANDROID`, `ADMOB_ANDROID_REWARDED`, `ADMOB_ANDROID_INTERSTITIAL`).
- `pages.yml` — publishes a playable web demo (simulated ads) and `privacy.html` from the default branch
  (enable *Settings → Pages → Source: GitHub Actions* once).
