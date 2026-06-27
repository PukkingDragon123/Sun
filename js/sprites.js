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
  const bend = st.bend ?? 0;         // overall body bend (rad) — proc-anim
  const tailLag = st.tailLag ?? 0;   // lagged tail/clavus bend (rad)
  const finLag = st.finLag ?? 0;     // lagged fin sway (rad)

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
  // dorsal + anal sit at the rear — sway them with the lagged tail bend
  ctx.save(); ctx.rotate(tailLag * 0.6);
  sketchShape(ctx, dorsal, { fill: finFill, lineW: 2.4, wobble: 2.6, key: 11 });
  sketchShape(ctx, anal, { fill: finFill, lineW: 2.4, wobble: 2.6, key: 17 });
  ctx.restore();

  // body — the iconic flattened disc with a scalloped clavus at the rear.
  // a gentle bend pivots at the snout (+x) so the rear (clavus) swings on turns.
  const body = [
    { x: 1.02, y: -0.10 }, { x: 0.80, y: -0.70 }, { x: 0.20, y: -1.05 },
    { x: -0.44, y: -0.95 }, { x: -0.92, y: -0.64 }, { x: -1.05, y: -0.28 },
    { x: -1.02, y: 0.08 }, { x: -1.06, y: 0.42 }, { x: -0.90, y: 0.72 },
    { x: -0.40, y: 0.98 }, { x: 0.24, y: 1.04 }, { x: 0.82, y: 0.64 },
    { x: 1.02, y: 0.18 },
  ].map((p) => {
    const px2 = p.x * R, py2 = p.y * R;
    const wgt = clamp(-px2 / (1.1 * R), 0, 1);   // 0 at head, 1 at tail
    const ang = bend * wgt;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    return { x: px2 * cs - py2 * sn, y: px2 * sn + py2 * cs };
  });

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

  // clavus frill ticks at the rear (swing with the lagged tail bend)
  ctx.save(); ctx.rotate(tailLag * 0.5);
  ctx.strokeStyle = rgba(P.ink, 0.45); ctx.lineWidth = 1.6;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(-1.0 * R, i * 0.28 * R);
    ctx.lineTo(-0.78 * R, i * 0.28 * R + 0.04 * R);
    ctx.stroke();
  }
  ctx.restore();

  // pectoral fin
  ctx.save(); ctx.translate(0.30 * R, 0.18 * R); ctx.rotate(px + finLag * 0.8);
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
// `flow` is the live wave surge; `push` is displacement from the player swimming
// through it. Both bend the frond — tips more than the holdfast — for a soft,
// organic, reactive sway.
export function drawKelp(ctx, H, t, seed, flow = 0, push = 0) {
  const segs = 11;
  const own = 0.6 + hash1(seed) * 0.5;
  const lean = (hash1(seed + 3) - 0.5) * 0.3;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const f = i / segs;
    const bend = (flow * 0.6 + Math.sin(t * own + seed + f * 2.4) * 0.45 + push * 1.5 + lean) * f * f;
    pts.push({ x: bend * 0.36 * H, y: -f * H });
  }
  const draw = (wid, style) => {
    ctx.strokeStyle = style; ctx.lineWidth = wid; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; ctx.quadraticCurveTo(a.x, (a.y + b.y) / 2, b.x, b.y); }
    ctx.stroke();
  };
  const grad = ctx.createLinearGradient(0, 0, 0, -H);
  grad.addColorStop(0, mixHex('#2f5d3a', P.ink, 0.35)); grad.addColorStop(1, '#62ab72');
  draw(8, grad);
  draw(3, rgba('#a6e0a8', 0.45));                 // inner highlight
  // organic tapered leaf-blades, alternating, angled by flow + push
  for (let i = 2; i < pts.length; i++) {
    const p = pts[i], side = i % 2 ? 1 : -1;
    const ang = side * 0.6 + (flow + push) * 0.4 + Math.sin(t * own + i) * 0.1;
    const ln = (0.16 + hash1(seed + i) * 0.1) * H;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
    ctx.fillStyle = rgba(mixHex('#4f8255', '#86d390', hash1(seed + i)), 0.92);
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(side * ln * 0.5, -0.05 * H, side * ln, 0);
    ctx.quadraticCurveTo(side * ln * 0.5, 0.05 * H, 0, 0); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = rgba('#bfe9a0', 0.9);           // gas-bladder bulbs near the tips
  for (let i = pts.length - 3; i < pts.length; i++) { const p = pts[i]; ctx.beginPath(); ctx.arc(p.x, p.y, 0.028 * H, 0, TAU); ctx.fill(); }
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
  const cx = Math.cos(w.a) * 0.7 * R, cy = Math.sin(w.a) * 0.55 * R;
  const rad = ((w.cut ? 0.18 : 0.26) + w.r) * R;       // a sizeable chunk, not a scratch
  const blob = blobPts(cx, cy, rad, rad * 0.82, 9, 0.42, (w.a * 97) | 0);
  // bite a real chunk out of the body silhouette (reveals the water behind)
  ctx.save(); ctx.globalCompositeOperation = 'destination-out';
  sketchShape(ctx, blob, { fill: '#000', outline: null, wobble: 1.2, key: (w.a * 53) | 0 });
  ctx.restore();
  // dark gore rim + raw red flesh just inside it
  sketchShape(ctx, blob, { fill: null, outline: rgba('#3a0d08', 0.95), lineW: R * 0.06, wobble: 1.4, key: (w.a * 53) | 0 });
  sketchShape(ctx, blobPts(cx, cy, rad * 0.82, rad * 0.66, 8, 0.4, (w.a * 31) | 0),
    { fill: null, outline: rgba(P.blood, 0.6), lineW: R * 0.035, wobble: 1.6, key: (w.a * 17) | 0 });
  // a trickle running down from the chunk
  ctx.strokeStyle = rgba(P.blood, 0.5); ctx.lineWidth = R * 0.045; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, cy + rad * 0.5); ctx.quadraticCurveTo(cx + R * 0.03, cy + R * 0.3, cx - R * 0.02, cy + R * 0.52); ctx.stroke();
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

