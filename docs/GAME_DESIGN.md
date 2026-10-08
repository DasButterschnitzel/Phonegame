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
- Crop tier `t` (= zone): HP/chunk 36 / 161 / 637 / 2230, value/chunk `4^t`; golden crops 1.5 % (×10, may drop a
  tornado).
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
- **FINAL HARVEST** from **70 %** cleared until FINISH: +15 % speed, +25 % bite power, a banner, a golden ring and a
  gold progress bar — the farm ends on a climax. Without it the late game clears ~20 % slower (Pumpkin's longest gap
  between events 48 s → 81 s); starting it at 70 % rather than 75 % keeps it clear of the 75 % gift.
- Segment caps per open zone: 8 / 14 / 22 / 32 (and what fits on the loop).
- Finished farms pay **3 % of the income rate at completion** forever (also offline).

### Pacing (bots, `npm run balance -- --profile all --farms 5 --bands --assert`)
| Farm time (Meadow / other farms) | before (0fca9dc) | now |
|---|---|---|
| ACTIVE_NO_ADS: taps lucky bugs, uses free gifts and tornadoes, never an ad | 25:10 / 29–42 min | **18:45** / 22–34 min |
| ACTIVE: the same plus a ×2 ad every 10 min | — | 15:49 / 18–27 min |
| ACTIVE_UPGRADES_ONLY: ignores every extra | 26:57 / 29–42 min | 25:05 / 28–43 min |
| CASUAL: holds half the time, shops every 10 s | 41:47 / 49–68 min | 34:04 / 34–55 min |
| IDLE: never holds, shops every 5 min | 2:30 h | 1:20 h (buys autopilot with coins) |

- The late game (70 % → finish) clears at a median 95 % of the mid game's (25–70 %) rate for ACTIVE_NO_ADS over five
  farms × three seeds (worst farm 80 %); before, it was 32–52 % of the early rate and CASUAL Pumpkin crawled at
  0.7 %/min with ~100 s between events. Longest late gap between meaningful events (purchase, route growth, new level,
  bonus, fence): ≤ 41 s; typical longest stretch with nothing affordable 50 s (worst 66 s).
- Opening unchanged: first chunk / unload / ADD 0:02 / 0:09 / 0:25, first route growth 1:03, zones 2/3/4 at
  2:30 / 4:45 / 10:06 (ACTIVE_NO_ADS).
- Crop HP per chunk 36 / 161 / 637 / 2230 by tier (was 36 × 3.5^t: 36 / 126 / 441 / 1544): with the late game fixed the
  later fields can afford to be tougher, so a farm is enjoyed rather than rushed.
- OVERDRIVE pulsed perfectly (ACTIVE_TWO_FINGER): ~12 % faster.
- Assertions (`--assert`, `src/game/balance.test.ts`): Meadow 15–24 min without ads, each rewarded ×2 worth 40–200 s,
  late game ≥ 85 % of the mid game (median, three seeds) and ≥ 50 % on the worst farm, no late gap > 75 s, no drought
  > 120 s, every SPEED level ≥ 7 % (milestones ≥ 14 %), late SPEED levels ≤ 2 min of income, every profile finishes.

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

### Feedback hierarchy ("pop", src/app/juice.ts, src/ui/Hud.ts)
Each step up is bigger, longer and louder than the one below it; routine things stay small so the big ones read.
| Moment | What happens |
|---|---|
| Bite / chunk / kill | recoil away from the biter, debris, chunk arcs into the eating segment; a kill topples with dust (no camera shake per crop) |
| Upgrade button (≈ 400 ms) | squash → stretch → settle, the icon jumps, the level badge flips and lands gold, the price ("−48") flies up and off the card, sparks; MERGE / OPEN FIELD / FINISH are 1.35× bigger. SPEED also surges the crawler (+25 % fading over 1.2 s), rears the head, kicks the camera and sends out a ring (bigger every 5th level) |
| Depot payout | sized against recent income: routine → a few coins; good → more coins, a bigger counter; big → a gold cascade, rings, a flash on the coin counter, a success haptic |
| Merge | pulled together, impact flash + ring + shockwave, a ripple runs down the whole chain; a never-seen level adds a golden fountain and a white shockwave before its dialog |
| Route growth | dust along the plot borders, the new stretch draws itself, living crops along the new border flinch away, the camera pulls back |
| New field | big ring, camera pull-back, fanfare, heavy haptic, banner |
| Farm finished (1.6 s, before its dialog) | the widest pull-back, the barn hops, crop confetti from the head and the hopper, a golden ring, the chain wiggles twice, what is left of the field twinkles in four waves, a fanfare (boom, cymbal, run, held chord), a success haptic, the progress bar fills gold and reads COMPLETE. The crawler coasts meanwhile (the throttle rests), the map waits and no ad can interrupt (the big-moment quiet covers the dialog) |

