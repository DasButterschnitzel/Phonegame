# AdMob production hardening — Gold status

STATUS: SILVER (loop running)

Goal 06: make the ad stack, the consent flow and the release pipeline safe to ship on Google Play,
without redesigning the game or adding ad pressure. This file is the loop log and the gate list.

## A1 — Audit (baseline 3d1ea2e)

### Build inputs (where ad configuration comes from)

| Input | Read by | Used for | Problem |
|---|---|---|---|
| `VITE_ADMOB_REAL` | Vite (JS bundle) | test vs real units, `isTesting`, `initializeForTesting` | Baked into the **shared** web bundle (`dist/native`), which both the debug and the release APK package. CI passes `vars.ADMOB_REAL` to the step that builds the debug APK, so a debug APK can carry live inventory. |
| `VITE_ADMOB_ANDROID_REWARDED` / `_INTERSTITIAL` | Vite | unit IDs | Each one falls back to Google's demo unit **on its own**: half a configuration silently becomes a mixed test/production build. No format check. |
| `ADMOB_APP_ID_ANDROID` | Gradle `defaultConfig.resValue` | manifest `APPLICATION_ID` | Applies to debug and release alike; falls back to the demo app ID silently; no format check; no tie to the unit IDs' publisher. |
| `VERSION_CODE` | Gradle | versionCode | CI uses `github.run_number`: not tied to the version, no monotonic check, reruns reuse codes. |
| `ANDROID_KEYSTORE_PATH` + passwords | Gradle | release signing | Partial secrets give an unsigned or failing build without a clear message. |
| `ios/App/App/Info.plist` | iOS | `GADApplicationIdentifier` | Google's demo iOS app ID; iOS has never been built (needs a Mac). |

### Runtime requests and consent paths (`providers/AdMob.ts`)

1. `requestConsentInfo()` → `showConsentForm()` if REQUIRED → `canRequestAds` from the result.
2. **On any consent failure, `canRequest = true`** — a first launch offline, or a UMP error, requests ads with no consent decision.
   The plugin rejects on failure and gives no `canRequestAds()`, which UMP keeps from the previous session; a native helper is needed.
3. Consent is requested once per launch (good), but never again: an offline first launch stays without ads until restart.
4. After the privacy options form, readiness is not re-evaluated (withdrawn consent keeps preloaded ads; new consent does not start the SDK).
5. `initialize({ initializeForTesting: !ADMOB_REAL })` — test devices are only registered when `initializeForTesting` is true
   (plugin source), so production builds could never register test devices. No `maxAdContentRating`; TFCD/TFUA unspecified (correct for a 13+ audience, but implicit).
6. `prepareRewardVideoAd({ isTesting: !ADMOB_REAL })`: with `isTesting` the plugin swaps in its own demo unit unless the device is a registered
   test device. The plugin stores prepared ads by the final unit ID; mixing our IDs and its swapped IDs makes `showRewardVideoAd({adId})` miss.
7. Loads retry with backoff (2–60 s) forever, also while consent forbids requests (it returns early, so fine) — but `FailedToLoad` events are global
   and cannot be attributed to a unit when several are prepared.

### Reward integrity

| Path | Today | Risk |
|---|---|---|
| Rewarded → Dismissed | earned after a 400 ms grace | ok |
| Dismissed → Rewarded within 400 ms | earned | ok |
| Dismissed → Rewarded after 400 ms | resolves "skipped"; the late reward is dropped (the flag is reset at the next show) | a slow device loses a reward the player earned; untested |
| Rewarded twice | idempotent flag | ok |
| FailedToShow → stray Dismissed | resolves false, then the stray Dismissed schedules a `finishReward` 400 ms later that **resolves whatever show is current** — a new ad started in that window would end as "skipped" while still on screen | cross-session resolution |
| `showRewardVideoAd` rejects after the ad showed | resolves false while the ad is on screen; game resumes under the ad | wrong state |
| No events at all | AdManager's 90 s visible-time timeout | ok, but slow (90 s frozen game) |
| Activity recreated / WebView reload | listeners re-added; events of the old ad arrive with no session | ignored (callback null) — ok, untested |
| Show failed / never started | `AdManager.rewarded` **always** records `onRewardedShown` in `finally` | a failed ad consumes the placement cooldown and the 5-minute interstitial quiet time |
| Interstitial not shown (not loaded, failed) | `maybeInterstitial` **always** records `onInterstitialShown` | a non-ad consumes the hourly budget and the cooldown (harmless for players, wrong for the ad-count test) |

