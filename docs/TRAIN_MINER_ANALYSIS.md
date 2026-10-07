# Train Miner — what to learn, what to do better

Short, implementation-oriented notes. Sources: FLEXUS/Azur dev story (PocketGamer.biz interview, Azur's
dev-story post), store pages, review aggregates. We copy *principles*, never presentation.

## What made it work

| Finding | Evidence | What Crop Crawler does |
|---|---|---|
| **The world is the progress bar.** Early builds used a fixed rectangular loop; the turning point was: *"when a resource tile is cleared, a new piece of track spawns in its place."* | FLEXUS dev story | The route is the **boundary of the territory you have cleared**. Clearing the crops next to the route lets the territory (and the route) push outward into that plot. Crops never regrow. |
| **Resource damage is the polish.** Tiles "took damage from different wagon types at varying angles, broke apart unevenly"; clones "couldn't replicate the polish". | dev story | Staged crop damage (healthy → bitten → stripped → stump) with **directional** knock-back from the side the chomper hit, chunks flying into the basket. |
| **Hold anywhere** beats swipes; players "just love doing loops"; many never upgrade. | dev story | Hold-to-crawl, idle crawl when released, a loop that is satisfying even without upgrades. |
| **Visible load matters**: shrinking the stack height cost ~10 % D7. Loaded vs empty train animate differently. | dev story | Tall wobbling stacks per segment; full baskets look stuffed, body compresses a little, heavier settle. |
| **Sound sells speed.** | dev story | Speed-linked servo whirr + leg ticks (quiet), loud *rewards*. |
| **Fewer, cleaner tools.** Specialised wagons (axe/pickaxe/drill) cluttered the screen → replaced by merging. | dev story | One segment type, auto-MERGE to the next level. |
| **Content is retention.** 5 islands at launch → 20+; D1 35 % → 50 % after six months of look-and-feel polish. | dev story | 5 farms with distinct crops/biomes; every farm visibly transforms from dense field to conquered meadow. |

## Known weaknesses (reviews) and our answers

| Complaint | Our answer |
|---|---|
| Forced ads, heavy monetisation | Interstitials only at natural breaks with long cooldowns and a 5-min grace; never during control or celebrations; rewarded ads always optional and labelled. |
| Grindy / repetitive later | The *map changes every minute* (route growth, fences opening, territory turning into meadow); zone gates are free once a zone is mostly cleared, so there is never a dead grind. |
| Same loop forever | Route grows organically per plot; each farm's territory shape depends on how *you* cleared it. |
| Performance degradation | Route changes are incremental (rebuild on growth only), crops are instanced with dirty-range uploads, no per-bite geometry work. |

## Interaction rules we adopt

1. **Territory, not tiles-to-rail.** Plots (3×3 crops) adjacent to the route become *ready* when every crop of the plot
   that the chompers can reach is destroyed. A short beat later the plot joins the territory and the route bulges out
   around it (always one simple loop, same direction, smooth fillets).
2. **Zones** (4 per farm, richer crops further out) are fenced. A fence opens for coins (early) or **for free once the
   current zone is ≥ 85 % cleared** — no economic dead end is possible.
3. **Depot**: a painted unloading pad on the route in front of the barn. Cargo transfers *while you roll through*
   (each segment unloads as it passes the chute, coins credited in a rolling wave) with a gentle magnetic slow-down.
   No stopping, no guessing.
4. **Finish** a farm by clearing it (≥ 90 %), not by paying.
