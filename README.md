# 🐡 Sunfish: A Useless Odyssey

A hand-painted 2D survival-roguelike. You play the **ocean sunfish (Mola mola)** —
widely libeled as the most useless fish in the sea — dragging your wobbly bulk
from the **Atlantic to the Pacific** to lay your eggs. The ocean has other plans.

> Drag with your finger (or mouse) and the fish follows with smooth spring
> physics. Flick to dash. Dodge **rocks**, **currents**, **seals**, **jellyfish**
> and **fishing boats** (their nets *catch* you, their propellers *cut* you).
> Reach the Spawning Ground, lay your eggs, win. Die — and try again, a little
> less useless each run.

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
Five zones introduce one hazard at a time (Shallows → Drift → Cold Deep →
Shipping Lane → Spawning Ground). Permadeath, but the **plankton** you collect
banks between runs — spend it in the *Tide-Pool Outfitters* on permanent
upgrades (more hearts, faster swimming, the dash, slippery skin, luckier roe).
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
