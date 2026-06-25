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
> smooth spring physics. Flick to dash. The crossing is **long** and spans nine
> regions — dodge **rocks, coral, currents, sea urchins, mines, anchors and
> baited hooks**, and outwit **seals, sharks, barracuda, anglerfish, pufferfish,
> squid, jellyfish and fishing boats** (nets *catch* you, propellers *cut* you,
> squid *grab* you). Region **checkpoints** let you revive; meta-upgrades make
> the trek shorter and gentler. Reach the Spawning Ground, lay your eggs (the
> lifetime tally keeps climbing), win. Then spend eggs on **loot-box clams** for
> 16 collectible **skins**. Die — and try again, a little less useless each run.

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
- *Mystery Clams* — loot boxes that drop one of **16 skins** across four
  rarities (dupes refund eggs). Dress your useless fish in the **Wardrobe**.

Runs are seeded, so each crossing is freshly generated.

## How it's built
Vanilla JS + Canvas 2D, no dependencies. Fixed-timestep simulation,
resolution-independent world units, DPR-capped responsive canvas.

The "polished hand-drawn" look is **rendered procedurally** — wobbly *boiling*
ink outlines, soft watercolor washes, paper grain and drifting godrays — so the
game ships with zero asset files. Audio is synthesized live via the Web Audio
API. See `design/` for the design plan, the art/audio manifest, and the frozen
numeric thresholds.

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
