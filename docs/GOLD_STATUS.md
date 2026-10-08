# Gold status — Crop Crawler 05 (Endless World Tour)

**STATUS: BRONZE** — the endless system exists (World Tour after the Starter Tour, generated farms, forward travel, save v3), but content, economy tuning, map UX and the OVERDRIVE indicator are not done. Updated after every loop.

## Loop log
| Loop | Commit | What changed | Status after |
|---|---|---|---|
| W0 | 0174072 | Audit of finite assumptions, architecture (`docs/WORLD_TOUR.md`), this document | RED |
| W1 | dbf4e6c | Endless core: farm keys ≠ biomes, blueprints, journey, World Tour scheduler + first generator, forward travel with Tour recalibration, save v3 + migration, debug hooks | BRONZE |
| W2 | 83cab8a · 769099a · 5eab0df | Organic generated outlines; 1,000-seed stress test with real-sim play-outs; 500-farm journey bench; crop size classes (trees 2×2, giants 1×1, same economy per plot); data-driven biome looks (trees, props, landmarks, rocks, barn skins, weather); 3 new families (Zambezi Orchard, Jade Rice Terraces, Tuscan Vineyard); starter families gain a signature each; duplication detector; screenshot matrix | BRONZE |
| W3 | 1234168 | Endless economy: 100-farm bot report (`npm run endless`, 6 profiles); fixed Tour-start bank flood, lost passive income, cost drift, river-bend lobe; size classes get depth (tougher crops); quick farms avoid cross-cutting layouts | BRONZE |

| W5a | (this) | Biome library batch A: Tropical Plantation, Christmas Tree Farm, Sakura Tea Garden, Andean Terraces, Nordic Berry (20 crops incl. huge grand firs, 9 trees, 11 props, 5 landmarks, 4 rock styles, butterflies + petals); per-prop scale | BRONZE |

## Gates (✅ met with evidence · ⬜ open · ❌ failing)
### Core
- ✅ first five farms still work — Starter Tour balance identical to goal 04 (ACTIVE_NO_ADS 18:14 / 38:18 / 57:27 / 1:28:38 / 1:51:03), e2e progression + 57 e2e green
- ⬜ current core loop unchanged
- ⬜ Android launches
- ⬜ save/load works
- ⬜ accepted real-phone behaviours preserved (multitouch buying, camera at speed, audio, AdMob test flow, shimmer)

