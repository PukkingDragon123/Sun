// Procedural hand-drawn sprites. Each draws in LOCAL space around the origin
// (facing +x), so the boil-wobble stays stable while the entity moves.
import { TAU, hash1, rgba, lerp, mixHex, clamp } from './utils.js';
import { PALETTE as P } from './config.js';
import { sketchShape, inkStroke, wash, blobPts } from './draw.js';

// hsl string helper (rainbow skin)
const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`;

// ----------------------------------------------------------- the sunfish star
// st.skin (optional): { body, belly, shade, pattern, patternColor, accessory,
// glow, rainbow }. Falls back to the default moon-grey palette.
export function drawSunfish(ctx, R, t, st = {}) {
  const flap = st.flap ?? 0;
  const blink = st.blink ?? 1;       // 1 open, 0 shut
  const hurt = st.hurt ?? 0;
  const look = st.lookX ?? 1;
  const mouth = st.mouth ?? 0;       // 0 resigned, 1 eating "o"
  const sk = st.skin || {};

  // resolve skin colors (rainbow cycles hue over time)
  let bodyC = sk.body || P.fishBody, bellyC = sk.belly || P.fishBelly, shadeC = sk.shade || P.fishShade;
  let glowC = sk.glow || null;
  if (sk.rainbow) {
    const h = t * 36;
    bodyC = hsl(h, 68, 74); shadeC = hsl(h - 18, 60, 60); bellyC = hsl(h + 26, 82, 88);
    glowC = hsl(h, 90, 70);
  }

  const sx = Math.sin(flap) * 0.22 * R;   // synchronized fin scull
  const px = Math.sin(flap * 1.25) * 0.18; // pectoral wave

  // glow aura (skins with a glow shimmer behind the body)
  if (glowC) wash(ctx, -0.1 * R, 0, 1.7 * R, glowC, 0.32 + 0.1 * Math.sin(t * 3));

  // dorsal + anal fins (drawn first so the body hides their roots)
  const finFill = mixHex(shadeC, bodyC, 0.4);
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
  grad.addColorStop(0, shadeC);
  grad.addColorStop(0.5, bodyC);
  grad.addColorStop(1, bellyC);
  sketchShape(ctx, body, { fill: grad, lineW: 3.4, wobble: 1.9, key: 3 });

  // watercolor depth + skin pattern, all clipped to the body silhouette
  ctx.save(); ctx.beginPath();
  sketchShape(ctx, body, { fill: null, outline: null }); ctx.clip();
  wash(ctx, -0.2 * R, -0.7 * R, R, shadeC, 0.5);
  wash(ctx, 0.1 * R, 0.8 * R, 0.9 * R, bellyC, 0.6);
  for (let i = 0; i < 5; i++) {
    const a = hash1(i * 5 + 1) * TAU, rr = hash1(i * 3 + 2) * 0.6 * R;
    wash(ctx, Math.cos(a) * rr, Math.sin(a) * rr - 0.2 * R, 0.16 * R, shadeC, 0.4);
  }
  if (sk.pattern) drawPattern(ctx, R, t, sk.pattern, sk.patternColor || shadeC);
  if (st.poison) wash(ctx, 0, -0.1 * R, 1.2 * R, P.poison, 0.26 + 0.1 * Math.sin(t * 4));
  if (st.wounds && st.wounds.length) for (const w of st.wounds) drawWound(ctx, R, w);
  if (st.parasites) drawParasites(ctx, R, st.parasites);
  if (hurt > 0) wash(ctx, 0, 0, 1.2 * R, P.blood, 0.55 * hurt);
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

  // a single dumb little dot eye — barely sentient, sits low and forward
  const sad = clamp(st.sad ?? 0, 0, 1);
  const ex = 0.54 * R, ey = -0.14 * R, er = 0.075 * R;
  ctx.fillStyle = rgba(P.foam, 0.5);
  ctx.beginPath(); ctx.arc(ex, ey, er * 2.1, 0, TAU); ctx.fill();   // faint socket so the dot reads on any skin
  ctx.fillStyle = P.ink;
  ctx.beginPath(); ctx.arc(ex + look * 0.02 * R, ey + sad * er * 0.3, er * (0.45 + 0.55 * blink) * (1 + sad * 0.4), 0, TAU); ctx.fill();
  ctx.fillStyle = rgba(P.foam, 0.9);
  ctx.beginPath(); ctx.arc(ex - er * 0.3, ey - er * 0.35, er * 0.4, 0, TAU); ctx.fill();
  // worried sad eyebrow + a welling tear when things are going badly
  if (sad > 0.05) {
    ctx.strokeStyle = P.ink; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ex - er * 1.6, ey - er * 2.2); ctx.lineTo(ex + er * 1.2, ey - er * (3.0 + sad)); ctx.stroke();
    if (sad > 0.45) {
      const ty = ey + er * 2 + (0.5 + 0.5 * Math.sin(t * 2)) * er * 3;
      ctx.fillStyle = rgba('#bfe9f0', 0.85);
      ctx.beginPath(); ctx.ellipse(ex - er * 0.3, ty, er * 0.5, er * 0.85, 0, 0, TAU); ctx.fill();
    }
  }

  // mouth: gormless little 'o' normally, a downturned frown when sad/hurt
  ctx.strokeStyle = P.ink; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  if (sad > 0.4) {
    ctx.beginPath(); ctx.arc(0.95 * R, 0.36 * R, 0.12 * R, Math.PI * 1.18, Math.PI * 1.82); ctx.stroke();
  } else {
    const mo = 0.045 * R + mouth * 0.06 * R;
    ctx.beginPath(); ctx.ellipse(0.95 * R, 0.24 * R, mo, mo * 1.2, 0, 0, TAU); ctx.stroke();
  }

  if (sk.accessory) drawAccessory(ctx, R, t, sk.accessory, ex, ey);
}

// skin patterns, drawn already clipped to the body
function drawPattern(ctx, R, t, kind, color) {
  if (kind === 'spots') {
    for (let i = 0; i < 9; i++) {
      const a = hash1(i * 9 + 2) * TAU, rr = hash1(i * 4 + 5) * 0.85 * R;
      ctx.fillStyle = rgba(color, 0.55);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.8 - 0.05 * R, 0.07 * R + hash1(i) * 0.05 * R, 0, TAU);
      ctx.fill();
    }
  } else if (kind === 'stripes') {
    ctx.save(); ctx.rotate(-0.32);
    for (let i = -3; i <= 3; i++) {
      ctx.fillStyle = rgba(color, 0.5);
      ctx.fillRect(i * 0.34 * R - 0.07 * R, -1.4 * R, 0.13 * R, 2.8 * R);
    }
    ctx.restore();
  } else if (kind === 'stars') {
    for (let i = 0; i < 16; i++) {
      const a = hash1(i * 7 + 1) * TAU, rr = hash1(i * 3 + 4) * R;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr * 0.85;
      const s = (0.02 + hash1(i) * 0.03) * R * (0.7 + 0.3 * Math.sin(t * 3 + i));
      ctx.fillStyle = rgba(color, 0.9);
      star(ctx, x, y, s);
    }
  } else if (kind === 'koi') {
    const blotch = (x, y, r, c) => sketchShape(ctx, blobPts(x * R, y * R, r * R, r * 0.8 * R, 8, 0.28, x * 99 + y * 13),
      { fill: rgba(c, 0.92), lineW: 0, outline: null });
    blotch(-0.2, -0.4, 0.42, color);
    blotch(0.5, 0.3, 0.3, '#1a1a22');
    blotch(-0.5, 0.4, 0.26, color);
  }
}
function star(ctx, x, y, s) {
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
  }
  ctx.lineWidth = Math.max(0.8, s * 0.5); ctx.strokeStyle = ctx.fillStyle; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, s * 0.4, 0, TAU); ctx.fill();
}

// cosmetic accessories
function drawAccessory(ctx, R, t, kind, ex, ey) {
  if (kind === 'shades') {
    const L = 0.17 * R, cy = ey - 0.02 * R;
    ctx.fillStyle = '#10141a'; ctx.strokeStyle = P.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(ex - L * 0.2, cy, L, L * 0.78, -0.08, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ex + L * 1.5, cy + L * 0.1, L * 0.7, L * 0.6, -0.08, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(ex + L * 0.7, cy - L * 0.15); ctx.lineTo(ex + L * 0.95, cy - L * 0.05); ctx.stroke();
    ctx.fillStyle = rgba('#ffffff', 0.55);
    ctx.beginPath(); ctx.ellipse(ex - L * 0.4, cy - L * 0.3, L * 0.32, L * 0.16, -0.5, 0, TAU); ctx.fill();
  } else if (kind === 'crown') {
    ctx.save(); ctx.translate(0.34 * R, -0.96 * R); ctx.rotate(-0.12);
    ctx.fillStyle = P.amber; ctx.strokeStyle = P.ink; ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-0.26 * R, 0.05 * R);
    ctx.lineTo(-0.26 * R, -0.12 * R); ctx.lineTo(-0.13 * R, 0.0 * R);
    ctx.lineTo(0, -0.22 * R); ctx.lineTo(0.13 * R, 0.0 * R);
    ctx.lineTo(0.26 * R, -0.12 * R); ctx.lineTo(0.26 * R, 0.05 * R);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    for (const jx of [-0.18, 0, 0.18]) {
      ctx.fillStyle = P.blood;
      ctx.beginPath(); ctx.arc(jx * R, -0.02 * R, 0.04 * R, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

// ----------------------------------------------------------------- the seal
export function drawSeal(ctx, R, t, st = {}) {
  const mouth = st.mouth ?? 0;
  const swim = Math.sin(t * 6) * 0.06;
  const bodyFill = ctx.createLinearGradient(0, -R, 0, R);
  bodyFill.addColorStop(0, P.hazardLight);
  bodyFill.addColorStop(0.6, P.hazard);
  bodyFill.addColorStop(1, mixHex(P.hazard, '#cdbfae', 0.5));
  sketchShape(ctx, [
    { x: -1.15 * R, y: -0.5 * R }, { x: -1.45 * R, y: -0.2 * R },
    { x: -1.3 * R, y: 0 }, { x: -1.46 * R, y: 0.24 * R }, { x: -1.12 * R, y: 0.5 * R },
    { x: -0.9 * R, y: 0 },
  ], { fill: P.hazardDark, lineW: 2.4, wobble: 2.2, key: 41 });
  const body = [
    { x: 1.12, y: 0.02 }, { x: 0.86, y: -0.42 }, { x: 0.3, y: -0.6 },
    { x: -0.4, y: -0.56 }, { x: -1.0, y: -0.34 }, { x: -1.05, y: 0.06 + swim },
    { x: -0.95, y: 0.4 }, { x: -0.3, y: 0.58 }, { x: 0.4, y: 0.56 },
    { x: 0.92, y: 0.4 },
  ].map((p) => ({ x: p.x * R, y: p.y * R }));
  sketchShape(ctx, body, { fill: bodyFill, lineW: 3, wobble: 1.9, key: 43 });
  ctx.save(); ctx.translate(0.2 * R, 0.42 * R); ctx.rotate(0.5 + swim);
  sketchShape(ctx, [{ x: 0, y: 0 }, { x: 0.16 * R, y: 0.5 * R },
    { x: 0.02 * R, y: 0.66 * R }, { x: -0.16 * R, y: 0.4 * R }],
    { fill: P.hazardDark, lineW: 2.2, wobble: 1.8, key: 47 });
  ctx.restore();
  if (mouth > 0.05) {
    ctx.fillStyle = '#6b2030';
    ctx.beginPath();
    ctx.moveTo(0.9 * R, -0.02 * R);
    ctx.lineTo(1.2 * R, -0.18 * R - mouth * 0.18 * R);
    ctx.lineTo(1.24 * R, 0.06 * R);
    ctx.lineTo(1.18 * R, 0.2 * R + mouth * 0.18 * R);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.foam;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo((1.0 + i * 0.07) * R, -0.1 * R - mouth * 0.16 * R);
      ctx.lineTo((1.04 + i * 0.07) * R, 0.0 * R);
      ctx.lineTo((1.08 + i * 0.07) * R, -0.1 * R - mouth * 0.16 * R);
      ctx.fill();
    }
  }
  ctx.fillStyle = P.ink;
  ctx.beginPath(); ctx.arc(0.62 * R, -0.22 * R, 0.09 * R, 0, TAU); ctx.fill();
  ctx.fillStyle = P.foam;
  ctx.beginPath(); ctx.arc(0.6 * R, -0.25 * R, 0.03 * R, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba(P.foam, 0.8); ctx.lineWidth = 1.3;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath(); ctx.moveTo(0.95 * R, 0.12 * R);
    ctx.quadraticCurveTo(1.3 * R, 0.12 * R + i * 0.1 * R, 1.5 * R, 0.14 * R + i * 0.16 * R);
    ctx.stroke();
  }
}

// ----------------------------------------------------------------- the shark
export function drawShark(ctx, R, t, st = {}) {
  const mouth = st.mouth ?? 0;       // 0 closed .. 1 gaping
  const col = st.color || P.shark;   // blue shark passes its own hue
  const dark = mixHex(col, '#0a1822', 0.45);
  const pale = mixHex(col, '#f1f5f6', 0.7);
  const swim = Math.sin(t * 5) * 0.045;
  // heterocercal caudal — long upper lobe, shorter lower
  sketchShape(ctx, [
    { x: -1.25 * R, y: 0 }, { x: -2.05 * R, y: -0.85 * R }, { x: -1.7 * R, y: -0.1 * R },
    { x: -1.75 * R, y: 0.06 * R }, { x: -1.95 * R, y: 0.5 * R }, { x: -1.3 * R, y: 0.22 * R },
  ], { fill: col, lineW: 2.4, wobble: 1.3, key: 81 });
  // tall raked first dorsal + tiny second dorsal
  sketchShape(ctx, [{ x: 0.0, y: -0.5 * R }, { x: 0.18 * R + swim * R, y: -1.3 * R }, { x: 0.5 * R, y: -0.46 * R }], { fill: dark, lineW: 2.2, wobble: 1.2, key: 82 });
  sketchShape(ctx, [{ x: -0.8 * R, y: -0.4 * R }, { x: -0.7 * R, y: -0.62 * R }, { x: -0.55 * R, y: -0.36 * R }], { fill: dark, lineW: 1.6, wobble: 1, key: 85 });
  // streamlined body with a pointed snout
  const body = [
    { x: 1.42, y: 0.0 }, { x: 1.05, y: -0.24 }, { x: 0.45, y: -0.42 }, { x: -0.4, y: -0.44 },
    { x: -1.05, y: -0.28 }, { x: -1.18, y: 0.02 + swim }, { x: -1.02, y: 0.32 },
    { x: -0.35, y: 0.46 }, { x: 0.5, y: 0.44 }, { x: 1.08, y: 0.26 },
  ].map((p) => ({ x: p.x * R, y: p.y * R }));
  sketchShape(ctx, body, { fill: col, lineW: 3, wobble: 1.4, key: 83 });
  // countershading: dark back over pale belly, clipped to the body
  ctx.save(); ctx.beginPath(); sketchShape(ctx, body, { fill: null, outline: null }); ctx.clip();
  ctx.fillStyle = rgba(dark, 0.9); ctx.beginPath();
  ctx.moveTo(-1.3 * R, -0.6 * R); ctx.lineTo(1.5 * R, -0.6 * R); ctx.lineTo(1.5 * R, -0.02 * R);
  ctx.quadraticCurveTo(0, 0.12 * R, -1.3 * R, -0.05 * R); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgba(pale, 0.95); ctx.beginPath();
  ctx.moveTo(-1.3 * R, 0.6 * R); ctx.lineTo(1.5 * R, 0.6 * R); ctx.lineTo(1.5 * R, 0.14 * R);
  ctx.quadraticCurveTo(0, 0.26 * R, -1.3 * R, 0.12 * R); ctx.closePath(); ctx.fill();
  ctx.restore();
  // very long scythe pectoral fin
  ctx.save(); ctx.translate(0.5 * R, 0.36 * R); ctx.rotate(0.5 + swim);
  sketchShape(ctx, [{ x: 0, y: 0 }, { x: 0.95 * R, y: 0.32 * R }, { x: 0.88 * R, y: 0.5 * R }, { x: 0.05 * R, y: 0.32 * R }],
    { fill: mixHex(col, '#000', 0.12), lineW: 2, wobble: 1.2, key: 84 });
  ctx.restore();
  // gill slits
  ctx.strokeStyle = rgba(P.ink, 0.4); ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo((0.62 - i * 0.08) * R, -0.18 * R); ctx.quadraticCurveTo((0.57 - i * 0.08) * R, 0, (0.62 - i * 0.08) * R, 0.2 * R); ctx.stroke(); }
  // underslung toothy mouth
  ctx.fillStyle = '#2a0c12'; ctx.beginPath();
  ctx.moveTo(1.05 * R, 0.2 * R); ctx.quadraticCurveTo(1.42 * R, 0.2 * R, 1.4 * R, 0.34 * R + mouth * 0.18 * R);
  ctx.quadraticCurveTo(1.15 * R, 0.46 * R + mouth * 0.2 * R, 1.0 * R, 0.32 * R); ctx.closePath(); ctx.fill();
  ctx.fillStyle = P.foam;
  for (let i = 0; i < 5; i++) { const tx = (1.08 + i * 0.07) * R; ctx.beginPath(); ctx.moveTo(tx, 0.24 * R); ctx.lineTo(tx + 0.025 * R, 0.32 * R + mouth * 0.14 * R); ctx.lineTo(tx + 0.05 * R, 0.24 * R); ctx.fill(); }
  // dark eye with a cold glint
  ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(0.92 * R, -0.06 * R, 0.07 * R, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba('#fff', 0.5); ctx.beginPath(); ctx.arc(0.9 * R, -0.09 * R, 0.025 * R, 0, TAU); ctx.fill();
}

// -------------------------------------------------------------- the barracuda
export function drawBarracuda(ctx, R, t, st = {}) {
  const mouth = st.mouth ?? 0;
  const swim = Math.sin(t * 9) * 0.05;
  const fill = ctx.createLinearGradient(0, -R * 0.5, 0, R * 0.5);
  fill.addColorStop(0, '#9fc3c9'); fill.addColorStop(1, '#5f8088');
  sketchShape(ctx, [
    { x: -1.5 * R, y: 0 }, { x: -1.9 * R, y: -0.35 * R }, { x: -1.7 * R, y: 0 },
    { x: -1.9 * R, y: 0.35 * R },
  ], { fill: '#5f8088', lineW: 2, wobble: 1.8, key: 91 });
  const body = [
    { x: 1.55, y: 0.0 }, { x: 0.8, y: -0.26 }, { x: 0.0, y: -0.34 },
    { x: -0.9, y: -0.28 }, { x: -1.5, y: -0.12 + swim }, { x: -1.5, y: 0.12 },
    { x: -0.9, y: 0.28 }, { x: 0.0, y: 0.34 }, { x: 0.8, y: 0.26 },
  ].map((p) => ({ x: p.x * R, y: p.y * R }));
  sketchShape(ctx, body, { fill, lineW: 2.6, wobble: 1.6, key: 92 });
  // tiny dorsal
  sketchShape(ctx, [{ x: -0.2 * R, y: -0.3 * R }, { x: 0.0, y: -0.55 * R }, { x: 0.2 * R, y: -0.28 * R }],
    { fill: '#5f8088', lineW: 1.8, wobble: 1.6, key: 93 });
  // long toothy jaw
  ctx.fillStyle = '#22363a';
  ctx.beginPath(); ctx.moveTo(1.2 * R, -0.06 * R);
  ctx.lineTo(1.62 * R, -0.05 * R); ctx.lineTo(1.62 * R, 0.08 * R + mouth * 0.1 * R);
  ctx.lineTo(1.2 * R, 0.12 * R); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = P.foam; ctx.lineWidth = 1.2;
  for (let i = 0; i < 6; i++) { const tx = (1.26 + i * 0.06) * R; ctx.beginPath(); ctx.moveTo(tx, -0.02 * R); ctx.lineTo(tx, 0.05 * R); ctx.stroke(); }
  ctx.fillStyle = P.foam; ctx.beginPath(); ctx.arc(1.04 * R, -0.1 * R, 0.07 * R, 0, TAU); ctx.fill();
  ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(1.05 * R, -0.1 * R, 0.035 * R, 0, TAU); ctx.fill();
}

// ------------------------------------------------------------- the anglerfish
export function drawAngler(ctx, R, t, st = {}) {
  const mouth = st.mouth ?? 0;
  const lure = st.lure ?? 1;   // lamp brightness
  // lure light glow
  const lx = 1.05 * R, ly = -1.0 * R;
  wash(ctx, lx, ly, 0.9 * R * lure, P.bio, 0.5 * lure);
  // round dark body
  const body = [
    { x: 0.95, y: 0.1 }, { x: 0.7, y: -0.6 }, { x: 0.1, y: -0.85 },
    { x: -0.6, y: -0.7 }, { x: -0.95, y: -0.2 }, { x: -0.92, y: 0.3 },
    { x: -0.5, y: 0.75 }, { x: 0.2, y: 0.85 }, { x: 0.8, y: 0.55 },
  ].map((p) => ({ x: p.x * R, y: p.y * R }));
  const fill = ctx.createRadialGradient(-0.2 * R, 0, 0.1 * R, 0, 0, 1.1 * R);
  fill.addColorStop(0, '#15202b'); fill.addColorStop(1, '#070d14');
  sketchShape(ctx, body, { fill, lineW: 3, wobble: 2.0, key: 71 });
  // illicium (rod) + glowing lure
  ctx.strokeStyle = '#0c1620'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0.5 * R, -0.7 * R);
  ctx.quadraticCurveTo(0.9 * R, -1.1 * R, lx, ly); ctx.stroke();
  ctx.fillStyle = rgba(P.bio, 0.5 + 0.5 * lure);
  ctx.beginPath(); ctx.arc(lx, ly, 0.13 * R, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba('#eafff4', 0.9); ctx.beginPath(); ctx.arc(lx, ly, 0.06 * R, 0, TAU); ctx.fill();
  // huge fanged maw
  ctx.fillStyle = '#1f0a0e';
  ctx.beginPath();
  ctx.moveTo(0.2 * R, 0.2 * R);
  ctx.quadraticCurveTo(0.95 * R, 0.1 * R, 0.95 * R, 0.35 * R + mouth * 0.2 * R);
  ctx.quadraticCurveTo(0.5 * R, 0.62 * R + mouth * 0.2 * R, 0.1 * R, 0.42 * R);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f3f3ea';
  for (let i = 0; i < 6; i++) {
    const tx = (0.24 + i * 0.12) * R;
    ctx.beginPath(); ctx.moveTo(tx, 0.24 * R); ctx.lineTo(tx + 0.03 * R, 0.38 * R + mouth * 0.16 * R); ctx.lineTo(tx + 0.06 * R, 0.24 * R); ctx.fill();
    ctx.beginPath(); ctx.moveTo(tx, 0.44 * R + mouth * 0.18 * R); ctx.lineTo(tx + 0.03 * R, 0.32 * R + mouth * 0.04 * R); ctx.lineTo(tx + 0.06 * R, 0.44 * R + mouth * 0.18 * R); ctx.fill();
  }
  // pale eye reflecting the lure
  ctx.fillStyle = rgba(P.bio, 0.85); ctx.beginPath(); ctx.arc(0.45 * R, -0.18 * R, 0.1 * R, 0, TAU); ctx.fill();
  ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(0.47 * R, -0.16 * R, 0.045 * R, 0, TAU); ctx.fill();
}

// ------------------------------------------------------------- the pufferfish
export function drawPuffer(ctx, R, t, st = {}) {
  const inflate = clamp(st.inflate ?? 0, 0, 1);     // 0 calm .. 1 spiky balloon
  const rr = R * (0.7 + inflate * 0.55);
  const fill = ctx.createRadialGradient(-0.2 * rr, -0.2 * rr, 0.1 * rr, 0, 0, rr);
  fill.addColorStop(0, '#f4e2a6'); fill.addColorStop(1, '#caa24a');
  // spikes (extend as it inflates)
  const spikeL = (0.12 + inflate * 0.4) * R;
  ctx.fillStyle = '#b98a32'; ctx.strokeStyle = P.ink; ctx.lineWidth = 1.4;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + 0.1;
    const bx = Math.cos(a) * rr * 0.9, by = Math.sin(a) * rr * 0.9;
    ctx.beginPath();
    ctx.moveTo(bx - Math.sin(a) * 0.08 * rr, by + Math.cos(a) * 0.08 * rr);
    ctx.lineTo(Math.cos(a) * (rr + spikeL), Math.sin(a) * (rr + spikeL));
    ctx.lineTo(bx + Math.sin(a) * 0.08 * rr, by - Math.cos(a) * 0.08 * rr);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  sketchShape(ctx, blobPts(0, 0, rr, rr * 0.92, 12, 0.05, 61), { fill, lineW: 3, wobble: 1.8, key: 62 });
  // wide worried eyes
  for (const s of [-1, 1]) {
    ctx.fillStyle = P.foam; ctx.beginPath(); ctx.arc(0.32 * rr, -0.2 * rr + s * 0.0, 0.16 * rr, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = P.foam; ctx.beginPath(); ctx.arc(0.34 * rr, -0.22 * rr, 0.17 * rr, 0, TAU); ctx.fill();
  ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(0.4 * rr, -0.2 * rr, 0.08 * rr, 0, TAU); ctx.fill();
  // pursed lips
  ctx.strokeStyle = P.ink; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.arc(0.7 * rr, 0.16 * rr, 0.1 * rr, 0, TAU); ctx.stroke();
}

// ----------------------------------------------------------------- the squid
export function drawSquid(ctx, R, t, st = {}) {
  const grab = st.grab ?? 0;      // 0 idle .. 1 tentacles reaching forward
  const fill = ctx.createLinearGradient(0, -R, 0, R);
  fill.addColorStop(0, '#b3506b'); fill.addColorStop(1, '#7a2d44');
  // mantle (points backward, +x is the head/arms)
  const mantle = [
    { x: -1.5, y: 0 }, { x: -0.9, y: -0.4 }, { x: -0.2, y: -0.5 },
    { x: 0.4, y: -0.4 }, { x: 0.5, y: 0 }, { x: 0.4, y: 0.4 },
    { x: -0.2, y: 0.5 }, { x: -0.9, y: 0.4 },
  ].map((p) => ({ x: p.x * R, y: p.y * R }));
  sketchShape(ctx, mantle, { fill, lineW: 3, wobble: 2, key: 51 });
  // fins on the mantle tip
  sketchShape(ctx, [{ x: -1.5 * R, y: -0.1 * R }, { x: -1.9 * R, y: -0.4 * R }, { x: -1.4 * R, y: 0.1 * R }],
    { fill: '#7a2d44', lineW: 2, wobble: 1.8, key: 52 });
  sketchShape(ctx, [{ x: -1.5 * R, y: 0.1 * R }, { x: -1.9 * R, y: 0.4 * R }, { x: -1.4 * R, y: -0.1 * R }],
    { fill: '#7a2d44', lineW: 2, wobble: 1.8, key: 53 });
  // arms reaching toward +x (extend with grab)
  ctx.strokeStyle = '#8a3450'; ctx.lineWidth = R * 0.13; ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const sy = (i / 5 - 0.5) * 0.8 * R;
    const reach = (0.5 + grab * 0.9) * R;
    ctx.beginPath(); ctx.moveTo(0.4 * R, sy * 0.6);
    ctx.quadraticCurveTo(0.5 * R + reach * 0.6, sy + Math.sin(t * 4 + i) * 0.12 * R,
      0.5 * R + reach, sy * 1.4 + Math.sin(t * 4 + i) * 0.2 * R);
    ctx.stroke();
  }
  // big eye
  ctx.fillStyle = '#ffe9b0'; ctx.beginPath(); ctx.arc(0.1 * R, -0.18 * R, 0.18 * R, 0, TAU); ctx.fill();
  ctx.fillStyle = P.ink; ctx.beginPath(); ctx.ellipse(0.12 * R, -0.16 * R, 0.06 * R, 0.1 * R, 0, 0, TAU); ctx.fill();
}

// ------------------------------------------------------------------ the boat
export function drawBoat(ctx, W, t) {
  const H = W * 0.42;
  const hullFill = ctx.createLinearGradient(0, -H, 0, H);
  hullFill.addColorStop(0, P.hazardLight);
  hullFill.addColorStop(1, P.hazardDark);
  const hull = [
    { x: -1.0, y: -0.5 }, { x: 1.0, y: -0.5 }, { x: 0.92, y: 0.1 },
    { x: 0.5, y: 0.62 }, { x: 0, y: 0.78 }, { x: -0.5, y: 0.6 }, { x: -0.92, y: 0.12 },
  ].map((p) => ({ x: p.x * W, y: p.y * H }));
  sketchShape(ctx, hull, { fill: hullFill, lineW: 3.4, wobble: 2.2, key: 51 });
  ctx.save(); ctx.beginPath();
  sketchShape(ctx, hull, { fill: null, outline: null }); ctx.clip();
  ctx.fillStyle = rgba('#b6483a', 0.85);
  ctx.fillRect(-W, -0.18 * H, 2 * W, 0.16 * H);
  ctx.strokeStyle = rgba(P.hazardDark, 0.5); ctx.lineWidth = 1.4;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(-0.9 * W, (0.1 + i * 0.18) * H);
    ctx.lineTo(0.9 * W, (0.1 + i * 0.18) * H); ctx.stroke();
  }
  ctx.restore();
  sketchShape(ctx, [
    { x: -0.3 * W, y: -0.5 * H }, { x: -0.3 * W, y: -0.95 * H },
    { x: 0.18 * W, y: -0.95 * H }, { x: 0.18 * W, y: -0.5 * H },
  ], { fill: mixHex(P.hazard, '#caa', 0.3), lineW: 2.6, wobble: 1.8, key: 53 });
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
  ctx.fillStyle = rgba('#caa', 0.8);
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath(); ctx.arc((c / cols - 0.5) * w, 0, 3, 0, TAU); ctx.fill();
  }
}

// --------------------------------------------------- the baited fishing hook
export function drawHook(ctx, R, t, depth) {
  // line up to the surface
  ctx.strokeStyle = rgba('#dfeef0', 0.4); ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(0, -depth); ctx.lineTo(Math.sin(t + depth * 0.01) * 6, -R); ctx.stroke();
  // steel hook
  ctx.strokeStyle = '#c7cdd2'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -R);
  ctx.lineTo(0, 0.4 * R);
  ctx.arc(-0.35 * R, 0.4 * R, 0.35 * R, 0, Math.PI * 0.9, false);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(-0.62 * R, 0.32 * R, 0.07 * R, 0, TAU); ctx.stroke(); // barb tip
  // a tempting (deadly) glowing bait
  wash(ctx, 0, 0.42 * R, 0.5 * R, P.amber, 0.5 + 0.15 * Math.sin(t * 4));
  ctx.fillStyle = P.amberSoft; ctx.beginPath(); ctx.arc(0, 0.42 * R, 0.16 * R, 0, TAU); ctx.fill();
}

// ----------------------------------------------------------------- a sea mine
export function drawMine(ctx, R, t, armed) {
  // horns
  ctx.fillStyle = '#2b3138'; ctx.strokeStyle = P.ink; ctx.lineWidth = 1.6;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    ctx.save(); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(-0.1 * R, -R); ctx.lineTo(0, -1.28 * R); ctx.lineTo(0.1 * R, -R); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  const fill = ctx.createRadialGradient(-0.3 * R, -0.3 * R, 0.1 * R, 0, 0, R);
  fill.addColorStop(0, '#4a535b'); fill.addColorStop(1, '#171c22');
  sketchShape(ctx, blobPts(0, 0, R, R, 12, 0.04, 121), { fill, lineW: 3, wobble: 1.6, key: 122 });
  // blinking warning light
  const blink = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 7));
  wash(ctx, 0.2 * R, -0.1 * R, 0.4 * R, P.danger, 0.5 * blink);
  ctx.fillStyle = rgba(P.danger, blink); ctx.beginPath(); ctx.arc(0.2 * R, -0.1 * R, 0.12 * R, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba('#fff', 0.7 * blink); ctx.beginPath(); ctx.arc(0.16 * R, -0.14 * R, 0.04 * R, 0, TAU); ctx.fill();
}

// ----------------------------------------------------------------- a sea urchin
export function drawUrchin(ctx, R, seed) {
  ctx.strokeStyle = '#241a2e'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + hash1(seed + i) * 0.2;
    const len = R * (1.1 + hash1(seed + i * 3) * 0.5);
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.4, Math.sin(a) * R * 0.4);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len); ctx.stroke();
  }
  const fill = ctx.createRadialGradient(-0.2 * R, -0.2 * R, 0.1 * R, 0, 0, R);
  fill.addColorStop(0, '#5a3b6e'); fill.addColorStop(1, '#241a2e');
  sketchShape(ctx, blobPts(0, 0, R * 0.6, R * 0.55, 10, 0.08, seed), { fill, lineW: 2.4, wobble: 1.4, key: seed + 5 });
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = rgba('#c79bff', 0.5);
    ctx.beginPath(); ctx.arc((hash1(seed + i) - 0.5) * R * 0.6, (hash1(seed + i * 2) - 0.5) * R * 0.5, R * 0.05, 0, TAU); ctx.fill();
  }
}

// ----------------------------------------------------------------- an anchor
export function drawAnchor(ctx, R, t) {
  ctx.strokeStyle = '#4b5560'; ctx.fillStyle = '#3a434c'; ctx.lineWidth = R * 0.16; ctx.lineCap = 'round';
  // chain up
  ctx.strokeStyle = rgba('#5b646d', 0.7); ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(Math.sin(t + i) * 3, -R - i * 0.3 * R, 5, 8, 0, 0, TAU); ctx.stroke(); }
  ctx.strokeStyle = '#4b5560'; ctx.lineWidth = R * 0.16;
  ctx.beginPath(); ctx.arc(0, -0.7 * R, 0.18 * R, 0, TAU); ctx.stroke();          // ring
  ctx.beginPath(); ctx.moveTo(0, -0.5 * R); ctx.lineTo(0, 0.7 * R); ctx.stroke(); // shank
  ctx.beginPath(); ctx.moveTo(-0.4 * R, -0.1 * R); ctx.lineTo(0.4 * R, -0.1 * R); ctx.stroke(); // stock
  // flukes
  ctx.beginPath();
  ctx.moveTo(0, 0.7 * R);
  ctx.quadraticCurveTo(-0.7 * R, 0.6 * R, -0.6 * R, 0.1 * R);
  ctx.moveTo(0, 0.7 * R);
  ctx.quadraticCurveTo(0.7 * R, 0.6 * R, 0.6 * R, 0.1 * R);
  ctx.stroke();
}

// ------------------------------------------------------ natural sea stones
export function drawRock(ctx, R, seed) {
  const n = 2 + Math.floor(hash1(seed) * 2);
  for (let i = 0; i < n; i++) {
    const ox = (hash1(seed + i * 9) - 0.5) * R * 0.9;
    const oy = (1 - hash1(seed + i * 5) * 0.4) * R * 0.32;
    const rr = R * (0.55 + hash1(seed + i * 7) * 0.5);
    const top = mixHex('#9fb0bb', '#c2cdd3', hash1(seed + i));       // cool weathered granite
    const bot = mixHex('#41535e', '#5a6f7b', hash1(seed + i * 2));
    const g = ctx.createLinearGradient(ox, oy - rr, ox, oy + rr);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    const shape = blobPts(ox, oy, rr, rr * 0.74, 8, 0.2, seed + i * 31);
    sketchShape(ctx, shape, { fill: g, lineW: 2.4, wobble: 1.4, key: seed + i * 13 });
    ctx.save(); ctx.beginPath(); sketchShape(ctx, shape, { fill: null, outline: null }); ctx.clip();
    ctx.strokeStyle = rgba('#2c3940', 0.22); ctx.lineWidth = 2;           // strata
    for (let s = 0; s < 3; s++) {
      const yy = oy - rr * 0.34 + s * rr * 0.32;
      ctx.beginPath(); ctx.moveTo(ox - rr, yy + (hash1(seed + s) - 0.5) * 10);
      ctx.quadraticCurveTo(ox, yy - 6, ox + rr, yy + (hash1(seed + s * 2) - 0.5) * 10); ctx.stroke();
    }
    ctx.fillStyle = rgba('#5f8a5a', 0.5);                                  // moss
    for (let m = 0; m < 6; m++) { const a = -Math.PI / 2 + (hash1(seed + m * 3) - 0.5) * 1.7; ctx.beginPath(); ctx.arc(ox + Math.cos(a) * rr * 0.72, oy + Math.sin(a) * rr * 0.55, rr * (0.07 + hash1(seed + m) * 0.05), 0, TAU); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = rgba('#ffffff', 0.12);                                 // top sheen
    ctx.beginPath(); ctx.ellipse(ox - rr * 0.25, oy - rr * 0.5, rr * 0.4, rr * 0.16, -0.3, 0, TAU); ctx.fill();
  }
}

// --------------------------------------------------------------- coral (blocker)
export function drawCoral(ctx, R, seed) {
  const hue = [ '#e08a5a', '#d96f8f', '#e0b35a', '#7fb0c9' ][Math.floor(hash1(seed) * 4)];
  const branches = 3 + Math.floor(hash1(seed + 2) * 3);
  for (let b = 0; b < branches; b++) {
    const a = -Math.PI / 2 + (b / (branches - 1) - 0.5) * 1.6;
    const len = R * (0.8 + hash1(seed + b * 5) * 0.7);
    ctx.strokeStyle = mixHex(hue, P.ink, 0.2); ctx.lineWidth = R * 0.22; ctx.lineCap = 'round';
    const ex = Math.cos(a) * len, ey = Math.sin(a) * len;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(ex * 0.4 + hash1(seed + b) * 8, ey * 0.6, ex, ey); ctx.stroke();
    // knobs
    ctx.fillStyle = rgba(hue, 0.95);
    ctx.beginPath(); ctx.arc(ex, ey, R * 0.16, 0, TAU); ctx.fill();
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = rgba('#fff', 0.25);
      ctx.beginPath(); ctx.arc(ex * (0.4 + k * 0.2), ey * (0.4 + k * 0.2), R * 0.06, 0, TAU); ctx.fill();
    }
  }
}

// ------------------------------------------------------------------ the kelp
// `flow` (≈ -1..1) is the live wave surge from the game, so the whole bed
// sways together; tips lag and sway more than the holdfast for a fluid feel.
export function drawKelp(ctx, H, t, seed, flow = 0) {
  const segs = 9;
  const own = 0.6 + hash1(seed) * 0.5;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const f = i / segs;
    const bend = (flow * 0.7 + Math.sin(t * own + seed + f * 2.2) * 0.5) * f * f;
    pts.push({ x: bend * 0.34 * H, y: -f * H });
  }
  const grad = ctx.createLinearGradient(0, 0, 0, -H);
  grad.addColorStop(0, mixHex('#2f5d3a', P.ink, 0.3)); grad.addColorStop(1, '#5aa06a');
  ctx.strokeStyle = grad; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; ctx.quadraticCurveTo(a.x, (a.y + b.y) / 2, b.x, b.y); }
  ctx.stroke();
  for (let i = 2; i < pts.length; i++) {       // translucent blades
    const p = pts[i], side = i % 2 ? 1 : -1;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(side * 0.5 + flow * 0.3);
    ctx.fillStyle = rgba(mixHex('#4f8255', '#7fc98a', hash1(seed + i)), 0.9);
    ctx.beginPath(); ctx.ellipse(side * 0.14 * H, 0, 0.2 * H, 0.045 * H, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = rgba('#9ed6a0', 0.9);          // gas-bladder bulbs near the tips
  for (let i = pts.length - 3; i < pts.length; i++) { const p = pts[i]; ctx.beginPath(); ctx.arc(p.x, p.y, 0.03 * H, 0, TAU); ctx.fill(); }
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
  wash(ctx, 0, -0.2 * R, 1.5 * R, '#cfe9ef', 0.4);
  ctx.save();
  sketchShape(ctx, bell, { fill: rgba('#dff1f4', 0.5), lineW: 2.2, wobble: 2, key: 61 });
  wash(ctx, 0, -0.4 * R, 0.5 * R, '#b9a6d6', 0.5);
  ctx.restore();
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

// --------------------------------------------- a clam (loot box) that opens
export function drawClam(ctx, R, open, t) {
  // open: 0 shut .. 1 fully agape. A pearl glows inside as it opens.
  if (open > 0.1) wash(ctx, 0, -0.1 * R, R * (0.6 + open), P.amberSoft, 0.5 * open);
  // bottom shell
  ctx.save();
  const fillB = ctx.createLinearGradient(0, 0, 0, 0.7 * R);
  fillB.addColorStop(0, '#e9d6c5'); fillB.addColorStop(1, '#b9967c');
  sketchShape(ctx, fan(R, 0.6, false), { fill: fillB, lineW: 3, wobble: 2, key: 131 });
  ctx.restore();
  // pearl
  if (open > 0.2) {
    ctx.fillStyle = rgba('#fff8ec', 0.95);
    ctx.beginPath(); ctx.arc(0, -0.05 * R, 0.22 * R, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba('#fff', 0.8);
    ctx.beginPath(); ctx.arc(-0.07 * R, -0.12 * R, 0.07 * R, 0, TAU); ctx.fill();
  }
  // top shell hinges open
  ctx.save(); ctx.translate(0, -0.02 * R); ctx.rotate(-open * 0.9);
  const fillT = ctx.createLinearGradient(0, -0.7 * R, 0, 0);
  fillT.addColorStop(0, '#f3e6d8'); fillT.addColorStop(1, '#cdb29a');
  sketchShape(ctx, fan(R, 0.6, true), { fill: fillT, lineW: 3, wobble: 2, key: 132 });
  // ribs
  ctx.strokeStyle = rgba(P.ink, 0.25); ctx.lineWidth = 1.6;
  for (let i = 1; i < 6; i++) {
    const a = Math.PI + (i / 6) * Math.PI;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * 0.6 * R); ctx.stroke();
  }
  ctx.restore();
}
// half-clam fan shape
function fan(R, hScale, up) {
  const pts = [{ x: -R, y: 0 }];
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    pts.push({ x: Math.cos(a) * R, y: (up ? -1 : 1) * Math.abs(Math.sin(a)) * hScale * R });
  }
  pts.push({ x: R, y: 0 });
  return pts;
}

// ----------------------------------------- gore: cookiecutter bite + parasites
// drawn already clipped to the body, so a circle near the edge reads as a
// scooped-out "cookie" bite missing from the silhouette.
function drawWound(ctx, R, w) {
  const cx = Math.cos(w.a) * 0.66 * R, cy = Math.sin(w.a) * 0.52 * R;
  if (w.cut) {                                    // a slashing gash
    const len = (0.3 + w.r) * R, ang = w.a + 1.2;
    const dx = Math.cos(ang) * len * 0.5, dy = Math.sin(ang) * len * 0.5;
    ctx.strokeStyle = rgba('#5a160f', 0.95); ctx.lineWidth = R * 0.07; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - dx, cy - dy); ctx.lineTo(cx + dx, cy + dy); ctx.stroke();
    ctx.strokeStyle = rgba(P.blood, 0.8); ctx.lineWidth = R * 0.03;
    ctx.beginPath(); ctx.moveTo(cx - dx, cy - dy); ctx.lineTo(cx + dx, cy + dy); ctx.stroke();
  } else {                                         // a round cookiecutter scoop
    const br = w.r * R;
    ctx.fillStyle = rgba(P.bloodDark, 0.95); ctx.beginPath(); ctx.arc(cx, cy, br, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba('#5a160f', 0.95); ctx.beginPath(); ctx.arc(cx, cy, br * 0.66, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(P.blood, 0.85); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, br, 0, TAU); ctx.stroke();
  }
  // a trickle of blood running down from the wound
  ctx.strokeStyle = rgba(P.blood, 0.45); ctx.lineWidth = R * 0.035; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + R * 0.03, cy + R * 0.18, cx - R * 0.02, cy + R * 0.34); ctx.stroke();
}
function drawParasites(ctx, R, n) {
  for (let i = 0; i < Math.min(n, 6); i++) {
    const a = hash1(i * 13 + 3) * TAU, x = Math.cos(a) * 0.6 * R, y = Math.sin(a) * 0.5 * R;
    ctx.fillStyle = rgba('#7a5a38', 0.95);
    ctx.beginPath(); ctx.ellipse(x, y, R * 0.07, R * 0.045, a, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba('#2e2112', 0.8); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(a) * R * 0.09, y - Math.sin(a) * R * 0.09); ctx.stroke();
  }
}

// ----------------------------------------------------------------- swordfish
export function drawSwordfish(ctx, R, t, st = {}) {
  const swim = Math.sin(t * 6) * 0.04;
  const dark = '#22425a', mid = '#4a6f88', pale = '#cdd9df';
  // crescent (lunate) tail
  sketchShape(ctx, [
    { x: -1.35 * R, y: 0 }, { x: -1.98 * R, y: -0.62 * R }, { x: -1.58 * R, y: -0.06 * R },
    { x: -1.62 * R, y: 0.06 * R }, { x: -1.98 * R, y: 0.62 * R },
  ], { fill: dark, lineW: 2, wobble: 1.1, key: 101 });
  // streamlined fusiform body
  const body = [
    { x: 0.95, y: 0 }, { x: 0.55, y: -0.24 }, { x: -0.2, y: -0.34 }, { x: -0.9, y: -0.2 + swim },
    { x: -1.3, y: -0.05 }, { x: -1.3, y: 0.05 }, { x: -0.9, y: 0.2 + swim }, { x: -0.2, y: 0.32 }, { x: 0.55, y: 0.22 },
  ].map((p) => ({ x: p.x * R, y: p.y * R }));
  sketchShape(ctx, body, { fill: mid, lineW: 2.4, wobble: 1.1, key: 102 });
  // countershading
  ctx.save(); ctx.beginPath(); sketchShape(ctx, body, { fill: null, outline: null }); ctx.clip();
  ctx.fillStyle = rgba(dark, 0.85); ctx.beginPath(); ctx.moveTo(-1.3 * R, -0.4 * R); ctx.lineTo(1 * R, -0.4 * R); ctx.lineTo(1 * R, -0.02 * R); ctx.quadraticCurveTo(-0.3 * R, 0.06 * R, -1.3 * R, -0.04 * R); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgba(pale, 0.92); ctx.beginPath(); ctx.moveTo(-1.3 * R, 0.4 * R); ctx.lineTo(1 * R, 0.4 * R); ctx.lineTo(1 * R, 0.12 * R); ctx.quadraticCurveTo(-0.3 * R, 0.2 * R, -1.3 * R, 0.1 * R); ctx.closePath(); ctx.fill();
  ctx.restore();
  // tall sickle first dorsal + small pelvic
  sketchShape(ctx, [{ x: -0.05 * R, y: -0.3 * R }, { x: 0.06 * R, y: -0.98 * R }, { x: 0.02 * R, y: -0.5 * R }, { x: 0.3 * R, y: -0.28 * R }], { fill: dark, lineW: 1.8, wobble: 1, key: 103 });
  sketchShape(ctx, [{ x: -0.2 * R, y: 0.3 * R }, { x: -0.1 * R, y: 0.62 * R }, { x: 0.12 * R, y: 0.32 * R }], { fill: dark, lineW: 1.6, wobble: 1, key: 104 });
  // the long rapier bill
  ctx.fillStyle = '#9fb6c4'; ctx.strokeStyle = P.ink; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(0.9 * R, -0.05 * R); ctx.lineTo(2.18 * R, -0.01 * R); ctx.lineTo(0.9 * R, 0.06 * R); ctx.closePath(); ctx.fill(); ctx.stroke();
  // big dark eye near the bill base
  ctx.fillStyle = P.foam; ctx.beginPath(); ctx.arc(0.66 * R, -0.1 * R, 0.09 * R, 0, TAU); ctx.fill();
  ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(0.67 * R, -0.1 * R, 0.055 * R, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba('#fff', 0.6); ctx.beginPath(); ctx.arc(0.64 * R, -0.13 * R, 0.02 * R, 0, TAU); ctx.fill();
}

// ------------------------------------------------------- cookiecutter shark
export function drawCookiecutter(ctx, R, t, st = {}) {
  const fill = ctx.createLinearGradient(0, -R, 0, R);
  fill.addColorStop(0, '#3a4750'); fill.addColorStop(1, '#222c33');
  sketchShape(ctx, [{ x: -1.4 * R, y: 0 }, { x: -1.7 * R, y: -0.3 * R }, { x: -1.5 * R, y: 0 }, { x: -1.7 * R, y: 0.3 * R }], { fill: '#222c33', lineW: 2, wobble: 1.6, key: 111 });
  const body = [{ x: 1.2, y: 0 }, { x: 0.6, y: -0.4 }, { x: -0.4, y: -0.42 }, { x: -1.2, y: -0.2 }, { x: -1.2, y: 0.2 }, { x: -0.4, y: 0.42 }, { x: 0.6, y: 0.4 }].map((p) => ({ x: p.x * R, y: p.y * R }));
  sketchShape(ctx, body, { fill, lineW: 2.4, wobble: 1.6, key: 112 });
  ctx.fillStyle = rgba(P.bio, 0.45); ctx.beginPath(); ctx.ellipse(0.2 * R, 0.3 * R, 0.7 * R, 0.16 * R, 0, 0, TAU); ctx.fill();
  // round suctorial cookie-cutter mouth, ringed with teeth
  ctx.fillStyle = '#2a0c12'; ctx.beginPath(); ctx.arc(1.05 * R, 0.06 * R, 0.26 * R * (st.biting ? 1.1 : 1), 0, TAU); ctx.fill();
  ctx.strokeStyle = P.foam; ctx.lineWidth = 1.4;
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; ctx.beginPath(); ctx.moveTo(1.05 * R + Math.cos(a) * 0.18 * R, 0.06 * R + Math.sin(a) * 0.18 * R); ctx.lineTo(1.05 * R + Math.cos(a) * 0.27 * R, 0.06 * R + Math.sin(a) * 0.27 * R); ctx.stroke(); }
  ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(0.6 * R, -0.16 * R, 0.07 * R, 0, TAU); ctx.fill();
}

// ----------------------------------------------------------------- the orca
export function drawOrca(ctx, R, t, st = {}) {
  const mouth = st.mouth ?? 0; const swim = Math.sin(t * 3.5) * 0.04;
  sketchShape(ctx, [{ x: -1.3 * R, y: 0 }, { x: -1.7 * R, y: -0.5 * R }, { x: -1.4 * R, y: 0 }, { x: -1.7 * R, y: 0.5 * R }], { fill: P.orca, lineW: 3, wobble: 2, key: 141 });
  const body = [{ x: 1.25, y: 0.05 }, { x: 1.0, y: -0.34 }, { x: 0.4, y: -0.5 }, { x: -0.4, y: -0.48 }, { x: -1.05, y: -0.3 }, { x: -1.1, y: 0.06 + swim }, { x: -1.0, y: 0.4 }, { x: -0.3, y: 0.56 }, { x: 0.5, y: 0.52 }, { x: 1.05, y: 0.34 }].map((p) => ({ x: p.x * R, y: p.y * R }));
  const fill = ctx.createLinearGradient(0, -R, 0, R);
  fill.addColorStop(0, mixHex(P.orca, '#3a4654', 0.4)); fill.addColorStop(0.5, P.orca); fill.addColorStop(1, '#0c1218');
  sketchShape(ctx, body, { fill, lineW: 3.4, wobble: 1.9, key: 142 });
  sketchShape(ctx, [{ x: -0.05 * R, y: -0.5 * R }, { x: 0.05 * R + swim * R, y: -1.35 * R }, { x: 0.45 * R, y: -0.45 * R }], { fill: P.orca, lineW: 2.8, wobble: 2, key: 143 });
  ctx.save(); ctx.beginPath(); sketchShape(ctx, body, { fill: null, outline: null }); ctx.clip();
  ctx.fillStyle = '#eef3f4';
  ctx.beginPath(); ctx.ellipse(0.1 * R, 0.55 * R, 0.9 * R, 0.4 * R, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0.78 * R, -0.12 * R, 0.22 * R, 0.14 * R, -0.2, 0, TAU); ctx.fill();   // eye patch
  ctx.fillStyle = rgba('#cdd7da', 0.45); ctx.beginPath(); ctx.ellipse(-0.5 * R, -0.2 * R, 0.5 * R, 0.22 * R, 0.2, 0, TAU); ctx.fill(); // grey saddle
  ctx.restore();
  ctx.save(); ctx.translate(0.5 * R, 0.45 * R); ctx.rotate(0.6);
  sketchShape(ctx, [{ x: 0, y: 0 }, { x: 0.55 * R, y: 0.3 * R }, { x: 0.1 * R, y: 0.5 * R }], { fill: '#10161c', lineW: 2, wobble: 1.7, key: 144 }); ctx.restore();
  ctx.fillStyle = '#1f0a0e'; ctx.beginPath();
  ctx.moveTo(0.75 * R, 0.16 * R); ctx.quadraticCurveTo(1.3 * R, 0.14 * R, 1.28 * R, 0.34 * R + mouth * 0.22 * R);
  ctx.quadraticCurveTo(0.95 * R, 0.5 * R + mouth * 0.22 * R, 0.72 * R, 0.34 * R); ctx.closePath(); ctx.fill();
  ctx.fillStyle = P.foam; for (let i = 0; i < 6; i++) { const tx = (0.82 + i * 0.08) * R; ctx.beginPath(); ctx.moveTo(tx, 0.2 * R); ctx.lineTo(tx + 0.03 * R, 0.32 * R + mouth * 0.16 * R); ctx.lineTo(tx + 0.06 * R, 0.2 * R); ctx.fill(); }
  ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(0.78 * R, -0.08 * R, 0.05 * R, 0, TAU); ctx.fill();
}

// ------------------------------------------------------- parasitic copepod
export function drawCopepod(ctx, R, t) {
  ctx.fillStyle = '#a8895e'; ctx.strokeStyle = P.ink; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.ellipse(0, 0, R, R * 0.62, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = rgba('#c8b07e', 0.9); ctx.beginPath(); ctx.ellipse(-R * 0.9, 0, R * 0.4, R * 0.3, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = P.ink; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(R * 0.6, -R * 0.2); ctx.lineTo(R * 1.3, -R * 0.5); ctx.moveTo(R * 0.6, R * 0.2); ctx.lineTo(R * 1.3, R * 0.5); ctx.stroke();
  ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(R * 0.4, 0, R * 0.18, 0, TAU); ctx.fill();
}

// ----------------------------------------------------------------- seagull
export function drawSeagull(ctx, R, t, st = {}) {
  const flap = Math.sin(t * 12) * 0.4;
  sketchShape(ctx, [{ x: 0.9 * R, y: 0 }, { x: 0.2 * R, y: -0.3 * R }, { x: -0.8 * R, y: -0.15 * R }, { x: -1.0 * R, y: 0.1 * R }, { x: -0.6 * R, y: 0.25 * R }, { x: 0.3 * R, y: 0.25 * R }], { fill: '#f2f4f5', lineW: 2, wobble: 1.4, key: 151 });
  ctx.strokeStyle = '#9aa6ac'; ctx.lineWidth = R * 0.16; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-0.1 * R, -0.1 * R); ctx.lineTo(-0.5 * R, (-0.7 - flap) * R); ctx.moveTo(-0.1 * R, -0.1 * R); ctx.lineTo(0.3 * R, (-0.55 + flap * 0.5) * R); ctx.stroke();
  ctx.fillStyle = P.amber; ctx.beginPath(); ctx.moveTo(0.85 * R, -0.05 * R); ctx.lineTo(1.25 * R, 0.02 * R); ctx.lineTo(0.85 * R, 0.08 * R); ctx.closePath(); ctx.fill();
  ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(0.6 * R, -0.05 * R, 0.06 * R, 0, TAU); ctx.fill();
}

// ----------------------------------------------- plastic bag (fake jellyfish)
export function drawBag(ctx, R, t) {
  const sway = Math.sin(t * 1.2) * 0.08;
  const pts = [{ x: -0.9, y: -0.2 }, { x: -0.7, y: -0.7 }, { x: 0, y: -0.9 }, { x: 0.7, y: -0.7 }, { x: 0.9, y: -0.2 }, { x: 0.6, y: 0.2 }, { x: 0.85, y: 0.7 }, { x: 0.2, y: 0.5 }, { x: -0.2, y: 0.8 }, { x: -0.6, y: 0.5 }, { x: -0.85, y: 0.7 }].map((p) => ({ x: (p.x + sway) * R, y: p.y * R }));
  sketchShape(ctx, pts, { fill: rgba(P.plastic, 0.45), lineW: 2, wobble: 2.6, key: 161 });
  ctx.strokeStyle = rgba('#ffffff', 0.4); ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(-0.3 * R, -0.4 * R); ctx.lineTo(-0.1 * R, 0.3 * R); ctx.moveTo(0.2 * R, -0.5 * R); ctx.lineTo(0.3 * R, 0.2 * R); ctx.stroke();
  ctx.strokeStyle = rgba(P.ink, 0.3); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(-0.3 * R, -0.72 * R, 0.12 * R, 0, Math.PI); ctx.arc(0.3 * R, -0.72 * R, 0.12 * R, 0, Math.PI); ctx.stroke();
}

// ---------------------------------------------------------- booster pickup
export function drawBooster(ctx, R, t, type) {
  const cols = { nurse: '#c2a875', swift: '#7fd0ff', shield: '#bfe9f0' };
  const col = cols[type] || '#ffd97a';
  wash(ctx, 0, 0, R * 1.9, col, 0.4 + 0.15 * Math.sin(t * 4));
  ctx.fillStyle = rgba('#08202e', 0.7); ctx.strokeStyle = col; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill(); ctx.stroke();
  if (type === 'nurse') {
    sketchShape(ctx, [{ x: 0.7 * R, y: 0 }, { x: 0.1 * R, y: -0.25 * R }, { x: -0.5 * R, y: -0.2 * R }, { x: -0.7 * R, y: 0 }, { x: -0.5 * R, y: 0.2 * R }, { x: 0.1 * R, y: 0.25 * R }], { fill: col, lineW: 1.6, wobble: 1, key: 171 });
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-0.5 * R, 0); ctx.lineTo(-0.85 * R, -0.25 * R); ctx.lineTo(-0.85 * R, 0.25 * R); ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(0.45 * R, -0.05 * R, 0.05 * R, 0, TAU); ctx.fill();
  } else if (type === 'swift') {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-0.4 * R, -0.4 * R); ctx.lineTo(0.45 * R, 0); ctx.lineTo(-0.4 * R, 0.4 * R); ctx.lineTo(-0.15 * R, 0); ctx.closePath(); ctx.fill();
  } else {
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, R * 0.5, 0, TAU); ctx.stroke();
    ctx.fillStyle = rgba(col, 0.3); ctx.fill();
    ctx.fillStyle = rgba('#fff', 0.6); ctx.beginPath(); ctx.arc(-0.15 * R, -0.15 * R, 0.1 * R, 0, TAU); ctx.fill();
  }
}

// ----------------------------------- background ambient life (silhouettes)
// Caller sets fillStyle + globalAlpha; these just lay down a shape facing +x.
export function drawTuna(ctx, R, t, phase = 0) {
  const wig = Math.sin(t * 7 + phase) * 0.14;
  ctx.beginPath();
  ctx.moveTo(R, 0);
  ctx.quadraticCurveTo(0.1 * R, -0.55 * R, -0.85 * R, wig * R);
  ctx.quadraticCurveTo(0.1 * R, 0.55 * R, R, 0);
  ctx.fill();
  ctx.beginPath(); ctx.moveTo(-0.8 * R, wig * R); ctx.lineTo(-1.3 * R, -0.45 * R + wig * R); ctx.lineTo(-1.05 * R, wig * R); ctx.lineTo(-1.3 * R, 0.45 * R + wig * R); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0.15 * R, -0.32 * R); ctx.lineTo(0.32 * R, -0.6 * R); ctx.lineTo(0.42 * R, -0.3 * R); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0.05 * R, 0.3 * R); ctx.lineTo(0.2 * R, 0.55 * R); ctx.lineTo(0.3 * R, 0.28 * R); ctx.closePath(); ctx.fill();
}

export function drawWhale(ctx, R, t) {
  const wig = Math.sin(t * 0.8) * 0.05;
  ctx.beginPath();
  ctx.moveTo(1.05 * R, 0.0);
  ctx.quadraticCurveTo(0.5 * R, -0.42 * R, -0.5 * R, -0.34 * R);
  ctx.quadraticCurveTo(-1.1 * R, -0.28 * R, -1.5 * R, -0.5 * R + wig * R);
  ctx.lineTo(-1.78 * R, -0.66 * R);
  ctx.quadraticCurveTo(-1.5 * R, -0.2 * R, -1.5 * R, 0);
  ctx.quadraticCurveTo(-1.5 * R, 0.2 * R, -1.78 * R, 0.5 * R);
  ctx.lineTo(-1.5 * R, 0.34 * R - wig * R);
  ctx.quadraticCurveTo(-0.9 * R, 0.5 * R, 0.2 * R, 0.46 * R);
  ctx.quadraticCurveTo(0.75 * R, 0.4 * R, 1.05 * R, 0.0);
  ctx.closePath(); ctx.fill();
  // pectoral flipper + a small dorsal hump
  ctx.beginPath(); ctx.moveTo(0.3 * R, 0.28 * R); ctx.quadraticCurveTo(0.15 * R, 0.74 * R, -0.18 * R, 0.62 * R); ctx.quadraticCurveTo(0.02 * R, 0.4 * R, 0.3 * R, 0.28 * R); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-0.55 * R, -0.32 * R); ctx.quadraticCurveTo(-0.4 * R, -0.5 * R, -0.25 * R, -0.32 * R); ctx.fill();
}
