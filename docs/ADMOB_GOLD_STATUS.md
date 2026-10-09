# AdMob production hardening — Gold status

STATUS: GOLD

Every gate below has its evidence, and CI is green on the final code (97487ce: CI #50 — typecheck, unit tests, all
flavors, bundle checks, every e2e project including the Android shell, balance, long sessions; Android #44 — debug
built with production-looking settings and audited demo-only, release test with the Gradle matrix, throwaway-key AAB
and APK audited). GOLD covers the code, the build pipeline and the documents. It does **not** mean AdMob production is
live or that Google Play approved anything: those need the HUMAN-ONLY steps in `docs/RELEASE_CHECKLIST.md`.

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

## Gold gates

| Gate | Evidence |
|---|---|
| debug can never use live ad inventory accidentally | `admob.gradle` forces demo IDs per build type; `config.ts` disables production units in debuggable builds; CI *Android debug* is built **with** production-looking env and audited demo-only; `admob-matrix` debug × ADMOB_REAL false/true/real IDs; `audit-android.test` debug-with-real-inventory fails |
| production cannot accidentally ship Google demo IDs | Gradle refuses demo/placeholder/mixed IDs; JS refuses them; the production workflow audits the bundle (`--mode production`) |
| real configuration validated at build time | `checkAdMobRelease` before `preReleaseBuild`; 13 refused configurations in `admob-matrix` (CI) |
| test-device path supported | `ADMOB_TEST_DEVICE_IDS` → `initializeForTesting` + `testingDevices` (any build); release workflow *Register test devices* (+ universal APK); matrix + controller tests; docs |
| UMP update occurs on every launch | `AdMobController.init` → `updateConsent`; controller tests assert the call order |
| canRequestAds gates ad requests | single gate `applyConsent`; ordering tests (nothing before the update, slow update, unreadable decision → off); Android-shell order test |
| offline consent failure behaves safely | tests: first launch offline, stored decision offline, UMP error, hung update, form failure, dismissed form; Android shell e2e |
| gameplay never depends on ad availability | `ads.init()` is not awaited; e2e: offline first launch, no fill, consent form failure, disabled mode all boot and play |
| every rewarded placement grants exactly once | sessions settle once, only the reward event earns (controller); manager busy guard; dialogs one action at a time + idempotent offline payout; Android-shell matrix (reward twice = exactly +3:00), process death, double-tap e2e |
| skipped ads grant nothing | manager/controller tests; shell "closed without reward"; web e2e (`ads=noreward`) |
| failed ads cost nothing | no cooldown/quiet time/budget for ads that never started (manager tests); `ads=showfail` e2e keeps the free upgrade offer; shell "failed to show" |
| current low interstitial pressure preserved | `AdPolicy` unchanged; session replay below is **identical** to baseline 3d1ea2e; only shown interstitials use the budget |
| app-ads.txt deployment path documented | `PLAY_CONSOLE_CHECKLIST.md`, `RELEASE_CHECKLIST.md`, `deploy/`; `check-app-ads` refuses the template |
| Play Console checklist complete | `docs/PLAY_CONSOLE_CHECKLIST.md` (all nine areas + app-ads.txt + closed-test rule as stated by the goal) |
| privacy/data inventory complete | `docs/DATA_SAFETY_INVENTORY.md`; `public/privacy.html` rewritten against it |
| signing workflow hardened | incomplete secrets / unsigned or unversioned production refused (Gradle + matrix); keystore from env, deleted after use; never echoed |
| AAB release build works | CI *Android release test*: signed AAB + universal APK audited on every push; local production simulation with a test upload key audited PASSED |
| production workflow intentional, not accidental | manual dispatch + `environment: production`; `workflows.test.ts` forbids secrets or production builds in push workflows |
| secret leakage audit passes | `scripts/secrets.test.ts` (tracked files), `workflows.test.ts` (no secrets in scripts, no tracing), audit/Gradle/log output names variables only, perf overlay test |
| current gameplay unchanged | `git diff 3d1ea2e -- src/game src/shared` is empty; only ad-offer readiness and failure texts changed in the UI |
| World Tour unchanged | same (no change under `src/game`); World Tour e2e in CI |
| save format unchanged | no change under `src/game/save` |
| typecheck green | local + CI |
| unit tests green | 258 tests (36 files) |
| e2e green | CI #50 on 97487ce (all projects incl. the Android shell: 19 tests); locally 105/105 on pixel7 |
| balance green | `npm run balance -- --profile all --assert`: "Balance targets OK" |
| Android debug green | CI Android #44 on 97487ce |
| Android signed-release pipeline proven with dummy/test signing | CI *Android release test* (throwaway key, AAB + APK audited) on every push since 67ac258 |

## Test matrix (goal 06)

