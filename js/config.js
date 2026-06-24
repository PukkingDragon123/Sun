// All tunable numbers live here as data (game-design-system §9.5).
// Coordinates are in WORLD UNITS: the visible water column is always
// REF_H tall regardless of device; the renderer scales world->screen.
// This keeps gameplay identical across phone, tablet and desktop.

export const REF_H = 720;          // logical water-column height (world units)
export const STEP = 1000 / 60;     // fixed simulation step (ms)
export const DPR_CAP = 1.5;        // devicePixelRatio cap (perf law)

export const WATER = {
  surfaceBand: 96,   // wavy surface zone from the top
  seabedBand: 86,    // sandy floor zone from the bottom
};

export const FISH = {
  radius: 42,            // visible body radius
  hitboxScale: 0.58,     // collision radius = radius * this (player forgiveness)
  followFreq: 8.6,       // spring natural frequency (rad/s) toward pointer
  maxSpeed: 560,         // px/s base cap (upgradable)
  dragPerSec: 1.7,       // velocity damping when no steering input (per s)
  lookAhead: 150,        // keyboard/gamepad steer target distance
  finFlap: 5.2,          // fin flap base rate
};

export const DASH = {
  impulse: 660,          // burst velocity added
  dur: 0.26,             // seconds of boosted state
  cooldown: 1.05,        // seconds between dashes
  iframes: 0.34,         // invulnerable seconds during/after dash
  flickSpeed: 1500,      // pointer speed (px/s) that triggers a flick-dash
  queue: 0.13,           // input buffer window (s)
};

export const COMBAT = {
  baseMaxHP: 3,
  hitIFrames: 1.1,        // invulnerable seconds after a hit
  rockSplatSpeed: 250,    // impact speed above which rocks hurt
  netSnareTime: 2.2,      // seconds to be hauled up if you stop struggling
  netStruggleDrain: 1.9,  // struggle meter drained per unit of frantic motion
  netEscapeIFrames: 0.65,
};

export const SEAL = {
  detectRange: 360,
  speed: 250,
  lungeWindup: 0.55,      // telegraph before the strike
  lungeSpeed: 720,
  lungeDur: 0.42,
  rest: 1.5,              // recover time after a lunge
  giveUp: 9,              // seconds chasing before losing interest
  damage: 1,
};

export const JELLY = { damage: 1, driftSpeed: 26 };

export const BOAT = {
  speed: 120,             // horizontal cruise (world units/s)
  hullY: 64,              // hull sits near the surface
  netDepth: 340,          // how deep the net hangs below the hull
  netDamageWhileCaught: 0.018, // hp/sec drained while snared (flavor)
  propDamage: 2,
  propRadius: 46,
};

export const WORLD = {
  goalDistance: 9200,     // world px from start to spawning ground
  // zone boundaries as fractions of goalDistance; each zone adds one hazard
  zones: [
    { id: 'shallows', name: 'Atlantic Shallows', end: 0.18, tint: '#1c4a5e' },
    { id: 'drift',    name: 'The Open Drift',    end: 0.42, tint: '#15384f' },
    { id: 'deep',     name: 'The Cold Deep',     end: 0.68, tint: '#0e2942' },
    { id: 'lane',     name: 'The Shipping Lane',  end: 0.90, tint: '#123040' },
    { id: 'spawn',    name: 'The Spawning Ground', end: 1.0, tint: '#1d5566' },
  ],
};

// Permanent meta-upgrades (roguelike). cost in plankton; level caps.
export const UPGRADES = [
  { id: 'vitality', name: 'Blubber',      desc: '+1 maximum heart',            max: 3, baseCost: 14, step: 12 },
  { id: 'grace',    name: 'Grace',        desc: 'Swim a little faster',         max: 4, baseCost: 10, step: 9 },
  { id: 'dash',     name: 'Flick Dash',   desc: 'Unlock & sharpen the dash',    max: 3, baseCost: 12, step: 14 },
  { id: 'skin',     name: 'Slippery Skin',desc: 'Wriggle out of nets faster',   max: 3, baseCost: 11, step: 10 },
  { id: 'roe',      name: 'Lucky Roe',    desc: 'Lay more eggs at the end',     max: 4, baseCost: 8,  step: 7 },
];

export const PALETTE = {
  ink: '#16302f',          // wobbly hand-inked dark-teal outline
  inkSoft: 'rgba(22,48,47,0.5)',
  fishBody: '#cdd7da',     // silvery moon-grey
  fishBelly: '#f2ead7',    // warm cream
  fishShade: '#9fb0b6',
  hazard: '#4b3f36',       // warm charcoal-brown
  hazardDark: '#33291f',
  hazardLight: '#6c5a49',
  amber: '#f6c14b',        // pickups & eggs glow
  amberSoft: '#ffd97a',
  foam: '#eaf6f7',
  surfaceTeal: '#3d8aa0',
  deepNavy: '#0a2238',
};
