# Crop Crawler — Game Design

## Pitch
Hold your finger down and a robot caterpillar munches its way around the farm. Every segment chomps the crops beside
the route and stacks the harvest on its back; roll through the depot to sell. **The world changes because you harvest
it:** crops never grow back, and every plot you clear joins your territory — the route bulges out around it, the bare
soil turns into meadow, and the farm visibly transforms from a dense field into conquered land.

## Core loop: destroy → route grows → haul → depot → upgrade
| Train Miner | Crop Crawler |
|---|---|
| Hold to drive the train | **Hold to crawl** (release → 20 % idle crawl, so it is idle-friendly) |
| Saw wagons cut tiles next to the track | Head and segments chomp crops within reach (`REACH 2.0`) of the route |
| Tiles take damage, break apart | Crops drop **3 chunks** as HP falls and look *eaten*: the first contact nibbles a notch, each chunk takes a bigger bite (carved geometry showing flesh, facing the body that bit), the second leaves a stump, the last topples it (squash, tip, dirt puff); stubble remains |
| Cleared tile → new track spawns | **Cleared plot → the route grows into it** (see below) |
| MASS bar + resource stack | Basket bar + **wobbling block stack on every segment**; each chunk arcs from the bite into the stack of the segment that ate it and the stack grows when it lands |
| Sell at the station | **Depot**: a wave from the first segment to the last tips every stack into the hopper while the caterpillar rolls through (0.4–1.3 s) |
| ADD / MERGE / SPEED / CAPACITY / TNT | ADD / MERGE / SPEED / CAPACITY / **TORNADO** (clears its whole radius) |
| Clear the area → next level | **OPEN FIELD** (fenced zones) → **FINISH FARM** at 90 % cleared → map, 5 farms |

### Multitouch: one finger drives, the other buys — or pushes
- **Buy while driving.** Every button activates on its own pointer (`onTap` in `src/ui/dom.ts`): a tap made while
  another finger holds the field produces no `click` on phones (the browser treats it as a two-finger gesture), so
  buttons used to ignore it. Covered by a real multi-touch e2e (CDP touches, `e2e/touch.spec.ts`).
- **OVERDRIVE.** A second finger on the field (Shift + Space on a keyboard) pushes harder: top speed × 1.3 on top of
  the SPEED level (it multiplies upgrades, never replaces them). The motor heats up in 6 s — full boost for the
  first 3.6 s, then it fades — and cools down in 6 s, so it is a burst, not a mode: holding two fingers all the time
  gains nothing. A player who pulses it perfectly finishes farms ~12 % sooner (bot ACTIVE_TWO_FINGER); the economy
  is balanced for one finger.
- Fingers on buttons never count, nor do fingers that land within 22 px of one (a near-miss must not surge the
  crawler); a third finger adds nothing; cancel, focus loss and backgrounding clear every finger.
- Feedback: the head digs in and the antennae whip back on the next frame, the servo winds up, a light haptic tick,
  blades flare, the head's blades kick dirt sideways, "OVERDRIVE!" pops over the head the first three times; as the
  motor gets hot the antennae glow orange to red and it lets off steam with a hiss; on release the body settles
  and the speed eases back. The one-time tip appears once ADD, MERGE and OPEN FIELD are known.
- Accessibility toggle mode: a single-finger tap starts/stops the crawl (on release), a two-finger hold overdrives.

### Territory and route growth (src/game/territory.ts)
- A farm is a grid of plots (3.6 units, 3×3 crops) authored as a small ASCII map per farm: plots, rocks, water, the
  start territory and the depot. Zones (rings by distance from the start) are assigned automatically.
- **The route is the outline of the cleared territory.** A frontier plot is *ready* when every crop the route can
  reach is destroyed. After a 0.6 s anticipation beat (glowing outline, ding) it joins the territory, and the route is
  rebuilt around it: the new stretch draws itself, the plot greens with grass and flowers, dust flies, the camera
  pulls back a little and a sting plays.
- Growth always keeps **one simple loop**: no holes, no corner-only contacts (hard rules), and tidy shapes — no spike
  out of a spike, no one-plot slots (soft rules, waived after a grace period so they can never block progress).
  Growth waits until the caterpillar's body has left the area (max 3 s), so the body never jumps.
- Crops left inside the territory out of reach are swept away (rare). Readiness is sticky so growth spreads along an
  edge instead of combing it.