// ----------------------------------------------------------------- the lionfish
// A slow venomous drifter: a fan of long banded spines splays out and waves with
// sin(t). Body undulates along its spine; pectoral "wings" fan procedurally.
// st.flare (0..1) makes the spines bristle wider when something touches it.
export function drawLionfish(ctx, R, t, st = {}) {
  const flare = clamp(st.flare ?? 0, 0, 1);
  const undulate = Math.sin(t * 2.2);
  const bodyC = '#b34a32', stripeC = '#f3ead8', shadeC = mixHex('#b34a32', P.ink, 0.5);
  const bellyC = '#e8b88c', spineC = '#c75a3e';

  const drawSpine = (baseX, baseY, ang, len, wid, phase) => {
    const wave = Math.sin(t * 3 + phase) * 0.18 * (0.6 + flare);
    const a = ang + wave;
    const tx = baseX + Math.cos(a) * len, ty = baseY + Math.sin(a) * len;
    const mx = baseX + Math.cos(a) * len * 0.5 - Math.sin(a) * Math.sin(t * 4 + phase) * 0.06 * R;
    const my = baseY + Math.sin(a) * len * 0.5 + Math.cos(a) * Math.sin(t * 4 + phase) * 0.06 * R;
    wash(ctx, tx, ty, wid * 2.4, P.poison, 0.22 + 0.12 * Math.sin(t * 3 + phase));
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba('#3a160e', 0.85); ctx.lineWidth = wid * 1.7;
    ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.quadraticCurveTo(mx, my, tx, ty); ctx.stroke();
    ctx.strokeStyle = rgba(spineC, 0.95); ctx.lineWidth = wid;
    ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.quadraticCurveTo(mx, my, tx, ty); ctx.stroke();
    ctx.strokeStyle = rgba(stripeC, 0.9); ctx.lineWidth = wid * 0.7;
    for (let k = 1; k <= 4; k++) {
      const f = k / 5, px = lerp(baseX, tx, f), py = lerp(baseY, ty, f);
      ctx.beginPath(); ctx.moveTo(px - Math.cos(a) * wid, py - Math.sin(a) * wid);
      ctx.lineTo(px + Math.cos(a) * wid, py + Math.sin(a) * wid); ctx.stroke();
    }
    ctx.fillStyle = rgba('#eafff0', 0.9);
    ctx.beginPath(); ctx.arc(tx, ty, wid * 0.7, 0, TAU); ctx.fill();
  };
  const N = 7, spread = (1.0 + flare * 0.5);
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    const baseX = lerp(0.34 * R, -0.74 * R, f), baseY = -0.5 * R - Math.sin(f * Math.PI) * 0.12 * R;
    const ang = lerp(-Math.PI * 0.42, -Math.PI * 0.74, f) * spread;
    drawSpine(baseX, baseY, ang, (1.05 + Math.sin(f * Math.PI) * 0.45) * R, R * 0.05, i * 1.7);
  }
  for (let i = 0; i < 3; i++) {
    const f = i / 2, baseX = lerp(-0.1 * R, -0.66 * R, f), baseY = 0.5 * R;
    drawSpine(baseX, baseY, (Math.PI * 0.36 + f * 0.4) * spread, (0.7 + 0.2 * f) * R, R * 0.045, 10 + i * 1.3);
  }

  const wingF = 0.5 + flare * 0.4 + 0.12 * Math.sin(t * 2.4);
  ctx.save(); ctx.translate(-0.1 * R, 0.18 * R); ctx.rotate(0.5 + undulate * 0.08);
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * (0.25 + i * 0.12) + Math.sin(t * 2.6 + i) * 0.06;
    const ln = (0.7 + 0.18 * Math.sin(i * 1.3)) * R * wingF;
    ctx.strokeStyle = rgba(i % 2 ? '#3a160e' : spineC, 0.8); ctx.lineWidth = R * 0.05; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * ln, Math.sin(a) * ln); ctx.stroke();
  }
  ctx.fillStyle = rgba(bodyC, 0.28);
  ctx.beginPath(); ctx.moveTo(0, 0);
  for (let i = 0; i <= 6; i++) { const a = Math.PI * (0.25 + i * 0.12); const ln = 0.7 * R * wingF; ctx.lineTo(Math.cos(a) * ln, Math.sin(a) * ln); }
  ctx.closePath(); ctx.fill();
  ctx.restore();

  const body = [
    { x: 1.0, y: -0.02 }, { x: 0.74, y: -0.42 }, { x: 0.2, y: -0.52 },
    { x: -0.44, y: -0.44 + undulate * 0.05 }, { x: -0.92, y: -0.24 + undulate * 0.08 },
    { x: -1.0, y: 0.02 + undulate * 0.1 }, { x: -0.92, y: 0.28 + undulate * 0.08 },
    { x: -0.44, y: 0.46 + undulate * 0.05 }, { x: 0.2, y: 0.52 }, { x: 0.74, y: 0.42 },
  ].map((p) => ({ x: p.x * R, y: p.y * R }));
  const grad = ctx.createLinearGradient(0, -0.5 * R, 0, 0.5 * R);
  grad.addColorStop(0, shadeC); grad.addColorStop(0.55, bodyC); grad.addColorStop(1, bellyC);
  sketchShape(ctx, body, { fill: grad, lineW: 3, wobble: 2.0, key: 181 });

  ctx.save(); ctx.beginPath(); sketchShape(ctx, body, { fill: null, outline: null }); ctx.clip();
  wash(ctx, -0.2 * R, -0.5 * R, 0.9 * R, shadeC, 0.45);
  wash(ctx, 0.1 * R, 0.6 * R, 0.8 * R, bellyC, 0.5);
  ctx.save(); ctx.rotate(-0.04);
  for (let i = -4; i <= 3; i++) {
    ctx.fillStyle = rgba(stripeC, 0.55);
    ctx.fillRect(i * 0.26 * R - 0.05 * R, -0.7 * R, 0.1 * R, 1.4 * R);
  }
  ctx.restore();
  ctx.restore();

  ctx.save(); ctx.translate(-0.95 * R, undulate * 0.12 * R); ctx.rotate(undulate * 0.18);
  sketchShape(ctx, [
    { x: 0, y: -0.28 * R }, { x: -0.4 * R, y: -0.4 * R }, { x: -0.3 * R, y: 0 },
    { x: -0.4 * R, y: 0.4 * R }, { x: 0, y: 0.28 * R },
  ], { fill: rgba(bodyC, 0.85), lineW: 2, wobble: 1.8, key: 182 });
  ctx.restore();

  ctx.fillStyle = P.foam; ctx.beginPath(); ctx.arc(0.6 * R, -0.12 * R, 0.11 * R, 0, TAU); ctx.fill();
  ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(0.63 * R, -0.11 * R, 0.06 * R, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba('#fff', 0.6); ctx.beginPath(); ctx.arc(0.6 * R, -0.14 * R, 0.022 * R, 0, TAU); ctx.fill();
  ctx.strokeStyle = P.ink; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0.92 * R, 0.2 * R, 0.1 * R, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
}

