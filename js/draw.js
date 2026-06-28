// Hand-drawn rendering primitives — the whole storybook look, in code: soft
// hand-painted watercolor-and-ink shapes with wobbly hand-inked dark-teal
// outlines, paper grain, and soft godrays.
import { TAU, hash1, rgba, lerp } from './utils.js';
import { PALETTE } from './config.js';

// --- the "boil": hand-drawn outlines jitter a few times per second, not every
// frame, giving the classic animated-illustration shimmer. -------------------
let _boil = 0;
export function setBoilTime(seconds) { _boil = Math.floor(seconds * 8.5); }
function jit(seed) { return hash1((seed * 131 + _boil * 977) | 0) * 2 - 1; }

// Catmull-Rom spline through points -> smooth bezier path on the current ctx.
function buildSpline(ctx, p, closed) {
  const n = p.length;
  if (n < 3) {
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(p[i].x, p[i].y);
    return;
  }
  const at = (i) => p[((i % n) + n) % n];
  ctx.moveTo(p[0].x, p[0].y);
  const end = closed ? n : n - 1;
  for (let i = 0; i < end; i++) {
    const p0 = closed ? at(i - 1) : at(Math.max(0, i - 1));
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = closed ? at(i + 2) : at(Math.min(n - 1, i + 2));
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
      p2.x, p2.y
    );
  }
  if (closed) ctx.closePath();
}

// Draw a filled organic shape with a wobbly, double-stroked ink outline.
export function sketchShape(ctx, pts, o = {}) {
  const {
    fill = null, outline = PALETTE.ink, lineW = 3, wobble = 2.0,
    closed = true, key = 1, alpha = 1,
  } = o;
  const w1 = pts.map((p, i) => ({
    x: p.x + jit(key + i * 2) * wobble,
    y: p.y + jit(key + i * 2 + 1) * wobble,
  }));
  ctx.beginPath(); buildSpline(ctx, w1, closed);
  if (fill) {
    ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.fill(); ctx.globalAlpha = 1;
  }
  if (outline) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = outline; ctx.lineWidth = lineW; ctx.stroke();
    // a second, looser pass for the inked-by-hand feel
    const w2 = pts.map((p, i) => ({
      x: p.x + jit(key + i * 2 + 53) * wobble * 1.4,
      y: p.y + jit(key + i * 2 + 54) * wobble * 1.4,
    }));
    ctx.beginPath(); buildSpline(ctx, w2, closed);
    ctx.globalAlpha = 0.3; ctx.lineWidth = lineW * 0.7; ctx.stroke(); ctx.globalAlpha = 1;
  }
}

// Just the wobbly stroke (open polyline) — fins, kelp, tentacles.
export function inkStroke(ctx, pts, o = {}) {
  sketchShape(ctx, pts, { ...o, fill: null, closed: o.closed ?? false });
}

// Organic closed outline around an ellipse, with stable (non-boiling) lumps.
export function blobPts(cx, cy, rx, ry, n, lump, key) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r = 1 + (lump ? (hash1(key + i * 7) * 2 - 1) * lump : 0);
    pts.push({ x: cx + Math.cos(a) * rx * r, y: cy + Math.sin(a) * ry * r });
  }
  return pts;
}

// Soft watercolor wash (radial bleed).
export function wash(ctx, x, y, r, color, a = 0.5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(0.65, rgba(color, a * 0.45));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

// Soft contact shadow blob.
export function softShadow(ctx, x, y, rx, ry, a = 0.22) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, `rgba(6,18,28,${a})`);
  g.addColorStop(1, 'rgba(6,18,28,0)');
  ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / Math.max(rx, ry));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, Math.max(rx, ry), 0, TAU); ctx.fill();
  ctx.restore();
}

// Build a reusable paper-grain pattern (call once per renderer).
export function makePaper(size = 220) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (hash1(i * 2.17 + 11) - 0.5) * 26;       // fine grain
    const f = (hash1(i * 0.013 + 7) - 0.5) * 10;        // broad mottle
    const v = 128 + n + f;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return g.createPattern(c, 'repeat');
}

// Drifting godray shafts from the surface (drawn additively). `intensity`
// scales the brightness so deep regions can fade them out.
export function godrays(ctx, w, h, t, count = 6, intensity = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const seed = i * 1.7;
    const x = ((i + 0.5) / count) * w + Math.sin(t * 0.18 + seed) * w * 0.06;
    const sway = Math.sin(t * 0.11 + seed * 2) * 40;
    const topW = lerp(26, 64, hash1(i * 13));
    const a = (0.05 + 0.035 * (0.5 + 0.5 * Math.sin(t * 0.3 + seed))) * intensity;
    const g = ctx.createLinearGradient(x, 0, x + sway, h);
    g.addColorStop(0, rgba('#bfeefc', a));
    g.addColorStop(0.6, rgba('#bfeefc', a * 0.25));
    g.addColorStop(1, rgba('#bfeefc', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - topW, 0); ctx.lineTo(x + topW, 0);
    ctx.lineTo(x + sway + topW * 2.4, h); ctx.lineTo(x + sway - topW * 2.4, h);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