- **Zones** are fenced. OPEN FIELD costs coins, or is **free once the open area is 85 % cleared** — there is no
  economic dead end. FINISH FARM is free at **90 % cleared**.
- Verified by tests: random claim orders on every farm never softlock and every route is smooth (turn radius ≥ 1.45),
  never overlaps itself (gap ≥ 2.4 between non-adjacent stretches) and always passes the depot.

### Depot: unload rule (decision)
| Option | Pros | Cons |
|---|---|---|
| A — fly-through (rolling) | Never breaks the hold-to-crawl flow; a readable head-to-tail wave; a longer chain makes a longer wave | Paying each segment only when it physically reached the chute took 3 s for 7 segments and 10+ s for long chains — so the wave is timed and capped instead |
| B — stop to unload | Very explicit | Breaks flow, needs a second input, punishes long chains |
| C — hybrid (slow zone + stop on release) | Flexible | Two rules to learn; unclear when it pays |

**Chosen: A, fly-through with a timed unload wave and a gentle magnetic drag (speed × 0.85 during the pass).** When
the head crosses the chute, segment *k* of *n* pays at `unloadAt(k, n)`: the first after 0.36 s, the whole wave
0.44–0.7 s for 2–4 segments and 0.8–1.3 s for 12–32, never longer (config `DEPOT`). Each segment heaves its stack up
early enough that the blocks land in the hopper as it is paid, top block first; the stack visibly empties front to
back, the counter climbs, the last load gets the barn's bounce, a coin spray and a stronger tick on the coin counter.
The pad, chevrons, open doors and glow make the drop-off unmistakable; approach cues at ½ lap, ¼ lap and just before
the chute pull a loaded caterpillar home; the camera leans towards the hopper only with a real load and holds through
the wave. Coins credited = value unloaded (unit-tested).

**A full basket takes no bites**: crops hold at their next chunk threshold (blades grind and spark, stack tops flash,
FULL badge, arrow over the hopper) — nothing is wasted, but clearing pauses until you unload or upgrade CAPACITY.

**Damage model:** each body removes `power(level) × distance travelled` HP from every crop within reach — per-pass
damage is independent of speed, so going faster always means more harvest per second.

**Merging:** the lowest-level pair (two rearmost) becomes one segment of the next level; `power(L) = 4 × 2.4^(L−1)`.

## Economy (src/game/config.ts)
Resources are finite (≈ 100 K coins of crops on Meadow); costs are scaled so a player spends everything and still
needs time to clear the farm.
- Crop tier `t` (= zone): HP/chunk `36 × 3.5^t`, value/chunk `4^t`; golden crops 1.5 % (×10, may drop a tornado).
- Head power 7; capacity per segment `10 × 1.35^(lvl−1)`.
- **SPEED** `3 × 1.07^(lvl−1) × (1 + 0.08 × ⌊lvl/5⌋)` units/s, Lv 1–15: every level is 7 % faster (felt, not
  +0.3 u/s), Lv 5/10/15 are milestones (+15 %); 3.0 → 9.6 units/s. It used to be `3 × (1 + 0.1 (lvl−1))` up to Lv 25:
  +5 % per level late on, at ever higher prices.
- Costs (× farm multiplier `25^i × 1.2^i`): ADD `15 × 1.32^(segments−1) × 1.01^adds`, MERGE `50 × 2.9^(pairLevel−1) ×
  1.012^merges`, SPEED `60 × 1.6^(lvl−1)`, CAPACITY `35 × 1.55^(lvl−1)`, OPEN FIELD `[900, 12K, 110K]` (or free at 85 %).
  The per-purchase climbs were 1.025 / 1.03 — they compounded to ×6–7 by the end of a farm, which is what made its
  last fifth a grind. Pricing ADD/MERGE by zone instead was tried and brought the grind straight back.
- **FINISH FARM** unlocks at **85 %** cleared (was 90 %): the last isolated pockets are optional clean-up (they keep
  paying if you stay). 85 / 88 / 90 % changed the five-farm ACTIVE time by only 117 / 120 / 123 min once the late game
  was fixed — the threshold mostly decides how much pocket-hunting is required.
- **FINAL HARVEST** from **75 %** cleared until FINISH: +15 % speed, +25 % bite power, a banner, a golden ring and a
  gold progress bar — the farm ends on a climax. Without it the late game clears ~20 % slower (Pumpkin's longest gap
  between events 48 s → 81 s).