// ------------------------------------------------------------------ the moray
// A long ribbon eel anchored in a seabed burrow. The body is a procedural sine
// S-curve spine from the burrow mouth out to the head. `extend` 0 = coiled,
// 1 = lunged. `mouth` gapes; `windup` rears the head back during the telegraph.
export function drawMoray(ctx, R, t, st = {}) {
  const extend = clamp(st.extend ?? 0, 0, 1);
  const mouth = clamp(st.mouth ?? 0, 0, 1);
  const windup = clamp(st.windup ?? 0, 0, 1);
  const back = mixHex(P.shark, '#16302f', 0.45);
  const skinTop = '#5a7348', skinMid = '#7e9460', belly = '#d9d6a8';

  const reach = (0.5 + extend * 2.6) * R;
  const segs = 16;
  const amp = (0.18 + extend * 0.34) * R;
  const wig = t * 7 + extend * 2;
  const spine = [];
  for (let i = 0; i <= segs; i++) {
    const f = i / segs;
    const x = f * reach;
    const wave = Math.sin(f * 3.4 - wig) * amp * (0.25 + f);
    const droop = (1 - f) * 0.5 * R;
    const y = wave + droop - windup * f * 0.5 * R;
    spine.push({ x, y });
  }
  const head = spine[spine.length - 1];
  const thick = (f) => (0.06 + 0.28 * Math.sin(Math.min(1, f * 1.15) * Math.PI)) * R + 0.04 * R;
  const top = [], bot = [];
  for (let i = 0; i <= segs; i++) {
    const f = i / segs;
    const a = spine[i], b = spine[Math.min(segs, i + 1)], c = spine[Math.max(0, i - 1)];
    const dx = b.x - c.x, dy = b.y - c.y, dl = Math.hypot(dx, dy) || 1;
    const nx = -dy / dl, ny = dx / dl;
    const w = thick(f);
    top.push({ x: a.x + nx * w, y: a.y + ny * w });
    bot.push({ x: a.x - nx * w, y: a.y - ny * w });
  }
  const ribbon = top.concat(bot.reverse());

  wash(ctx, -0.1 * R, 0.35 * R, 0.7 * R, '#05101f', 0.5);

  ctx.strokeStyle = rgba(skinTop, 0.85); ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 2; i < top.length; i++) {
    const p = top[i], crest = 0.07 * R * Math.sin(i * 0.9 + t * 6);
    const px = p.x, py = p.y - 0.09 * R - Math.abs(crest);
    if (i === 2) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();

  const grad = ctx.createLinearGradient(0, head.y - 0.5 * R, 0, head.y + 0.5 * R);
  grad.addColorStop(0, skinTop); grad.addColorStop(0.55, skinMid); grad.addColorStop(1, belly);
  sketchShape(ctx, ribbon, { fill: grad, lineW: 2.8, wobble: 1.7, key: 141 });

  ctx.save(); ctx.beginPath(); sketchShape(ctx, ribbon, { fill: null, outline: null }); ctx.clip();
  for (let i = 0; i < 9; i++) {
    const f = hash1(i * 7 + 1), s = spine[Math.floor(f * segs)];
    wash(ctx, s.x, s.y - 0.05 * R, (0.1 + hash1(i) * 0.12) * R, back, 0.4);
  }
  ctx.restore();

  ctx.save();
  ctx.translate(head.x, head.y);
  const prev = spine[segs - 1];
  ctx.rotate(Math.atan2(head.y - prev.y, head.x - prev.x));
  const HR = 0.4 * R;
  const headShape = [
    { x: 0.95, y: -0.1 }, { x: 0.6, y: -0.62 }, { x: -0.1, y: -0.72 },
    { x: -0.7, y: -0.5 }, { x: -0.85, y: 0 }, { x: -0.7, y: 0.5 },
    { x: -0.1, y: 0.72 }, { x: 0.6, y: 0.62 }, { x: 0.95, y: 0.16 },
  ].map((p) => ({ x: p.x * HR, y: p.y * HR }));
  sketchShape(ctx, headShape, { fill: grad, lineW: 2.8, wobble: 1.6, key: 142 });
  const gape = (mouth * 0.55 + windup * 0.3) * HR;
  ctx.fillStyle = '#3a0d12';
  ctx.beginPath();
  ctx.moveTo(0.95 * HR, -0.08 * HR);
  ctx.quadraticCurveTo(1.15 * HR, -0.05 * HR, 1.12 * HR, -0.22 * HR - gape);
  ctx.lineTo(0.2 * HR, -0.16 * HR - gape * 0.5);
  ctx.lineTo(0.2 * HR, 0.16 * HR + gape * 0.5);
  ctx.quadraticCurveTo(1.15 * HR, 0.05 * HR, 0.95 * HR, 0.12 * HR);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = P.foam;
  for (let i = 0; i < 6; i++) {
    const tx = (0.3 + i * 0.13) * HR;
    ctx.beginPath(); ctx.moveTo(tx, -0.14 * HR - gape * 0.5); ctx.lineTo(tx + 0.03 * HR, -0.02 * HR - gape * 0.25); ctx.lineTo(tx + 0.06 * HR, -0.14 * HR - gape * 0.5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(tx, 0.14 * HR + gape * 0.5); ctx.lineTo(tx + 0.03 * HR, 0.02 * HR + gape * 0.25); ctx.lineTo(tx + 0.06 * HR, 0.14 * HR + gape * 0.5); ctx.fill();
  }
  ctx.fillStyle = P.foam; ctx.beginPath(); ctx.arc(0.34 * HR, -0.3 * HR, 0.11 * HR, 0, TAU); ctx.fill();
  ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(0.36 * HR, -0.3 * HR, 0.055 * HR, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba('#fff', 0.6); ctx.beginPath(); ctx.arc(0.32 * HR, -0.33 * HR, 0.022 * HR, 0, TAU); ctx.fill();
  ctx.restore();
}

// ----------------------------------------------------------- the electric ray
// A flat torpedo ray seen from above: a rounded pectoral disc that flaps with a
// travelling sine, a stubby tail, and (when charging) crackling bio arcs.
// st.charge 0..1 is the telegraph build; st.discharge 0..1 the shock flash.
export function drawElectricRay(ctx, R, t, st = {}) {
  const charge = clamp(st.charge ?? 0, 0, 1);
  const discharge = clamp(st.discharge ?? 0, 0, 1);
  const flap = Math.sin(t * 3.2);
  const edge = 0.16 * flap;
  const back = '#3a4a52', belly = '#c9d2cf', shade = '#26333a';

  if (charge > 0 || discharge > 0) {
    const a = 0.18 * charge + 0.5 * discharge;
    wash(ctx, 0, 0, R * (1.5 + charge * 0.8 + discharge * 1.4), P.bio, a);
  }

  const N = 16, disc = [];
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * TAU;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    const ripple = Math.sin(ang * 2 + t * 3.2) * 0.12 * Math.abs(sn);
    const rx = 1.18 * (1 + ripple);
    const ry = (0.92 + edge * Math.sign(sn || 1) * Math.abs(sn)) * (1 + ripple * 0.4);
    disc.push({ x: cs * rx * R, y: sn * ry * R });
  }
  const grad = ctx.createLinearGradient(0, -1.0 * R, 0, 1.0 * R);
  grad.addColorStop(0, shade); grad.addColorStop(0.5, back); grad.addColorStop(1, belly);
  sketchShape(ctx, disc, { fill: grad, lineW: 3.2, wobble: 2.0, key: 181 });

  ctx.save(); ctx.beginPath(); sketchShape(ctx, disc, { fill: null, outline: null }); ctx.clip();
  wash(ctx, -0.1 * R, -0.45 * R, 1.1 * R, shade, 0.5);
  wash(ctx, 0.05 * R, 0.6 * R, 0.9 * R, belly, 0.45);
  for (let i = 0; i < 5; i++) {
    const a = hash1(i * 5 + 4) * TAU, rr = hash1(i * 3 + 7) * 0.7 * R;
    wash(ctx, Math.cos(a) * rr, Math.sin(a) * rr - 0.1 * R, 0.18 * R, shade, 0.32);
  }
  ctx.fillStyle = rgba(mixHex(P.bio, back, 0.55), 0.4 + 0.4 * charge);
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(0.05 * R, s * 0.42 * R, 0.34 * R, 0.5 * R, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();

  ctx.save();
  const tailWag = Math.sin(t * 3.2 + 1.2) * 0.18;
  sketchShape(ctx, [
    { x: -1.05 * R, y: 0 }, { x: -1.55 * R, y: -0.1 * R + tailWag * R },
    { x: -1.92 * R, y: tailWag * R }, { x: -1.55 * R, y: 0.1 * R + tailWag * R },
  ], { fill: back, lineW: 2.4, wobble: 1.8, key: 182 });
  sketchShape(ctx, [
    { x: -1.5 * R, y: -0.06 * R + tailWag * R }, { x: -2.0 * R, y: -0.3 * R + tailWag * R },
    { x: -1.8 * R, y: 0.02 * R + tailWag * R },
  ], { fill: shade, lineW: 1.8, wobble: 1.6, key: 183 });
  ctx.restore();

  for (const s of [-1, 1]) {
    ctx.fillStyle = P.ink;
    ctx.beginPath(); ctx.arc(0.5 * R, s * 0.12 * R, 0.05 * R, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(P.foam, 0.8);
    ctx.beginPath(); ctx.arc(0.49 * R, s * 0.12 * R - 0.02 * R, 0.018 * R, 0, TAU); ctx.fill();
  }

  const arcA = charge * 0.7 + discharge;
  if (arcA > 0.02) {
    const arcs = 3 + Math.round(charge * 2 + discharge * 3);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let k = 0; k < arcs; k++) {
      const seed = k * 7.3 + Math.floor(t * 30) * 1.7;
      const a0 = hash1(seed) * TAU;
      const len = (0.5 + hash1(seed + 1) * 0.7) * R * (0.8 + discharge * 0.8);
      let x = Math.cos(a0) * 0.25 * R, y = Math.sin(a0) * 0.25 * R;
      ctx.strokeStyle = rgba(P.bio, 0.55 + 0.45 * arcA);
      ctx.lineWidth = 1.4 + discharge * 1.6;
      ctx.beginPath(); ctx.moveTo(x, y);
      const steps = 4;
      for (let j = 1; j <= steps; j++) {
        const f = j / steps;
        const jx = (hash1(seed + j * 3) - 0.5) * 0.35 * R;
        const jy = (hash1(seed + j * 3 + 1) - 0.5) * 0.35 * R;
        x = Math.cos(a0) * len * f + jx; y = Math.sin(a0) * len * f + jy;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = rgba('#eafff4', 0.5 + 0.5 * discharge); ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    if (discharge > 0.3) {
      ctx.fillStyle = rgba('#eafff4', discharge);
      ctx.beginPath(); ctx.arc(0, 0, 0.12 * R * discharge, 0, TAU); ctx.fill();
    }
  }
}

// ------------------------------------------------------------------- the crab
// A seabed scuttler. Faces +x; two claws and a fan of legs that step in a
// travelling wave. st.snap raises/clamps the crusher claw (the pinch); st.wind
// cocks it during windup; st.walk is the gait phase; st.move scales leg amplitude.
export function drawCrab(ctx, R, t, st = {}) {
  const walk = st.walk ?? t * 6;
  const snap = clamp(st.snap ?? 0, 0, 1);
  const wind = clamp(st.wind ?? 0, 0, 1);
  const move = st.move ?? 0;
  const shellC = '#b65a36', shellDk = '#7e3520', shellHi = '#e08a5a';

  ctx.strokeStyle = mixHex(shellDk, P.ink, 0.3); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 4; i++) {
      const ph = walk + i * 0.9 + (side < 0 ? Math.PI : 0);
      const lift = Math.max(0, Math.sin(ph)) * 0.22 * R * (0.3 + 0.7 * move);
      const swing = Math.cos(ph) * 0.16 * R * (0.3 + 0.7 * move);
      const rootX = (-0.55 + i * 0.34) * R;
      const rootY = side * 0.42 * R;
      const kneeX = rootX + swing * 0.5 + 0.12 * R;
      const kneeY = rootY + side * (0.42 * R) - lift;
      const footX = rootX + swing + 0.2 * R;
      const footY = side * 0.95 * R - lift * 0.5;
      ctx.lineWidth = R * 0.09;
      ctx.beginPath(); ctx.moveTo(rootX, rootY); ctx.quadraticCurveTo(kneeX, kneeY, footX, footY); ctx.stroke();
      ctx.lineWidth = R * 0.05;
      ctx.beginPath(); ctx.moveTo(footX, footY); ctx.lineTo(footX + 0.06 * R, footY + side * 0.08 * R); ctx.stroke();
    }
  }

  const body = blobPts(0, 0, 0.92 * R, 0.62 * R, 12, 0.05, 201);
  const grad = ctx.createLinearGradient(0, -0.6 * R, 0, 0.6 * R);
  grad.addColorStop(0, shellHi); grad.addColorStop(0.55, shellC); grad.addColorStop(1, shellDk);
  sketchShape(ctx, body, { fill: grad, lineW: 3, wobble: 1.8, key: 202 });
  ctx.save(); ctx.beginPath(); sketchShape(ctx, body, { fill: null, outline: null }); ctx.clip();
  wash(ctx, -0.1 * R, -0.3 * R, 0.8 * R, shellHi, 0.4);
  wash(ctx, 0.1 * R, 0.4 * R, 0.7 * R, shellDk, 0.5);
  ctx.strokeStyle = rgba(shellDk, 0.45); ctx.lineWidth = 1.8;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath(); ctx.moveTo(-0.6 * R, i * 0.22 * R - 0.02 * R);
    ctx.quadraticCurveTo(0, i * 0.22 * R + 0.12 * R, 0.6 * R, i * 0.22 * R - 0.02 * R); ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const a = hash1(i * 7 + 3) * TAU, rr = hash1(i * 3 + 1) * 0.6 * R;
    ctx.fillStyle = rgba(shellDk, 0.35);
    ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.7, 0.05 * R, 0, TAU); ctx.fill();
  }
  ctx.restore();

  for (const s of [-1, 1]) {
    const ex = 0.34 * R;
    ctx.strokeStyle = mixHex(shellDk, P.ink, 0.3); ctx.lineWidth = R * 0.06; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ex - 0.1 * R, -0.4 * R); ctx.lineTo(ex, -0.62 * R + s * 0.02 * R); ctx.stroke();
    ctx.fillStyle = P.foam; ctx.beginPath(); ctx.arc(ex, -0.64 * R + s * 0.02 * R, 0.08 * R, 0, TAU); ctx.fill();
    ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(ex + 0.02 * R, -0.65 * R + s * 0.02 * R, 0.04 * R, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = rgba(P.ink, 0.5); ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(0.5 * R, 0.18 * R); ctx.lineTo(0.66 * R, 0.16 * R); ctx.stroke();

  drawClaw(ctx, R, 0.7 * R, 0.5 * R, -0.5, 0.55, snap * 0.4, shellC, shellDk, shellHi, 0.7);
  const armLift = -wind * 0.9;
  drawClaw(ctx, R, 0.78 * R, -0.28 * R, -0.15 + armLift, -0.7, snap, shellC, shellDk, shellHi, 1.0);
}

// a jointed pincer claw. (ax,ay) shoulder; baseAng arm tilt; openAng resting gape;
// close 0..1 shuts the pincer; scale shrinks the whole claw. Drawn in local space.
function drawClaw(ctx, R, ax, ay, baseAng, openAng, close, c, dk, hi, scale) {
  ctx.save();
  ctx.translate(ax, ay);
  const armL = 0.42 * R * scale;
  const elbowX = Math.cos(baseAng) * armL, elbowY = Math.sin(baseAng) * armL;
  ctx.strokeStyle = mixHex(dk, P.ink, 0.25); ctx.lineWidth = R * 0.16 * scale; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(elbowX, elbowY); ctx.stroke();
  ctx.translate(elbowX, elbowY);
  ctx.rotate(baseAng);
  const palm = blobPts(0.36 * R * scale, 0, 0.4 * R * scale, 0.3 * R * scale, 9, 0.08, 211);
  const g = ctx.createLinearGradient(0, -0.3 * R * scale, 0, 0.3 * R * scale);
  g.addColorStop(0, hi); g.addColorStop(0.6, c); g.addColorStop(1, dk);
  sketchShape(ctx, palm, { fill: g, lineW: 2.6, wobble: 1.6, key: 212 });
  const tipX = 0.86 * R * scale, fl = 0.5 * R * scale;
  const gape = openAng * (1 - close);
  ctx.strokeStyle = mixHex(dk, P.ink, 0.2); ctx.lineWidth = R * 0.11 * scale; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0.55 * R * scale, 0.06 * R * scale);
  ctx.quadraticCurveTo(tipX, gape * 0.5 * R * 0.4 * scale + 0.12 * R * scale, tipX + fl * 0.5, -gape * 0.2 * R * scale + 0.02 * R * scale);
  ctx.stroke();
  ctx.save();
  ctx.translate(0.55 * R * scale, -0.04 * R * scale);
  ctx.rotate(gape);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(0.3 * R * scale, -0.12 * R * scale, 0.5 * R * scale, -0.02 * R * scale);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = rgba(hi, 0.6); ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(0.5 * R * scale, 0); ctx.lineTo(tipX, 0.02 * R * scale); ctx.stroke();
  ctx.restore();
}

