// Seeded procedural world generation. One new hazard is introduced per zone
// (the teaching sequence from the design plan); difficulty escalates toward
// the Shipping Lane, then releases at the Spawning Ground.
import { WORLD, WATER, REF_H } from './config.js';
import { makeRng } from './utils.js';
import { Rock, Plankton, Kelp, Current } from './entities.js';

export function zoneAt(x) {
  const f = x / WORLD.goalDistance;
  for (const z of WORLD.zones) if (f <= z.end) return z;
  return WORLD.zones[WORLD.zones.length - 1];
}

function rockAt(x, rng) {
  const r = rng.range(42, 92);
  const onFloor = rng.chance(0.7);
  const y = onFloor
    ? REF_H - WATER.seabedBand - r * 0.3
    : rng.range(REF_H * 0.32, REF_H - WATER.seabedBand - r);
  return new Rock(x, y, r, Math.floor(rng() * 1e6));
}

function currentAt(x, rng) {
  const w = rng.range(320, 620);
  const top = rng.range(WATER.surfaceBand + 30, REF_H * 0.5);
  const h = rng.range(180, 320);
  const fx = (rng.chance(0.7) ? -1 : 1) * rng.range(70, 150); // mostly opposing
  const fy = (rng.chance(0.5) ? -1 : 1) * rng.range(20, 70);
  return new Current(x, x + w, top, Math.min(REF_H - WATER.seabedBand, top + h), fx, fy);
}

const colY = (rng, pad = 110) => rng.range(WATER.surfaceBand + pad, REF_H - WATER.seabedBand - pad);

export function generateWorld(seed) {
  const rng = makeRng(seed >>> 0);
  const G = WORLD.goalDistance;
  const rocks = [], plankton = [], kelp = [], currents = [], spawners = [];

  // decorative kelp along the floor everywhere
  for (let x = 160; x < G; x += rng.range(240, 460)) {
    if (rng.chance(0.6)) kelp.push(new Kelp(x + rng.range(-30, 30), rng.range(120, 280), Math.floor(rng() * 1e6)));
  }

  let x = 680;
  while (x < G - 640) {
    const z = zoneAt(x).id;

    if (rng.chance(0.82)) plankton.push(new Plankton(x + rng.range(-40, 40), colY(rng, 80), rng.chance(0.12)));

    if (z === 'shallows') {
      if (rng.chance(0.7)) rocks.push(rockAt(x, rng));
    } else if (z === 'drift') {
      if (rng.chance(0.45)) rocks.push(rockAt(x, rng));
      if (rng.chance(0.5)) currents.push(currentAt(x, rng));
    } else if (z === 'deep') {
      if (rng.chance(0.4)) rocks.push(rockAt(x, rng));
      if (rng.chance(0.4)) currents.push(currentAt(x, rng));
      if (rng.chance(0.5)) spawners.push({ x, type: 'seal', y: colY(rng, 130) });
      if (rng.chance(0.4)) spawners.push({ x: x + rng.range(40, 140), type: 'jelly', y: colY(rng, 90) });
    } else if (z === 'lane') {
      if (rng.chance(0.3)) rocks.push(rockAt(x, rng));
      if (rng.chance(0.35)) currents.push(currentAt(x, rng));
      if (rng.chance(0.4)) spawners.push({ x, type: 'seal', y: colY(rng, 130) });
      if (rng.chance(0.3)) spawners.push({ x, type: 'jelly', y: colY(rng, 90) });
      if (rng.chance(0.62)) spawners.push({ x, type: 'boat', dir: rng.chance(0.5) ? -1 : 1 });
    } else { // spawning ground — calm, generous plankton
      plankton.push(new Plankton(x, colY(rng, 70), rng.chance(0.3)));
      if (rng.chance(0.4)) plankton.push(new Plankton(x + rng.range(60, 160), colY(rng, 70), false));
    }

    x += rng.range(300, 520);
  }

  spawners.sort((a, b) => a.x - b.x);
  return { rocks, plankton, kelp, currents, spawners, goal: G };
}
