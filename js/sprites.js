// Procedural hand-drawn sprites. Each draws in LOCAL space around the origin
// (facing +x), so the boil-wobble stays stable while the entity moves.
import { TAU, hash1, rgba, lerp, mixHex } from './utils.js';
import { PALETTE as P } from './config.js';
import { sketchShape, inkStroke, wash, blobPts } from './draw.js';

// ----------------------------------------------------------- the sunfish star
export function drawSunfish(ctx, R, t, st = {}) {
  const flap = st.flap ?? 0;
  const blink = st.blink ?? 1;       // 1 open, 0 shut
  const hurt = st.hurt ?? 0;
  const look = st.lookX ?? 1;
  const mouth = st.mouth ?? 0;       // 0 resigned, 1 eating "o"
  const sx = Math.sin(flap) * 0.22 * R;   // synchronized fin scull
  const px = Math.sin(flap * 1.25) * 0.18; // pectoral wave

  // dorsal + anal fins (drawn first so the body hides their roots)
  const finFill = mixHex(P.fishShade, P.fishBody, 0.4);
  const dorsal = [
    { x: -0.34 * R, y: -0.84 * R }, { x: -0.08 * R + sx * 0.4, y: -1.46 * R },
    { x: 0.04 * R + sx, y: -1.98 * R }, { x: 0.18 * R + sx * 0.6, y: -1.38 * R },
    { x: 0.12 * R, y: -0.82 * R },
  ];
  const anal = dorsal.map((p) => ({ x: p.x, y: -p.y }));
  sketchShape(ctx, dorsal, { fill: finFill, lineW: 2.4, wobble: 2.6, key: 11 });
  sketchShape(ctx, anal, { fill: finFill, lineW: 2.4, wobble: 2.6, key: 17 });

  // body — the iconic flattened disc with a scalloped clavus at the rear
  const body = [
    { x: 1.02, y: -0.10 }, { x: 0.80, y: -0.70 }, { x: 0.20, y: -1.05 },
    { x: -0.44, y: -0.95 }, { x: -0.92, y: -0.64 }, { x: -1.05, y: -0.28 },
    { x: -1.02, y: 0.08 }, { x: -1.06, y: 0.42 }, { x: -0.90, y: 0.72 },
    { x: -0.40, y: 0.98 }, { x: 0.24, y: 1.04 }, { x: 0.82, y: 0.64 },
    { x: 1.02, y: 0.18 },
  ].map((p) => ({ x: p.x * R, y: p.y * R }));

  const grad = ctx.createLinearGradient(0, -1.1 * R, 0, 1.1 * R);
  grad.addColorStop(0, P.fishShade);
  grad.addColorStop(0.5, P.fishBody);
  grad.addColorStop(1, P.fishBelly);
  sketchShape(ctx, body, { fill: grad, lineW: 3.4, wobble: 1.9, key: 3 });

  // watercolor depth: shade wash up top, cream belly bleed
  ctx.save(); ctx.beginPath();
  sketchShape(ctx, body, { fill: null, outline: null }); ctx.clip();
  wash(ctx, -0.2 * R, -0.7 * R, R, P.fishShade, 0.5);
  wash(ctx, 0.1 * R, 0.8 * R, 0.9 * R, P.fishBelly, 0.6);
  // faint mottled spots
  for (let i = 0; i < 5; i++) {
    const a = hash1(i * 5 + 1) * TAU, rr = hash1(i * 3 + 2) * 0.6 * R;
    wash(ctx, Math.cos(a) * rr, Math.sin(a) * rr - 0.2 * R, 0.16 * R, P.fishShade, 0.4);
  }
  if (hurt > 0) wash(ctx, 0, 0, 1.2 * R, '#e2604f', 0.55 * hurt);
  ctx.restore();

  // clavus frill ticks at the rear
  ctx.strokeStyle = rgba(P.ink, 0.45); ctx.lineWidth = 1.6;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(-1.0 * R, i * 0.28 * R);
    ctx.lineTo(-0.78 * R, i * 0.28 * R + 0.04 * R);
    ctx.stroke();
  }

  // pectoral fin
  ctx.save(); ctx.translate(0.30 * R, 0.18 * R); ctx.rotate(px);
  sketchShape(ctx, blobPts(0, 0, 0.26 * R, 0.13 * R, 9, 0.12, 71),
    { fill: finFill, lineW: 2, wobble: 1.6, key: 23 });
  ctx.restore();

  // the big weary eye
  const ex = 0.52 * R, ey = -0.30 * R, er = 0.21 * R;
  sketchShape(ctx, blobPts(ex, ey, er, er, 10, 0.05, 31),
    { fill: P.foam, lineW: 2.2, wobble: 1.2, key: 31 });
  ctx.save();
  ctx.beginPath(); ctx.ellipse(ex, ey, er, er * blink, 0, 0, TAU); ctx.clip();
  ctx.fillStyle = P.ink;
  ctx.beginPath();
  ctx.arc(ex + look * 0.07 * R, ey + 0.03 * R, er * 0.62, 0, TAU); ctx.fill();
  ctx.fillStyle = P.foam;
  ctx.beginPath(); ctx.arc(ex + look * 0.07 * R - er * 0.2, ey - er * 0.22, er * 0.2, 0, TAU); ctx.fill();
  ctx.restore();
  // droopy upper lid -> weary look
  ctx.strokeStyle = P.ink; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(ex, ey - er * (1 - blink) * 0.2, er * 1.08, er * (0.5 + 0.5 * blink), 0,
    Math.PI * 1.04, Math.PI * 2.02);
  ctx.stroke();

  // tiny resigned mouth
  ctx.strokeStyle = P.ink; ctx.lineWidth = 2.2;
  if (mouth > 0.1) {
    ctx.beginPath(); ctx.arc(1.0 * R, 0.18 * R, 0.07 * R * (0.6 + mouth), 0, TAU); ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(0.96 * R, 0.14 * R);
    ctx.quadraticCurveTo(1.02 * R, 0.22 * R, 0.97 * R, 0.27 * R);
    ctx.stroke();
  }
}

