# World Tour — endless farms (architecture)

## Why the game ended (audit, f9425ec)
| Finite assumption | Where | Problem for endless play |
|---|---|---|
| `FarmId` is a union of five ids, `FARM_ORDER` a five-item list | `game/types.ts` | a farm can only be one of five hand-made maps |
| `FARMS: Record<FarmId, FarmDef>` | `game/farms/index.ts` | no way to describe farm #6 |
| `farmEco(index)`: values ×25ⁱ, costs ×25ⁱ·1.2ⁱ | `game/config.ts` | farm 100 would need 10¹⁴⁰ coins; doubles overflow near farm 220 |
| `farmsProgress`, `completedFarms`, `unlockedFarms`, `economy.passive` keyed by farm | `GameState` | every farm ever played keeps a full field snapshot (bitsets) and a passive entry: unbounded save and per-frame sums |
| `finishFarm` → `FARM_ORDER[index + 1] ?? null` | `game/sim.ts` | after Cactus Ranch: `null`, "you finished the game" |
| `BIOMES`, `TIER_BLOCK_COLORS` keyed by farm | `render/palette.ts` | a look per farm, not per biome |
| Map = one card per farm in `FARM_ORDER` | `ui/modals/Map.ts` | a list of five; would become a list of hundreds |
| `t('farm.<id>')` names | i18n | five hand-written names |
| Crops: `CropId` union, builders in one record | `render/geo/crops.ts` | fine as a registry, but every crop is 1/9 of a plot (no trees) |

What already scales: a farm is a plot-grid character map run through one `buildLayout`; the route is always the
outline of the claimed plots (`territory.ts` keeps it one simple loop); crops, field state, rendering and the
economy all work on whatever map they are given.

## Concepts
- **Biome family** (`BiomeId`): art direction and content — crop pools per tier, layout tendencies, obstacle
  styling, palette, props, depot skin, ambience, music flavour, name list, rarity. Pure data (game side) + a look
  (render side).
- **Farm key** (`FarmKey`, a string): the identity of one farm. The Starter Tour keeps its ids (`meadow`, `pumpkin`,
  `sunflower`, `snowyberry`, `desert`) so old saves and their field snapshots stay valid. World Tour farms are
  `w<ordinal>-<biome>-<seed hex>`: the key alone says which farm it is.
- **Farm plan** (cheap, for the map): ordinal, tour, slot in the tour, biome, size class, modifier, showcase flag,
  name — derived from the world seed and the ordinal by the scheduler (no layout).
- **Farm blueprint** (`FarmBlueprint`): a plan plus its generated plot map and crops — everything needed to rebuild
  the farm exactly. Stored inside that farm's progress while the farm is live (≈ 300 bytes), so a generator change in a
  later update can never move the ground under a half-cleared farm.
- **Farm definition** (`FarmDef`): the runtime farm built from a starter table entry or a blueprint (layout, bounds,
  depot, economy).

## Journey
`GameState.journey`: world seed, frontier ordinal, Core Rank, farms completed, biomes discovered, the last few
completed farms (stamps for the map) and personal records — all bounded. Starter Tour = Tour 0 (farms #1–#5); World
Tour t ≥ 1 = 8 farms (#6–#13 is Tour 1, …), the 8th is the Tour's showcase finale. Travel is strictly forward in the
World Tour: a finished farm can be played on until you set off, then it becomes a stamp (its field snapshot is
dropped). Live farms (current + unfinished) keep full snapshots; there are never more than a handful.

## Economy (readable numbers forever)
Each World Tour is one economic arc: farm slot j of a Tour has values ×Gʲ and costs ×Gʲ·Cʲ, so numbers climb from
"15 coins" to billions within a Tour, then the next Tour starts a new region at small numbers again. Coins are
recalibrated at the Tour start (the Tour's finale pays out into Core Rank, not into a pile of useless billions);
charges, tornadoes, collection, records and Core Rank persist. Core Rank gives a small permanent bonus with
diminishing returns. Passive income only counts the current Tour's farms (≤ 8 entries). The Starter Tour keeps its
exact economy (×25ⁱ).

## Generation
Authored procedural: layout archetypes (river bend, double pond, canyon, terraces, horseshoe, …) with parameters,
mirroring and size classes produce a plot map; static validation (connected plots, obstacles open to the outside, no
diagonal-only pinches, no one-plot necks, depot on the near edge, enough crops) rejects bad candidates and the next
attempt is tried; a play-out validation (the real sim clearing the farm) runs in the stress test over thousands of
seeds. Everything is seeded (`hash32`, `mulberry32`), never `Math.random` or the clock.

Measured (`npm run worldgen`, 1,000 farms per family through the real scheduler, 200 of each played out with the real
simulation): 8,000 farms, 0 validation failures, 0 bowl fallbacks, p95 of 2 attempts, all 16 archetypes in use,
1,600 play-outs (small and large crops) clearing ≥ 90 % with no stuck route. `npm run journey` walks 500 farms: no
duplicate key, a next destination always reachable, every scheduled family visited, save ~2.5 KB flat.

## Biome families (content system)
A family is data in two places, both checked by tests:
- **game** (`world/biomes.ts`): crop pools per tier (crops have a size class — small 3×3, large 2×2 trees and vines,
  huge single crops — and a plot always holds the same HP and value whatever its crops), favoured layout archetypes,
  rarity, earliest Tour;
- **render** (`render/palette.ts`): palette and light, two tree kinds, ring props, a landmark (some with a rotor),
  rock style, grass and flower colours, the barn's skin (the depot language — pad, hopper, chevrons, sign — never
  changes), and weather (dust, mist, leaves, snow, pollen: one instanced draw call that follows the camera).

Names and titles live in i18n (`biome.<id>`, twelve curated `names.<id>` per family, `crop.<id>`); a test fails if a
family or crop lacks them in either language or if a name repeats anywhere. The **duplication detector**
(`render/biomes.test.ts`) requires every pair of families to differ in at least three major ways — crops, trees,
props, landmark, rocks, weather, barn, layouts — so a palette swap can never pass as a new place. The five starter
families gained a signature each (sheep; scarecrows and autumn leaves; beehives and pollen; snowfall; sandstone mesas
and dust) on top of their accepted look.

| Family | Crops (size) | Scenery | Landmark · weather |
|---|---|---|---|
| Zambezi Orchard | groundnut, sorghum/corn, pawpaw (L), mango (L) | acacias, baobabs, termite mounds, tall grass, granite kopjes, red laterite | wind pump + tank · warm dust |
| Jade Rice Terraces | rice seedlings, taro, golden rice, lychee (L) | broadleaf trees, bamboo, dry-stone walls, stilt huts, mossy rocks, jade paddies once cleared | stilted granary · mist |
| Tuscan Vineyard | basil, artichoke/tomato, grapevines, olive (L) | cypress lanes, umbrella pines, hay bales, terracotta urns, limestone | stone farmhouse · falling leaves |

## Save v3
`v2 → v3`: `farmId` stays the key (starter ids are valid keys); a `journey` is created from the starter progress
(completed count, discovered biomes, World Tour unlocked when all five are done); everything else carries over.
Budgets: 100 farms well under 100 KB, 500 farms no bigger than 100 farms (bounded structures only).
