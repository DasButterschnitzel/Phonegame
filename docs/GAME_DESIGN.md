# Crop Crawler — Game Design

## Pitch
Hold your finger down and a robot caterpillar munches its way around the farm. Every segment chomps the crops beside
the path and stacks the harvest on its back; pass the barn to sell. Grow the caterpillar, merge segments into stronger
ones, expand the path into richer fields, finish the farm and travel to the next biome.

## Core loop (mirrors Train Miner)
| Train Miner | Crop Crawler |
|---|---|
| Hold to drive the train | **Hold to crawl** (release → slow 20 % idle crawl, so it is idle-friendly) |
| Saw wagons cut trees next to the track | Body segments' side chompers damage crops in reach (`REACH 1.6`) |
| Trees take several hits, look pale | Crops drop **3 chunks** as HP falls, shrink and turn pale, then **regrow** (14–26 s) |
| MASS bar + resource stack on the train | Basket bar + **wobbling block stack on every segment** (capacity is per segment) |
| Sell at the station | Barn on the loop; each segment unloads as it passes (blocks fly into the barn) |
| ADD / MERGE / SPEED / CAPACITY / TNT | ADD / MERGE / SPEED / CAPACITY / **TORNADO** |
| Clear the area → next level on the map | **EXPAND** ×3 (bigger loops through higher-tier crops) → **FINISH FARM** → map, 5 farms |

**Damage model:** each body removes `power(level) × distance travelled` HP from every crop within reach. Per pass
damage does not depend on speed, so going faster (holding, SPEED upgrades) always means more harvest per second.

**Merging:** one button merges the lowest-level pair (the two rearmost of that level) into one segment of the next
level. `power(L) = 4 × 2.4^(L−1)`, so a merge is +20 % power but frees a slot and costs basket capacity — a real
trade-off against ADD. A popup celebrates every newly discovered level (Collection screen up to level 30).

**Three bottlenecks** keep every upgrade relevant: damage (ADD/MERGE/SPEED), capacity (CAPACITY/SPEED for more barn
visits), regrowth (EXPAND to reach more and better crops).

## Economy (src/game/config.ts)
- Crop tier `t`: HP/chunk `15 × 3.2^t`, value/chunk `4^t`.
- Capacity per segment `25 × 1.3^(lvl−1)`; speed `3 × (1 + 0.1 (lvl−1))` units/s.
- Costs (× farm multiplier `25^i × 1.2^i`): ADD `6 × 1.3^(segments−1) × 1.02^adds`, MERGE `25 × 2.7^(pairLevel−1) × 1.03^merges`,
  SPEED `30 × 1.6^(lvl−1)`, CAPACITY `20 × 1.5^(lvl−1)`, EXPAND `[2.5K, 30K, 220K]`, FINISH `1.2M`.
- Segment caps per stage: 8 / 14 / 22 / 32.
- Finished farms pay **3 % of the income rate at completion** forever (also offline).

### Pacing (balance bot, active player)
| Milestone | Time |
|---|---|
| First chunk / unload / ADD | 0:02 / 0:08 / 0:09 |
| Level 2 / 3 segment | 0:38 / 1:32 |
| Meadow stage 2 / 3 / 4 | 4:40 / 12:33 / 28:18 |
| Meadow finished | ~50 min |
| Farms 2–5 | ~58 / 69 / 77 / 109 min (≈ 6 h total) |
Casual players are close to active; idle-only players are ~3–4× slower but always progress. Re-run with
`npm run balance -- --profile all`.

## Retention
- Offline earnings: 50 % of the recent income rate + passive income, up to 2 h, ×3 with a rewarded ad.
- 7-day daily calendar (coins, tornadoes, boosts), ×2 with a rewarded ad; missed days do not reset.
- Lucky ladybug/butterfly crosses the screen every 2–3 min: tap for coins, ×3 with an ad.
- Golden crops (1 %, ×10 value, 5 % chance to drop a tornado).
- Juice: stack wobble, crop wobble/pale/shrink, particles, coin fly, merge pop, camera kicks, procedural audio that
  follows speed, haptics. First-time hints guide hold → ADD → MERGE → barn → EXPAND → tornado.

## Monetization rules (src/platform/ads/AdPolicy.ts)
Rewarded (always opt-in, reward stated on the button): ×2 coins (3 min, stacks to 15), Autopilot (full speed hands-free,
3 min), free tornado (3 min cooldown), free upgrade on the cheapest unaffordable upgrade after 20 s of being stuck
(2 min cooldown), offline ×3, gift ×3, farm complete ×2, daily ×2.

Interstitials — forced ads are the #1 complaint in Train Miner reviews, so they are rare and only at natural breaks
(after a barn unload once the coins landed, or after closing a reward dialog):
- never in the first 5 minutes of total play or the first minute of a session,
- at least 2 minutes apart, none within 90 s after a rewarded ad,
- not while the player is steering (2 s quiet) or a tutorial hint is shown, at least 2 unloads between,
- at most 10 per hour. No banners.

## Ideas for later
Rewarded "no interstitials for 20 minutes", remove-ads IAP / ad-skip tokens, more farms (data-driven), segment
accessories per level tier, weekly events, cloud save across devices.
