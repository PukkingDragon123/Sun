// All player-visible strings live here (game-design-system §10.3).
// Switching language is a data change, never a code change.
export const STR = {
  title: 'SUNFISH',
  subtitle: 'a useless odyssey',
  tagline: 'The ocean’s least competent fish has somewhere to be.',

  tapToStart: 'tap · click · press to begin the crossing',
  dragHint: 'Drag anywhere to swim — flick to dash',
  keyHint: 'or use WASD / arrows / a gamepad stick',

  goalAtlantic: 'ATLANTIC',
  goalPacific: 'PACIFIC',

  hudEggs: 'eggs',
  hudBest: 'furthest',

  // shop
  shopTitle: 'Tide-Pool Outfitters',
  shopBlurb: 'Spend hard-won eggs. Become a marginally less useless fish.',
  shopBack: 'back',
  shopMaxed: 'MAXED',
  shopBanked: 'in the purse',
  shopCantAfford: 'not enough eggs',

  // wardrobe + loot
  wardrobeTitle: 'The Wardrobe',
  wardrobeBlurb: 'Every fish deserves an outfit it did not earn.',
  wardrobeEquip: 'equip',
  wardrobeEquipped: 'worn',
  wardrobeLocked: '???',
  lootTitle: 'Crack a Mystery Clam',
  lootBlurb: (c) => `A clam of dubious provenance. ${c} eggs.`,
  lootOpen: 'crack it open',
  lootAgain: 'crack another',
  lootEquipNow: 'wear it',
  lootDupe: (n) => `Already owned — refunded ${n} eggs`,
  lootGot: 'a new look!',
  lootNeed: 'not enough eggs',

  caught: 'CAUGHT IN A NET!',
  grabbed: 'GRABBED!',
  struggle: 'WIGGLE! drag back and forth!',

  zoneEnter: (n) => n,
  checkpoint: (n) => `${n} — checkpoint reached`,

  win: 'YOU MADE IT.',
  winSub: 'Against all reason, the useless fish crosses an ocean.',
  eggsLaid: (n) => `${n.toLocaleString()} eggs drift into the blue`,
  winFunFact: 'A real sunfish can lay 300 million eggs. You did your best.',
  lifetimeEggs: (n) => `${n.toLocaleString()} eggs laid in all your lifetimes`,

  deaths: [
    'A seal had a snack. You were the snack.',
    'Splat. Rocks: 1, Fish: 0.',
    'Caught, hauled up, and deeply confused.',
    'The propeller did propeller things.',
    'Stung silly by a drifting jelly.',
    'You simply gave up. Understandable.',
    'A shark introduced itself. Briefly.',
    'An anglerfish’s little lamp was the last thing you saw.',
    'You hugged a sea mine. It hugged back.',
    'Sat on an urchin. A pointed lesson.',
    'A squid wanted a cuddle. Forever.',
    'A barracuda was simply faster than you.',
  ],
  deathTitle: 'A USELESS END',
  retry: 'try again',
  toShop: 'upgrades',
  toWardrobe: 'wardrobe',
  toLoot: 'clams',
  continueBtn: (n) => `revive · ${n} eggs`,
  continueFree: 'revive · free (second wind)',

  distance: (m) => `${Math.round(m).toLocaleString()} m`,
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
    'A sunfish can dive past 600 m into the cold dark, then warm up on top.',
    'Baby sunfish look like tiny spiky snowflakes. They grow 60 million times.',
  ],
};
