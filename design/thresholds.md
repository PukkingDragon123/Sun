# Thresholds & numeric contract (frozen before content)

## Performance
- Target ≥ 60 fps on the weakest declared platform (mid mobile browser).
- Fixed-timestep simulation at 60 Hz; render interpolated. Logic never depends
  on frame rate.
- devicePixelRatio capped at 1.5.
- Zero allocations inside the frame loop on the hot path (pooled particles).
- Same-type swarms (bubbles, plankton, particles) drawn cheaply; no per-entity
  heavyweight state.
- Seeded RNG (mulberry32) for per-run procedural placement → deterministic runs.

## Agency metrics (frozen before content)
- World units = screen pixels at a reference height of 720 logical px.
- Sunfish follow: critically-damped spring toward the pointer, max speed
  ~520 px/s base (upgradable), turn is velocity-derived (no instant snapping).
- Sunfish body radius ~38 px; **collision hitbox = 0.6 × visible radius**
  (player hitbox smaller than sprite — forgiveness). Hazard hitboxes honest.
- Dash: +impulse ~620 px burst over 0.28 s, 1.1 s cooldown, 0.35 s i-frames.
- Water column height = full viewport; surface band top ~8%, seabed band
  bottom ~10%.

## Combat / survival
- Base max HP = 3 (frail by design). Upgradable to 6.
- Damage: seal bite 1, rock splat 1 (only above impact-speed threshold
  ~260 px/s; gentle nudges free), jellyfish sting 1, propeller 2, net snare
  drains while caught.
- Invulnerability after any hit: 1.1 s (flashing).
- Net snare: being hauled up fills a meter over ~2.2 s; struggling (fast pointer
  motion) drains it; escape grants 0.6 s i-frames.

## Forgiveness windows
- Contact damage uses shrunken player hitbox (0.6×).
- Seal lunge telegraph: 0.55 s wind-up with clear visual before the dash.
- Coyote tolerance on dash input (queued ~120 ms).

## Progression
- Goal distance ~ 9000 world px across 5 zones.
- Plankton: source = drifting clusters in-world; sink = meta-upgrade shop.
- Eggs laid at the end scale with run quality (HP remaining + plankton + an
  upgrade) — pure flourish/score.