// ----------------------------------------------------------------- the seal
export function drawSeal(ctx, R, t, st = {}) {
  const mouth = st.mouth ?? 0;     // 0 closed .. 1 lunging
  const swim = Math.sin(t * 6) * 0.06;
  const bodyFill = ctx.createLinearGradient(0, -R, 0, R);
  bodyFill.addColorStop(0, P.hazardLight);
  bodyFill.addColorStop(0.6, P.hazard);
  bodyFill.addColorStop(1, mixHex(P.hazard, '#cdbfae', 0.5));

  // rear tail flippers
  sketchShape(ctx, [
    { x: -1.15 * R, y: -0.5 * R }, { x: -1.45 * R, y: -0.2 * R },
    { x: -1.3 * R, y: 0 }, { x: -1.46 * R, y: 0.24 * R }, { x: -1.12 * R, y: 0.5 * R },
    { x: -0.9 * R, y: 0 },
  ], { fill: P.hazardDark, lineW: 2.4, wobble: 2.2, key: 41 });

  // torpedo body
  const body = [
    { x: 1.12, y: 0.02 }, { x: 0.86, y: -0.42 }, { x: 0.3, y: -0.6 },
    { x: -0.4, y: -0.56 }, { x: -1.0, y: -0.34 }, { x: -1.05, y: 0.06 + swim },
    { x: -0.95, y: 0.4 }, { x: -0.3, y: 0.58 }, { x: 0.4, y: 0.56 },
    { x: 0.92, y: 0.4 },
  ].map((p) => ({ x: p.x * R, y: p.y * R }));
  sketchShape(ctx, body, { fill: bodyFill, lineW: 3, wobble: 1.9, key: 43 });

  // fore-flipper
  ctx.save(); ctx.translate(0.2 * R, 0.42 * R); ctx.rotate(0.5 + swim);
  sketchShape(ctx, [{ x: 0, y: 0 }, { x: 0.16 * R, y: 0.5 * R },
    { x: 0.02 * R, y: 0.66 * R }, { x: -0.16 * R, y: 0.4 * R }],
    { fill: P.hazardDark, lineW: 2.2, wobble: 1.8, key: 47 });
  ctx.restore();

  // snout + mouth
  if (mouth > 0.05) {
    ctx.fillStyle = '#6b2030';
    ctx.beginPath();
    ctx.moveTo(0.9 * R, -0.02 * R);
    ctx.lineTo(1.2 * R, -0.18 * R - mouth * 0.18 * R);
    ctx.lineTo(1.24 * R, 0.06 * R);
    ctx.lineTo(1.18 * R, 0.2 * R + mouth * 0.18 * R);
    ctx.closePath(); ctx.fill();
    // teeth
    ctx.fillStyle = P.foam;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo((1.0 + i * 0.07) * R, -0.1 * R - mouth * 0.16 * R);
      ctx.lineTo((1.04 + i * 0.07) * R, 0.0 * R);
      ctx.lineTo((1.08 + i * 0.07) * R, -0.1 * R - mouth * 0.16 * R);
      ctx.fill();
    }
  }
  // eye
  ctx.fillStyle = P.ink;
  ctx.beginPath(); ctx.arc(0.62 * R, -0.22 * R, 0.09 * R, 0, TAU); ctx.fill();
  ctx.fillStyle = P.foam;
  ctx.beginPath(); ctx.arc(0.6 * R, -0.25 * R, 0.03 * R, 0, TAU); ctx.fill();
  // whiskers
  ctx.strokeStyle = rgba(P.foam, 0.8); ctx.lineWidth = 1.3;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath(); ctx.moveTo(0.95 * R, 0.12 * R);
    ctx.quadraticCurveTo(1.3 * R, 0.12 * R + i * 0.1 * R, 1.5 * R, 0.14 * R + i * 0.16 * R);
    ctx.stroke();
  }
}

