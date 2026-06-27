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

// The sunfish is SLOW and deliberate — a low top speed for a weighty drift —
// but tracks the pointer snappily so it always feels in control.
export const FISH = {
  radius: 42,            // visible body radius
  hitboxScale: 0.6,      // collision radius = radius * this (player forgiveness)
  followFreq: 9.8,       // spring natural frequency (rad/s) toward pointer (snappy)
  maxSpeed: 318,         // px/s base cap — intentionally slow (upgradable)
  dragPerSec: 2.4,       // settles quickly when you let go (tight control)
  lookAhead: 140,        // keyboard/gamepad steer target distance
  finFlap: 5.0,          // fin flap base rate
};

export const DASH = {
  impulse: 440,          // burst velocity added
  dur: 0.30,             // seconds of boosted state
  cooldown: 1.15,        // seconds between dashes
  iframes: 0.32,         // invulnerable seconds during/after dash
  flickSpeed: 1500,      // pointer speed (px/s) that triggers a flick-dash
  queue: 0.13,           // input buffer window (s)
};

export const COMBAT = {
  baseMaxHP: 3,
  hitIFrames: 1.05,       // invulnerable seconds after a hit
  rockSplatSpeed: 230,    // impact speed above which solid things hurt
  netSnareTime: 2.4,      // seconds to be hauled up if you stop struggling
  netEscapeIFrames: 0.65,
};

// ---- mobile hazards (slowed down to match the deliberate pace) -------------
export const SEAL = {
  detectRange: 340, speed: 158, lungeWindup: 0.55, lungeSpeed: 470,
  lungeDur: 0.42, rest: 1.6, giveUp: 9, damage: 1,
};
export const SHARK = {
  detectRange: 540, cruise: 96, charge: 540, chargeWindup: 0.72,
  chargeDur: 0.62, rest: 1.5, giveUp: 12, damage: 2,
};
export const BARRACUDA = {
  detectRange: 320, cruise: 84, dart: 600, dartWindup: 0.32,
  dartDur: 0.3, rest: 0.85, damage: 1,
};
export const ANGLER = {
  detectRange: 250, lungeWindup: 0.5, lungeSpeed: 470, lungeDur: 0.4,
  rest: 1.9, damage: 2, lureRange: 260,
};
export const PUFFER = { triggerRange: 116, inflate: 0.35, deflate: 2.2, damage: 1, driftSpeed: 20 };
export const SQUID = { detectRange: 380, grabRange: 158, grabTime: 1.7, escape: 1, damage: 1, speed: 128 };
export const JELLY = { damage: 1, driftSpeed: 22 };
export const BOAT = {
  speed: 78, hullY: 64, netDepth: 360, netDamageWhileCaught: 0.018,
  propDamage: 2, propRadius: 46,
};

// ---- static / drifting obstacles -------------------------------------------
export const MINE = { damage: 2, radius: 30, blastKnock: 360, driftSpeed: 14 };
export const URCHIN = { damage: 1, radius: 26 };
export const HOOK = { damage: 1, radius: 16, snare: true };
export const ANCHOR = { radius: 64 };

// ---- field obstacles (no direct damage; they move you) ---------------------
// WHIRLPOOL: a slow vortex. `pull` = peak inward accel (world px/s^2) at the eye,
// falling to 0 at the rim. `swirl` = tangential drag accel; `spin` = arm rotation.
export const WHIRLPOOL = { radius: 190, pull: 520, swirl: 150, spin: 0.6 };
// SEA VENT: a hot updraft. `lift` = upward accel (world px/s^2) inside the column,
// `lateral` = gentle centring accel; `column` = column height (world px) above the
// floor mouth; `radius` = mouth half-width / pull radius.
export const VENT = { radius: 70, lift: 1500, lateral: 240, column: 430 };

// ---- ambient waves: a slow surge that nudges you, strongest near the top ----
export const WAVE = { surge: 54, freq: 0.42, swirl: 0.0009, depthKeep: 0.32 };

// ---- status effects --------------------------------------------------------
export const STATUS = {
  slowMul: 0.55, slowTime: 1.8,
  poisonTime: 6.5, poisonTick: 2.2, poisonDmg: 1,
  healTick: 3.0, healTime: 16,   // Nurse Shark regen booster
  swiftMul: 1.5, swiftTime: 9,   // Swift Current booster
  shieldTime: 7,                 // Bubble Shield booster
  woundSlowPer: 0.05, woundSlowMax: 0.42,  // each open wound drags you down
};