// --------------------------------------------------------------- giant grouper
// A big, slow ambush gulper. Breathes (whole body sine-scales), flares its gills,
// and eases open a HUGE mouth (gape) to suck prey in. Mottled, counter-shaded.
export function drawGrouper(ctx, R, t, st = {}) {
  const gape = clamp(st.gape ?? 0, 0, 1);
  const suck = clamp(st.suck ?? 0, 0, 1);
  const breath = st.breath ?? Math.sin(t * 1.3);
  const swell = 1 + breath * 0.05;
  const gillFlare = 0.5 + 0.5 * breath;
  const swim = Math.sin(t * 1.1) * 0.03;
  const body0 = '#6e6147', mid = '#8a7a59', pale = '#cdbfa0', dark = mixHex(body0, P.ink, 0.5);

  sketchShape(ctx, [
    { x: -1.32 * R, y: 0 }, { x: -1.92 * R, y: (-0.6 + swim) * R },
    { x: -1.7 * R, y: -0.12 * R }, { x: -1.74 * R, y: 0.12 * R },
    { x: -1.92 * R, y: (0.6 + swim) * R }, { x: -1.34 * R, y: 0.18 * R },
  ], { fill: mixHex(body0, P.ink, 0.25), lineW: 2.6, wobble: 2.2, key: 181 });

  sketchShape(ctx, [
    { x: -0.85 * R, y: -0.52 * R }, { x: -0.5 * R, y: -0.86 * R },
    { x: 0.0, y: -0.92 * R }, { x: 0.45 * R, y: -0.78 * R }, { x: 0.6 * R, y: -0.5 * R },
  ], { fill: mixHex(mid, P.ink, 0.3), lineW: 2.2, wobble: 2, key: 182 });
  sketchShape(ctx, [
    { x: -0.7 * R, y: 0.52 * R }, { x: -0.4 * R, y: 0.82 * R },
    { x: -0.05 * R, y: 0.78 * R }, { x: 0.15 * R, y: 0.5 * R },
  ], { fill: mixHex(mid, P.ink, 0.3), lineW: 2, wobble: 2, key: 183 });

  const jaw = gape * 0.46;
  const body = [
    { x: 1.02, y: -0.18 }, { x: 0.88, y: -0.6 }, { x: 0.4, y: -0.86 },
    { x: -0.35, y: -0.82 }, { x: -0.92, y: -0.56 }, { x: -1.04, y: -0.2 },
    { x: -1.04, y: 0.22 + swim }, { x: -0.9, y: 0.6 }, { x: -0.3, y: 0.86 },
    { x: 0.45, y: 0.82 }, { x: 0.9, y: 0.5 },
    { x: 1.04, y: 0.2 + jaw },
  ].map((p) => ({ x: p.x * R, y: p.y * R * (p.y < 0 ? swell : 1) }));

  const grad = ctx.createLinearGradient(0, -R, 0, R);
  grad.addColorStop(0, dark); grad.addColorStop(0.45, body0); grad.addColorStop(1, pale);
  sketchShape(ctx, body, { fill: grad, lineW: 3.4, wobble: 2.0, key: 184 });

  ctx.save(); ctx.beginPath(); sketchShape(ctx, body, { fill: null, outline: null }); ctx.clip();
  ctx.fillStyle = rgba(dark, 0.9); ctx.beginPath();
  ctx.moveTo(-1.1 * R, -0.7 * R); ctx.lineTo(1.1 * R, -0.7 * R); ctx.lineTo(1.1 * R, -0.08 * R);
  ctx.quadraticCurveTo(0, 0.06 * R, -1.1 * R, -0.12 * R); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgba(pale, 0.92); ctx.beginPath();
  ctx.moveTo(-1.1 * R, 0.7 * R); ctx.lineTo(1.1 * R, 0.7 * R); ctx.lineTo(1.1 * R, 0.2 * R);
  ctx.quadraticCurveTo(0, 0.34 * R, -1.1 * R, 0.18 * R); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 16; i++) {
    const a = hash1(i * 11 + 3) * TAU, rr = hash1(i * 5 + 7) * 0.92 * R;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr * 0.7 - 0.12 * R;
    const s = (0.05 + hash1(i * 3) * 0.07) * R;
    const spotC = rgba(i % 3 ? '#4f4530' : '#9c8c66', 0.5);
    sketchShape(ctx, blobPts(x, y, s, s * 0.85, 7, 0.35, i * 17 + 5),
      { fill: spotC, outline: null, wobble: 1.1, key: i * 7 + 2 });
  }
  wash(ctx, -0.2 * R, -0.5 * R, 0.9 * R, dark, 0.35);
  ctx.restore();

  ctx.strokeStyle = rgba(P.ink, 0.5); ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(0.34 * R, -0.5 * R);
  ctx.quadraticCurveTo((0.16 - gillFlare * 0.14) * R, 0, 0.34 * R, 0.5 * R);
  ctx.stroke();
  if (gillFlare > 0.4) {
    ctx.save(); ctx.beginPath(); sketchShape(ctx, body, { fill: null, outline: null }); ctx.clip();
    wash(ctx, 0.2 * R, 0.05 * R, 0.3 * R, P.blood, 0.18 * gillFlare);
    ctx.restore();
  }

  ctx.save(); ctx.translate(0.4 * R, 0.42 * R); ctx.rotate(0.55 + swim);
  sketchShape(ctx, blobPts(0, 0.18 * R, 0.34 * R, 0.2 * R, 8, 0.16, 191),
    { fill: mixHex(mid, '#000', 0.1), lineW: 2, wobble: 1.6, key: 192 });
  ctx.restore();

  const mx = 0.86 * R;
  const upY = 0.06 * R;
  const loY = (0.2 + jaw) * R;
  const lipFront = (1.06 + gape * 0.04) * R;
  ctx.fillStyle = mixHex('#2a0c10', '#120406', suck * 0.6);
  ctx.beginPath();
  ctx.moveTo(mx, upY);
  ctx.quadraticCurveTo(lipFront, upY - 0.04 * R, lipFront, (upY + loY) / 2);
  ctx.quadraticCurveTo(lipFront, loY + 0.04 * R, mx, loY);
  ctx.quadraticCurveTo(mx - 0.18 * R - suck * 0.1 * R, (upY + loY) / 2, mx, upY);
  ctx.closePath(); ctx.fill();
  if (gape > 0.15) {
    ctx.fillStyle = rgba('#000', 0.55);
    const gx = mx + 0.04 * R - suck * 0.06 * R, gy = (upY + loY) / 2;
    ctx.beginPath(); ctx.ellipse(gx, gy, (0.06 + gape * 0.12) * R, (loY - upY) * 0.34, 0, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = mixHex(pale, '#caa', 0.3); ctx.lineWidth = R * (0.09 + gape * 0.02); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(mx - 0.06 * R, upY);
  ctx.quadraticCurveTo(lipFront * 0.99, upY - 0.05 * R, lipFront, (upY + loY) / 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(mx - 0.06 * R, loY);
  ctx.quadraticCurveTo(lipFront * 0.99, loY + 0.05 * R, lipFront, (upY + loY) / 2); ctx.stroke();
  if (gape > 0.25) {
    ctx.fillStyle = rgba(P.foam, 0.85);
    for (let i = 0; i < 5; i++) {
      const tx = mx + (0.06 + i * 0.18) * R;
      ctx.beginPath(); ctx.moveTo(tx, upY + 0.01 * R);
      ctx.lineTo(tx + 0.02 * R, upY + 0.06 * R + gape * 0.03 * R);
      ctx.lineTo(tx + 0.04 * R, upY + 0.01 * R); ctx.fill();
    }
  }

  const ex = 0.62 * R, ey = -0.36 * R, er = 0.13 * R;
  ctx.fillStyle = rgba('#f0e4b8', 0.95); ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU); ctx.fill();
  ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(ex + 0.02 * R, ey, er * 0.52, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba('#fff', 0.7); ctx.beginPath(); ctx.arc(ex - er * 0.3, ey - er * 0.35, er * 0.22, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba(P.ink, 0.5); ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(ex - er * 1.5, ey - er * 1.4); ctx.quadraticCurveTo(ex, ey - er * 2, ex + er * 1.7, ey - er * 0.9); ctx.stroke();
}

// ------------------------------------------------- the nurse shark (pet)
// Broad flat head, barbels, brownish, rounded fins — a placid bottom-dweller.
export function drawNurseShark(ctx, R, t, st = {}) {
  const col = '#b79a6b';
  const dark = mixHex(col, '#3a2c18', 0.5);
  const pale = mixHex(col, '#f1ead7', 0.6);
  const swim = Math.sin(t * 4) * 0.05;

  sketchShape(ctx, [
    { x: -1.2 * R, y: -0.18 * R }, { x: -2.0 * R, y: -0.30 * R },
    { x: -2.15 * R, y: 0.05 * R }, { x: -1.95 * R, y: 0.42 * R },
    { x: -1.25 * R, y: 0.22 * R },
  ], { fill: col, lineW: 2.4, wobble: 1.4, key: 131 });

  sketchShape(ctx, [{ x: -0.45 * R, y: -0.42 * R }, { x: -0.22 * R + swim * R, y: -0.86 * R }, { x: 0.02 * R, y: -0.4 * R }],
    { fill: dark, lineW: 2, wobble: 1.2, key: 132 });
  sketchShape(ctx, [{ x: -0.95 * R, y: -0.36 * R }, { x: -0.8 * R, y: -0.66 * R }, { x: -0.62 * R, y: -0.34 * R }],
    { fill: dark, lineW: 1.8, wobble: 1.1, key: 133 });

  const body = [
    { x: 1.30, y: 0.06 }, { x: 1.05, y: -0.30 }, { x: 0.5, y: -0.46 },
    { x: -0.4, y: -0.46 }, { x: -1.0, y: -0.30 }, { x: -1.16, y: 0.04 + swim },
    { x: -1.0, y: 0.40 }, { x: -0.35, y: 0.52 }, { x: 0.5, y: 0.50 }, { x: 1.06, y: 0.34 },
  ].map((p) => ({ x: p.x * R, y: p.y * R }));
  sketchShape(ctx, body, { fill: col, lineW: 3, wobble: 1.6, key: 134 });

  ctx.save(); ctx.beginPath(); sketchShape(ctx, body, { fill: null, outline: null }); ctx.clip();
  ctx.fillStyle = rgba(dark, 0.85); ctx.beginPath();
  ctx.moveTo(-1.3 * R, -0.6 * R); ctx.lineTo(1.5 * R, -0.6 * R); ctx.lineTo(1.5 * R, -0.04 * R);
  ctx.quadraticCurveTo(0, 0.1 * R, -1.3 * R, -0.06 * R); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgba(pale, 0.9); ctx.beginPath();
  ctx.moveTo(-1.3 * R, 0.62 * R); ctx.lineTo(1.5 * R, 0.62 * R); ctx.lineTo(1.5 * R, 0.18 * R);
  ctx.quadraticCurveTo(0, 0.3 * R, -1.3 * R, 0.16 * R); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 5; i++) { const a = hash1(i * 6 + 3) * TAU, rr = hash1(i * 4 + 1) * 0.7 * R; wash(ctx, Math.cos(a) * rr, Math.sin(a) * rr * 0.7 - 0.1 * R, 0.14 * R, dark, 0.3); }
  ctx.restore();

  ctx.save(); ctx.translate(0.45 * R, 0.42 * R); ctx.rotate(0.35 + swim);
  sketchShape(ctx, blobPts(0, 0, 0.5 * R, 0.22 * R, 8, 0.14, 137),
    { fill: mixHex(col, '#000', 0.1), lineW: 2, wobble: 1.3, key: 136 });
  ctx.restore();

  ctx.strokeStyle = rgba(dark, 0.9); ctx.lineWidth = Math.max(2, 0.04 * R); ctx.lineCap = 'round';
  for (const off of [-0.04, 0.06]) {
    ctx.beginPath();
    ctx.moveTo(1.16 * R, 0.30 * R + off * R);
    ctx.quadraticCurveTo(1.28 * R, 0.46 * R + off * R, 1.18 * R, 0.56 * R + off * R + Math.sin(t * 3 + off) * 0.03 * R);
    ctx.stroke();
  }

  ctx.fillStyle = '#3a1c16';
  ctx.beginPath(); ctx.ellipse(1.18 * R, 0.30 * R, 0.07 * R, 0.045 * R, 0, 0, TAU); ctx.fill();

  ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(0.86 * R, -0.12 * R, 0.06 * R, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba(P.foam, 0.85); ctx.beginPath(); ctx.arc(0.84 * R, -0.15 * R, 0.022 * R, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba(P.ink, 0.35); ctx.lineWidth = 1.6;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo((0.5 - i * 0.08) * R, -0.12 * R); ctx.quadraticCurveTo((0.46 - i * 0.08) * R, 0.02 * R, (0.5 - i * 0.08) * R, 0.16 * R); ctx.stroke(); }
}

// ----------------------------------------------------------- a slow whirlpool
// A rotating vortex. `spin` is the live rotation phase (radians); arms are drawn
// as logarithmic spiral strokes that boil + sweep. Drawn centred on the eye.
export function drawWhirlpool(ctx, R, t, st = {}) {
  const spin = st.spin ?? t * 0.6;
  wash(ctx, 0, 0, R * 1.08, P.surfaceTeal, 0.16 + 0.05 * Math.sin(t * 1.5));
  wash(ctx, 0, 0, R * 0.5, P.deepNavy, 0.4);
  const arms = 3, turns = 1.5, segs = 26;
  for (let a = 0; a < arms; a++) {
    const base = spin + (a / arms) * TAU;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const f = i / segs;
      const ang = base + f * turns * TAU;
      const rr = R * (0.12 + 0.86 * f);
      pts.push({ x: Math.cos(ang) * rr, y: Math.sin(ang) * rr * 0.9 });
    }
    const grad = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[segs].x, pts[segs].y);
    grad.addColorStop(0, rgba(P.deepNavy, 0.0));
    grad.addColorStop(0.5, rgba('#7fbfd0', 0.45));
    grad.addColorStop(1, rgba(P.foam, 0.7));
    inkStroke(ctx, pts, { outline: grad, lineW: 3.2, wobble: 1.6, key: 181 + a * 7 });
  }
  for (let i = 0; i < 7; i++) {
    const f = (i / 7);
    const ang = -spin * 1.6 + f * turns * TAU + hash1(i + 3) * 0.6;
    const rr = R * (0.2 + 0.7 * ((f + t * 0.15) % 1));
    ctx.fillStyle = rgba(P.foam, 0.5);
    ctx.beginPath(); ctx.arc(Math.cos(ang) * rr, Math.sin(ang) * rr * 0.9, R * 0.04 + hash1(i) * R * 0.02, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = rgba(P.foam, 0.32); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 0, R, R * 0.9, 0, 0, TAU); ctx.stroke();
}

// ----------------------------------------------------- a hydrothermal sea vent
// Sits ON the seabed; +y is DOWN into the floor. A rocky mound + a rising column
// of hot shimmer + bubbles UP from the vent mouth. `active` scales height/heat.
export function drawSeaVent(ctx, R, t, st = {}) {
  const active = clamp(st.active ?? 1, 0, 1);
  const colH = st.colH ?? R * 6;
  const colW = R * 0.85;
  ctx.save();
  for (let i = 0; i < 9; i++) {
    const f = i / 8;
    const y = -f * colH * active;
    const sway = Math.sin(t * 2.2 - f * 5 + R) * colW * 0.5 * f;
    const rr = colW * (1 - f * 0.55) * (0.8 + 0.2 * Math.sin(t * 4 + i));
    wash(ctx, sway, y, rr, P.blood, (0.16 - f * 0.13) * active);
  }
  for (let i = 0; i < 12; i++) {
    const ph = (t * (0.4 + hash1(i) * 0.3) + hash1(i + 9)) % 1;
    const y = -ph * colH * active;
    const sway = Math.sin(t * 2 - ph * 6 + i) * colW * 0.6 * ph + (hash1(i + 2) - 0.5) * colW;
    const br = R * 0.05 + hash1(i + 5) * R * 0.06;
    ctx.strokeStyle = rgba(P.foam, (0.6 - ph * 0.5) * active); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(sway, y, br, 0, TAU); ctx.stroke();
  }
  ctx.restore();
  const moundFill = ctx.createLinearGradient(0, -R * 0.6, 0, R * 0.5);
  moundFill.addColorStop(0, '#5a4a40'); moundFill.addColorStop(1, '#241a14');
  sketchShape(ctx, [
    { x: -1.0 * R, y: 0.5 * R }, { x: -0.7 * R, y: -0.2 * R }, { x: -0.32 * R, y: -0.55 * R },
    { x: 0, y: -0.62 * R }, { x: 0.32 * R, y: -0.55 * R }, { x: 0.7 * R, y: -0.2 * R },
    { x: 1.0 * R, y: 0.5 * R },
  ], { fill: moundFill, lineW: 3, wobble: 2.0, key: 191 });
  wash(ctx, 0, -0.5 * R, R * 0.5, P.danger, 0.5 + 0.2 * Math.sin(t * 5) * active);
  ctx.fillStyle = rgba(P.danger, 0.85 * active);
  ctx.beginPath(); ctx.ellipse(0, -0.5 * R, R * 0.26, R * 0.12, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba(P.amberSoft, 0.9 * active);
  ctx.beginPath(); ctx.ellipse(0, -0.5 * R, R * 0.13, R * 0.06, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba('#caa', 0.25); ctx.lineWidth = 1.6;
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 0.3 * R, -0.4 * R); ctx.lineTo(i * 0.4 * R, 0.45 * R); ctx.stroke(); }
}

// ---------------------------------------------------- seagrass (ambient plant)
// A clump of thin ribbon blades fanning from one holdfast. Each bows with flow +
// a little self-phase so the clump shimmers. Signature like drawKelp.
export function drawSeagrass(ctx, H, t, seed, flow = 0, push = 0, tint = '#6db96a') {
  const blades = 4 + Math.floor(hash1(seed) * 4);
  const baseLean = (hash1(seed + 7) - 0.5) * 0.25;
  for (let b = 0; b < blades; b++) {
    const bh = H * (0.55 + hash1(seed + b * 5) * 0.5);
    const spread = (b / (blades - 1 || 1) - 0.5) * 0.5 * H * 0.4;
    const own = 0.7 + hash1(seed + b) * 0.6;
    const segs = 6;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const f = i / segs;
      const bend = (flow * 0.7 + push * 1.4 + baseLean + Math.sin(t * own + seed + b + f * 2.0) * 0.4) * f * f;
      pts.push({ x: spread * (1 - f) + bend * 0.5 * H, y: -f * bh });
    }
    const col = mixHex(tint, '#2f5d3a', 0.15 + hash1(seed + b * 3) * 0.25);
    ctx.strokeStyle = mixHex(col, P.ink, 0.25); ctx.lineWidth = Math.max(1, 0.05 * H);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], p = pts[i]; ctx.quadraticCurveTo(a.x, (a.y + p.y) / 2, p.x, p.y); }
    ctx.stroke();
    ctx.strokeStyle = rgba(mixHex(tint, '#d8f5c0', 0.5), 0.5); ctx.lineWidth = Math.max(0.8, 0.02 * H);
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], p = pts[i]; ctx.quadraticCurveTo(a.x, (a.y + p.y) / 2, p.x, p.y); }
    ctx.stroke();
  }
}

