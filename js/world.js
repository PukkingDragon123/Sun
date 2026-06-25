// Seeded procedural world generation across nine regions. Each region has its
// own roster of hazards (the teaching sequence escalates from the Sunlit
// Shallows to the Midnight Trench, then releases at the Spawning Ground).
// The crossing is long; region checkpoints (one per zone boundary) make it
// survivable, and meta-upgrades make it shorter.
import { WORLD, WATER, REF_H } from './config.js';
import { makeRng } from './utils.js';
import {
  Rock, Coral, Anchor, Urchin, Mine, Hook, PlasticBag, Booster,
  Plankton, Kelp, Current,
} from './entities.js';

export function zoneIndexAt(x) {
  const f = x / WORLD.goalDistance;
  for (let i = 0; i < WORLD.zones.length; i++) if (f <= WORLD.zones[i].end) return i;
  return WORLD.zones.length - 1;
}
export function zoneAt(x) { return WORLD.zones[zoneIndexAt(x)]; }
export function zoneStartX(idx) { return idx <= 0 ? 0 : WORLD.zones[idx - 1].end * WORLD.goalDistance; }

function rockAt(x, rng, r0 = 42, r1 = 92) {
  const r = rng.range(r0, r1);
  const onFloor = rng.chance(0.7);
  const y = onFloor ? REF_H - WATER.seabedBand - r * 0.3 : rng.range(REF_H * 0.32, REF_H - WATER.seabedBand - r);
  return new Rock(x, y, r, Math.floor(rng() * 1e6));
}
function currentAt(x, rng, strong = false) {
  const w = rng.range(340, 660);
  const top = rng.range(WATER.surfaceBand + 30, REF_H * 0.5);
  const h = rng.range(190, 330);
  const mul = strong ? 2.2 : 1;
  const fx = (rng.chance(0.7) ? -1 : 1) * rng.range(60, 130) * mul;
  const fy = (rng.chance(0.5) ? -1 : 1) * rng.range(18, 60) * mul;
  return new Current(x, x + w, top, Math.min(REF_H - WATER.seabedBand, top + h), fx, fy, strong);
}
const colY = (rng, pad = 110) => rng.range(WATER.surfaceBand + pad, REF_H - WATER.seabedBand - pad);
const floorY = (rng, off = 0) => REF_H - WATER.seabedBand - off - rng.range(0, 18);

