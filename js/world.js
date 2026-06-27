// Seeded procedural world generation across nine regions. Rocks and coral have
// been retired; the seabed now leans on kelp, urchins and the region predators.
// The crossing is long; region checkpoints make it survivable, upgrades shorten
// it. (rocks/corals are still returned as empty arrays for back-compat.)
import { WORLD, WATER, REF_H } from './config.js';
import { makeRng } from './utils.js';
import { Anchor, Urchin, Mine, Hook, PlasticBag, Booster, Plankton, Kelp, Current, Whirlpool, SeaVent } from './entities.js';

export function zoneIndexAt(x) {
  const f = x / WORLD.goalDistance;
  for (let i = 0; i < WORLD.zones.length; i++) if (f <= WORLD.zones[i].end) return i;
  return WORLD.zones.length - 1;
}
export function zoneAt(x) { return WORLD.zones[zoneIndexAt(x)]; }
export function zoneStartX(idx) { return idx <= 0 ? 0 : WORLD.zones[idx - 1].end * WORLD.goalDistance; }

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
  const rocks = [], corals = [];   // retired — kept empty for back-compat
  const anchors = [], urchins = [], mines = [], hooks = [], bags = [], boosters = [];
  const plankton = [], kelp = [], currents = [], spawners = [], whirlpools = [], vents = [];
  const boosterType = () => rng.pick(['nurse', 'nurse', 'nurse', 'swift', 'shield']);
  const dropBooster = (x) => boosters.push(new Booster(x, colY(rng, 90), boosterType()));

  // lush kelp along the floor, in little clumps (denser in the Kelp Forest)
  for (let x = 140; x < G; x += rng.range(150, 320)) {
    const z = zoneAt(x).id;
    const p = z === 'kelp' ? 0.96 : (z === 'shallows' || z === 'bloom' || z === 'spawn') ? 0.7 : 0.42;
    if (rng.chance(p)) {
      const clump = rng.int(1, z === 'kelp' ? 4 : 2);
      for (let k = 0; k < clump; k++) kelp.push(new Kelp(x + rng.range(-24, 24), rng.range(130, 320), Math.floor(rng() * 1e6)));
    }
  }

  let x = 720;
  while (x < G - 720) {
    const z = zoneAt(x).id;
    const foodP = (z === 'twilight' || z === 'trench') ? 0.5 : z === 'spawn' ? 1 : 0.85;
    if (rng.chance(foodP)) plankton.push(new Plankton(x + rng.range(-40, 40), colY(rng, 80), rng.chance(0.14)));
    if (rng.chance(0.07)) dropBooster(x);

    switch (z) {
      case 'shallows':
        if (rng.chance(0.4)) spawners.push({ x, type: 'swordfish', y: colY(rng, 120) });
        if (rng.chance(0.34)) spawners.push({ x, type: 'crab', y: floorY(rng, 8) });
        break;
      case 'kelp':
        if (rng.chance(0.42)) urchins.push(new Urchin(x, floorY(rng, 6), rng.range(22, 34), Math.floor(rng() * 1e6)));
        if (rng.chance(0.42)) spawners.push({ x, type: 'swordfish', y: colY(rng, 120) });
        if (rng.chance(0.32)) spawners.push({ x, type: 'barracuda', y: colY(rng, 120) });
        if (rng.chance(0.3)) spawners.push({ x, type: 'lionfish', y: colY(rng, 120) });
        if (rng.chance(0.34)) spawners.push({ x, type: 'crab', y: floorY(rng, 8) });
        break;
      case 'drift':
        if (rng.chance(0.5)) currents.push(currentAt(x, rng, rng.chance(0.3)));
        if (rng.chance(0.42)) spawners.push({ x: x + rng.range(20, 120), type: 'jelly', y: colY(rng, 90) });
        if (rng.chance(0.32)) spawners.push({ x, type: 'barracuda', y: colY(rng, 120) });
        if (rng.chance(0.28)) bags.push(new PlasticBag(x + rng.range(-30, 60), colY(rng, 90)));
        if (rng.chance(0.3)) whirlpools.push(new Whirlpool(x + rng.range(40, 160), colY(rng, 200)));
        break;
      case 'bloom':
        for (let k = 0, n = rng.int(2, 5); k < n; k++) spawners.push({ x: x + rng.range(-70, 130), type: 'jelly', y: colY(rng, 70) });
        if (rng.chance(0.5)) bags.push(new PlasticBag(x + rng.range(-30, 60), colY(rng, 80)));
        if (rng.chance(0.38)) spawners.push({ x, type: 'puffer', y: colY(rng, 110) });
        if (rng.chance(0.25)) mines.push(new Mine(x + rng.range(-30, 60), colY(rng, 90)));
        if (rng.chance(0.34)) spawners.push({ x, type: 'lionfish', y: colY(rng, 90) });
        break;
      case 'deep':
        if (rng.chance(0.45)) currents.push(currentAt(x, rng, rng.chance(0.5)));
        if (rng.chance(0.4)) spawners.push({ x, type: 'seal', y: colY(rng, 130) });
        if (rng.chance(0.42)) spawners.push({ x, type: 'shark', y: colY(rng, 140) });
        if (rng.chance(0.32)) spawners.push({ x, type: 'cookiecutter', y: colY(rng, 120) });
        if (rng.chance(0.08)) spawners.push({ x, type: 'orca', y: colY(rng, 170) });
        if (rng.chance(0.3)) spawners.push({ x, type: 'torpedo', y: colY(rng, 130) });
        if (rng.chance(0.3)) spawners.push({ x, type: 'moray', y: floorY(rng, 24) });
        if (rng.chance(0.22)) spawners.push({ x, type: 'grouper', y: colY(rng, 150) });
        if (rng.chance(0.28)) whirlpools.push(new Whirlpool(x + rng.range(40, 160), colY(rng, 220)));
        break;
      case 'twilight':
        if (rng.chance(0.52)) spawners.push({ x, type: 'angler', y: colY(rng, 150) });
        if (rng.chance(0.35)) spawners.push({ x, type: 'cookiecutter', y: colY(rng, 130) });
        if (rng.chance(0.3)) mines.push(new Mine(x + rng.range(-30, 60), colY(rng, 100)));
        if (rng.chance(0.25)) bags.push(new PlasticBag(x + rng.range(-30, 60), colY(rng, 100)));
        if (rng.chance(0.34)) spawners.push({ x, type: 'torpedo', y: colY(rng, 140) });
        if (rng.chance(0.3)) vents.push(new SeaVent(x + rng.range(-20, 40), REF_H - WATER.seabedBand));
        break;
      case 'lane':
        if (rng.chance(0.6)) spawners.push({ x, type: 'boat', dir: rng.chance(0.5) ? -1 : 1 });
        if (rng.chance(0.45)) hooks.push(new Hook(x + rng.range(-40, 40), rng.range(REF_H * 0.28, REF_H * 0.6)));
        if (rng.chance(0.4)) bags.push(new PlasticBag(x + rng.range(-30, 60), colY(rng, 90)));   // pollution
        if (rng.chance(0.3)) mines.push(new Mine(x + rng.range(-30, 60), colY(rng, 90)));
        if (rng.chance(0.28)) anchors.push(new Anchor(x + rng.range(-20, 20), floorY(rng, 30), rng.range(54, 78)));
        if (rng.chance(0.3)) spawners.push({ x, type: 'shark', y: colY(rng, 140) });
        if (rng.chance(0.3)) spawners.push({ x, type: 'crab', y: floorY(rng, 8) });
        if (rng.chance(0.24)) spawners.push({ x, type: 'grouper', y: colY(rng, 150) });
        break;
      case 'trench':
        if (rng.chance(0.46)) spawners.push({ x, type: 'squid', y: colY(rng, 150) });
        if (rng.chance(0.3)) spawners.push({ x, type: 'angler', y: colY(rng, 150) });
        if (rng.chance(0.3)) spawners.push({ x, type: 'cookiecutter', y: colY(rng, 130) });
        if (rng.chance(0.1)) spawners.push({ x, type: 'orca', y: colY(rng, 170) });
        if (rng.chance(0.4)) mines.push(new Mine(x + rng.range(-30, 60), colY(rng, 90)));
        if (rng.chance(0.34)) spawners.push({ x, type: 'moray', y: floorY(rng, 24) });
        if (rng.chance(0.34)) vents.push(new SeaVent(x + rng.range(-20, 40), REF_H - WATER.seabedBand));
        break;
      default: // spawn — calm, generous food + a parting gift
        plankton.push(new Plankton(x, colY(rng, 70), rng.chance(0.35)));
        if (rng.chance(0.4)) plankton.push(new Plankton(x + rng.range(60, 160), colY(rng, 70), false));
        if (rng.chance(0.22)) dropBooster(x);
    }
    x += rng.range(280, 500);
  }

  spawners.sort((a, b) => a.x - b.x);
  const checkpoints = WORLD.zones.map((z, i) => ({ x: zoneStartX(i), zoneIdx: i }));
  return { rocks, corals, anchors, urchins, mines, hooks, bags, boosters, plankton, kelp, currents, spawners, whirlpools, vents, checkpoints, goal: G };
}