Evidence: `CAPTURE=1 npx playwright test capture --project=pixel7 -g pop:` writes frame-stepped clips and contact sheets
(`capture/pop-*.mp4`, `-sheet.png`); DOM animations are frame-stepped too (WAAPI runs on the compositor clock).

## Bonus economy: generous without ads (src/game/config.ts `BONUS`)
Freebies come from moments the player understands — no ad, no coins, no dice:
| Moment | Gift |
|---|---|
| 25 % of a farm cleared | free ×2-coins charge (3 min, start it when you like) |
| 50 % | free tornado |
| 75 % | free autopilot charge |
| every field you open | coins: 15 s of income, bursting from the head into the counter |
| farm finished | a free ×2-coins charge for the road (shown in the farm-complete dialog) |
| arriving on a new farm | a tornado to start with |
| (existing) lucky bugs, daily calendar, offline earnings | unchanged |

The reason is spelled out ("50 % CLEARED! Free tornado!") and the gift flies from the progress bar to its button, which
carries a green FREE tag until used; a free charge is one tap. Old saves get no retroactive gifts.

**Pay coins or watch an ad** (the ad is a way to pay, never the only sensible one):
| Action | Coins | Ad |
|---|---|---|
| Autopilot 3:00 | 180 s of current income (a convenience: about all you earn while it drives) | yes |
| Tornado | 90 s of income, ×1.6 for each one bought on the same farm | yes (3 min cooldown) |
| ×2 coins 3:00 | — (buying income with income would be a chore every optimiser repeats) | yes, or the free charge |
| One upgrade when stuck 20 s | the normal price | yes (badge "▶ +1", never "FREE") |

The buttons show the feature first; a small tag says how to get it: FREE, a coin price (dimmed while unaffordable), a
small ad mark. A tap with a free charge acts at once; otherwise a compact dialog spells out the reward — the coin button
leads when the coins are there, otherwise the ad does. A skipped or failed ad gives nothing and costs nothing.

**Tornadoes aim.** A tornado used to spin up 2.5 units ahead of the head — the route is the edge of the cleared land,
so it mostly swept bare ground (0–20 crops). It now races out to the densest patch of living crops within 14 units
(what the camera shows): 45–75 crops, finishing the farm 22–102 s sooner.

What a rewarded ad is worth (bots, seconds of progress): ×2 coins ≈ 110 s per ad (ACTIVE watching one every 10 min vs
ACTIVE_NO_ADS, five farms: 1:44:43 vs 2:05:08 with 11 ads); a tornado 22–102 s (forked runs); autopilot ~60 s for a
casual player and little for one who holds anyway — the dialog says what it does, so active players simply skip it.

## Monetization rules (src/platform/ads/AdPolicy.ts)
Rewarded (always opt-in, reward stated on the button): ×2 coins (3 min, stacks to 15), Autopilot (full speed hands-free,
3 min), tornado, one upgrade when stuck (2 min cooldown), offline ×3, gift ×3, farm complete ×2, daily ×2.

Interstitials — forced ads are the #1 complaint in Train Miner reviews, so they are rare and only at natural breaks
(after a depot unload once the coins landed, or after closing a reward dialog):
- never in the first 5 minutes of total play or the first 2 minutes of a session,
- at least 8 minutes apart, none within 5 minutes after a rewarded ad,
- never within 10 s of a big moment (route growth, merge, new field, FINAL HARVEST, farm finished), not while the
  player is steering (3 s quiet) or a tutorial hint is shown, at least 3 unloads between,
- at most 4 per hour. No banners.
Replaying the bots through the policy: the old rules (2 min apart, 10/hour) let every kind of player hit 10 an hour,
mostly after lucky-bug dialogs; now ACTIVE sees 1 in its first hour, CASUAL/IDLE 4, a player who watches rewarded ads
every 5 minutes none.

## Ideas for later
Rewarded "no interstitials for 20 minutes", remove-ads IAP / ad-skip tokens, more farms (data-driven), segment
accessories per level tier, weekly events, cloud save across devices.
