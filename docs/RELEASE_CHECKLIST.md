# Release checklist

From "the code is ready" to "Crop Crawler is on Google Play". **HUMAN-ONLY** marks what only the owner can do — the
repository and its workflows cannot create accounts, accept agreements or make declarations. Nothing is "live" or
"approved" until AdMob and Google Play say so.

## HUMAN-ONLY tasks (cannot be automated)

1. Create the **AdMob account**.
2. Enter **tax and payment** information (AdMob, and Play Console if needed).
3. Create the **Google Play developer account** (and verify identity).
4. Accept the **Google agreements** (AdMob terms, Play developer distribution agreement).
5. Create and **publish the privacy message** in AdMob → Privacy & messaging (GDPR; and US state regulations if
   wanted).
6. Obtain the **publisher ID** (AdMob → Settings → Account information).
7. Create the **production ad units** (one rewarded, one interstitial; optionally rewarded units per placement group).
8. Complete the final **Play Console declarations** (`docs/PLAY_CONSOLE_CHECKLIST.md`).
9. **Recruit testers** for the closed test, where the account needs one.
10. **Request production access** and roll out.

## Store artifact checklist

### AdMob
- [ ] **AdMob account** — HUMAN-ONLY (1–2, 4, 6 above).
- [ ] **App created in AdMob** — Android app `com.butterweichmedia.cropcrawler`; its app ID (`ca-app-pub-…~…`) is the
      secret `ADMOB_APP_ID_ANDROID`. Link it to the Play listing once the app is published.
- [ ] **Rewarded unit** → secret `ADMOB_ANDROID_REWARDED` (optional per-group units: `ADMOB_ANDROID_REWARDED_BOOST`,
      `_UPGRADE`, `_BONUS` — see `docs/ADMOB_TESTING.md`).
- [ ] **Interstitial unit** → secret `ADMOB_ANDROID_INTERSTITIAL`.
- [ ] **UMP privacy message published** — HUMAN-ONLY (5). Without a published GDPR message, users in the EEA/UK/CH
      cannot consent and the app (correctly) requests no ads there.

### Play Console
- [ ] **Play Console app** created — HUMAN-ONLY (3).
- [ ] **Developer website** = `https://butterweich.media`.
- [ ] **Privacy policy** — placeholders in `public/privacy.html` filled in, published, same URL in Play Console and
      `src/platform/legal.ts`.
- [ ] **app-ads.txt** live at `https://butterweich.media/app-ads.txt` and checked with
      `node scripts/check-app-ads.ts --url https://butterweich.media/app-ads.txt` (template: `deploy/app-ads.txt.example`;
      never upload it with `REPLACE_ME`).
- [ ] **Data Safety** form — from `docs/DATA_SAFETY_INVENTORY.md`.
- [ ] **Contains ads** declaration — Yes.
- [ ] **Content rating** questionnaire — done; certificate received.
- [ ] **Target audience** — 13–15, 16–17, 18+ (not for children) unless the owner decides otherwise.
- [ ] **Closed test if applicable** — personal accounts created after 13 Nov 2023: ≥ 12 testers opted in for ≥ 14 days
      (check the account in Play Console).

### Build and test
- [ ] **Test device** — the owner's phone registered (AdMob UI → Settings → Test devices, or the secret
      `ADMOB_TEST_DEVICE_IDS`); a *release test (real units, test device)* build shows only ads labelled "Test Ad".
- [ ] **Release signing** — upload key created and backed up (below); secrets set in the `production` environment.
- [ ] **AAB upload** — the audited bundle from the *Android production release* workflow, to internal testing first.
- [ ] **Pre-launch report** — no crashes, no ANRs, consent form and ads behave on Google's test devices.
- [ ] **Crash/ANR review** — Android vitals and the internal/closed testers' reports before every promotion.
- [ ] **Production access** — HUMAN-ONLY (10), then a staged rollout.

## One-time setup

### Upload key (never commit it, never send it anywhere)

```bash
keytool -genkeypair -v -keystore upload.jks -storetype PKCS12 -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Butterweich Media"
base64 -w0 upload.jks > upload.jks.base64        # macOS: base64 -i upload.jks -o upload.jks.base64
```

Keep `upload.jks` and its password in a password manager plus an offline backup. With **Play App Signing** (default
for new apps) Google holds the app signing key; a lost upload key can be reset through Play Console support, a leaked
one must be reset at once. Delete `upload.jks.base64` after pasting it.

### GitHub (repository → Settings)

1. **Environments → New environment `production`** → *Required reviewers*: yourself (every production build then waits
   for an explicit approval) and *Deployment branches*: the release branch only.
2. Add these **environment secrets** to `production` (not repository secrets; never as variables, they are printed):

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | contents of `upload.jks.base64` |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | `upload` (or your alias) |
| `ANDROID_KEY_PASSWORD` | key password (PKCS12: same as the keystore password) |
| `ADMOB_APP_ID_ANDROID` | `ca-app-pub-…~…` |
| `ADMOB_ANDROID_REWARDED` | `ca-app-pub-…/…` |
| `ADMOB_ANDROID_INTERSTITIAL` | `ca-app-pub-…/…` |
| `ADMOB_ANDROID_REWARDED_BOOST` / `_UPGRADE` / `_BONUS` | optional |
| `ADMOB_TEST_DEVICE_IDS` | optional, comma-separated hashed IDs — only used when a run ticks *Register test devices* |

The workflow checks that every required secret is present (printing names only), fails if signing is incomplete and
never echoes a value. No push workflow can read these secrets.

## Every release

1. **Version.** Bump `version` in `package.json` (semantic: `MAJOR.MINOR.PATCH`). The versionCode is derived:
   `major·1 000 000 + minor·10 000 + patch·100 + build` (`npm run version:code`; `0.1.0` → `10000`). Each production
   build is tagged `play-<versionCode>`, and the workflow refuses a code that is not higher than every tag — Play would
   reject it anyway. To re-upload the same version (a rejected upload), run with *build* = 1, 2, … instead.
2. **Green main line.** CI (typecheck, unit tests, e2e, balance, sessions) and *Android* (debug + release test) green on
   the commit you release.
3. **Run Actions → *Android production release* → Run workflow** on that branch; approve the `production` environment.
   It: checks the secrets → derives and checks the versionCode → runs the unit tests → builds the web assets → builds
   the signed AAB with `ADMOB_MODE=production` → deletes the key → audits the bundle (package, target SDK, version,
   not debuggable, production IDs from one publisher, no demo or placeholder IDs, no test devices, no debug code, no
   WebView debugging, signed with the upload key) → uploads the AAB → tags `play-<versionCode>`.
4. **Download the AAB** artifact and upload it in Play Console → *Internal testing*. Read the pre-launch report.
5. On a registered test device: install from the internal track, accept/decline consent, watch a rewarded ad (labelled
   "Test Ad"), check the reward, check *Settings → Privacy options*. Never tap untagged live ads.
6. Promote: closed testing (if required) → production with a staged rollout; watch Android vitals and AdMob.

### Release test with real units (optional)

Same workflow with **Register test devices** ticked: the bundle and a universal APK carry the production units *and*
the devices from `ADMOB_TEST_DEVICE_IDS`. Install the APK on those devices only; do not promote that bundle to the
public track (its artifacts are named `…TEST-DEVICES-internal-only…`).

## Rollback

- A bad production build: halt the staged rollout in Play Console; fix; bump the version; release again.
- A leaked secret: rotate it (AdMob units can be replaced; request an upload-key reset in Play Console), update the
  environment secret, release again.