| Case | Where |
|---|---|
| debug + ADMOB_REAL false / true / real IDs supplied | `admob-matrix` (CI), CI debug job (hostile env + audit) |
| release + test configuration / incomplete / malformed / valid production | `admob-matrix`, `config.test.ts`, `audit-android.test.ts`, local production simulation |
| consent required / not required | controller tests, Android shell |
| update failure with / without previous permission, offline first launch | controller tests, Android shell |
| privacy options required (and changed) | controller tests, Android shell (withdraw in Settings → offers gone without restart) |
| rewarded complete / skipped / fail / duplicate | controller + manager tests, Android-shell order matrix, web e2e |
| interstitial suppressed during a major event / after rewarded | `AdPolicy.test.ts` (bigMoment, afterRewarded), web e2e "no interstitial right after a rewarded ad", farm-complete travel |
| background during ad / restore after ad | controller test (backgrounded click-through still earns), music e2e (paused under the ad, resumes after), manager give-up timer counts visible time only |
| process death | Android shell: restart during an ad, the old reward grants nothing |

## Production ad-count replay (`npm run sessions -- --hours 6`, seed 1)

Forced interstitials per session if every allowed slot showed an ad (policy: ≤ 4/h, 8 min apart, 5 min quiet after a
rewarded ad). Identical to baseline 3d1ea2e.

```
profile                    session starts at        30 min  1 h  2 h  max/rolling h
ACTIVE_NO_ADS              fresh install                 2    4    7              4
ACTIVE_NO_ADS              Starter Tour, farm #3         2    4    8              4
ACTIVE_NO_ADS              World Tour start (#6)         2    4    7              4
ACTIVE_NO_ADS              farm #20                      2    3    3              3
ACTIVE                     fresh install                 0    0    3              3
ACTIVE                     Starter Tour, farm #3         0    3    4              3
ACTIVE                     World Tour start (#6)         0    1    2              2
ACTIVE                     farm #20                      1    1    2              2
CASUAL                     fresh install                 2    4    8              4
CASUAL                     Starter Tour, farm #3         3    4    8              4
CASUAL                     World Tour start (#6)         3    4    8              4
ACTIVE_OCCASIONAL_REWARDED fresh install                 0    0    1              1
ACTIVE_OCCASIONAL_REWARDED Starter Tour, farm #3         1    2    2              2
ACTIVE_OCCASIONAL_REWARDED World Tour start (#6)         0    0    0              0
ACTIVE_OCCASIONAL_REWARDED farm #20                      1    1    1              1
IDLE                       fresh install                 3    4    8              4
IDLE                       Starter Tour, farm #3         4    4    8              4
ACTIVE_TWO_FINGER          fresh install                 2    3    6              4
ACTIVE_TWO_FINGER          Starter Tour, farm #3         1    4    5              4
ACTIVE_TWO_FINGER          World Tour start (#6)         0    1    5              4
ACTIVE_TWO_FINGER          farm #20                      3    4    4              4
```

ACTIVE_NO_ADS = no rewarded ads, ACTIVE_OCCASIONAL_REWARDED = rewarded-heavy (one every 5 min). Never more than 4 in
any rolling hour; active players who use rewarded ads see 0–3.

## Not verified here (and not claimed)

- **Real devices.** The new native plugin, the consent flow and the ad sessions ran against the real Capacitor bridge
  with a scripted Java side (Android shell) and in CI-built APKs/AABs, not on a phone with the real SDK. Before the
  first production upload: install the debug APK, check `adb logcat | grep "ADMOB MODE"`, watch a rewarded ad, open
  Settings → Privacy options (release checklist, "Every release", step 5).