// ---- more predators --------------------------------------------------------
export const SWORDFISH = { detectRange: 360, cruise: 62, windup: 0.7, lungeSpeed: 600, lungeDur: 0.5, rest: 1.7, damage: 1, reach: 540 };
export const COOKIE = { detectRange: 430, cruise: 150, windup: 0.34, dartSpeed: 720, dartDur: 0.26, rest: 0.95, damage: 1, reach: 300 };
export const ORCA = { detectRange: 700, cruise: 116, windup: 0.85, charge: 560, chargeDur: 0.82, rest: 1.9, damage: 3, reach: 640 };
export const COPEPOD = { detectRange: 300, speed: 116 };
export const SEAGULL = { diveSpeed: 560, damage: 1, interval: 5 };
export const PLASTIC = { damage: 1, driftSpeed: 15 };

// ---- v10 predators ---------------------------------------------------------
// Lionfish: a slow venomous CONTACT drifter (kelp + bloom). Brush its spines for
// 1 dmg + poison. Not a biter (canBite=>false); resolved in a collide() block.
export const LIONFISH = { driftSpeed: 26, damage: 1, detectRange: 260 };
// Moray: ambush burrow-eel (deep + trench). Anchored at the seabed; lunges out
// in an extending S-curve when you drift close at its depth, then retracts.
export const MORAY = {
  detectRange: 230, windup: 0.5, lungeSpeed: 560, lungeDur: 0.42,
  rest: 1.4, damage: 2, reach: 320,
};
// Electric ray (torpedo): flat disc that charges then DISCHARGES a radial shock
// (deep + twilight). 1 dmg + stun on contact during discharge. Not a mouth bite.
export const TORPEDO = {
  detectRange: 230, chargeTime: 0.8, dischargeTime: 0.32, shockRadius: 190,
  rest: 1.8, damage: 1, stun: 0.7,
};
// Crab: seabed scuttler (shallows + kelp + lane). Walks the floor; raises the
// crusher claw (windup) then SNAPS a committed, dodgeable pinch.
export const CRAB = {
  speed: 84, detectRange: 300, windup: 0.5, snapSpeed: 360, snapDur: 0.34,
  rest: 1.2, damage: 1, reach: 150,
};
// Giant grouper: big slow ambush gulper (deep + lane). Opens a huge mouth (the
// telegraph) and SUCKS the player toward it, then lunges for a heavy 2-dmg bite.
export const GROUPER = {
  detectRange: 300, windup: 0.85, suction: 520, lungeSpeed: 360, lungeDur: 0.34,
  rest: 1.7, damage: 2, reach: 120,
};

// ---- pickup boosters -------------------------------------------------------
export const BOOSTERS = [
  { id: 'nurse',  name: 'Nurse Shark',   blurb: 'a gentle companion tags along', color: '#c2a875' },
  { id: 'swift',  name: 'Swift Current', blurb: 'a burst of speed',             color: '#7fd0ff' },
  { id: 'shield', name: 'Bubble Shield', blurb: 'a few moments untouchable',    color: '#bfe9f0' },
];

// ---- nurse-shark pet -------------------------------------------------------
// Picked up via the 'nurse' booster: a pet that follows you (no passive heal),
// heals you to full at the spawning ground, then swims away. Leaves on death.
export const NURSE = {
  followLerp: 3.4,      // how snappily it chases its anchor point
  offBehind: 1.6,       // anchor = behind the player by this * player.r
  offSide: 0.85,        // and beside by this * player.r (above/below)
  r: 26,                // body radius (a small, friendly companion)
  healSparkleEvery: 0.12,
  leaveSpeed: 220,      // swim-away velocity once it's done
  leaveTime: 2.2,       // seconds of swimming away before it's culled
};

