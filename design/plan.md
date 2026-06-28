# Sunfish: A Useless Odyssey — Design Plan

## Logline
You are a Mola mola (ocean sunfish), widely libeled as "the most useless fish
in the sea." Your one purpose: drag your floppy bulk from the Atlantic to the
Pacific and lay your eggs. The ocean disagrees with this plan.

## Profile
- Time: real-time, continuous.
- Space: continuous 2D (a vertical water column, surface → seabed, scrolling
  horizontally toward the goal).
- Agency: one hero (the sunfish).
- Conflict: vs system (environmental hazards).
- Content: procedural per-run (seeded roguelike hazard placement).
- Outcome: win (reach spawning ground & lay eggs) / lose (die) — run-based,
  permadeath, with persistent meta-upgrades.
- Players: solo.
- Session: minutes per run.
- Engagement: execution (skillful fluid dodging) primary; accumulation
  (plankton → permanent upgrades, distance records) secondary.

## Delivery context
Desktop + mobile browsers + gamepad. Primary input: pointer drag (touch/mouse).
Alternates: keyboard (physical key codes WASD/arrows), gamepad left stick.
Responsive canvas, DPR capped. All player-visible strings external (strings.js).

## Experience formula
The player feels like a fragile, lovable underdog because the game constantly
threatens this clumsy fish with an ocean of dangers while rewarding smooth,
graceful dodging toward one tender goal — laying its eggs.

## Verbs
- SWIM — drag to steer; the core verb. Currents push it, hazards collide with
  it, pickups respond to it.
- DASH — a quick flick releases a burst of speed (brief i-frames); unlockable /
  upgradable. The sunfish's one moment of grace.
- EAT — drift into plankton to consume it (score + meta-currency, tiny heal).
- LAY EGGS — the climax verb, performed at the spawning ground = win.

## Resistance × verb matrix
| Resistance | Answered by |
|---|---|
| Jagged rocks (splat on fast impact) | steer around; slow down near them |
| Currents / waves (shove) | swim across them; ride them when helpful |
| Seals (chase + lunge bite) | dodge the telegraphed lunge; DASH away |
| Boats — net (catch) | dive deep under the hull; struggle free if snared |
| Boats — propeller (cut) | stay out of the churning wake |
| Jellyfish (sting on contact) | thread the gaps between drifting bells |

## Teaching sequence (one pattern at a time)
Zone 1 Atlantic Shallows — rocks only (learn movement & collision).
Zone 2 Open Drift — + currents (learn fighting the push).
Zone 3 Cold Deep — + seals (learn dodging a hunter) and jellyfish.
Zone 4 Shipping Lane — + boats/nets/propellers (the exam: everything at once).
Zone 5 Spawning Ground — calm; lay eggs (the payoff).

## Meta-progression (roguelike)
Plankton banked across runs (localStorage). Between runs, spend it on permanent
upgrades: Vitality (+max HP), Grace (faster follow/turn), Dash (unlock/cooldown),
Slippery Skin (shorter snare), Lucky Roe (more eggs). Soft slowdown on cost curve.

## Interest curve
Hook: a wobbly fish flops onto screen and instantly must dodge. Alternating
calm plankton stretches and hazard peaks; maximum tension in the Shipping Lane
gauntlet, release at the Spawning Ground.

## Art production note
Every asset is drawn **procedurally in canvas code** (js/draw.js + js/sprites.js
+ js/background.js) from one shared style formula: wobbly "boiling" hand-inked
dark-teal outlines, soft watercolor washes, paper grain and drifting godrays. The
background song is an audio file (inlined into the standalone build); all other
sound — SFX, the music-box pad and ocean ambience — is synthesized live via the
Web Audio API (js/audio.js). Apart from the song, the game ships with no external
asset files.

## Style formula (locked — see assets.csv)
Soft hand-painted watercolor-and-ink storybook illustration, visible paper grain
and loose brush washes; rounded organic shapes with wobbly hand-inked dark-teal
outlines; ocean in layered teal-to-navy washes over a pale sandy seabed, the
sunfish hero in silvery moon-grey and warm cream that pops against the blue
water, hazards (seals, boat hulls, jagged rocks) in warm charcoal-brown, pickups
and eggs glowing warm amber-gold; gentle whimsical-melancholic light with soft
godrays from the surface; high contrast, clean readable silhouettes, consistent
side-view perspective across all assets.