// ------------------------------------------------------------------ the boat
export function drawBoat(ctx, W, t) {
  const H = W * 0.42;
  const hullFill = ctx.createLinearGradient(0, -H, 0, H);
  hullFill.addColorStop(0, P.hazardLight);
  hullFill.addColorStop(1, P.hazardDark);
  // hull (wider than tall, V underside)
  const hull = [
    { x: -1.0, y: -0.5 }, { x: 1.0, y: -0.5 }, { x: 0.92, y: 0.1 },
    { x: 0.5, y: 0.62 }, { x: 0, y: 0.78 }, { x: -0.5, y: 0.6 }, { x: -0.92, y: 0.12 },
  ].map((p) => ({ x: p.x * W, y: p.y * H }));
  sketchShape(ctx, hull, { fill: hullFill, lineW: 3.4, wobble: 2.2, key: 51 });
  // a painted stripe
  ctx.save(); ctx.beginPath();
  sketchShape(ctx, hull, { fill: null, outline: null }); ctx.clip();
  ctx.fillStyle = rgba('#b6483a', 0.85);
  ctx.fillRect(-W, -0.18 * H, 2 * W, 0.16 * H);
  // plank lines
  ctx.strokeStyle = rgba(P.hazardDark, 0.5); ctx.lineWidth = 1.4;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(-0.9 * W, (0.1 + i * 0.18) * H);
    ctx.lineTo(0.9 * W, (0.1 + i * 0.18) * H); ctx.stroke();
  }
  ctx.restore();
  // little cabin
  sketchShape(ctx, [
    { x: -0.3 * W, y: -0.5 * H }, { x: -0.3 * W, y: -0.95 * H },
    { x: 0.18 * W, y: -0.95 * H }, { x: 0.18 * W, y: -0.5 * H },
  ], { fill: mixHex(P.hazard, '#caa', 0.3), lineW: 2.6, wobble: 1.8, key: 53 });

  // propeller at the stern (left/back), spinning
  ctx.save();
  ctx.translate(-0.96 * W, 0.18 * H);
  ctx.fillStyle = '#8a939a'; ctx.strokeStyle = P.ink; ctx.lineWidth = 2;
  const spin = t * 16;
  for (let b = 0; b < 3; b++) {
    ctx.save(); ctx.rotate(spin + (b / 3) * TAU);
    ctx.beginPath();
    ctx.ellipse(0, -0.16 * H, 0.07 * W, 0.2 * H, 0, 0, TAU);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath(); ctx.arc(0, 0, 0.06 * W, 0, TAU);
  ctx.fillStyle = '#5b636a'; ctx.fill(); ctx.stroke();
  ctx.restore();
}

