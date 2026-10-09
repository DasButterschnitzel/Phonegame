# AdMob: build modes and safe testing

Crop Crawler earns its money with AdMob, and AdMob suspends accounts for **invalid traffic** — including the
developer's own taps on live ads. This page says which build is safe for what, and how to test the real configuration
without generating invalid traffic.

## The four builds

| Build | Where it comes from | Ad IDs | Signed with | Tapping ads |
|---|---|---|---|---|
| **Debug** | `npm run android:debug`, CI job *Android debug* | always Google's demo units (`ADMOB MODE: TEST`) — `ADMOB_MODE`, `ADMOB_REAL` and real IDs in the environment are ignored | debug key | **safe** — tap, watch, close, anything |
| **Release test (demo units)** | CI job *Android release test* (every push), or a local `assembleRelease` with `ADMOB_MODE=test` (the default) | Google's demo units (`ADMOB MODE: TEST`) | a throwaway key made in the CI job | **safe** |
| **Release test (real units, test device)** | *Android production release* workflow with **Register test devices** ticked | your real app ID and units (`ADMOB MODE: PRODUCTION`) + the devices in `ADMOB_TEST_DEVICE_IDS` | upload key | **safe only on a registered device**, and only while its ads carry the **"Test Ad"** label |
| **Production** | *Android production release* workflow (default) | your real app ID and units, no test devices | upload key (Play re-signs) | **never** tap your own ads |

Where the mode comes from: `android/app/admob.gradle` (per build type) → the native `AdConfigPlugin` → the web layer,
which re-checks it (`src/platform/ads/admob/config.ts`). The web bundle itself carries no ad IDs, so it cannot leak a
mode from one build into another. Each launch logs exactly one of:

```
ADMOB MODE: TEST
ADMOB MODE: PRODUCTION
ADMOB MODE: DISABLED (reason)
```

Gradle prints the same line for the build (`> Task :app:checkAdMobDebug` / `checkAdMobRelease`); on a phone:
`adb logcat | grep "ADMOB MODE"`. Logs name variables, never their values.

## Release configuration

| Variable | Needed for | Notes |
|---|---|---|
| `ADMOB_MODE` | release | `test` (default) · `production` · `disabled` |
| `ADMOB_REAL` | release, optional | `true` means `production`; contradicting `ADMOB_MODE` fails the build |
| `ADMOB_APP_ID_ANDROID` | production | `ca-app-pub-<16 digits>~<10 digits>` |
| `ADMOB_ANDROID_REWARDED` | production | `ca-app-pub-<16 digits>/<10 digits>` — used by every rewarded placement unless a group has its own |
| `ADMOB_ANDROID_INTERSTITIAL` | production | as above |
| `ADMOB_ANDROID_REWARDED_BOOST` / `_UPGRADE` / `_BONUS` | optional | separate rewarded units per placement group (boost: income ×2, autopilot · upgrade: free upgrade, free tornado · bonus: offline ×3, lucky bug ×3, farm complete ×2, daily ×2) — for separate AdMob reporting |
| `ADMOB_TEST_DEVICE_IDS` | optional | comma-separated hashed device IDs (see below) |
| `ADMOB_UMP_DEBUG_GEOGRAPHY` | debug builds only | `eea` or `not_eea`: simulate a region for the consent form |

A production build **fails** (`checkAdMobRelease`, before anything compiles) when an ID is missing, malformed, one of
Google's demo IDs, a placeholder (all one digit, `1234567890123456`), or when the app ID and the units belong to
different publishers. Nothing falls back to demo IDs. The workflow then audits the finished bundle again
(`scripts/audit-android.ts`). In CI the IDs live as secrets of the `production` environment, never in the repository.

## Test devices (real units without invalid traffic)

Google's guidance: develop with demo units; to check the real configuration, use **registered test devices** — they
receive test ads from your real units, and taps on them are not counted.

