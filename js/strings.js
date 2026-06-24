// All player-visible strings live here (game-design-system §10.3).
// Switching language is a data change, never a code change.
export const STR = {
  title: 'SUNFISH',
  subtitle: 'a useless odyssey',
  tagline: 'The ocean’s least competent fish has somewhere to be.',

  tapToStart: 'tap · click · press to begin',
  dragHint: 'Drag anywhere to swim — flick to dash',
  keyHint: 'or use WASD / arrows / a gamepad stick',

  goalAtlantic: 'ATLANTIC',
  goalPacific: 'PACIFIC',

  hudPlankton: 'plankton',
  hudBest: 'furthest',

  shopTitle: 'Tide-Pool Outfitters',
  shopBlurb: 'Spend hard-won plankton. Become a marginally less useless fish.',
  shopBack: 'back',
  shopMaxed: 'MAXED',
  shopBanked: 'banked',
  shopCost: 'cost',
  shopCantAfford: 'not enough plankton',

  caught: 'CAUGHT IN A NET!',
  struggle: 'WIGGLE! drag back and forth!',

  zoneEnter: (n) => n,

  win: 'YOU MADE IT.',
  winSub: 'Against all reason, the useless fish crosses an ocean.',
  eggsLaid: (n) => `${n.toLocaleString()} eggs drift into the blue`,
  winFunFact: 'A real sunfish can lay 300 million eggs. You did your best.',

  deaths: [
    'A seal had a snack. You were the snack.',
    'Splat. Rocks: 1, Fish: 0.',
    'Caught, hauled up, and deeply confused.',
    'The propeller did propeller things.',
    'Stung silly by a drifting jelly.',
    'You simply gave up. Understandable.',
  ],
  deathTitle: 'A USELESS END',
  retry: 'try again',
  toShop: 'upgrades',

  distance: (m) => `${Math.round(m)} m`,
  paused: 'paused',
  muted: 'sound off',
  unmuted: 'sound on',
  rotate: 'Turn your device — this fish prefers landscape.',

  funFacts: [
    'The ocean sunfish (Mola mola) is the heaviest bony fish alive.',
    'It mostly eats jellyfish, which are basically water.',
    'Sailors thought it was a head with no body. Rude, but fair.',
    'It sunbathes on its side at the surface. That’s the whole plan.',
    'Seabirds land on it to pick off its parasites. Free spa.',
  ],
};
