// The hand-painted ocean backdrop, drawn in SCREEN space with parallax driven
// by the camera. Layered depth + drifting godrays + wavy surface + sandy floor
// + paper grain, per the STYLE FORMULA.
import { REF_H, WATER, PALETTE as P } from './config.js';
import { TAU, hash1, rgba, mixHex, lerp, clamp } from './utils.js';
import { godrays, makePaper, wash } from './draw.js';

export class Background {
  constructor() { this.paper = null; this.t = 0; }
  ensurePaper() { if (!this.paper) this.paper = makePaper(220); }

  render(ctx, view, t, tint) {
    this.ensurePaper();
    const { w, h, scale, camX } = view;
    const sy = (wy) => wy * scale;

    // 1. base vertical wash: zone tint -> deep navy
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, mixHex(tint, P.surfaceTeal, 0.35));
    g.addColorStop(0.45, tint);
    g.addColorStop(1, P.deepNavy);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // 2. distant murk blobs (slow parallax)
    const par1 = -camX * 0.18;
    for (let i = 0; i < 6; i++) {
      const bx = ((i * 421.7 + par1) % (w + 600)) - 300;
      const by = h * (0.2 + hash1(i * 7) * 0.6);
      wash(ctx, bx < -300 ? bx + w + 600 : bx, by, 220 + hash1(i) * 160,
        i % 2 ? mixHex(tint, '#000', 0.25) : mixHex(tint, P.surfaceTeal, 0.5), 0.22);
    }

    // 3. distant kelp silhouettes near the floor (mid parallax)
    const par2 = -camX * 0.4;
    const floorY = sy(REF_H - WATER.seabedBand);
    ctx.fillStyle = rgba(mixHex(tint, '#000', 0.4), 0.5);
    for (let i = 0; i < 14; i++) {
      let bx = (i * 197 + par2) % (w + 400) - 200; if (bx < -200) bx += w + 400;
      const kh = (80 + hash1(i * 3) * 150) * scale;
      const sway = Math.sin(t * 0.5 + i) * 16;
      ctx.beginPath();
      ctx.moveTo(bx - 10, floorY);
      ctx.quadraticCurveTo(bx + sway, floorY - kh * 0.6, bx + sway * 1.4, floorY - kh);
      ctx.quadraticCurveTo(bx + sway, floorY - kh * 0.6, bx + 10, floorY);
      ctx.closePath(); ctx.fill();
    }

    // 4. godrays
    godrays(ctx, w, h, t, 6);

    // 5. surface band with wavy waterline + foam
    const surfH = sy(WATER.surfaceBand);
    const sg = ctx.createLinearGradient(0, 0, 0, surfH * 1.4);
    sg.addColorStop(0, rgba('#bfe9f0', 0.85));
    sg.addColorStop(1, rgba('#bfe9f0', 0));
    ctx.fillStyle = sg; ctx.fillRect(0, 0, w, surfH * 1.4);
    ctx.strokeStyle = rgba(P.foam, 0.7); ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 12) {
      const yy = surfH + Math.sin((x + camX) * 0.02 + t * 1.6) * 4 * scale + Math.sin((x + camX) * 0.005 - t) * 3 * scale;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    // foam flecks
    for (let i = 0; i < 18; i++) {
      const fx = (i * 137.5 - camX * 0.8) % w; const x = fx < 0 ? fx + w : fx;
      ctx.fillStyle = rgba(P.foam, 0.5 + 0.3 * Math.sin(t * 2 + i));
      ctx.beginPath(); ctx.arc(x, surfH * (0.3 + hash1(i) * 0.6), 1.5 * scale, 0, TAU); ctx.fill();
    }

    // 6. sandy seabed (foreground, scrolls 1:1)
    const sandTop = floorY;
    const sand = ctx.createLinearGradient(0, sandTop, 0, h);
    sand.addColorStop(0, '#c9b386');
    sand.addColorStop(1, '#8f7a52');
    ctx.fillStyle = sand;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, sandTop + Math.sin((camX) * 0.02 + t) * 4);
    for (let x = 0; x <= w; x += 18) {
      const yy = sandTop + Math.sin((x + camX) * 0.02 + t * 0.6) * 5 * scale + Math.sin((x + camX) * 0.06) * 3 * scale;
      ctx.lineTo(x, yy);
    }
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    // pebbles
    for (let i = 0; i < 26; i++) {
      let px = (i * 173.3 - camX) % (w + 60); if (px < 0) px += w + 60;
      const py = sandTop + (10 + hash1(i * 5) * (h - sandTop) * 0.7) * 0.6 + 6;
      ctx.fillStyle = rgba(i % 2 ? '#7d6b45' : '#b7a073', 0.7);
      ctx.beginPath(); ctx.arc(px, clamp(py, sandTop + 6, h - 4), (2 + hash1(i) * 4) * scale, 0, TAU); ctx.fill();
    }
    // dark contour line on the sand top
    ctx.strokeStyle = rgba('#6b5836', 0.5); ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 18) {
      const yy = sandTop + Math.sin((x + camX) * 0.02 + t * 0.6) * 5 * scale + Math.sin((x + camX) * 0.06) * 3 * scale;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();

    // 7. paper grain overlay
    ctx.save();
    ctx.globalAlpha = 0.05; ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = this.paper; ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // 8. vignette
    const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(3,12,22,0.4)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  }

  // current-band visual (drifting streaks); called in WORLD space.
  drawCurrent(ctx, c, t) {
    ctx.save();
    ctx.strokeStyle = rgba('#bfe9f0', 0.12); ctx.lineWidth = 2;
    const dir = Math.sign(c.fx) || 1;
    for (let i = 0; i < 10; i++) {
      const yy = lerp(c.y0, c.y1, (i + 0.5) / 10);
      const phase = (t * dir * 0.4 + i * 0.3) % 1;
      const sx = lerp(c.x0, c.x1, phase);
      ctx.beginPath(); ctx.moveTo(sx, yy); ctx.lineTo(sx + dir * 40, yy); ctx.stroke();
    }
    ctx.restore();
  }
}