### Endless
- ✅ there is no designed final farm — `world.test.ts`: Cactus Ranch → farm #6 → … → #14 (Tour 2), `next` never null; 100-farm journey test
- ✅ World Tour unlocks after the Starter Tour — `e2e/world.spec.ts` (real UI: five FINISH dialogs, "Starter Tour complete! Core Rank 1 · World Tour unlocked", map → #6, reload lands on #6)
- ✅ farm generation is deterministic — 1,000 plans per seed identical on repeat, unique keys that parse back; 100 blueprints regenerate identically
- ✅ 100+ farms can be simulated — `npm run journey`: 500 farms finished, a next destination always reachable, 500 distinct keys, every scheduled family visited (0 errors)
- ✅ no route softlock — `npm run worldgen`: 8 families × 1,000 farms, 1,600 played out with the real sim (small and large crops), 0 failures, 0 fallbacks · ✅ no economy softlock — `npm run endless`: 6 profiles × 100 farms, every farm finished · ✅ no number overflow — biggest bank ~13T over 100 farms; most valuable possible chunk ~206B (unit test)
- ✅ farm duration controlled — no-ad medians quick 8.7 / standard 17.4 / grand 22.1 min (targets 8–12 / 14–20 / 20–26), farms 20+ p50 16.1 min (`docs/WORLD_TOUR.md`) · ✅ save size bounded — 10 / 50 / 100 / 250 / 500 farms: 2.5 / 2.7 / 2.4 / 2.6 / 2.5 KB, serialize ≤ 0.25 ms, parse ≤ 1.9 ms (`npm run journey`)

### Content
- ✅ ≥ 12 genuinely distinct biome families — 13: 5 starter + Zambezi Orchard, Jade Rice Terraces, Tuscan Vineyard, Tropical Plantation, Christmas Tree Farm, Sakura Tea Garden, Andean Terraces, Nordic Berry; duplication detector green (every pair ≥ 3 major differences); screenshot matrix + crop close-ups reviewed per family (`e2e/biomes.spec.ts`); 400 farms × 13 families generated, 1,040 played out, 0 failures
- ✅ different layout archetypes — 16 archetypes, all in use (stress test counts) · ✅ repeat protection — no family twice within 4 farms over 400 farms × 3 seeds (`world.test.ts`) · ⬜ anticipation · ⬜ rare/showcase farms
- ⬜ good generated names (12 curated per family, EN + DE, never repeated — test; review pending) · ⬜ no cultural caricatures (landscape-based names and props; review pending)

### Map
- ❌ map no longer a finite checklist (it is a list of five cards)
- ⬜ bounded rendering · ⬜ current / next / Tour milestone obvious · ⬜ Starter Tour transition

### Meta
- ⬜ Tour structure · ⬜ long-term progression · ⬜ simple · ⬜ no currency explosion · ⬜ progress matters after farm 50

### Balance
- ✅ farms 20–100 in the target duration band — no-ad p50 16.1 min (p10 8.1, p90 25.1); ACTIVE 12.8 · ✅ no grind curve — flat slot curve (values and costs ×14 per slot; slot medians 11.6–26.6 follow the size rhythm, not the position), Tours get ~20 % faster by Tour 12 · ✅ no long drought — worst wallet drought 72 s (no ads), p50 ~24 s · ⬜ SPEED stays useful (to re-measure with the ROI fork on World farms)
- ✅ no-ad player viable — 100 farms in 28 h of play, all size classes on target
- ⬜ cliffs: ~2 % of farms take > 1.6× their class median (worst 2.06×); no layout trap left (river bend fixed), the rest is spread across archetypes

### OVERDRIVE
- ❌ second-finger activation obvious (real-device feedback: indicator too weak)
- ❌ heat indicator clear · ⬜ boost fade understandable · ⬜ no permanent HUD clutter

### Visual · Performance · Monetization · QA
- ⬜ each biome readable without UI · ⬜ no recolours · ⬜ crops readable · ⬜ depot obvious · ⬜ rare farms wow
- ✅ draw calls — `e2e/biomes.spec.ts` budget test, high tier, grand farm, every zone open: 49–57 per family (the starter Meadow scene measures 50 at f9425ec and 51–52 now) · ✅ triangles — 124–170k per family, ≤ 180k asserted; content budgets unit-tested (any crop ≤ 850 per plot, trees ≤ 200, rocks ≤ 120, props ≤ 350, landmarks ≤ 700) · ⬜ memory · ⬜ bounded map · ✅ fast save (serialize ≤ 0.25 ms, parse ≤ 1.9 ms at 500 farms) · ⬜ low quality everywhere (low tier thins weather/props; screenshot matrix runs on the low SwiftShader tier — review pending)
- ⬜ ads optional · ⬜ forced-ad rate not increased · ⬜ big moments protected · ⬜ long sessions not ad spam
- ⬜ typecheck · ⬜ unit · ⬜ e2e · ⬜ balance · ⬜ Android workflow · ⬜ screenshot matrix · ⬜ 100-farm sim
- ✅ migration tests — v2 fresh Meadow, v2 mid-Pumpkin (field identical), v2 all five done (World Tour opens), v3 damaged blueprint (rebuilt from key), unknown key (→ frontier), broken journey (→ defaults)
- ⬜ no P0 · ⬜ no P1

## Scorecard (1–10; GOLD needs average ≥ 8.5, none < 8, no P0/P1)
| Category | Score | Evidence |
|---|---|---|
| Core game feel | 8 | accepted on a real phone (goal 04) |
| World Tour clarity | 4 | exists; map is still a list with a World Tour section |
| Biome variety | 7 | 13 families, each with its own crops/trees/props/landmark/rocks/barn/weather, screenshot-reviewed; no rare/legendary showcase family yet, no per-family music flavour |
| Farm generation | 7 | 16 archetypes, organic outlines, static + play-out validation over 8,000 farms with 0 failures; outlines at 12×12 plots still simple |
| Long-term progression | 5 | endless journey, Core Rank bonus measurable (Tours ~20 % faster by rank 12); no Core Rank UI / collection extension yet |
| Map UX | 4 | five cards |
| Economy | 8 | 100-farm bot over 6 profiles: targets met, no softlock/overflow, 3 bugs found and fixed; ~2 % mild cliffs remain |
| Pacing | 7 | five farms measured (goal 04) |
| Visual polish | 7 | |
| Animation | 8 | goal 04 pop pass |
| Audio | 8 | accepted on a real phone |
| OVERDRIVE readability | 4 | real-device feedback: too weak |
| Performance | 8 | goal 04 measurements |
| Save robustness | 8 | v3 bounded, migration + recovery tests |
| Android stability | 8 | CI + device |
| Monetization fairness | 8 | goal 04 ad policy |
| Replayability | 3 | endless, but only starter biomes so far |

## Open P0/P1
- ~~P0: the game ends after five farms.~~ fixed in W1.
- ~~P1: only 3 new biome families so far~~ — 13 families now; still missing: rare/legendary showcase families, music flavour per family.
- P1: OVERDRIVE state/heat not readable (real device).
- ~~P1: World Tour economy not yet tuned or measured over 100 farms~~ — W3: measured and tuned (see Balance).