- Segment caps per open zone: 8 / 14 / 22 / 32 (and what fits on the loop).
- Finished farms pay **3 % of the income rate at completion** forever (also offline).

### Pacing (bots, `npm run balance -- --profile all --farms 5 --bands --assert`)
| Farm time | before (0fca9dc) | now |
|---|---|---|
| ACTIVE (taps lucky bugs, uses tornadoes) Meadow / other farms | 25:10 / 28–42 min | **18:25** / 21–31 min |
| ACTIVE_NO_ADS (no extras at all) | 26:57 / 29–42 min | **19:32** / 22–34 min |
| CASUAL (holds half the time, shops every 10 s) | 41:47 / 49–68 min | **32:33** / 32–51 min |
| IDLE (never touches the screen, shops every 5 min) | 2:30 h | 2:05 h (no softlock on any farm) |

| Meadow, ACTIVE_NO_ADS: time / clear rate | 0–25 % | 25–50 % | 50–70 % | 70–80 % | 80 % → finish |
|---|---|---|---|---|---|
| before (finish at 90 %) | 6:16 / 4.0 %/min | 6:14 / 4.0 | 6:00 / 3.3 | 4:33 / 2.2 | 4:34 / 2.2 |
| now (finish at 85 %) | 6:12 / 4.0 | 5:21 / 4.7 | 4:36 / 4.4 | 2:27 / 4.1 | 0:58 / 5.2 |

- Late game (70 % → finish) vs the first half, ACTIVE, per farm: before 32–52 % of the early clear rate (CASUAL Pumpkin
  0.7 %/min with ~100 s between events); now 71–113 %. Longest late gap between meaningful events (purchase, route
  growth, new level, bonus, fence): 11–27 s. Longest stretch with nothing affordable: ACTIVE 25–30 s, NO_ADS ≤ 71 s,
  CASUAL ≤ 88 s.
- First chunk / unload / ADD 0:02 / 0:09 / 0:25, first route growth 1:03, zones 2/3/4 at 2:30 / 6:29 / 11:22 (ACTIVE).
- OVERDRIVE pulsed perfectly (ACTIVE_TWO_FINGER): ~12 % faster; one occasional rewarded ×2 every 5 min
  (ACTIVE_OCCASIONAL_REWARDED) saves ~90 s per ad.
- Assertions (`--assert`, `src/game/balance.test.ts`): Meadow 15–24 min, no-ads ≤ +20 %, late clear rate ≥ 70 % of
  early, no late gap > 60 s, no drought > 90 s, every SPEED level ≥ 7 % (milestones ≥ 14 %), late SPEED levels cost
  ≤ 2 min of income, every profile finishes.

## Retention
- Offline earnings: 50 % of the recent income rate + passive income, up to 2 h, ×3 with a rewarded ad.
- 7-day daily calendar (coins, tornadoes, boosts), ×2 with a rewarded ad; missed days do not reset.
- Lucky ladybug/butterfly crosses the screen every 2–3 min: tap for coins, ×3 with an ad.
- Juice: carved bite stages, recoil away from the biter, debris from the bite, chunks arcing into the eating
  segment's stack, the unload wave, route draw-in, merge pop, camera kicks and pull-backs, haptics. Motion: a strain
  wave runs down the chain on acceleration and braking, the head leads into bends, feet plant and push, cargo bounces
  a beat behind the stride.
- Audio: the motor is a tiny electric servo — a band-passed noise texture plus a faint 640–1000 Hz sine whine and
  leg ticks — with nothing below ~450 Hz (phone speakers don't play it; low buzz reads as moped/bee). It is the
  quietest layer and is ducked under big moments. Bites come from four crunch recipes with constrained variation
  (bigger crops lower); the final bite is its own rustle-thunk-pop; unload plinks climb per segment to a ka-ching.
  `e2e/audio.spec.ts` checks the loudness hierarchy (motor ≥ 6 dB under every gameplay sound), the motor's spectrum,
  that no sound leans on sub-bass and that bites vary; how it *sounds* still needs ears on a phone
  (docs/DEVICE_TESTING.md).
- First-time hints teach by reaction: ADD → MERGE → full basket → depot → the first route growth → OPEN FIELD → tornado.

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
