# Play Console checklist (owner)

Everything Google Play asks before Crop Crawler can go public, with the answer the app supports and where the evidence
is. The declarations are made by the owner in Play Console — **nothing here is submitted automatically**, and none of
it is "approved" until Google says so. Items marked **HUMAN-ONLY** cannot be done from the repository.

App: **Crop Crawler** · package `com.butterweichmedia.cropcrawler` · free, ads, no in-app purchases · EN/DE.

## Store listing

- [ ] **HUMAN-ONLY** Create the app in Play Console (default language English, German translation).
- [ ] Texts and graphics: `STORE.md` and `deploy/website/crop-crawler.md` (short/full description EN/DE), icon and
      feature graphic in `store/`, screenshots from a device or `e2e-screens/`.
- [ ] **Developer website: `https://butterweich.media`** — exactly this host. AdMob reads it from the store listing to
      find `https://butterweich.media/app-ads.txt` (see *app-ads.txt* below).
- [ ] Contact e-mail (shown publicly) and, for a German publisher, the legal notice (Impressum) on the website.

## Contains ads

- [ ] **App content → Ads: "Yes, my app contains ads."** Google AdMob: rewarded ads (opt-in) and occasional
      interstitials at natural breaks; no banners, no app-open ads (`docs/ADMOB_TESTING.md`).

## Target audience and content

- [ ] **Target age groups: 13–15, 16–17, 18+.** Crop Crawler is a general-audience casual game, not designed for
      children. Do **not** select an under-13 group unless the game is really meant for children: that puts it in the
      Families program (Families policy, Families-certified ad configuration, child-directed ad treatment, content
      limits) — a product decision, not a checkbox.
- [ ] *"Could the app unintentionally appeal to children?"* Answer honestly. The ad configuration follows this
      declaration, never the other way round: `src/platform/ads/admob/config.ts` → `AUDIENCE` keeps the
      child-directed tags **unspecified** for a 13+ audience and caps ads at **PG**. If Play decides the app appeals to
      children, revisit `AUDIENCE` (and the Families policy) with that decision — never use an SDK flag to get around
      it.
- [ ] Store art and copy stay aimed at a general audience (cartoon style alone does not make an app child-directed).

## Data safety

- [ ] Fill in the form from `docs/DATA_SAFETY_INVENTORY.md` and Google's current
      [Google Mobile Ads SDK data disclosure](https://developers.google.com/admob/android/privacy/play-data-disclosure).
      Short version: data is collected/shared only through the ads SDK (approximate location, app interactions,
      diagnostics, device or other IDs; advertising, analytics, fraud prevention), encrypted in transit; game progress
      stays on the device.

## Advertising ID

- [ ] **App content → Advertising ID: "Yes"** — used for advertising (and the SDK's analytics and fraud prevention).
      The release manifest declares `com.google.android.gms.permission.AD_ID` (merged from the ads SDK; the audit
      prints it).

## Privacy policy

- [ ] Fill in every `[placeholder]` in `public/privacy.html` (publisher, address, e-mail, date, Impressum). Until then
      the Pages workflow refuses to publish it.
- [ ] **HUMAN-ONLY** Publish it at its final URL (GitHub Pages, or `https://butterweich.media/…` from
      `deploy/website/`) and use the **same URL** in Play Console and in the app (`src/platform/legal.ts` →
      `PRIVACY_URL`; change it there if it moves).

## Content rating (IARC questionnaire)

- [ ] Category: **Game**. Expected answers (verify each question): no violence (crops are "munched" by a robot
      caterpillar), no fear, no sexual content, no profanity, no drugs/alcohol/tobacco, no gambling or simulated
      gambling, no user-to-user communication, no user-generated content, no location sharing, no digital purchases.
      Ratings are issued by IARC per region; do not promise a rating before they do.

## Other App content declarations

- [ ] Government app: no · Financial features: none · Health: none · News: no · COVID-19: no.
- [ ] Foreground services / special permissions: the app requests none itself (WorkManager inside the ads SDK only).

## Testing tracks

1. **Internal testing** — upload the AAB from the *Android production release* workflow; up to 100 testers, available
   within minutes; the **pre-launch report** runs automatically on Google's devices: check crashes, ANRs,
   accessibility and the screenshots.
2. **Closed testing** — required first for some accounts (below). Testers join via an opt-in link.
3. **Production** — staged rollout (e.g. 10 % → 50 % → 100 %) while watching crashes/ANRs in Android vitals.

## Production access (closed test requirement)

For **personal developer accounts created after 13 November 2023**, Google currently requires a **closed test with at
least 12 testers who have been opted in continuously for at least the last 14 days** before you can apply for
production access. This does **not** apply to every account (organisation accounts, older personal accounts).
**HUMAN-ONLY:** check the account type and creation date in Play Console (it shows the requirement on the dashboard if
it applies), recruit the testers, keep them opted in, then apply for production access and answer Google's questions
about the test.

## app-ads.txt

- [ ] **HUMAN-ONLY** Take the publisher ID from AdMob (Settings → Account information), fill it into
      `deploy/app-ads.txt.example`, save as `app-ads.txt` at the root of the developer website:
      `https://butterweich.media/app-ads.txt` (Google requires the root of the developer-website host).
- [ ] Check it: `node scripts/check-app-ads.ts --url https://butterweich.media/app-ads.txt` (refuses the template,
      demo/placeholder IDs and malformed lines; add `--publisher pub-…` to confirm it is yours).
- [ ] In AdMob → Apps → app-ads.txt, wait for "verified" (the crawler can take a day or more).

## After launch

- [ ] Android vitals: crash rate and ANR rate below Google's bad-behaviour thresholds.
- [ ] AdMob: Policy center, invalid-traffic notices, app-ads.txt status, privacy message status.
- [ ] Re-check this list whenever ads, SDKs, permissions or the audience change.