// ------------------------------------------------------ anemone (ambient plant)
// A squat watercolor stalk crowned with a ring of waving tentacles. Soft violet.
export function drawAnemone(ctx, H, t, seed, flow = 0, push = 0) {
  const hue = mixHex('#c77fb0', '#8a5fc0', hash1(seed));
  const lean = (flow * 0.5 + push) * 0.4;
  const bodyH = H * 0.42, bodyW = H * 0.3;
  const col = ctx.createLinearGradient(0, 0, 0, -bodyH);
  col.addColorStop(0, mixHex(hue, P.ink, 0.4)); col.addColorStop(1, hue);
  sketchShape(ctx, [
    { x: -bodyW * 0.7, y: 0 }, { x: -bodyW, y: -bodyH * 0.55 },
    { x: -bodyW * 0.6 + lean * H * 0.2, y: -bodyH },
    { x: bodyW * 0.6 + lean * H * 0.2, y: -bodyH },
    { x: bodyW, y: -bodyH * 0.55 }, { x: bodyW * 0.7, y: 0 },
  ], { fill: col, lineW: 2.2, wobble: 1.8, key: seed * 7 + 1 });
  const cx = lean * H * 0.2, cy = -bodyH;
  const n = 9 + Math.floor(hash1(seed + 2) * 5);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI + (i / (n - 1)) * Math.PI;
    const tl = bodyW * (0.9 + hash1(seed + i * 3) * 0.8);
    const wav = Math.sin(t * 1.6 + i * 0.9 + seed) * 0.22 + lean;
    const ex = cx + Math.cos(a) * tl + wav * tl * 0.5;
    const ey = cy + Math.sin(a) * tl - tl * 0.25;
    ctx.strokeStyle = rgba(mixHex(hue, '#ffd9ef', 0.5), 0.8);
    ctx.lineWidth = Math.max(1, 0.022 * H); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(cx + Math.cos(a) * tl * 0.5, cy + Math.sin(a) * tl * 0.5, ex, ey);
    ctx.stroke();
    ctx.fillStyle = rgba('#ffe9f6', 0.7);
    ctx.beginPath(); ctx.arc(ex, ey, Math.max(0.8, 0.016 * H), 0, TAU); ctx.fill();
  }
  wash(ctx, cx, cy - bodyW * 0.2, bodyW * 1.2, hue, 0.25);
}

