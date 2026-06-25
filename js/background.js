// The hand-painted ocean backdrop, drawn in SCREEN space with parallax driven
// by the camera. Layered depth + drifting godrays + wavy surface + sandy floor
// + caustics + paper grain. Each region passes a `dark` factor (0 sunlit .. 1
// midnight) and its id, so the same painter renders shallows or trench.
import { REF_H, WATER, PALETTE as P, WAVE } from './config.js';
import { TAU, hash1, rgba, mixHex, lerp, clamp } from './utils.js';
import { godrays, makePaper, wash } from './draw.js';
import { drawTuna, drawWhale } from './sprites.js';

export class Background {
  constructor() { this.paper = null; this.t = 0; }
  ensurePaper() { if (!this.paper) this.paper = makePaper(220); }

  render(ctx, view, t, tint, dark = 0, zoneId = '') {
    this.ensurePaper();
    const { w, h, scale, camX } = view;
    const sy = (wy) => wy * scale;
    const light = 1 - dark;             // how lit the scene is

    // 1. base vertical wash: zone tint -> deep navy (darker zones sink to black)
    const deep = mixHex(P.deepNavy, '#02060d', dark);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, mixHex(tint, P.surfaceTeal, 0.35 * light));
    g.addColorStop(0.45, tint);
    g.addColorStop(1, deep);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // 2. distant murk blobs (slow parallax)
    const par1 = -camX * 0.18;
    for (let i = 0; i < 6; i++) {
      const bx = ((i * 421.7 + par1) % (w + 600)) - 300;
      const by = h * (0.2 + hash1(i * 7) * 0.6);
      wash(ctx, bx < -300 ? bx + w + 600 : bx, by, 220 + hash1(i) * 160,
        i % 2 ? mixHex(tint, '#000', 0.25) : mixHex(tint, P.surfaceTeal, 0.5), 0.22 * (0.4 + light * 0.6));
    }

    // 3. distant kelp silhouettes near the floor (mid parallax)
    const par2 = -camX * 0.4;
    const floorY = sy(REF_H - WATER.seabedBand);
    ctx.fillStyle = rgba(mixHex(tint, '#000', 0.4), 0.5);
    for (let i = 0; i < 14; i++) {
      let bx = (i * 197 + par2) % (w + 400) - 200; if (bx < -200) bx += w + 400;
      const kh = (80 + hash1(i * 3) * 150) * scale;
      const sway = (Math.sin(t * WAVE.freq + bx * 0.012) * 0.7 + Math.sin(t * 0.5 + i) * 0.3) * 22;  // sways with the waves
      ctx.beginPath();
      ctx.moveTo(bx - 10, floorY);
      ctx.quadraticCurveTo(bx + sway, floorY - kh * 0.6, bx + sway * 1.4, floorY - kh);
      ctx.quadraticCurveTo(bx + sway, floorY - kh * 0.6, bx + 10, floorY);
      ctx.closePath(); ctx.fill();
    }

    // 3b. ambient life drifting through the deep background
    this.drawAmbient(ctx, view, t, light);

    // 4. godrays (fade out in the dark)
    if (light > 0.15) godrays(ctx, w, h, t, 6, light);

