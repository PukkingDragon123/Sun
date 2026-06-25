# 🐡 Sunfish: A Useless Odyssey

A hand-painted 2D survival-roguelike. You play the **ocean sunfish (Mola mola)** —
widely libeled as the most useless fish in the sea — dragging your wobbly bulk
from the **Atlantic to the Pacific** to lay your eggs. The ocean has other plans.

## ▶ Play in your browser (no install)

A single self-contained build lives at [`standalone.html`](standalone.html) — open
it directly, or play it straight from GitHub via the htmlpreview proxy:

**https://htmlpreview.github.io/?https://raw.githubusercontent.com/PukkingDragon123/Sun/refs/heads/claude/wonderful-allen-v6r65s/standalone.html**

(First load takes a second while htmlpreview fetches the file.) For the cleanest
result, enable **GitHub Pages** on this branch — see below.


> Drag with your finger (or mouse) and the slow, weighty fish follows with
> smooth spring physics; ambient **waves** nudge you the whole way. Flick to
> dash. The crossing is **long** and spans nine regions that get darker and
> deadlier before the calm finale.
>
> **Hazards:** **strong currents**, sea urchins, sea mines, anchors, baited
> hooks, **fishing nets** (you bleed while tangled), **boat propellers**,
> **jellyfish swarms** (sting *and* slow you), and **plastic pollution** that
> looks like a jellyfish and *poisons* you.
>
> **Predators:** sea lions, **blue sharks**, **cookiecutter sharks** (they take a
> round chunk — you swim on *cut like a cookie*), **swordfish** (easy straight
> lunges early on), barracuda, anglerfish, pufferfish, **squid** (they grab), and
> the rare boss-tier **orca**. Every wind-up shows a red **attack-area** so you
> can read it. Bite-wounds are permanent open chunks that **slow you down** the
> more you collect.
>
> Your run opens with a **hatch** — you and a sibling, briefly — and ends, when
> it ends, with a slow, sad **sink** to the seabed.
>
> Grab **boosters** mid-run (Nurse Shark heal-over-time, Swift Current, Bubble
> Shield). Region **checkpoints** let you revive. Reach the Spawning Ground, lay
> your eggs (the lifetime tally climbs), win — then spend eggs on **loot-box
> clams** for 16 collectible **skins**. Die, gorily, and try again a little less
> useless each run.

## Play

It's a static web game (HTML5 canvas, no build step). ES modules need to be
served over HTTP, so:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

(or any static host / GitHub Pages). Add `?dev=1` to the URL for an FPS overlay.

### Controls
- **Touch / mouse:** drag anywhere to swim · quick **flick** to dash
- **Keyboard:** WASD / arrow keys · **Space** to dash · **M** to mute
- **Gamepad:** left stick to swim · **A** to dash

## Roguelike loop
**Nine regions** introduce hazards a few at a time — Sunlit Shallows → Kelp
Forest → Open Drift → Jelly Bloom → Cold Deep → Twilight Zone → Shipping Lane →
Midnight Trench → Spawning Ground — getting darker and deadlier before the calm
finale. The crossing is long, but every region boundary is a **checkpoint**:
when you die you can **revive** there (free with *Second Wind*, otherwise for
eggs).

The **eggs** you gather from food are the currency. Dying still banks what you
collected; finishing lays the whole clutch (and adds to a lifetime total). Spend
eggs two ways:

- *Tide-Pool Outfitters* — permanent upgrades: more hearts, faster swimming, the
  dash, slippery skin, lucky roe, a gill **magnet**, thick hide, a **head start**
  (begin further along), and **Second Wind** (a free revive).
- *Mystery Clams* — loot boxes that always hand you a **skin you don't own yet**
  (16 skins across four rarities) until the set is complete; after that, dupes
  refund eggs. Dress your useless fish in the **Wardrobe**, and admire it
  swimming in the calm of the upgrade screen.

Runs are seeded, so each crossing is freshly generated.

## How it's built
Vanilla JS + Canvas 2D, no dependencies. Fixed-timestep simulation,
resolution-independent world units, DPR-capped responsive canvas.

The "polished hand-drawn" look is **rendered procedurally** — wobbly *boiling*
ink outlines, soft watercolor washes, paper grain and drifting godrays — so the
game ships with zero asset files. Layered surface swells and flowing-streamline
currents keep the water fluid; kelp sways in time with the wave surge; a school
of **tuna** and the occasional **whale** drift through the deep background;
predators are drawn with realistic countershading and fins; and the sunfish
accrues bleeding bite-wounds and gets visibly sadder the more it's hurt. Audio
is synthesized live via the Web Audio API. See `design/` for the design plan,
the art/audio manifest, and the frozen numeric thresholds.

```
index.html        page shell, boots js/main.js
logic.js          apps-engine solo stub
js/
  config.js       all tunable numbers (one place)
  strings.js      all player-visible text
  utils.js        math, seeded RNG, noise
  draw.js         hand-drawn primitives (boil, sketch, wash, godrays, paper)
  sprites.js      procedural creatures & objects
  background.js   layered parallax ocean backdrop
  entities.js     player + hazards + pickups + particle pool
  world.js        seeded zone generation
  audio.js        Web Audio SFX / ambience / music
  input.js        pointer drag + keyboard + gamepad
  game.js         states, camera, collisions, HUD, shop, save
  main.js         canvas + fixed-timestep loop
```