// ----------------------------------------------------- tubeworm (ambient plant)
// A tight bunch of pale chitin tubes, each capped with a feathery red plume.
export function drawTubeworm(ctx, H, t, seed, flow = 0, push = 0) {
  const tubes = 3 + Math.floor(hash1(seed) * 3);
  for (let b = 0; b < tubes; b++) {
    const th = H * (0.5 + hash1(seed + b * 4) * 0.5);
    const ox = (b - (tubes - 1) / 2) * H * 0.18;
    const sway = Math.sin(t * 0.6 + b + seed) * 0.04 + flow * 0.12;
    const tx = ox + sway * H, ty = -th;
    const g = ctx.createLinearGradient(ox, 0, tx, ty);
    g.addColorStop(0, mixHex('#cfc3a8', P.ink, 0.3)); g.addColorStop(1, '#e8ddc4');
    ctx.strokeStyle = g; ctx.lineWidth = Math.max(1.4, 0.07 * H); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ox, 0); ctx.quadraticCurveTo(ox + sway * H * 0.4, -th * 0.5, tx, ty); ctx.stroke();
    const plume = mixHex('#d9534a', '#ff7a6a', hash1(seed + b));
    const fl = th * 0.34;
    for (let k = -2; k <= 2; k++) {
      const a = -Math.PI / 2 + k * 0.34 + flow * 0.3 + Math.sin(t * 2 + b + k) * 0.12;
      ctx.strokeStyle = rgba(plume, 0.9); ctx.lineWidth = Math.max(1, 0.03 * H); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tx, ty);
      ctx.lineTo(tx + Math.cos(a) * fl, ty + Math.sin(a) * fl); ctx.stroke();
    }
    ctx.fillStyle = rgba(mixHex(plume, '#000', 0.2), 0.9);
    ctx.beginPath(); ctx.arc(tx, ty, Math.max(1.2, 0.05 * H), 0, TAU); ctx.fill();
  }
}