// ---- economy: collect plankton, score points, lay eggs via a mini-game -----
export const ECONOMY = {
  pointsPerCheckpoint: 250,        // flat reward for reaching a NEW forward zone
  pointsPerPlankton: 5,            // small immediate feedback per plankton eaten
  checkpointPlanktonBonus: 20,     // EXTRA points per plankton gathered since the last checkpoint
  cpClutchPerPlankton: 3,          // checkpoint clutch: eggs per plankton-since
  // lay mini-game: CLICK / TAP as fast as you can. eggs accrue from sustained
  // effort over the window; the plankton you collected MULTIPLIES the whole clutch.
  layBase: 16,                     // base eggs/sec component
  healthMul: 6,                    // + eggs/sec per current hp at lay time
  planktonBonusPer: 0.04,          // clutch multiplier per plankton (25 plankton => x2)
  layDuration: 6.0,                // mini-game length (s)
  layMinRate: 0.15,                // guaranteed baseline accrual even without clicking
  effortDrainPerSec: 0.5,          // effort meter bleeds down so you must keep going
  effortPerClick: 0.09,            // each click / tap / keypress kicks the meter up
  effortPerInput: 0.012,           // drag-speed contribution (secondary to clicking)
  consolationPlankton: 0.5,        // death banks floor(runPlankton * this) as eggs
};

// ---- the journey -----------------------------------------------------------
// A long ocean crossing. At the slow base speed a careful run is a real trek
// (~12-18 min); meta-upgrades (Grace, Head Start, currents) make it shorter
// and gentler. Region checkpoints make the distance survivable.
export const WORLD = {
  goalDistance: 60000,
  unitsPerMeter: 22,      // for the "X m" readout
  // zone boundaries as fractions of goalDistance. Each region has its own
  // mood (tint + darkness) and roster of hazards (see world.js).
  zones: [
    { id: 'shallows', name: 'The Sunlit Shallows', end: 0.10, tint: '#2a6076', dark: 0.00 },
    { id: 'kelp',     name: 'The Kelp Forest',      end: 0.22, tint: '#1d5a4c', dark: 0.06 },
    { id: 'drift',    name: 'The Open Drift',       end: 0.34, tint: '#184a63', dark: 0.10 },
    { id: 'bloom',    name: 'The Jelly Bloom',      end: 0.46, tint: '#2c3a6b', dark: 0.16 },
    { id: 'deep',     name: 'The Cold Deep',        end: 0.60, tint: '#0e2942', dark: 0.30 },
    { id: 'twilight', name: 'The Twilight Zone',    end: 0.72, tint: '#0a1b30', dark: 0.52 },
    { id: 'lane',     name: 'The Shipping Lane',    end: 0.86, tint: '#143245', dark: 0.22 },
    { id: 'trench',   name: 'The Midnight Trench',  end: 0.95, tint: '#05101f', dark: 0.66 },
    { id: 'spawn',    name: 'The Spawning Ground',  end: 1.00, tint: '#1f6a79', dark: 0.00 },
  ],
};

// Permanent meta-upgrades (roguelike). Cost in EGGS; level caps. Several of
// these directly "make the long stage easier": Grace (faster), Head Start
// (begin further along), Second Wind (a free revive).
export const UPGRADES = [
  { id: 'vitality',  name: 'Extra Heart',  desc: 'One more heart',          max: 4, baseCost: 60,  step: 55 },
  { id: 'grace',     name: 'Speed',        desc: 'Swim faster',             max: 5, baseCost: 45,  step: 38 },
  { id: 'dash',      name: 'Dash',         desc: 'Unlock a quick dash',     max: 3, baseCost: 55,  step: 55 },
  { id: 'slip',      name: 'Slippery',     desc: 'Escape nets faster',      max: 3, baseCost: 50,  step: 44 },
  { id: 'roe',       name: 'More Eggs',    desc: 'Gather extra eggs',       max: 5, baseCost: 40,  step: 34 },
  { id: 'magnet',    name: 'Magnet',       desc: 'Pull in nearby food',     max: 3, baseCost: 55,  step: 50 },
  { id: 'armor',     name: 'Tough Skin',   desc: 'Safer after a hit',       max: 3, baseCost: 55,  step: 50 },
  { id: 'headstart', name: 'Head Start',   desc: 'Start further along',     max: 4, baseCost: 85,  step: 80 },
  { id: 'wind',      name: 'Second Wind',  desc: 'Revive once, free',       max: 1, baseCost: 240, step: 0 },
];

// ---- cosmetics: skins + loot boxes -----------------------------------------
export const RARITY = {
  common:    { label: 'Common',    color: '#cdd7da', weight: 60, refund: 22 },
  rare:      { label: 'Rare',      color: '#7fd0ff', weight: 27, refund: 55 },
  epic:      { label: 'Epic',      color: '#c69bff', weight: 11, refund: 120 },
  legendary: { label: 'Legendary', color: '#ffd76b', weight: 2,  refund: 280 },
};

