# Gold status — Crop Crawler 05 (Endless World Tour)

**STATUS: BRONZE** — the endless World Tour is complete in the build (generated farms, 18 biome families with music and ambience, a tuned endless economy, the journey map, arrival and completion context), but the OVERDRIVE indicator (open P1) and the Gold gates (screenshot matrix review, long sessions, low-quality review, CI/Android, scorecard) are not done. Updated after every loop.

## Loop log
| Loop | Commit | What changed | Status after |
|---|---|---|---|
| W0 | 0174072 | Audit of finite assumptions, architecture (`docs/WORLD_TOUR.md`), this document | RED |
| W1 | dbf4e6c | Endless core: farm keys ≠ biomes, blueprints, journey, World Tour scheduler + first generator, forward travel with Tour recalibration, save v3 + migration, debug hooks | BRONZE |
| W2 | 83cab8a · 769099a · 5eab0df | Organic generated outlines; 1,000-seed stress test with real-sim play-outs; 500-farm journey bench; crop size classes (trees 2×2, giants 1×1, same economy per plot); data-driven biome looks (trees, props, landmarks, rocks, barn skins, weather); 3 new families (Zambezi Orchard, Jade Rice Terraces, Tuscan Vineyard); starter families gain a signature each; duplication detector; screenshot matrix | BRONZE |
| W3 | 1234168 | Endless economy: 100-farm bot report (`npm run endless`, 6 profiles); fixed Tour-start bank flood, lost passive income, cost drift, river-bend lobe; size classes get depth (tougher crops); quick farms avoid cross-cutting layouts | BRONZE |
| W5a | 9639a6d | Biome library batch A: Tropical Plantation, Christmas Tree Farm, Sakura Tea Garden, Andean Terraces, Nordic Berry (20 crops incl. huge grand firs, 9 trees, 11 props, 5 landmarks, 4 rock styles, butterflies + petals); per-prop scale | BRONZE |
| W5b | d0a5180 | Biome library batch B: Lavender Valley, Mushroom Marsh (rare), Volcanic Chili (rare), Giant's Garden (legendary), Lunar Farm (legendary) — 20 crops incl. 3 huge, 8 trees, 11 props, 5 landmarks, bees/fireflies/embers/stardust; lathes auto-orient (inside-out caps fixed) | BRONZE |
| W5c | e5d0f40 · 5f10d92 · 8786eb6 | Music flavour per family through the shared engine (tempo, key, scale, contour, timbre; no imitation of traditional music) + a quiet ambience per family; audio QA measures every tune and ambience; fixed noise bursts cut off by the 0.5 s noise buffer (farm-complete cymbal, zone crash, overheat, route swoosh); big-farm budget e2e waits for a settled frame (+ per-view draw breakdown hook) | BRONZE |
| W4a | 1040384 · f2cbdca | Journey map as a bounded trail (3 behind, here, 5 ahead, finale milestone; COMPLETED/CURRENT/NEXT/FUTURE/TOUR FINALE/NEW BIOME/mystery; Tour pips, Core Rank chip, journey stats + 18 biome stamps; no grey locked rows); farm names never repeat within a family over two Tours | BRONZE |
| W4b | 867a2b9 | Arrival beat: 1.45 s entrance card (Tour · farm n/8, name, family, size, modifier with its effect, finale, NEW BIOME stamp, new Tour), never blocking; arrival chime in the farm's key; the new-farm gift follows the card | BRONZE |
| W4c | 2971182 | Completion context: Tour pips, next destination card, one-tap "Next farm" (map secondary), Core Rank before → after on a Tour's end; Starter Tour transition (fanfare, World Tour explainer, "Start the World Tour"); no interstitial during travel/entrance (e2e fails without the guard) | BRONZE |
| W6 | f7ae4b3 | OVERDRIVE readable: a heat arc above the head (cyan → yellow → orange 60–80 % → red 80–100 % with HOT!), a bolt that dims as the boost fades, shown only while engaged or warm; pops in inside the input event; cyan ring + sparks on activation, cyan sparks while pushing; red shake when the motor is too hot; soft HOT! beeps | BRONZE |
| W7a | (this) | Long sessions measured: `npm run sessions` replays the real interstitial policy over 30 min / 1 h / 2 h sessions (fresh install, Starter farm #3, World Tour start, farm #20) for six profiles — ≤ 4 per rolling hour everywhere, World Tour sessions never above the Starter Tour ones (+1 in 2 h at most); in CI with --assert | BRONZE |

## Gates (✅ met with evidence · ⬜ open · ❌ failing)
### Core
- ✅ first five farms still work — Starter Tour balance identical to goal 04 (ACTIVE_NO_ADS 18:14 / 38:18 / 57:27 / 1:28:38 / 1:51:03), e2e progression + 57 e2e green
- ⬜ current core loop unchanged
- ⬜ Android launches
- ⬜ save/load works
- ⬜ accepted real-phone behaviours preserved (multitouch buying, camera at speed, audio, AdMob test flow, shimmer)

### Endless
- ✅ there is no designed final farm — `world.test.ts`: Cactus Ranch → farm #6 → … → #14 (Tour 2), `next` never null; 100-farm journey test
- ✅ World Tour unlocks after the Starter Tour — `e2e/world.spec.ts` (real UI: five FINISH dialogs, "Starter Tour complete!" with Core Rank 1, map → #6, reload lands on #6); `e2e/journey.spec.ts`: the same through the one-tap "Start the World Tour"
- ✅ farm generation is deterministic — 1,000 plans per seed identical on repeat, unique keys that parse back; 100 blueprints regenerate identically
- ✅ 100+ farms can be simulated — `npm run journey`: 500 farms finished, a next destination always reachable, 500 distinct keys, every scheduled family visited (0 errors)
- ✅ no route softlock — `npm run worldgen`: 8 families × 1,000 farms, 1,600 played out with the real sim (small and large crops), 0 failures, 0 fallbacks · ✅ no economy softlock — `npm run endless`: 6 profiles × 100 farms, every farm finished · ✅ no number overflow — biggest bank ~13T over 100 farms; most valuable possible chunk ~206B (unit test)
- ✅ farm duration controlled — no-ad medians quick 8.7 / standard 17.4 / grand 22.1 min (targets 8–12 / 14–20 / 20–26), farms 20+ p50 16.1 min (`docs/WORLD_TOUR.md`) · ✅ save size bounded — 10 / 50 / 100 / 250 / 500 farms: 2.5 / 2.7 / 2.4 / 2.6 / 2.5 KB, serialize ≤ 0.25 ms, parse ≤ 1.9 ms (`npm run journey`)

### Content
- ✅ ≥ 12 genuinely distinct biome families — 18 (13 listed below + Lavender Valley, Mushroom Marsh, Volcanic Chili, Giant's Garden, Lunar Farm). Earlier count, 13: 5 starter + Zambezi Orchard, Jade Rice Terraces, Tuscan Vineyard, Tropical Plantation, Christmas Tree Farm, Sakura Tea Garden, Andean Terraces, Nordic Berry; duplication detector green (every pair ≥ 3 major differences); screenshot matrix + crop close-ups reviewed per family (`e2e/biomes.spec.ts`); 400 farms × 13 families generated, 1,040 played out, 0 failures
- ✅ different layout archetypes — 16 archetypes, all in use (stress test counts) · ✅ repeat protection — no family twice within 4 farms over 400 farms × 3 seeds (`world.test.ts`) · ✅ anticipation — the map shows the next stops with NEW BIOME tags, new families further ahead as mysteries (with rarity, size and modifier as a teaser) and the Tour finale as a milestone; arrival shows a NEW BIOME stamp (`e2e/journey.spec.ts`, screenshots) · ✅ rare/showcase farms — 2 rare + 2 legendary families (Tour 2+/3+) favoured for Tour finales; huge one-per-plot crops (glowing giant caps, ember peppers, prize pumpkins, grand firs)
- ⬜ good generated names (12 curated per family, EN + DE, never repeated in the lists — test; a family never repeats a name within two Tours — test; review pending) · ⬜ no cultural caricatures (landscape-based names and props; review pending)
- ✅ music flavour per family through the shared engine, quiet ambience — every family has its own tune (unit test: ≥ 2 differences per pair, meadow tune unchanged) and ambience; offline audio QA: tunes within 1.1 dB of the meadow tune, no extra sub-bass, ambience ≥ 12 dB under a bite · ⬜ heard on a phone

### Map
- ✅ map no longer a finite checklist — a journey trail: three farms behind, where you are (cleared %), the next stop (Go, or "Finish this farm first") and four more, the next Tour finale as a milestone ("… 2 more farms"); never a grey locked row (`e2e/journey.spec.ts` asserts none)
- ✅ bounded rendering — at most 3 + 1 + 5 nodes and a milestone; the trail reads the journey's last six stamps and plans ≤ 7 farms (planTour cached) — unit test at farm #4,005 · ✅ current / next / Tour milestone obvious — states, Tour pips (done / here / finale ★), "Farm 4 of 8", Core Rank chip; screenshots EN 412 px and DE 360 px (nothing spills out, asserted) · ✅ Starter Tour transition — its own dialog: Core Rank 1 (+8 % harvest value), a three-line World Tour explainer, the first World farm and one tap "Start the World Tour"; fanfare; no interstitial on the way

### Meta
- ✅ Tour structure — eight farms, a showcase finale, shown as pips on the map and the completion dialog; "World Tour 3 begins!" on arrival · ✅ long-term progression — one permanent stat, Core Rank: on the map ("Core Rank 2 +13 % harvest value") and on a Tour's end ("Core Rank 1 → 2"); measured effect: Tours ~20 % faster by rank 12 (W3) · ✅ simple — no second currency or job; journey stats + 18 biome stamps are a record, not a system · ✅ no currency explosion — biggest bank ~13T over 100 farms, readable bound test (W3) · ⬜ progress matters after farm 50 — Core Rank keeps rising (diminishing); when the stamp collection completes is still to be measured (W7)

### Balance
- ✅ farms 20–100 in the target duration band — no-ad p50 16.1 min (p10 8.1, p90 25.1); ACTIVE 12.8 · ✅ no grind curve — flat slot curve (values and costs ×14 per slot; slot medians 11.6–26.6 follow the size rhythm, not the position), Tours get ~20 % faster by Tour 12 · ✅ no long drought — worst wallet drought 72 s (no ads), p50 ~24 s · ⬜ SPEED stays useful (to re-measure with the ROI fork on World farms)
- ✅ no-ad player viable — 100 farms in 28 h of play, all size classes on target
- ⬜ cliffs: ~2 % of farms take > 1.6× their class median (worst 2.06×); no layout trap left (river bend fixed), the rest is spread across archetypes

### OVERDRIVE
- ✅ second-finger activation obvious — the heat arc pops in inside the pointer event itself (`e2e/overdrive.spec.ts`: visible and popping before the handler returns, < 150 ms asserted), a cyan ring rolls out and sparks fly off the head on the next frame, the head digs in, the servo winds up, a haptic tick; a hot motor answers a second finger with a red shake instead of silence · ⬜ confirmed on a phone (the original complaint came from one)
- ✅ heat indicator clear — arc fill = heat, colour bands cool (cyan) / warm (yellow) / hot (orange, 60–80 %) / max (red, 80–100 %, HOT! badge) asserted at 0.37 / 0.63 / 0.9 heat, screenshots `e2e-screens/od-*.png`; a light rim keeps it readable on dark ground; soft beeps when it turns red · ✅ boost fade understandable — the bolt in the arc is bright while the boost is full and dims with it (bright at 37 % and 63 %, dim at 90 %) · ✅ no permanent HUD clutter — nothing over the head while the motor is cold (asserted before and after)

### Visual · Performance · Monetization · QA
- ⬜ each biome readable without UI · ⬜ no recolours · ⬜ crops readable · ⬜ depot obvious · ⬜ rare farms wow
- ✅ draw calls — `e2e/biomes.spec.ts` budget test, high tier, grand farm, every zone open: 49–57 per family (the starter Meadow scene measures 50 at f9425ec and 51–52 now) · ✅ triangles — 124–170k per family, ≤ 180k asserted; content budgets unit-tested (any crop ≤ 850 per plot, trees ≤ 200, rocks ≤ 120, props ≤ 350, landmarks ≤ 700) · ⬜ memory · ✅ bounded map (see Map) · ✅ fast save (serialize ≤ 0.25 ms, parse ≤ 1.9 ms at 500 farms) · ⬜ low quality everywhere (low tier thins weather/props; screenshot matrix runs on the low SwiftShader tier — review pending)
- ✅ ads optional — every rewarded ad is an offer; nothing on the World Tour needs one (the no-ad bot finishes 100 farms, W3) · ✅ forced-ad rate not increased — the interstitial policy is unchanged (≤ 4 an hour, 8 min apart, 5 quiet min after a rewarded ad); `npm run sessions`: World Tour sessions see as many or fewer interstitials than the same player's Starter Tour sessions (two-finger: 6 vs 5 in 2 h, the only +1); the one new flow (one-tap travel) never gets one (e2e) · ✅ big moments protected — 10 quiet seconds after route growth, merges, new fields, FINAL HARVEST and farm finished (unit test); none during travel or a farm's entrance (e2e) · ✅ long sessions not ad spam — max 4 in any rolling hour in every 2 h session of every profile, 2 h ≤ 8 (CI runs it with --assert); see `docs/WORLD_TOUR.md`
- ⬜ typecheck · ⬜ unit · ⬜ e2e · ⬜ balance · ⬜ Android workflow · ⬜ screenshot matrix · ⬜ 100-farm sim
- ✅ migration tests — v2 fresh Meadow, v2 mid-Pumpkin (field identical), v2 all five done (World Tour opens), v3 damaged blueprint (rebuilt from key), unknown key (→ frontier), broken journey (→ defaults)
- ⬜ no P0 · ⬜ no P1

## Scorecard (1–10; GOLD needs average ≥ 8.5, none < 8, no P0/P1)
| Category | Score | Evidence |
|---|---|---|
| Core game feel | 8 | accepted on a real phone (goal 04) |
| World Tour clarity | 7 | journey trail map, arrival card, completion context with one-tap next farm, Starter Tour transition — e2e + screenshots (EN/DE, 360/412 px); not yet seen on a phone |
| Biome variety | 8 | 18 families incl. 2 rare + 2 legendary showcases, each with its own crops/trees/props/landmark/rocks/barn/weather, screenshot-reviewed, plus a music flavour and ambience each (measured offline, not yet heard on a phone); per-biome quality scores pending (W7) |
| Farm generation | 7 | 16 archetypes, organic outlines, static + play-out validation over 8,000 farms with 0 failures; outlines at 12×12 plots still simple |
| Long-term progression | 6 | endless journey; Core Rank shown on the map and on each Tour's end (before → after, bonus); journey stats + biome stamps; when the stamp set completes is not measured yet |
| Map UX | 7 | bounded trail (≤ 10 nodes), clear states, pips, Core Rank chip, mystery/NEW BIOME teasers, finale milestone; e2e + screenshots; not yet seen on a phone |
| Economy | 8 | 100-farm bot over 6 profiles: targets met, no softlock/overflow, 3 bugs found and fixed; ~2 % mild cliffs remain |
| Pacing | 7 | five farms measured (goal 04) |
| Visual polish | 7 | |
| Animation | 8 | goal 04 pop pass |
| Audio | 8 | accepted on a real phone (goal 04); W5c flavours/ambience are measured offline only (levels, spectra, clips) — no device listening yet |
| OVERDRIVE readability | 7 | heat arc + bolt + HOT!, activation in the input event, ring/sparks — e2e + screenshots; the complaint came from a phone and this redesign has not been on one yet |
| Performance | 8 | goal 04 measurements |
| Save robustness | 8 | v3 bounded, migration + recovery tests |
| Android stability | 8 | CI + device |
| Monetization fairness | 8 | goal 04 ad policy |
| Replayability | 6 | endless: 18 families × 16 layout archetypes × 3 size classes × modifiers, rare/legendary Tour finales; anticipation now on the map (mysteries, NEW BIOME, finale milestone) and on arrival; long-session evidence pending (W7) |

## Open P0/P1
- ~~P0: the game ends after five farms.~~ fixed in W1.
- ~~P1: only 3 new biome families so far~~ — 18 families incl. rare/legendary showcases, each with a music flavour and ambience (W5c).
- P1: OVERDRIVE state/heat not readable (real device) — addressed in the build (W6: heat arc, bolt, HOT!, activation in the input event); stays open until it is checked on a phone.
- ~~P1: World Tour economy not yet tuned or measured over 100 farms~~ — W3: measured and tuned (see Balance).
