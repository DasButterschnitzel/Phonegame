# Gold status — Crop Crawler 05 (Endless World Tour)

**STATUS: RED** — the game still ends after five farms (audit below). Updated after every loop.

## Loop log
| Loop | Commit | What changed | Status after |
|---|---|---|---|
| W0 | (this) | Audit of finite assumptions, architecture (`docs/WORLD_TOUR.md`), this document | RED |

## Gates (✅ met with evidence · ⬜ open · ❌ failing)
### Core
- ⬜ first five farms still work
- ⬜ current core loop unchanged
- ⬜ Android launches
- ⬜ save/load works
- ⬜ accepted real-phone behaviours preserved (multitouch buying, camera at speed, audio, AdMob test flow, shimmer)

### Endless
- ❌ there is no designed final farm — `finishFarm` returns `next = null` after Cactus Ranch
- ⬜ World Tour unlocks after the Starter Tour
- ⬜ farm generation is deterministic
- ⬜ 100+ farms can be simulated
- ⬜ no route softlock · ⬜ no economy softlock · ❌ no number overflow (×25ⁱ: 10¹⁴⁰ by farm 100)
- ⬜ farm duration controlled · ❌ save size bounded (every farm keeps a full field snapshot)

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
- ⬜ migration tests · ⬜ no P0 · ⬜ no P1

## Scorecard (1–10; GOLD needs average ≥ 8.5, none < 8, no P0/P1)
| Category | Score | Evidence |
|---|---|---|
| Core game feel | 8 | accepted on a real phone (goal 04) |
| World Tour clarity | 1 | does not exist |
| Biome variety | 3 | five hand-made farms, palette + one decor kind each |
| Farm generation | 1 | none |
| Long-term progression | 1 | ends after farm 5 |
| Map UX | 4 | five cards |
| Economy | 3 | fine for 5 farms, overflows endlessly |
| Pacing | 7 | five farms measured (goal 04) |
| Visual polish | 7 | |
| Animation | 8 | goal 04 pop pass |
| Audio | 8 | accepted on a real phone |
| OVERDRIVE readability | 4 | real-device feedback: too weak |
| Performance | 8 | goal 04 measurements |
| Save robustness | 6 | unbounded growth once endless |
| Android stability | 8 | CI + device |
| Monetization fairness | 8 | goal 04 ad policy |
| Replayability | 2 | it ends |

## Open P0/P1
- P0: the game ends after five farms.
- P1: OVERDRIVE state/heat not readable (real device).
- P1: economy and save would not survive endless play.
