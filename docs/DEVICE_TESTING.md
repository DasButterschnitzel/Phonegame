# Testing on a physical Android phone

Everything automated in this repo runs in desktop Chromium with a software GPU (SwiftShader). That checks logic,
layout, loudness and main-thread cost, but it says nothing reliable about a phone's GPU, its thermals, how the motor
actually sounds through a phone speaker, or how a thumb feels on the glass. This page is the checklist for that part.

## 1. Install

- Debug APK: GitHub → Actions → **Android** → latest run on `ccr-03b75db9-3a33mp` → artifact `crop-crawler-debug-apk`
  (a zip with `app-debug.apk` inside), or the APK file shared in the chat.
- Sideload it (allow "install unknown apps" for your file manager / browser). It installs over the previous debug
  build and keeps the save.

## 2. Switch on the performance overlay

Settings (gear) → tap the line **"Crop Crawler v…"** at the bottom **seven times quickly** → toast "Performance
overlay on". Close Settings. The same gesture switches it off again; the choice is saved. Players never see it unless
they do this.

| Line | Meaning |
| --- | --- |
| `58 fps (cap 60)  hitches>50ms: 0` | frames per second, the frame cap (60 in play, 30 under a dialog), slow frames in the last ~10 s |
| `frame 16.7 p95 … p99 … max …` | wall time between frames over the last ~2 s (ms) — **the smoothness number** |
| `main 3.1 p95 …` | JavaScript work per frame (simulation + rendering setup + HUD), ms |
| `1080×2340 @1.50 (max 1.50) tier med` | drawing-buffer size, current resolution scale (drops automatically when the GPU can't keep up), quality tier |
| `calls 38 tris 160k heap 40/512 MB` | draw calls and triangles last frame, JS heap |
| `GPU …` | the GPU/driver name WebGL reports |

**Tap the overlay** to copy all of it to the clipboard — paste that into the chat with a note of what was happening.

**Release builds keep this gesture** (decision: hidden developer tools are worth it for remote QA, and a player is
unlikely to stumble on seven quick taps on the version line). It shows only local performance numbers — frame times,
resolution, quality tier, draw calls, triangles, JS heap, and the GPU name WebGL reports. No ad or device IDs, no
consent state, no save contents, nothing personal; nothing is sent anywhere (copying is a manual tap).

What "good" looks like: `frame` median ≈ 16.7 with p95 under ~20 and no `max` above ~50 during normal play;
`hitches>50ms` staying at 0 for long stretches. A falling `@` value means the dynamic resolution is stepping down
(GPU-bound); `tier low` on a recent phone means GPU detection guessed wrong (Settings → Graphics lets you force it).

## 3. What to try, and what to look for

Play with sound on, phone speaker (not headphones) first, then headphones.

**First minute (harvest feel)**
- Hold to crawl. Do crops next to the path visibly get *bitten* — a notch with lighter flesh on the side facing the
  caterpillar, then a big bite, then a stump, then a quick topple with a little dirt puff and stubble?
- Do chunks visibly fly from the bitten crop into the segment that ate it, and does that stack grow when they land?
- Is there any frame hitch on the very first bite? (Should not be: the overlay's `max` should stay low.)

**Motion**
- Press and release: does the caterpillar respond on the next frame (no delay)? Antennae lag back when it speeds up
  and swing forward when it brakes?
- Around corners: does the head lead and the body follow smoothly, no snapping?
- Feet: do they look planted while the body moves over them (no ice-skating)?

**Depot**
- With a few segments: the unload should take about half a second; with a long caterpillar about one second, never
  more than ~1.4 s. Can you *watch* each stack lift off and land in the hopper, front to back, with the counter and
  coins following?

**Big moments** — watch the overlay's `max` and `hitches`: route growth, opening a field (fence), tornado, merge,
travelling to another farm (the farm swap happens behind the cloud curtain; the frames after it should be smooth).

**Sound** (the important human check — loudness tests passed, but that does not prove it sounds good)
- Motor: should read as a tiny electric servo — soft, slightly futuristic. Write down if it ever sounds like a fart,
  moped, lawnmower, angry bee or a buzzing phone. It should sit *under* every gameplay sound.
- Bites: varied, never machine-gun identical; big crops lower than small ones; the last bite (collapse) clearly
  different from an ordinary bite.
- Unload: hopper clack → a rising run of plinks → ka-ching at the end.
- Listening clips without the game: `npx playwright test capture -g "listening"` with `CAPTURE=1` writes WAVs
  (motor at crawl/full, a row of bites, an unload wave) to `capture/audio/` — play them on the phone speaker.

**Touch and interruptions**
- Two fingers, lift one: still crawling; lift both: slows down.
- Hold, then pull down the notification shade / take a call / press Home / switch apps; come back: the throttle must
  not be stuck on, the game is paused while away and resumes cleanly.
- Tap upgrade buttons while holding the screen with another finger: the button works, the crawl continues.

**Thermals / battery** (15 minutes of normal play)
- Note battery % before and after, whether the phone gets warm, and whether `fps` or `@` drift down over time.
- Leave it idle (not touching) for a minute: after ~30 s without input (and no autopilot boost) the game drops to
  30 fps to save power — the overlay's `cap` shows it. Any touch brings 60 back on the next frame.

## 4. Deeper: Chrome DevTools on the phone (debug APK only)

USB debugging on → plug in → desktop Chrome → `chrome://inspect` → "Crop Crawler" WebView → **inspect**. The
Performance panel can record a trace of a hitch; the Console shows any errors.

## 5. Rendering budget (what the overlay's `tris` should read)

Measured in the pacing scenarios (`PACING=1 npx playwright test pacing --project=pixel7`, medium tier):
| Scene | Triangles before → after the instance packing |
| --- | --- |
| idle crawl / full-speed harvesting | 157k / 163k → 111k / 116k |
| route growth, merge, field opening, tornado | 159–167k → 112–121k |
| long caterpillar on a big farm | 173k → 122k |
| large unload (the old peak) | 202k → 158k |
| zoomed far out | 202k → 151k |

Where the triangles were: dead and bitten crops were still drawn (zero-scaled) by the untouched-crop meshes, and the
dressing of every plot not yet claimed was too — about 30 % of the peak, all invisible. Crops never regrow and claimed
plots stay claimed, so those slots are now released and the buffers repacked (`src/render/views/FieldView.ts`,
`TerritoryView.ts`; tests check that exactly the crops and dressing that exist are drawn).

Effects by tier: low-end phones show essential feedback only (bite debris, kills, coins, rings, golden sparkles —
at half the particle count) and skip decorative extras (farm-finish confetti and twinkles, merge fountains, speed
streaks, kicked-up dirt); medium is the normal set; high-end phones get 1.6× the extras. Never gameplay.

At top speed (Lv 15 with OVERDRIVE ≈ 10–14 u/s) the camera used to trail the head (its aim 1.4–1.9 units behind);
the look-ahead now grows with speed along the route, so the view leads the head by the same margin at any speed.
Damage per pass and the depot wave are tested at those speeds (sim tests).

## 6. What has and hasn't been verified

Verified by automation (software GPU, desktop CPU throttled 4× for pacing): game logic, saves, layouts, loudness and
spectrum of every sound, main-thread frame cost of the heavy moments. **Not verified on a real phone**: GPU frame
times, thermals, battery, how the audio actually sounds on a phone speaker, touch latency on real hardware.