export const LOOTBOX = { cost: 150, name: 'Mystery Clam' };

// A skin recolors the sunfish and may add a pattern, an accessory, or a glow.
// `moon` is the default and is always owned. `rainbow` animates its hue.
export const DEFAULT_SKIN = 'moon';
export const SKINS = [
  // -- common ----------------------------------------------------------------
  { id: 'moon',   name: 'Moonfish',     rarity: 'common', body: '#cdd7da', belly: '#f2ead7', shade: '#9fb0b6' },
  { id: 'sandy',  name: 'Sanddollar',   rarity: 'common', body: '#d8c89c', belly: '#efe3c0', shade: '#b3a06f', pattern: 'spots', patternColor: '#a98f55' },
  { id: 'slate',  name: 'Slate',        rarity: 'common', body: '#9fb3bf', belly: '#cfe0e6', shade: '#6f8c9b' },
  { id: 'pearl',  name: 'Pearl',        rarity: 'common', body: '#eef1f0', belly: '#ffffff', shade: '#c4ccd2', glow: '#ffffff' },
  // -- rare ------------------------------------------------------------------
  { id: 'sunset', name: 'Sunset',       rarity: 'rare', body: '#f0a45c', belly: '#ffd9a0', shade: '#d97b3c', pattern: 'stripes', patternColor: '#c85f2a' },
  { id: 'mint',   name: 'Sea Mint',     rarity: 'rare', body: '#9fe6c4', belly: '#e4fff2', shade: '#5fb893' },
  { id: 'rose',   name: 'Rosefin',      rarity: 'rare', body: '#f2a6c0', belly: '#ffe0ec', shade: '#d176a0', pattern: 'spots', patternColor: '#d98' },
  { id: 'cobalt', name: 'Cobalt',       rarity: 'rare', body: '#5b8ff0', belly: '#bcd4ff', shade: '#3a63c0', pattern: 'spots', patternColor: '#2c49a8' },
  { id: 'tiger',  name: 'Tigerfish',    rarity: 'rare', body: '#f3b13c', belly: '#ffe2a0', shade: '#c47d1f', pattern: 'stripes', patternColor: '#3a2a14' },
  // -- epic ------------------------------------------------------------------
  { id: 'koi',    name: 'Koi',          rarity: 'epic', body: '#fbfbfb', belly: '#ffffff', shade: '#dfe6ea', pattern: 'koi', patternColor: '#e2604f' },
  { id: 'galaxy', name: 'Galaxy',       rarity: 'epic', body: '#2b2b5e', belly: '#4a3a7a', shade: '#1a1a40', pattern: 'stars', patternColor: '#ffffff', glow: '#8a7bff' },
  { id: 'gold',   name: 'Goldfish',     rarity: 'epic', body: '#f6c14b', belly: '#ffe9a8', shade: '#c89322', glow: '#ffd97a' },
  { id: 'rad',    name: 'Rad',          rarity: 'epic', body: '#39d6c4', belly: '#c9fff7', shade: '#1f9c8f', accessory: 'shades' },
  // -- legendary -------------------------------------------------------------
  { id: 'rainbow',name: 'Prism',        rarity: 'legendary', rainbow: true, glow: '#ffffff' },
  { id: 'void',   name: 'Voidfish',     rarity: 'legendary', body: '#0c0c14', belly: '#1a1a2a', shade: '#050509', pattern: 'stars', patternColor: '#7CFFB2', glow: '#7CFFB2' },
  { id: 'royal',  name: 'Her Majesty',  rarity: 'legendary', body: '#caa3ff', belly: '#efe0ff', shade: '#9a6fd0', accessory: 'crown', glow: '#ffd76b' },
];

export const PALETTE = {
  ink: '#16302f',          // wobbly hand-inked dark-teal outline
  inkSoft: 'rgba(22,48,47,0.5)',
  fishBody: '#cdd7da',     // silvery moon-grey (default skin)
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
  blood: '#e2604f',        // hurt flash & hearts
  bloodDark: '#8e2b22',    // deeper gore
  poison: '#9be36b',       // plastic / copepod sickness
  plastic: '#d2dadf',      // floating bags
  danger: '#ff6a4d',       // mines / alarms
  bio: '#7CFFB2',          // bioluminescence (twilight/trench)
  shark: '#5d6b73',        // shark grey
  blueShark: '#5a86b0',    // common mid-game blue shark
  orca: '#1c2530',         // orca black
};
