# Gold status — Crop Crawler 05 (Endless World Tour)

**STATUS: BRONZE** — the endless system exists (World Tour after the Starter Tour, generated farms, forward travel, save v3), but content, economy tuning, map UX and the OVERDRIVE indicator are not done. Updated after every loop.

## Loop log
| Loop | Commit | What changed | Status after |
|---|---|---|---|
| W0 | 0174072 | Audit of finite assumptions, architecture (`docs/WORLD_TOUR.md`), this document | RED |
| W1 | (this) | Endless core: farm keys ≠ biomes, blueprints, journey, World Tour scheduler + first generator, forward travel with Tour recalibration, save v3 + migration, debug hooks | BRONZE |

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
- ⬜ 100+ farms can be simulated
- ⬜ no route softlock · ⬜ no economy softlock · ⬜ no number overflow (Tour-normalised economy in place: each Tour climbs ×14 per farm, then a new Tour starts small — to be measured over 100 farms)
- ⬜ farm duration controlled · ✅ save size bounded — after 100 farms the save is < 40 KB (only the live farm + ≤ 6 stamps); 500 to measure

### Content
- ⬜ ≥ 12 genuinely distinct biome families (now: 5 hand-made farms)
- ⬜ different layout archetypes · ⬜ repeat protection · ⬜ anticipation · ⬜ rare/showcase farms
- ⬜ good generated names · ⬜ no cultural caricatures

### Map
- ❌ map no longer a finite checklist (it is a list of five cards)
- ⬜ bounded rendering · ⬜ current / next / Tour milestone obvious · ⬜ Starter Tour transition

### Meta
- ⬜ Tour structure · ⬜ long-term progression · ⬜ simple · ⬜ no currency explosion · ⬜ progress matters after farm 50

### Balance
- ⬜ farms 20–100 in the target duration band · ⬜ no grind curve · ⬜ no long drought · ⬜ SPEED stays useful
- ⬜ no-ad player viable

### OVERDRIVE
- ❌ second-finger activation obvious (real-device feedback: indicator too weak)
- ❌ heat indicator clear · ⬜ boost fade understandable · ⬜ no permanent HUD clutter

### Visual · Performance · Monetization · QA
- ⬜ each biome readable without UI · ⬜ no recolours · ⬜ crops readable · ⬜ depot obvious · ⬜ rare farms wow
- ⬜ draw calls · ⬜ triangles · ⬜ memory · ⬜ bounded map · ⬜ fast save · ⬜ low quality everywhere
- ⬜ ads optional · ⬜ forced-ad rate not increased · ⬜ big moments protected · ⬜ long sessions not ad spam
- ⬜ typecheck · ⬜ unit · ⬜ e2e · ⬜ balance · ⬜ Android workflow · ⬜ screenshot matrix · ⬜ 100-farm sim
- ✅ migration tests — v2 fresh Meadow, v2 mid-Pumpkin (field identical), v2 all five done (World Tour opens), v3 damaged blueprint (rebuilt from key), unknown key (→ frontier), broken journey (→ defaults)
- ⬜ no P0 · ⬜ no P1

## Scorecard (1–10; GOLD needs average ≥ 8.5, none < 8, no P0/P1)
| Category | Score | Evidence |
|---|---|---|
| Core game feel | 8 | accepted on a real phone (goal 04) |
| World Tour clarity | 4 | exists; map is still a list with a World Tour section |
| Biome variety | 3 | five hand-made farms, palette + one decor kind each |
| Farm generation | 4 | 16 archetypes, static validation + rerolls; layouts still plain |
| Long-term progression | 4 | endless journey, Core Rank; economy not tuned |
| Map UX | 4 | five cards |
| Economy | 4 | Tour-normalised design in place, untuned |
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
- P1: World Tour farms reuse the five starter biomes (no new places yet).
- P1: OVERDRIVE state/heat not readable (real device).
- P1: World Tour economy not yet tuned or measured over 100 farms (save is bounded now).