// ----------------------------------------------------- glow-stalk (ambient plant)
// A slender dark stalk strung with bioluminescent bulbs that pulse. Drawn
// additively so the glow reads on near-black floors.
export function drawGlowStalk(ctx, H, t, seed, flow = 0, push = 0, color = P.bio) {
  const segs = 9;
  const own = 0.5 + hash1(seed) * 0.5;
  const lean = (hash1(seed + 3) - 0.5) * 0.3;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const f = i / segs;
    const bend = (flow * 0.5 + push * 1.3 + lean + Math.sin(t * own + seed + f * 2) * 0.35) * f * f;
    pts.push({ x: bend * 0.3 * H, y: -f * H });
  }
  ctx.strokeStyle = mixHex('#0c1620', color, 0.12); ctx.lineWidth = Math.max(1.4, 0.045 * H);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], p = pts[i]; ctx.quadraticCurveTo(a.x, (a.y + p.y) / 2, p.x, p.y); }
  ctx.stroke();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 2; i < pts.length; i++) {
    const p = pts[i];
    const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.8 + i * 0.8 + seed));
    const r = (0.04 + hash1(seed + i) * 0.03) * H;
    wash(ctx, p.x, p.y, r * 2.6, color, 0.5 * pulse);
    ctx.fillStyle = rgba('#eafff4', 0.85 * pulse);
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.5, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
