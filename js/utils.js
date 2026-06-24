// Math, RNG and noise helpers. Pure, allocation-light.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
export const dist2 = (x1, y1, x2, y2) => {
  const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy;
};
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

// shortest-arc angle lerp
export function angLerp(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return a + d * t;
}

// Deterministic seeded RNG (mulberry32). Same seed -> same run.
export function makeRng(seed) {
  let s = seed >>> 0;
  const fn = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  fn.range = (a, b) => a + fn() * (b - a);
  fn.int = (a, b) => Math.floor(a + fn() * (b - a + 1));
  fn.pick = (arr) => arr[Math.floor(fn() * arr.length)];
  fn.chance = (p) => fn() < p;
  return fn;
}

// Integer hash -> [0,1). Used for stable per-vertex jitter.
export function hash1(n) {
  n = (n << 13) ^ n;
  n = (n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff;
  return n / 0x7fffffff;
}

// Smooth 1D value noise in [-1,1].
export function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const a = hash1(i) * 2 - 1, b = hash1(i + 1) * 2 - 1;
  return lerp(a, b, smooth(f));
}

// Layered sine "wave" used for surface, currents and idle bob.
export function wave(t, ...terms) {
  let s = 0;
  for (let k = 0; k < terms.length; k += 3) {
    s += terms[k] * Math.sin(t * terms[k + 1] + terms[k + 2]);
  }
  return s;
}

// hex -> "r,g,b"
export function rgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
export function rgba(hex, a) { return `rgba(${rgb(hex)},${a})`; }

// Mix two hex colors, t in [0,1].
export function mixHex(h1, h2, t) {
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  return `rgb(${r},${g},${bl})`;
}