// hanging net (procedural) — drawn from the boat downward in WORLD space by the
// caller; here we draw a panel of width w and depth d at the local origin top.
export function drawNet(ctx, w, d, t, taut = 0) {
  const cols = 7, rows = Math.max(5, Math.round(d / (w / cols)));
  const sway = (y) => Math.sin(t * 1.4 + y * 0.02) * (1 - taut) * 10;
  ctx.strokeStyle = rgba('#dfeef0', 0.55); ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let c = 0; c <= cols; c++) {
    const x = (c / cols - 0.5) * w;
    for (let r = 0; r <= rows; r++) {
      const y = (r / rows) * d;
      const xx = x + sway(y) * (x === 0 ? 0 : x / Math.abs(x) * 0.3 + 0.7);
      if (r === 0) ctx.moveTo(xx, y); else ctx.lineTo(xx, y);
    }
  }
  for (let r = 0; r <= rows; r++) {
    const y = (r / rows) * d;
    for (let c = 0; c <= cols; c++) {
      const x = (c / cols - 0.5) * w + sway(y) * 0.6;
      if (c === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  // floats along the top
  ctx.fillStyle = rgba('#caa', 0.8);
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath(); ctx.arc((c / cols - 0.5) * w, 0, 3, 0, TAU); ctx.fill();
  }
}

// ----------------------------------------------------------------- the rocks
export function drawRock(ctx, R, seed) {
  const n = 2 + (Math.floor(hash1(seed) * 3));
  for (let i = 0; i < n; i++) {
    const ox = (hash1(seed + i * 9) - 0.5) * R * 1.1;
    const oy = (1 - hash1(seed + i * 5) * 0.5) * R * 0.4;
    const rr = R * (0.5 + hash1(seed + i * 7) * 0.5);
    const fill = ctx.createLinearGradient(ox, oy - rr, ox, oy + rr);
    fill.addColorStop(0, P.hazardLight);
    fill.addColorStop(1, P.hazardDark);
    sketchShape(ctx, blobPts(ox, oy, rr, rr * 0.82, 9, 0.32, seed + i * 31),
      { fill, lineW: 3, wobble: 2.2, key: seed + i * 13 });
    // barnacle/moss dots
    for (let b = 0; b < 4; b++) {
      const a = hash1(seed + i + b * 3) * TAU, br = rr * 0.6 * hash1(seed + b);
      ctx.fillStyle = rgba(b % 2 ? '#6f8a5a' : P.hazardDark, 0.6);
      ctx.beginPath();
      ctx.arc(ox + Math.cos(a) * br, oy + Math.sin(a) * br * 0.7, rr * 0.08, 0, TAU);
      ctx.fill();
    }
  }
}

// ------------------------------------------------------------------ the kelp
export function drawKelp(ctx, H, t, seed) {
  const segs = 7;
  const sway = 0.5 + hash1(seed) * 0.5;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const f = i / segs;
    const x = Math.sin(t * sway + f * 3 + seed) * f * 0.22 * H;
    pts.push({ x, y: -f * H });
  }
  // stem
  ctx.strokeStyle = mixHex('#3f6f47', P.ink, 0.4); ctx.lineWidth = 6;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts) ctx.lineTo(p.x, p.y); ctx.stroke();
  // leaves
  ctx.fillStyle = rgba('#4f8255', 0.92);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], side = i % 2 ? 1 : -1;
    ctx.save(); ctx.translate(p.x, p.y);
    sketchShape(ctx, blobPts(side * 0.12 * H, 0, 0.18 * H, 0.05 * H, 7, 0.1, seed + i),
      { fill: rgba('#4f8255', 0.92), lineW: 1.6, wobble: 1.5, key: seed + i * 3 });
    ctx.restore();
  }
}

// -------------------------------------------------------------- the jellyfish
export function drawJelly(ctx, R, t) {
  const pulse = 1 + Math.sin(t * 2.2) * 0.12;
  const bell = [
    { x: -1.0, y: 0.1 }, { x: -0.86, y: -0.5 }, { x: -0.4, y: -0.86 },
    { x: 0, y: -0.96 }, { x: 0.4, y: -0.86 }, { x: 0.86, y: -0.5 },
    { x: 1.0, y: 0.1 }, { x: 0.6, y: 0.2 }, { x: 0.3, y: 0.06 },
    { x: 0, y: 0.2 }, { x: -0.3, y: 0.06 }, { x: -0.6, y: 0.2 },
  ].map((p) => ({ x: p.x * R, y: p.y * R * pulse }));
  // glow
  wash(ctx, 0, -0.2 * R, 1.5 * R, '#cfe9ef', 0.4);
  ctx.save();
  sketchShape(ctx, bell, { fill: rgba('#dff1f4', 0.5), lineW: 2.2, wobble: 2, key: 61 });
  // inner organs
  wash(ctx, 0, -0.4 * R, 0.5 * R, '#b9a6d6', 0.5);
  ctx.restore();
  // tentacles
  ctx.strokeStyle = rgba('#cfd6e6', 0.7); ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const bx = (i / 5 - 0.5) * 1.6 * R;
    ctx.beginPath(); ctx.moveTo(bx, 0.1 * R);
    for (let s = 1; s <= 5; s++) {
      const yy = 0.1 * R + s * 0.4 * R;
      ctx.lineTo(bx + Math.sin(t * 3 + s + i) * 0.12 * R, yy);
    }
    ctx.stroke();
  }
}

// ------------------------------------------------- glowing plankton (pickup)
export function drawPlankton(ctx, R, t) {
  wash(ctx, 0, 0, R * 1.7, P.amber, 0.5 + 0.15 * Math.sin(t * 4));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + t * 0.6;
    const rr = R * (0.35 + 0.4 * hash1(i + 3));
    const x = Math.cos(a) * rr, y = Math.sin(a * 1.3) * rr;
    ctx.fillStyle = i % 2 ? P.amberSoft : '#aef0c0';
    ctx.beginPath(); ctx.arc(x, y, R * 0.16, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(P.foam, 0.9);
    ctx.beginPath(); ctx.arc(x - R * 0.05, y - R * 0.05, R * 0.05, 0, TAU); ctx.fill();
  }
}

// --------------------------------------------------------- a single egg (win)
export function drawEgg(ctx, r, t = 0) {
  wash(ctx, 0, 0, r * 2, P.amber, 0.6);
  ctx.fillStyle = rgba('#fff6e0', 0.85);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba(P.amber, 0.9);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba(P.foam, 0.95);
  ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.18, 0, TAU); ctx.fill();
}