Game flows already apply rewards only after a `true` result and charge nothing on failure (`game.ts` buy/tornado/boost,
`metaFlows.ts` daily/gift/farm complete, `boot.ts` offline). The free-upgrade offer is consumed only after success.

### Release pipeline

- `android.yml` builds a **signed AAB on every push** when the keystore secret exists — a feature push can produce a distributable production package.
- The keystore is decoded with `echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}"` (secret inlined into the script; masked, but bad practice).
- No release-test job (signing never exercised without the real key), no artifact audit (package, SDKs, version, signature, App ID, mode).
- The debug APK and the release AAB share the web bundle built with `vars.ADMOB_REAL`.

### Other findings

- Perf overlay (Settings → version ×7, `?perf=1`): fps, frame times, buffer size, tier, draw calls, GPU renderer, heap — no ad IDs, consent state or identifiers. Keep it that way (test).
- Debug hooks (`window.__game`) are compiled in only with `VITE_DEBUG_HOOKS=true` (dev/e2e); the native flavor sets it false.
- Capacitor's `webContentsDebuggingEnabled` is not set, so WebView debugging follows the build type (debuggable only in debug). No `server.url`.
- No app-ads.txt, no data-safety inventory, no Play Console checklist; the privacy policy has placeholders and no consent-withdrawal path wording check.

## Plan

| Step | Scope |
|---|---|
| A2 | Ad configuration moves to the native build: Gradle per build type (debug forced to demo units; release `test` / `production` / `disabled`, validated, fails the build when invalid), a small native `AdConfig` plugin hands it to JS with UMP `canRequestAds()`. The JS bundle carries no ad IDs. |
| A3 | Consent controller with an injectable bridge: update every launch, gate on `canRequestAds()` after success **and** failure, retry on resume, privacy options re-evaluate readiness; ordering tests. |
| A4 | Reward sessions with exactly-once outcomes (`earned` / `skipped` / `failed`); policy records only shown ads; hostile-order tests; short failure UX; optional per-group units; max content rating PG. |
| A5 | Workflows: CI / Android debug / Android release test (dummy keystore) / Android production release (manual, protected environment); artifact audit; semver versionCode with a monotonic tag check. |
| A6 | ADMOB_TESTING, PLAY_CONSOLE_CHECKLIST, RELEASE_CHECKLIST, DATA_SAFETY_INVENTORY, app-ads.txt template + check, website copy, privacy policy audit. |
| A7 | Music source abstraction (procedural / custom track / custom playlist). |
| A8 | Gold verification: tests, builds, bad-config / offline / failure simulations, ad-count replay, CI. |

## Loop log

| Step | Commit | Result |
|---|---|---|
| A1 | 62b1cc8 | Audit written. |
| A2 | (this) | `android/app/admob.gradle`: debug = demo units whatever the environment says; release `test`/`production`/`disabled`, production validated (format, demo publisher, one publisher, required IDs) and the build fails on anything else, naming variables only. Signing: incomplete secrets or an unsigned/unversioned production build fail `preReleaseBuild`. `AdConfigPlugin` hands the values to JS; `admob/config.ts` re-checks them (debuggable + production → off; test + real units → off). The web bundle carries no ad IDs (`bundle:check`). iOS: ads off until the plugin is ported. Verified: Gradle checks with good/partial/mixed/demo configs, debug APK resources (demo IDs, mode test), Android-shell e2e for TEST/PRODUCTION/debug-safety. |