1. Install any build on the phone and run it once with a USB cable: `adb logcat | grep -i "setTestDeviceIds"`. The
   Google Mobile Ads SDK prints the device's **hashed** ID, e.g.
   `…setTestDeviceIds(Arrays.asList("33BE2250B43518CCDA7DE426D04EE231"))` (that one is Google's documentation example).
2. Either add it in the AdMob web UI (**Settings → Test devices**, no build needed; can take a while to apply), or put
   it into the secret `ADMOB_TEST_DEVICE_IDS` of the `production` environment and run the release workflow with
   **Register test devices**. That build also uploads a universal APK to install on the phone.
3. Every ad on that phone must show the **"Test Ad"** label. If one does not: stop, do not tap it, check the device ID.

Rules: never commit a device ID (the repository and the logs only ever see a count); never ship a build with
registered test devices to the public track — the workflow's audit refuses that unless the box was ticked; never ask
friends or testers to tap ads.

## Consent (UMP) — what to expect

Every launch asks Google's User Messaging Platform for a fresh decision, shows the form when it is required, and then
**only `canRequestAds()` decides** — also when the update failed. Until then nothing initializes the ad SDK or
requests an ad. Gameplay never waits for any of it.

| Situation | Expected |
|---|---|
| consent not required (outside the EEA/UK/CH) | ads load right after the update |
| consent required, player answers | the form shows first; any answer lets UMP allow ads (non-personalised if declined) |
| form fails to load (network) | no ads; the update is retried on resume, at most once a minute |
| form dismissed without an answer | no ads until the next launch (no nagging on every resume) |
| first launch offline | no decision stored → no ads, game runs normally, retried on resume |
| update hangs (captive portal, dead network) | counted as failed after 15 s: the stored decision applies, retried on resume |
| offline with an earlier decision | UMP's stored decision applies: ads if it allowed them |
| player changes privacy options (Settings → Privacy options, shown when UMP requires it) | ads loaded under the old choice are dropped; the new decision applies at once, no restart |

Testing the form outside the EEA: in a **debug** build set `ADMOB_UMP_DEBUG_GEOGRAPHY=eea` and register the device as
a test device (UMP's debug region only applies to test devices; emulators are test devices automatically). To start
over: Android Settings → Apps → Crop Crawler → Storage → **Clear storage** (this also deletes the save).

## Rewards and failures

- A reward is granted only after the SDK's reward event, exactly once per ad: not on load, show, impression, click,
  close without reward, failure, timeout, backgrounding or a restart.
- An ad that never started costs nothing: no coins, no free charge, no cooldown, no quiet time; the player sees
  "Ad not available — nothing was used. Try again later."
- Closed early: "Ad closed early — no reward." (the ad did start, so the placement's cooldown applies).
- Interstitials stay rare (`src/platform/ads/AdPolicy.ts`): 5 minutes of first play, 2 minutes into a session, 8
  minutes apart, 5 minutes after a rewarded ad, never in the tutorial, while steering or right after a big moment,
  at most 4 an hour. No banners, no app-open ads. Only an interstitial that was actually shown uses the budget.

## Who the ads are for

`src/platform/ads/admob/config.ts` → `AUDIENCE`:
- **Max ad content rating: PG** (`ParentalGuidance`) — a brand choice for a cartoon game with a 13+ audience.
- **Child-directed / under-age-of-consent tags: unspecified.** The app is not directed at children and asks no ages.

These follow the Play Console target audience; they do not replace it. If the declared audience ever includes children,
the Families policy applies (certified ad SDK configuration, child-directed treatment, content limits) — that is a
product decision, not a flag flip. See `docs/PLAY_CONSOLE_CHECKLIST.md`.

## Automated checks

| What | Where |
|---|---|
| debug/release/production ID resolution, placeholders, mixed publishers, log lines | `src/platform/ads/admob/config.test.ts` |
| consent order, offline/failure paths, privacy options, hostile reward orders, timeouts | `src/platform/ads/admob/AdMobController.test.ts` |
| only started ads cost cooldown / quiet time / budget | `src/platform/ads/AdManager.test.ts` |
| the real bridge + game flow in a simulated Android shell (modes, consent, reward orders) | `e2e/android.spec.ts` |
| Gradle: debug ignores production settings; broken release configs refused | CI job *Android release test* + `scripts/admob-matrix.ts` |
| the built APK/AAB: mode, IDs, signer, WebView flags, debug code | `scripts/audit-android.ts` (+ `.test.ts`) |
| workflows: secrets only as step env, no push builds production | `scripts/workflows.test.ts` |