export function generateWorld(seed) {
  const rng = makeRng(seed >>> 0);
  const G = WORLD.goalDistance;
  const rocks = [], corals = [], anchors = [], urchins = [], mines = [], hooks = [];
  const bags = [], boosters = [];
  const plankton = [], kelp = [], currents = [], spawners = [];
  const boosterType = () => rng.pick(['nurse', 'nurse', 'nurse', 'swift', 'shield']);
  const dropBooster = (x) => boosters.push(new Booster(x, colY(rng, 90), boosterType()));

  // decorative kelp along the floor (denser in the Kelp Forest)
  for (let x = 160; x < G; x += rng.range(220, 440)) {
    const z = zoneAt(x).id;
    const p = z === 'kelp' ? 0.95 : (z === 'shallows' || z === 'bloom') ? 0.6 : 0.35;
    if (rng.chance(p)) kelp.push(new Kelp(x + rng.range(-30, 30), rng.range(120, 300), Math.floor(rng() * 1e6)));
  }

  let x = 720;
  while (x < G - 720) {
    const z = zoneAt(x).id;
    const foodP = (z === 'twilight' || z === 'trench') ? 0.5 : z === 'spawn' ? 1 : 0.82;
    if (rng.chance(foodP)) plankton.push(new Plankton(x + rng.range(-40, 40), colY(rng, 80), rng.chance(0.14)));
    if (rng.chance(0.07)) dropBooster(x);

    switch (z) {
      case 'shallows':
        if (rng.chance(0.4)) spawners.push({ x, type: 'swordfish', y: colY(rng, 120) });
        if (rng.chance(0.45)) rocks.push(rockAt(x, rng, 40, 78));
        if (rng.chance(0.25)) corals.push(new Coral(x + rng.range(-30, 30), floorY(rng, 10), rng.range(38, 64), Math.floor(rng() * 1e6)));
        break;
      case 'kelp':
        if (rng.chance(0.4)) spawners.push({ x, type: 'swordfish', y: colY(rng, 120) });
        if (rng.chance(0.45)) urchins.push(new Urchin(x, floorY(rng, 6), rng.range(22, 34), Math.floor(rng() * 1e6)));
        if (rng.chance(0.4)) corals.push(new Coral(x + rng.range(-30, 30), floorY(rng, 8), rng.range(40, 70), Math.floor(rng() * 1e6)));
        if (rng.chance(0.3)) spawners.push({ x, type: 'barracuda', y: colY(rng, 120) });
        break;
      case 'drift':
        if (rng.chance(0.5)) currents.push(currentAt(x, rng, rng.chance(0.3)));
        if (rng.chance(0.35)) rocks.push(rockAt(x, rng));
        if (rng.chance(0.4)) spawners.push({ x: x + rng.range(20, 120), type: 'jelly', y: colY(rng, 90) });
        if (rng.chance(0.3)) spawners.push({ x, type: 'barracuda', y: colY(rng, 120) });
        if (rng.chance(0.28)) bags.push(new PlasticBag(x + rng.range(-30, 60), colY(rng, 90)));
        break;
      case 'bloom':
        // jelly SWARMS — clusters that sting and slow you
        for (let k = 0, n = rng.int(2, 5); k < n; k++) spawners.push({ x: x + rng.range(-70, 130), type: 'jelly', y: colY(rng, 70) });
        if (rng.chance(0.5)) bags.push(new PlasticBag(x + rng.range(-30, 60), colY(rng, 80)));
        if (rng.chance(0.35)) spawners.push({ x, type: 'puffer', y: colY(rng, 110) });
        if (rng.chance(0.3)) spawners.push({ x, type: 'copepod', y: colY(rng, 90) });
        if (rng.chance(0.25)) mines.push(new Mine(x + rng.range(-30, 60), colY(rng, 90)));
        break;
      case 'deep':
        if (rng.chance(0.45)) currents.push(currentAt(x, rng, rng.chance(0.5)));
        if (rng.chance(0.35)) spawners.push({ x, type: 'seal', y: colY(rng, 130) });
        if (rng.chance(0.4)) spawners.push({ x, type: 'shark', y: colY(rng, 140) });
        if (rng.chance(0.3)) spawners.push({ x, type: 'cookiecutter', y: colY(rng, 120) });
        if (rng.chance(0.25)) spawners.push({ x, type: 'copepod', y: colY(rng, 100) });
        if (rng.chance(0.08)) spawners.push({ x, type: 'orca', y: colY(rng, 170) });
        break;
      case 'twilight':
        if (rng.chance(0.5)) spawners.push({ x, type: 'angler', y: colY(rng, 150) });
        if (rng.chance(0.35)) spawners.push({ x, type: 'cookiecutter', y: colY(rng, 130) });
        if (rng.chance(0.3)) mines.push(new Mine(x + rng.range(-30, 60), colY(rng, 100)));
        if (rng.chance(0.25)) bags.push(new PlasticBag(x + rng.range(-30, 60), colY(rng, 100)));
        break;
      case 'lane':
        if (rng.chance(0.6)) spawners.push({ x, type: 'boat', dir: rng.chance(0.5) ? -1 : 1 });
        if (rng.chance(0.45)) hooks.push(new Hook(x + rng.range(-40, 40), rng.range(REF_H * 0.28, REF_H * 0.6)));
        if (rng.chance(0.4)) bags.push(new PlasticBag(x + rng.range(-30, 60), colY(rng, 90)));  // pollution
        if (rng.chance(0.3)) mines.push(new Mine(x + rng.range(-30, 60), colY(rng, 90)));
        if (rng.chance(0.3)) anchors.push(new Anchor(x + rng.range(-20, 20), floorY(rng, 30), rng.range(54, 78)));
        if (rng.chance(0.3)) spawners.push({ x, type: 'shark', y: colY(rng, 140) });
        break;
      case 'trench':
        if (rng.chance(0.45)) spawners.push({ x, type: 'squid', y: colY(rng, 150) });
        if (rng.chance(0.3)) spawners.push({ x, type: 'angler', y: colY(rng, 150) });
        if (rng.chance(0.3)) spawners.push({ x, type: 'cookiecutter', y: colY(rng, 130) });
        if (rng.chance(0.1)) spawners.push({ x, type: 'orca', y: colY(rng, 170) });
        if (rng.chance(0.4)) mines.push(new Mine(x + rng.range(-30, 60), colY(rng, 90)));
        break;
      default: // spawn — calm, generous food + a parting gift
        plankton.push(new Plankton(x, colY(rng, 70), rng.chance(0.35)));
        if (rng.chance(0.4)) plankton.push(new Plankton(x + rng.range(60, 160), colY(rng, 70), false));
        if (rng.chance(0.2)) dropBooster(x);
        if (rng.chance(0.3)) corals.push(new Coral(x, floorY(rng, 8), rng.range(40, 64), Math.floor(rng() * 1e6)));
    }

    x += rng.range(280, 500);
  }

  spawners.sort((a, b) => a.x - b.x);
  const checkpoints = WORLD.zones.map((z, i) => ({ x: zoneStartX(i), zoneIdx: i }));
  return { rocks, corals, anchors, urchins, mines, hooks, bags, boosters, plankton, kelp, currents, spawners, checkpoints, goal: G };
}
