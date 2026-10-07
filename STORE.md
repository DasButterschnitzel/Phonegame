# Store listing & release checklist

## Google Play listing

**App name:** Crop Crawler
**Category:** Casual · **Tags:** idle, merge, farming
**Contains ads:** Yes · **In-app purchases:** No

### Short description (≤ 80 chars)
- EN: Hold to crawl, munch crops and merge your robot caterpillar!
- DE: Halten zum Krabbeln, Ernte mampfen und deine Roboter-Raupe fusionieren!

### Full description
**EN**
Hold your finger down and watch your robot caterpillar chomp through the fields! Every segment munches the crops
beside its route and piles the harvest on its back — roll through the depot to cash in. Every plot you clear turns into
meadow and your route grows into it, until the whole farm is yours.
• Satisfying one-finger gameplay — hold to crawl, let go to relax
• Clear the land and watch your route grow across the farm
• Merge segments and discover new levels
• Upgrade speed and baskets, open fences to richer fields
• 5 farms: Sunny Meadow, Pumpkin Patch, Sunflower Hills, Snowy Berry Farm and Cactus Ranch
• Finished farms keep earning — even while you're away
• Tornadoes, golden crops, lucky ladybugs and daily rewards
Free to play. Optional ads give bonuses.

**DE**
Halte den Finger gedrückt und sieh zu, wie deine Roboter-Raupe sich durch die Felder mampft! Jedes Segment frisst die
Pflanzen an seiner Route und stapelt die Ernte auf dem Rücken – fahr durchs Depot und kassiere ab. Jede geräumte
Parzelle wird zur Wiese und deine Route wächst hinein, bis der ganze Hof dir gehört.
• Entspanntes Ein-Finger-Gameplay – halten zum Krabbeln, loslassen zum Entspannen
• Räume das Land und sieh zu, wie deine Route über den Hof wächst
• Segmente fusionieren und neue Stufen entdecken
• Tempo und Körbe verbessern, Zäune zu reicheren Feldern öffnen
• 5 Höfe: Sonnenwiese, Kürbisfeld, Sonnenblumenhügel, Schneebeerenhof und Kaktusranch
• Abgeschlossene Höfe verdienen weiter – auch wenn du nicht spielst
• Tornados, goldene Pflanzen, Glücks-Marienkäfer und tägliche Belohnungen
Kostenlos spielbar. Optionale Werbung gibt Boni.

### Graphics
- App icon 512×512: `store/icon-512.png` · Feature graphic 1024×500: `store/feature-1024x500.png`
- Phone screenshots: run `npm run e2e` and pick from `e2e-screens/` (or capture on a device).

## Play Console answers (draft — verify before submitting)
- **Target audience:** 13–15, 16–17, 18+ (not designed for children). Keep store art and copy aimed at a general
  audience. If Google flags "may unintentionally appeal to children", answer honestly; fallback is a neutral age gate
  + `tagForChildDirectedTreatment` for under-13 users.
- **Ads:** contains ads (AdMob). Interstitials only at natural breaks; rewarded ads are opt-in.
- **Data safety:** device or other IDs (advertising ID) and app interactions/diagnostics are **collected and shared**
  with Google AdMob for advertising/analytics and fraud prevention; data is encrypted in transit; game progress stays
  on the device; users can delete it via Settings → Reset progress or uninstall.
- **Content rating (IARC):** cartoon violence: none (crops are "chomped"); no user interaction, no gambling,
  no location sharing. Expected PEGI 3 / USK 0.
- **Privacy policy URL:** `https://dasbutterschnitzel.github.io/Phonegame/privacy.html` (after enabling Pages) —
  fill in the placeholders in `public/privacy.html` first.
- **Impressum:** required for a German publisher (§ 5 DDG) — add it to the website / store listing.

## AdMob setup
1. Create the Android (and iOS) app in AdMob, plus one **rewarded** and one **interstitial** ad unit per platform.
2. Privacy & messaging → create a **GDPR** message (and US state regulations message); for iOS also the IDFA explainer.
3. Put the IDs into GitHub repo variables (`ADMOB_REAL=true`, `ADMOB_APP_ID_ANDROID`, `ADMOB_ANDROID_REWARDED`,
   `ADMOB_ANDROID_INTERSTITIAL`) or the matching local env vars (see `.env.example`).
4. `app-ads.txt` must be served from the root of the developer website domain listed in Play (needs your own domain).

## Release checklist
- [ ] Fill in `public/privacy.html` placeholders, publish via GitHub Pages
- [ ] Real AdMob IDs configured; test on a real device with test devices registered
- [ ] Upload keystore secrets; tag `v0.1.0` → signed AAB artifact
- [ ] Internal testing track → closed testing (Google requires 12 testers for 14 days for new personal accounts)
- [ ] Check performance on a mid-range phone (Graphics: Auto picks Low/Medium; dynamic resolution is on)