    // 4b. bioluminescent motes drift through the dark (twilight + trench)
    if (dark > 0.22) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const par = -camX * 0.5;
      for (let i = 0; i < 26; i++) {
        let bx = (i * 151.3 + par) % (w + 80); if (bx < 0) bx += w + 80;
        const by = (h * (0.15 + hash1(i * 11) * 0.7)) + Math.sin(t * 0.6 + i) * 18 * scale;
        const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.4 + i * 1.7));
        ctx.fillStyle = rgba(P.bio, 0.28 * dark * tw);
        ctx.beginPath(); ctx.arc(bx, by, (1.4 + hash1(i) * 1.8) * scale, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    // 5. surface — layered translucent swells + a bright crest + foam
    const surfH = sy(WATER.surfaceBand);
    const waveAt = (x, a, b) => surfH
      + Math.sin((x + camX) * 0.018 + t * 1.5) * a * scale
      + Math.sin((x + camX) * 0.006 - t * 1.1) * b * scale
      + Math.sin((x + camX) * 0.045 + t * 2.2) * a * 0.4 * scale;
    const sg = ctx.createLinearGradient(0, 0, 0, surfH * 1.6);
    sg.addColorStop(0, rgba('#cdeef5', 0.9 * light)); sg.addColorStop(1, rgba('#bfe9f0', 0));
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0);
    for (let x = w; x >= 0; x -= 14) ctx.lineTo(x, waveAt(x, 5, 4));
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgba('#bfe9f0', 0.16 * light);   // a second swell for depth
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0);
    for (let x = w; x >= 0; x -= 14) ctx.lineTo(x, waveAt(x, 8, 6) + 6 * scale);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba(P.foam, 0.8 * light); ctx.lineWidth = 2 * scale;   // bright crest
    ctx.beginPath();
    for (let x = 0; x <= w; x += 10) { const yy = waveAt(x, 5, 4); if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); }
    ctx.stroke();
    if (light > 0.3) {
      for (let i = 0; i < 20; i++) {
        const fx = (i * 137.5 - camX * 0.8) % w; const x = fx < 0 ? fx + w : fx;
        ctx.fillStyle = rgba(P.foam, (0.4 + 0.35 * Math.sin(t * 2 + i)) * light);
        ctx.beginPath(); ctx.arc(x, waveAt(x, 5, 4) - 3 * scale, 1.6 * scale, 0, TAU); ctx.fill();
      }
    }

    // 6. sandy seabed (foreground, scrolls 1:1; darkens with depth)
    const sandTop = floorY;
    const sand = ctx.createLinearGradient(0, sandTop, 0, h);
    sand.addColorStop(0, mixHex('#c9b386', deep, dark * 0.8));
    sand.addColorStop(1, mixHex('#8f7a52', deep, dark * 0.85));
    ctx.fillStyle = sand;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, sandTop + Math.sin((camX) * 0.02 + t) * 4);
    const floorYAt = (x) => sandTop + Math.sin((x + camX) * 0.02 + t * 0.6) * 5 * scale + Math.sin((x + camX) * 0.06) * 3 * scale;
    for (let x = 0; x <= w; x += 18) ctx.lineTo(x, floorYAt(x));
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();

    // 6b. caustics — rippling sunlight on the sand (only where it's lit)
    if (light > 0.25) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const fy = floorYAt(x);
        const c = Math.sin((x + camX) * 0.03 + t * 1.1) * Math.sin((x + camX) * 0.013 - t * 0.7);
        const yy = fy - (6 + 10 * (0.5 + 0.5 * c)) * scale;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.strokeStyle = rgba('#dff6ff', 0.10 * light); ctx.lineWidth = 6 * scale; ctx.stroke();
      ctx.restore();
    }

    // pebbles
    for (let i = 0; i < 26; i++) {
      let px = (i * 173.3 - camX) % (w + 60); if (px < 0) px += w + 60;
      const py = sandTop + (10 + hash1(i * 5) * (h - sandTop) * 0.7) * 0.6 + 6;
      ctx.fillStyle = rgba(i % 2 ? '#7d6b45' : '#b7a073', 0.7 * (0.4 + light * 0.6));
      ctx.beginPath(); ctx.arc(px, clamp(py, sandTop + 6, h - 4), (2 + hash1(i) * 4) * scale, 0, TAU); ctx.fill();
    }
    // dark contour line on the sand top
    ctx.strokeStyle = rgba('#6b5836', 0.5); ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 18) { const yy = floorYAt(x); if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); }
    ctx.stroke();

    // 7. paper grain overlay
    ctx.save();
    ctx.globalAlpha = 0.05; ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = this.paper; ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // 7b. depth darkening wash
    if (dark > 0.01) { ctx.fillStyle = rgba('#02060e', dark * 0.5); ctx.fillRect(0, 0, w, h); }

    // 8. vignette (tighter in the dark)
    const vg = ctx.createRadialGradient(w / 2, h / 2, h * (0.36 - dark * 0.18), w / 2, h / 2, h * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(2,8,16,${0.4 + dark * 0.4})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  }

  // ambient background life: a slow whale or two + a drifting school of tuna.
  // Drawn in SCREEN space with parallax so they read as distant.
  drawAmbient(ctx, view, t, light) {
    const { w, h, scale, camX } = view;
    // ONE distant whale, faint and infrequent — drifts in over a long span so
    // it's mostly off-screen (just a hint of something huge out there).
    ctx.save();
    ctx.globalAlpha = 0.1 + light * 0.07;
    ctx.fillStyle = mixHex(P.deepNavy, '#000', 0.4);
    const wspan = w + 2600;
    const wx = ((-camX * 0.13 + t * 7) % wspan + wspan) % wspan - 320;
    const wy = h * (0.58 + 0.1 * Math.sin(t * 0.05));
    ctx.save(); ctx.translate(wx, wy); ctx.scale(-1, 1); drawWhale(ctx, 82 * scale, t); ctx.restore();
    ctx.restore();
    // several drifting schools of small fish at different depths and speeds
    const schools = [
      { mix: 0.5, par: 0.32, spd: 24, y: 0.34, n: 16, r: 10, a: 0.32 },
      { mix: 0.4, par: 0.52, spd: 40, y: 0.62, n: 12, r: 8, a: 0.26 },
      { mix: 0.62, par: 0.22, spd: 15, y: 0.47, n: 22, r: 13, a: 0.4 },
    ];
    for (let s = 0; s < schools.length; s++) {
      const sc = schools[s], span = w + 760;
      const sx = ((-camX * sc.par - t * sc.spd + s * 430) % span + span) % span - 110;
      const sy0 = h * (sc.y + 0.07 * Math.sin(t * 0.2 + s));
      ctx.save(); ctx.globalAlpha = sc.a * (0.55 + light * 0.45); ctx.fillStyle = mixHex(P.deepNavy, P.surfaceTeal, sc.mix);
      for (let i = 0; i < sc.n; i++) {
        const col = i % 6, row = (i / 6) | 0;
        const fx = sx + col * 24 * scale + row * 10 * scale;
        const fy = sy0 + row * 16 * scale + Math.sin(t * 3 + i * 0.7 + s) * 5 * scale;
        ctx.save(); ctx.translate(fx, fy); ctx.scale(-1, 1); drawTuna(ctx, sc.r * scale, t, i * 1.3 + s); ctx.restore();
      }
      ctx.restore();
    }
  }

  // a flowing current band (wavy streamlines + carried motes); WORLD space.
  drawCurrent(ctx, c, t) {
    ctx.save();
    const dir = Math.sign(c.fx) || 1;
    const hh = c.y1 - c.y0, span = c.x1 - c.x0;
    ctx.lineCap = 'round'; ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const yy = c.y0 + hh * ((i + 0.5) / 7);
      const amp = 6 + (i % 2) * 5;
      ctx.strokeStyle = rgba('#cdeef5', 0.1 + 0.05 * Math.sin(t * 2 + i) + (c.strong ? 0.06 : 0));
      ctx.beginPath();
      for (let x = c.x0; x <= c.x1; x += 14) {
        const y = yy + Math.sin(x * 0.02 - t * dir * 2 + i) * amp;
        if (x === c.x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 16; i++) {
      const m = ((i * 97.3 + t * dir * 120) % span + span) % span;
      const x = c.x0 + m, y = c.y0 + hash1(i * 3) * hh + Math.sin(t * 2 + i) * 6;
      ctx.fillStyle = rgba('#dff3f7', 0.16);
      ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}
