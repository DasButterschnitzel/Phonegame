# Data safety inventory (Android app)

Preparation for the **Data safety** form and the privacy policy — *not legal advice*. The human owner fills in the
Play Console form (HUMAN-ONLY); for the Google SDK rows, Google's own disclosure pages are the authority and change
over time: [Google Mobile Ads SDK — Play data disclosure](https://developers.google.com/admob/android/privacy/play-data-disclosure).

Checked against build `0.1.0` (Capacitor 8, play-services-ads 25.4.0, UMP 4.0.0) by reading the merged manifest of the
release bundle (`aapt2 dump permissions` / `xmltree`) and the source. The app itself has **no accounts, no analytics,
no crash reporting, no in-app purchases and no server**; its only network traffic is the Google Mobile Ads SDK and the
consent SDK (plus the privacy-policy link, which opens the browser).

## Per SDK / plugin

| Component | Purpose | Data it may process | Leaves the device? | Optional for the player? | Ad-related? |
|---|---|---|---|---|---|
| **Google Mobile Ads SDK** (`play-services-ads` via `@capacitor-community/admob` 8.2.1) | rewarded and interstitial ads | advertising ID, app set ID; IP address → approximate location; device and app info; ad interactions (views, taps, app launches); diagnostics (crash and performance data of the SDK) | **yes, to Google**, encrypted in transit | Rewarded ads are opt-in; interstitials are not. The SDK starts only after UMP allows ad requests; personalisation only with consent; the advertising ID can be reset/deleted in Android settings | yes |
| **Google User Messaging Platform** (UMP 4.0.0) | consent message (GDPR, where required) | consent choices (TCF string, stored on the device); IP address and device info to decide the region and show the form | **yes, to Google** | the form appears only where required; the choice can be changed in Settings → Privacy options | yes (ad consent) |
| `AdConfigPlugin` (this app) | hands the build's ad configuration and UMP's stored decision to the game | reads local resources and UMP's local state; collects nothing | no | — | yes (configuration) |
| `@capacitor/preferences` | the save | game progress, settings, ad-pacing counters (play time, times of recent interstitials) | only inside the player's own Android backup, if enabled (`allowBackup="true"`); never to us | delete via Settings → Reset progress or uninstall | the counters only space out ads |
| Capacitor core (bridge, SystemBars), `@capacitor/app`, `@capacitor/splash-screen` | run the web game, lifecycle, back button, full screen | nothing | no | — | no |
| `@capacitor/haptics` | vibration | nothing | no | Settings → Haptics | no |
| three.js, the Fredoka font, procedural audio | rendering, text, sound — all bundled | nothing; no network requests | no | — | no |
| Android System WebView | runs the game | the WebView's own crash/usage reporting follows the user's system settings, not this app | Google's, outside the app | — | no |

### Permissions in the release manifest

| Permission | From | Why |
|---|---|---|
| `INTERNET`, `ACCESS_NETWORK_STATE` | app / ads SDK | ads and consent |
| `VIBRATE` | `@capacitor/haptics` | haptic feedback (can be switched off) |
| `com.google.android.gms.permission.AD_ID` | ads SDK (merged) | advertising ID — answer **Yes** in the Advertising ID declaration |
| `ACCESS_ADSERVICES_AD_ID`, `_ATTRIBUTION`, `_TOPICS` | ads SDK (merged) | Android Privacy Sandbox ad APIs |
| `WAKE_LOCK`, `FOREGROUND_SERVICE` | ads SDK → WorkManager (merged) | the SDK's background work; the app starts no foreground service and declares no foreground-service type |

No location, contacts, camera, microphone, storage, phone or notification permissions.

## Draft answers for the Data safety form (owner verifies against Google's current SDK pages)

- **Does your app collect or share any of the required user data types?** Yes — through the Google Mobile Ads SDK.
- **Data types** (as listed for the Google Mobile Ads SDK; mark *collected* and/or *shared* exactly as Google's
  disclosure page says for the current SDK version):
  - Location → **Approximate location** (derived from the IP address)
  - App activity → **App interactions**
  - App info and performance → **Crash logs**, **Diagnostics**, **Other app performance data**
  - Device or other IDs → **Device or other IDs** (advertising ID, app set ID)
- **Purposes:** Advertising or marketing; Analytics (ad measurement); Fraud prevention, security, and compliance.
- **Is the data processed ephemerally?** Per Google's disclosure page.
- **Is collection required or optional?** Ads cannot be switched off in a free ad-financed app; personalisation is
  optional through consent (where required) and the advertising-ID settings.
- **Encrypted in transit?** Yes (the SDK uses HTTPS).
- **Deletion requests:** the app holds no personal data on any server; local data is deleted with Reset progress or
  by uninstalling. For ad data, point to Google's controls (the owner decides how to answer this question).
- **Game progress:** not collected — it never leaves the device except in the player's own backup.

## Keep in sync

- `public/privacy.html` (the policy) describes exactly this inventory.
- Re-check after changing SDK versions (`android/variables.gradle`), adding a plugin, analytics or crash reporting,
  or another ad network (mediation adapters bring their own disclosures).