- **AdMob production** is not live: no account, publisher ID or units exist yet (HUMAN-ONLY).
- **Play Store compliance** is not approved: nothing has been submitted (HUMAN-ONLY).
- **iOS** shows no ads until `AdConfigPlugin` is ported (needs a Mac).

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
| A2 | 9db026c | `android/app/admob.gradle`: debug = demo units whatever the environment says; release `test`/`production`/`disabled`, production validated (format, demo publisher, one publisher, required IDs) and the build fails on anything else, naming variables only. Signing: incomplete secrets or an unsigned/unversioned production build fail `preReleaseBuild`. `AdConfigPlugin` hands the values to JS; `admob/config.ts` re-checks them (debuggable + production → off; test + real units → off). The web bundle carries no ad IDs (`bundle:check`). iOS: ads off until the plugin is ported. Verified: Gradle checks with good/partial/mixed/demo configs, debug APK resources (demo IDs, mode test), Android-shell e2e for TEST/PRODUCTION/debug-safety. |
| A4a | 169d54d | Providers report `earned` / `skipped` / `failed` (interstitials: shown or not). The manager records cooldown + quiet time only for ads that started, and the interstitial budget only for shown ones; its give-up timer is cleared, waits while an ad is on screen, and cancels the provider. 9 manager tests. |
| A3 | 3ece5c6 | `AdMobController` behind an injectable bridge: UMP update every launch, form when required, then only `canRequestAds()` (also after a failed update or form; unreadable → off). No SDK start or ad request before it; resume retries a *failed* update once a minute (a dismissed form waits for the next launch); privacy options drop old ads and re-apply the decision at once. Reward sessions end exactly once; only the reward event earns; stray/late/foreign events are ignored. PG content cap, unspecified child tags, test devices from the build. 38 controller tests (mutation-checked), 13 Android-shell e2e (offline first launch, stored consent offline, form order, form failure, withdrawal in Settings). |
| A4 | 4aa5aef | Offers ask for the ad of *their* placement (`ads.ready(p)`), so per-group units can never show an offer whose unit is not loaded. Short failure texts (EN/DE): "Ad not available yet — try again later." / "Ad not available — nothing was used." / "Ad closed early — no reward." DevStub `?ads=showfail` (ready, never starts) + e2e: a failed free-upgrade ad keeps the offer, its cooldown and the quiet time. Android-shell matrix through the real bridge and game flow: reward→dismiss, dismiss→late reward, reward twice (exactly +180 s), closed without reward, failed-to-show with stray events. |
| A5 | 67ac258 | Workflows: `android.yml` (every push) = **debug** (built with production-looking AdMob env it must ignore, then audited as demo-only) + **release test** (8 broken configurations must be refused by the guards themselves; throwaway key made in the job; AAB + APK + universal APK audited; key deleted). `android-release.yml` = manual only, `environment: production`, secrets checked by name, versionCode from semver and higher than every `play-*` tag, unit tests, signed AAB with live units, audit with `--no-test-devices` (unless the dispatcher opts in), tag pushed. `scripts/audit-android.ts` reads the artifact (aapt2, apksigner, jarsigner/keytool): package, SDKs, version, debuggable, AdMob mode/IDs/publisher/placeholders, manifest wiring, Capacitor config (dev server, WebView debugging, mixed content), ad IDs or debug-only code in the web bundle, signer (not debug, not the throwaway key). `scripts/workflows.test.ts`: secrets only as step env, no tracing, no push workflow with secrets or production mode, production manual + protected. Placeholder publishers (all-same digits, 1234567890123456) refused by Gradle, JS and audit. Local proof: release-test AAB/APK audited; a production build with fake IDs and a local test upload key audited **PASSED**; the same with the throwaway key fails. CI: Android + CI green on 67ac258. |
| A5b | eb3fafa | `scripts/admob-matrix.ts` (22 Gradle cases: debug × ADMOB_REAL false/true/real IDs → demo; release test/disabled/production carry exactly their config; 13 broken configs refused by a guard) replaces the shell loop in CI. Release workflow: *Register test devices* requires the secret and also uploads the universal APK. |
| — | 0add139 | Perf overlay text is a pure `perfText()`; a test pins it to local performance fields and forbids imports from ads/consent/storage/settings. |
| A6 | 0edbba5 | `docs/ADMOB_TESTING.md`, `PLAY_CONSOLE_CHECKLIST.md`, `RELEASE_CHECKLIST.md`, `DATA_SAFETY_INVENTORY.md`; `deploy/app-ads.txt.example` + `scripts/check-app-ads.ts` (file or `--url`; refuses REPLACE_ME, demo/placeholder publishers, malformed lines, wrong TAG ID; never prints the publisher) + tests; `deploy/website/` (product page, support, layout for butterweich.media); privacy policy rewritten against the real behaviour (interstitials, no banners, nothing requested before consent, ad ID + app set ID, local ad counters, Android backup, permissions, no analytics); Pages refuses to publish placeholders; bundles must not contain REPLACE_ME; `PRIVACY_URL` in one place. |
| A7 | 4335f92 | Music source abstraction (`src/platform/audio/music.ts`): PROCEDURAL (default, unchanged) / TRACK (one file looped) / PLAYLIST (in order, looping, optional track per biome family). `FileMusic` streams files from `public/music/` through the music bus: crossfade on biome change and playlist advance, paused with ads, background and the music setting, `setMusicVolume`, falls back to procedural when a file fails. Loaded by dynamic import only when chosen: initial JS +1 KB gz, FileMusic a 2 KB chunk; no audio files added. Tests: plan/parse unit tests; e2e with WAVs generated in the test (order, wrap, ad pause/resume, background, setting, crossfade, fallback). |
| A8 | 0dca58b | Gold verification found a **real double reward**: in the offline dialog, Collect tapped before the ×3 ad covers the screen paid ×1 at once and ×3 after (×4; reproduced on the old code: 72 000 instead of 54 000). Reward dialogs now run one action at a time (`dom.exclusive`) and the offline payout is idempotent. New: double-tap e2e, process death during an ad (Android shell), secret-leakage audit of all tracked files. |
| A8 | 7ab48ba | A consent update that hangs counts as failed after 15 s (stored decision, retried on resume); an SDK start that never answers lets loads go ahead after 10 s. |
