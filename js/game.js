// Central game controller: states (menu/shop/play/laying/win/dead), camera,
// collisions, the net-snare mechanic, HUD and screens, plus persistent
// roguelike meta-progression in localStorage.
import {
  REF_H, WATER, WORLD, COMBAT, BOAT, SEAL, JELLY, UPGRADES, PALETTE as P,
} from './config.js';
import { clamp, lerp, dist, TAU, rgba, mixHex, hash1 } from './utils.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Background } from './background.js';
import { generateWorld, zoneAt } from './world.js';
import {
  Player, Seal, Boat, Jelly, Particles, surfaceLimit, seabedLimit,
} from './entities.js';
import { drawSunfish } from './sprites.js';
import { STR } from './strings.js';

const SAVE_KEY = 'sunfish.useless.v1';
const FONT = (s, w = '700') => `${w} ${s}px "Trebuchet MS","Segoe UI",system-ui,sans-serif`;

function loadSave() {
  try { return Object.assign({ plankton: 0, best: 0, runs: 0, mute: false, upg: {} }, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); }
  catch (e) { return { plankton: 0, best: 0, runs: 0, mute: false, upg: {} }; }
}

// ----- hand-drawn UI helpers ------------------------------------------------
function wobblyText(ctx, text, x, y, size, color, seed = 1) {
  ctx.save(); ctx.font = FONT(size, '800'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const total = ctx.measureText(text).width; let cx = x - total / 2;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]; const w = ctx.measureText(ch).width;
    const r = (hash1(seed + i * 7) - 0.5) * 0.13;
    ctx.save(); ctx.translate(cx + w / 2, y + (hash1(seed + i) - 0.5) * size * 0.06); ctx.rotate(r);
    ctx.fillStyle = color; ctx.fillText(ch, -w / 2, 0); ctx.restore();
    cx += w;
  }
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export class Game {
  constructor() {
    this.save = loadSave();
    Audio.setMuted(this.save.mute);
    this.bg = new Background();
    this.particles = new Particles(380);
    this.state = 'menu';
    this.t = 0; this.camX = 0;
    this.menuFlap = 0; this.banner = null;
    this._buttons = [];
    this.view = { w: 800, h: 450, scale: 1, camX: 0, worldViewW: 800 };
    this.deathMsg = '';
    this.eggs = 0;
    this.funFact = STR.funFacts[0];
  }

  stats() {
    const u = this.save.upg;
    return {
      maxHp: COMBAT.baseMaxHP + (u.vitality || 0),
      speedMul: 1 + (u.grace || 0) * 0.1,
      freqMul: 1 + (u.grace || 0) * 0.06,
      dashLevel: u.dash || 0,
      skinLevel: u.skin || 0,
      roeLevel: u.roe || 0,
    };
  }

  startRun() {
    this.seed = (Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    this.world = generateWorld(this.seed);
    this.player = new Player(this.stats());
    this.seals = []; this.boats = []; this.jellies = [];
    this.spawnIdx = 0; this.runPlankton = 0; this.runHits = 0;
    this.camX = 0; this.curZone = null; this.layT = 0;
    this.state = 'play';
    this.banner = { text: WORLD.zones[0].name, life: 2.6 };
    this.curZone = WORLD.zones[0].id;
    this.funFact = STR.funFacts[Math.floor(Math.random() * STR.funFacts.length)];
    Audio.music(true); Audio.sea(true);
  }

  // ---------------------------------------------------------------- UPDATE
  update(dt, now) {
    this.t += dt;
    if (Input.muteRequested()) { this.save.mute = Audio.toggleMute(); this.persist(); }
    this.menuFlap += dt * 2.2;
    if (this.banner) { this.banner.life -= dt; if (this.banner.life <= 0) this.banner = null; }
    this.particles.update(dt);

    if (this.state === 'menu' || this.state === 'shop') { this.updateMenu(); return; }
    if (this.state === 'dead' || this.state === 'win') { this.updateEnd(); return; }

    // ---- PLAY / LAYING ----
    const pl = this.player;
    this.activateSpawners();

    // steering target
    const { scale } = this.view;
    let target = { x: 0, y: 0, active: false };
    if (this.state === 'play') {
      if (Input.active) {
        target = { x: this.camX + Input.sx / scale, y: Input.sy / scale, active: true };
      } else if (Math.hypot(Input.dir.x, Input.dir.y) > 0.1) {
        target = { x: pl.x + Input.dir.x * 150, y: pl.y + Input.dir.y * 150, active: true };
      }
      // dash
      if (Input.consumeDash(now)) {
        let d = (Math.hypot(Input.dir.x, Input.dir.y) > 0.1) ? { x: Input.dir.x, y: Input.dir.y }
          : (Input.active ? Input.flickDir() : null);
        if (!d) { const sp = Math.hypot(pl.vx, pl.vy); d = sp > 12 ? { x: pl.vx / sp, y: pl.vy / sp } : { x: pl.face, y: 0 }; }
        pl.tryDash(d, Audio, this.particles);
      }
    }

    if (pl.caught) this.updateCaught(dt, now);
    else pl.update(dt, target, this.particles);

    // currents push the fish
    if (this.state === 'play' && !pl.caught) {
      for (const c of this.world.currents) {
        if (c.contains(pl.x, pl.y)) { pl.vx += c.fx * dt; pl.vy += c.fy * dt; }
      }
    }

    // entities
    for (const s of this.seals) s.update(dt, { player: pl });
    for (const b of this.boats) b.update(dt);
    for (const j of this.jellies) j.update(dt);
    for (const p of this.world.plankton) if (!p.dead) p.update(dt);
    this.jellies = this.jellies.filter((j) => !j.dead && j.x > this.camX - 400);
    this.seals = this.seals.filter((s) => !(s.state === 'leaving' && (s.y > REF_H || s.x < this.camX - 500)));
    this.boats = this.boats.filter((b) => b.x > this.camX - 700 && b.x < this.camX + this.view.worldViewW + 1400);

    if (this.state === 'play' && !pl.caught) this.collide();

    // zone banner on change
    const z = zoneAt(pl.x);
    if (z.id !== this.curZone) {
      this.curZone = z.id;
      this.banner = { text: z.name, life: 2.6 };
      if (z.id === 'lane') Audio.sfx('warn');
    }

    // ambient bubbles in view
    if (Math.random() < 0.3) {
      this.particles.spawn(this.camX + Math.random() * this.view.worldViewW,
        REF_H - WATER.seabedBand - Math.random() * 40, 'bubble', 0, -20);
    }

    // win trigger
    if (this.state === 'play' && pl.x >= this.world.goal - 30) this.beginLaying();
    if (this.state === 'laying') this.updateLaying(dt);

    // death
    if (!pl.alive && this.state === 'play') this.die();

    // camera
    const camTarget = clamp(pl.x - this.view.worldViewW * 0.34, 0, Math.max(0, this.world.goal + 240 - this.view.worldViewW));
    this.camX = lerp(this.camX, camTarget, clamp(dt * 5, 0, 1));
  }

  activateSpawners() {
    const lookX = this.camX + this.view.worldViewW + 220;
    const sp = this.world.spawners;
    while (this.spawnIdx < sp.length && sp[this.spawnIdx].x < lookX) {
      const s = sp[this.spawnIdx++];
      if (s.type === 'seal') this.seals.push(new Seal(s.x, s.y));
      else if (s.type === 'jelly') this.jellies.push(new Jelly(s.x, s.y));
      else if (s.type === 'boat') this.boats.push(new Boat(s.x + (s.dir < 0 ? this.view.worldViewW : 0), s.dir));
    }
  }

  collide() {
    const pl = this.player;
    // rocks
    for (const r of this.world.rocks) {
      if (Math.abs(r.x - pl.x) > 300) continue;
      const d = dist(r.x, r.y, pl.x, pl.y), min = r.hitR + pl.hitR;
      if (d < min) {
        const nx = (pl.x - r.x) / (d || 1), ny = (pl.y - r.y) / (d || 1);
        const speed = Math.hypot(pl.vx, pl.vy);
        pl.x = r.x + nx * min; pl.y = r.y + ny * min;
        const into = pl.vx * nx + pl.vy * ny;
        if (into < 0) { pl.vx -= into * nx; pl.vy -= into * ny; }
        if (speed > COMBAT.rockSplatSpeed) pl.hit(1, nx * 160, ny * 160, Audio, this.particles);
      }
    }
    // seals
    for (const s of this.seals) {
      if (!s.canBite()) continue;
      const bp = s.bitePoint();
      if (dist(bp.x, bp.y, pl.x, pl.y) < pl.hitR + 24) {
        if (pl.hit(SEAL.damage, (pl.x - s.x) * 1.6, (pl.y - s.y) * 1.6, Audio, this.particles)) {
          s.biteCD = 1.3; s.state = 'rest'; s.t = 0; this.runHits++;
        }
      }
    }
    // jellies
    for (const j of this.jellies) {
      if (dist(j.x, j.y, pl.x, pl.y) < pl.hitR + j.hitR) {
        if (pl.hit(JELLY.damage, (pl.x - j.x) * 2, (pl.y - j.y) * 2, Audio, this.particles)) {
          j.driftX = (pl.x - j.x); this.runHits++;
        }
      }
    }
    // boats: propeller + net
    for (const b of this.boats) {
      const pp = b.propPoint();
      if (dist(pp.x, pp.y, pl.x, pl.y) < pl.hitR + BOAT.propRadius) {
        if (pl.hit(BOAT.propDamage, (pl.x - pp.x) * 2, -180, Audio, this.particles)) { this.runHits++; this.particles.burst(pl.x, pl.y, 'foam', 14, 220); }
      }
      const nb = b.netBounds();
      if (pl.invuln <= 0 && pl.x > nb.x0 && pl.x < nb.x1 && pl.y > nb.y0 && pl.y < nb.y1) {
        pl.caught = b; pl.haul = 0; pl.escape = 0; Audio.sfx('snare');
      }
    }
    // plankton
    for (const p of this.world.plankton) {
      if (p.dead) continue;
      if (Math.abs(p.x - pl.x) > 200) continue;
      if (dist(p.x, p.y, pl.x, pl.y) < pl.hitR + p.r + 14) {
        p.dead = true; this.runPlankton += p.value; pl.mouth = 1;
        Audio.sfx('pickup');
        this.particles.burst(p.x, p.y, 'sparkle', p.value > 1 ? 12 : 6, 150, { color: P.amberSoft });
        if (p.value > 1 && pl.hp < pl.maxHp && Math.random() < 0.4) pl.hp++;
      }
    }
  }

  updateCaught(dt, now) {
    const pl = this.player, b = pl.caught;
    if (!b) return;
    // dragged under the boat, hauled toward the surface
    pl.x = lerp(pl.x, b.x, clamp(dt * 1.8, 0, 1));
    const surfTarget = b.hullY + 46;
    pl.y = lerp(pl.y, lerp(seabedLimit(pl.r), surfTarget, pl.haul), clamp(dt * 4, 0, 1));
    pl.vx *= 0.8; pl.vy *= 0.8;

    pl.haul += dt / COMBAT.netSnareTime;
    const skin = 1 + this.stats().skinLevel * 0.4;
    let struggling = Input.speed > 650;
    if (!struggling && Math.hypot(Input.dir.x, Input.dir.y) > 0.1) struggling = true; // keys/pad
    if (struggling) {
      pl.haul -= dt * 1.5 * skin;
      pl.escape += dt * 0.85 * skin;
      if (Math.random() < 0.5) this.particles.spawn(pl.x, pl.y, 'bubble', (Math.random() - 0.5) * 120, -40);
    }
    pl.haul = clamp(pl.haul, 0, 1.2);

    if (pl.escape >= 1) {
      pl.caught = null; pl.invuln = COMBAT.netEscapeIFrames; pl.vy = 240; pl.vx = (Math.random() - 0.5) * 120;
      Audio.sfx('escape'); this.particles.burst(pl.x, pl.y, 'bubble', 12, 160);
    } else if (pl.haul >= 1) {
      pl.hp = 0; pl.alive = false; pl.caught = null; this.die('caught');
    }
  }

  beginLaying() {
    if (this.state !== 'play') return;
    this.state = 'laying'; this.layT = 0;
    this.player.vx *= 0.3;
    Audio.sfx('eggs');
    const s = this.stats();
    this.eggs = Math.round((40 + this.runPlankton * 6 + this.player.hp * 25) * (1 + s.roeLevel * 0.6));
  }
  updateLaying(dt) {
    this.layT += dt;
    const pl = this.player;
    pl.vx *= 0.92; pl.vy *= 0.92; pl.mouth = 0.4;
    if (Math.random() < 0.7) {
      this.particles.spawn(pl.x - pl.r, pl.y + (Math.random() - 0.5) * pl.r, 'egg',
        -40 - Math.random() * 60, (Math.random() - 0.5) * 60, { life: 3.5, size: 5 + Math.random() * 4 });
    }
    if (this.layT > 2.7) {
      this.save.best = Math.max(this.save.best, this.world.goal);
      this.save.plankton += this.runPlankton; this.save.runs++;
      this.persist(); this.state = 'win';
    }
  }

  die(cause) {
    this.save.best = Math.max(this.save.best, Math.round(this.player.x));
    this.save.plankton += this.runPlankton; this.save.runs++; this.persist();
    Audio.sea(false);
    const msgs = STR.deaths;
    this.deathMsg = cause === 'caught' ? msgs[2] : msgs[Math.floor(Math.random() * msgs.length)];
    this.particles.burst(this.player.x, this.player.y, 'inkpuff', 16, 200);
    this.state = 'dead';
  }

  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) {} }

  // ----- menu / shop / end input ------------------------------------------
  updateMenu() {
    const tap = Input.takeTap();
    const key = Input.anyJustPressed();   // keyboard / gamepad
    if (this.state === 'menu') {
      if (tap) {
        const hit = this.hitButton(tap);
        if (hit === 'shop') { this.state = 'shop'; Audio.sfx('ui'); return; }
        if (hit === 'mute') { this.save.mute = Audio.toggleMute(); this.persist(); return; }
      }
      if (tap || key) { Audio.unlock(); this.startRun(); }
    } else if (this.state === 'shop') {
      if (tap) {
        const hit = this.hitButton(tap);
        if (hit === 'back') { this.state = 'menu'; Audio.sfx('ui'); }
        else if (hit && hit.startsWith('buy:')) this.buy(hit.slice(4));
      } else if (key) { this.state = 'menu'; Audio.sfx('ui'); }
    }
  }
  updateEnd() {
    const tap = Input.takeTap();
    const key = Input.anyJustPressed();
    if (tap) {
      if (this.hitButton(tap) === 'shop') { this.state = 'shop'; Audio.sfx('ui'); return; }
      Audio.sfx('ui'); this.state = 'menu';
    } else if (key) { Audio.sfx('ui'); this.state = 'menu'; }
  }
  hitButton(tap) {
    for (const b of this._buttons) {
      if (tap.x >= b.x && tap.x <= b.x + b.w && tap.y >= b.y && tap.y <= b.y + b.h) return b.id;
    }
    return null;
  }
  buy(id) {
    const def = UPGRADES.find((u) => u.id === id); if (!def) return;
    const lvl = this.save.upg[id] || 0;
    if (lvl >= def.max) return;
    const cost = def.baseCost + def.step * lvl;
    if (this.save.plankton < cost) { Audio.sfx('hurt'); return; }
    this.save.plankton -= cost; this.save.upg[id] = lvl + 1; this.persist(); Audio.sfx('buy');
  }

  // ---------------------------------------------------------------- RENDER
  render(ctx, view) {
    this.view = view; this.view.camX = this.camX;
    const tint = this.zoneTint();
    this.bg.render(ctx, { ...view, camX: this.camX }, this.t, tint);

    if (this.state === 'menu' || this.state === 'shop') {
      this.renderMenuWorld(ctx, view);
    } else {
      this.renderWorld(ctx, view);
    }

    // screen-space overlays
    this._buttons = [];
    if (this.state === 'menu') this.renderMenu(ctx, view);
    else if (this.state === 'shop') this.renderShop(ctx, view);
    else if (this.state === 'win') this.renderWin(ctx, view);
    else if (this.state === 'dead') this.renderDead(ctx, view);
    else this.renderHUD(ctx, view);
  }

  zoneTint() {
    if (this.state === 'menu' || this.state === 'shop' || !this.world) return WORLD.zones[0].tint;
    const x = this.player ? this.player.x : 0;
    const f = x / WORLD.goalDistance;
    let prev = WORLD.zones[0];
    for (let i = 0; i < WORLD.zones.length; i++) {
      const z = WORLD.zones[i];
      if (f <= z.end) {
        const start = i === 0 ? 0 : WORLD.zones[i - 1].end;
        return mixHex(prev.tint, z.tint, clamp((f - start) / (z.end - start), 0, 1));
      }
      prev = z;
    }
    return WORLD.zones[WORLD.zones.length - 1].tint;
  }

  worldXform(ctx, view) {
    ctx.save(); ctx.scale(view.scale, view.scale); ctx.translate(-this.camX, 0);
  }

  renderWorld(ctx, view) {
    this.worldXform(ctx, view);
    const L = this.camX - 120, Rr = this.camX + view.worldViewW + 120;
    for (const k of this.world.kelp) if (k.x > L && k.x < Rr) k.render(ctx, this.t);
    for (const c of this.world.currents) if (c.x1 > L && c.x0 < Rr) this.bg.drawCurrent(ctx, c, this.t);
    for (const r of this.world.rocks) if (r.x > L && r.x < Rr) r.render(ctx);
    for (const p of this.world.plankton) if (!p.dead && p.x > L && p.x < Rr) p.render(ctx);
    for (const j of this.jellies) j.render(ctx, this.t);
    for (const s of this.seals) s.render(ctx, this.t);
    for (const b of this.boats) b.render(ctx, this.t, this.player.caught === b);
    if (this.player) this.player.render(ctx, this.t);
    this.particles.render(ctx);
    // goal marker (a sunlit reef gateway)
    if (this.world.goal > L && this.world.goal < Rr + 400) this.drawGoal(ctx);
    ctx.restore();
  }

  drawGoal(ctx) {
    const gx = this.world.goal, top = WATER.surfaceBand, bot = REF_H - WATER.seabedBand;
    ctx.save();
    const g = ctx.createLinearGradient(gx, top, gx, bot);
    g.addColorStop(0, rgba(P.amberSoft, 0.0));
    g.addColorStop(0.5, rgba(P.amberSoft, 0.22));
    g.addColorStop(1, rgba(P.amber, 0.0));
    ctx.fillStyle = g; ctx.fillRect(gx - 80, top, 240, bot - top);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = rgba(P.amberSoft, 0.5);
      ctx.beginPath();
      ctx.arc(gx + 30 + Math.sin(this.t + i) * 20, top + 60 + i * (bot - top) / 5, 4, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  renderMenuWorld(ctx, view) {
    // a single idle sunfish bobbing in the middle
    this.worldXform(ctx, { ...view });
    const cx = this.camX + view.worldViewW * 0.5;
    const cy = REF_H * 0.52 + Math.sin(this.menuFlap * 0.7) * 18;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(this.menuFlap * 0.5) * 0.06);
    drawSunfish(ctx, 64, this.t, { flap: this.menuFlap, blink: 1, lookX: 1 });
    ctx.restore();
    this.particles.render(ctx);
    ctx.restore();
  }

  // ---- HUD ----
  renderHUD(ctx, view) {
    const { w, scale } = view; const pad = 14 * Math.max(1, scale * 0.7);
    const pl = this.player; if (!pl) return;
    // hearts
    for (let i = 0; i < pl.maxHp; i++) this.drawHeart(ctx, pad + i * 30, pad + 12, 11, i < pl.hp);
    // plankton
    ctx.font = FONT(18); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = P.amber; ctx.beginPath(); ctx.arc(w - pad - 70, pad + 12, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = P.foam; ctx.fillText(`${this.runPlankton}`, w - pad, pad + 12);
    // progress bar
    this.drawProgress(ctx, view);
    // dash readiness
    if (this.stats().dashLevel > 0) {
      const r = 16, dx = pad + r, dy = view.h - pad - r;
      ctx.strokeStyle = rgba(P.foam, 0.4); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(dx, dy, r, 0, TAU); ctx.stroke();
      const ready = 1 - clamp(pl.dashCD / 1.05, 0, 1);
      ctx.strokeStyle = ready >= 1 ? P.amber : rgba(P.amberSoft, 0.7);
      ctx.beginPath(); ctx.arc(dx, dy, r, -Math.PI / 2, -Math.PI / 2 + ready * TAU); ctx.stroke();
      ctx.fillStyle = rgba(P.foam, 0.8); ctx.font = FONT(9); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('DASH', dx, dy);
    }
    // banner
    if (this.banner) {
      const a = clamp(this.banner.life, 0, 1) * clamp(2.6 - this.banner.life, 0, 1);
      ctx.globalAlpha = clamp(a + 0.2, 0, 1);
      wobblyText(ctx, this.banner.text, w / 2, view.h * 0.26, 30, P.foam, 5);
      ctx.globalAlpha = 1;
    }
    // caught prompt
    if (pl.caught) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(this.t * 10);
      wobblyText(ctx, STR.caught, w / 2, view.h * 0.34, 26, '#ffd36b', 9);
      ctx.globalAlpha = 1;
      ctx.font = FONT(15); ctx.textAlign = 'center'; ctx.fillStyle = P.foam;
      ctx.fillText(STR.struggle, w / 2, view.h * 0.4);
      // haul meter
      const bw = Math.min(260, w * 0.5), bx = (w - bw) / 2, by = view.h * 0.44;
      ctx.fillStyle = rgba('#000', 0.4); roundRect(ctx, bx, by, bw, 12, 6); ctx.fill();
      ctx.fillStyle = '#e2604f'; roundRect(ctx, bx, by, bw * clamp(pl.haul, 0, 1), 12, 6); ctx.fill();
      ctx.fillStyle = P.amber; roundRect(ctx, bx, by + 16, bw * clamp(pl.escape, 0, 1), 8, 4); ctx.fill();
    }
  }

  drawHeart(ctx, x, y, s, full) {
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, s * 0.35);
    ctx.bezierCurveTo(-s, -s * 0.6, -s * 0.5, -s * 1.1, 0, -s * 0.45);
    ctx.bezierCurveTo(s * 0.5, -s * 1.1, s, -s * 0.6, 0, s * 0.35);
    ctx.closePath();
    ctx.fillStyle = full ? '#e2604f' : 'rgba(255,255,255,0.12)'; ctx.fill();
    ctx.strokeStyle = P.ink; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  drawProgress(ctx, view) {
    const { w } = view; const bw = Math.min(360, w * 0.5), bx = (w - bw) / 2, by = 20;
    ctx.font = FONT(10); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = rgba(P.foam, 0.8);
    ctx.fillText(STR.goalAtlantic, bx - 4, by - 10);
    ctx.textAlign = 'right'; ctx.fillText(STR.goalPacific, bx + bw + 4, by - 10);
    ctx.fillStyle = rgba('#06243a', 0.55); roundRect(ctx, bx, by, bw, 9, 4); ctx.fill();
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, '#2e7d8a'); g.addColorStop(1, P.amber);
    const f = clamp((this.player ? this.player.x : 0) / this.world.goal, 0, 1);
    ctx.fillStyle = g; roundRect(ctx, bx, by, bw * f, 9, 4); ctx.fill();
    // fish marker
    ctx.save(); ctx.translate(bx + bw * f, by + 4.5); ctx.scale(0.16, 0.16);
    drawSunfish(ctx, 40, this.t, { flap: this.menuFlap * 3, blink: 1, lookX: 1 });
    ctx.restore();
  }

  // ---- screens ----
  panel(ctx, view, h) {
    const { w } = view; const pw = Math.min(560, w * 0.92), px = (w - pw) / 2, py = (view.h - h) / 2;
    ctx.fillStyle = rgba('#0a2236', 0.82); roundRect(ctx, px, py, pw, h, 18); ctx.fill();
    ctx.strokeStyle = rgba(P.foam, 0.25); ctx.lineWidth = 2; ctx.stroke();
    return { px, py, pw };
  }
  button(ctx, id, x, y, w, h, label, enabled = true, accent = false) {
    this._buttons.push({ id, x, y, w, h });
    ctx.fillStyle = enabled ? (accent ? rgba(P.amber, 0.92) : rgba('#2e6f80', 0.95)) : 'rgba(120,120,120,0.3)';
    roundRect(ctx, x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = P.ink; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = enabled ? (accent ? '#3a2a10' : P.foam) : 'rgba(255,255,255,0.5)';
    ctx.font = FONT(15, '800'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  }

  renderMenu(ctx, view) {
    const { w, h } = view;
    ctx.textAlign = 'center';
    wobblyText(ctx, STR.title, w / 2, h * 0.2, Math.min(72, w * 0.13), P.foam, 2);
    ctx.font = FONT(18, '600'); ctx.fillStyle = P.amberSoft; ctx.textBaseline = 'middle';
    ctx.fillText(STR.subtitle, w / 2, h * 0.2 + Math.min(58, w * 0.1));
    ctx.font = FONT(14, '500'); ctx.fillStyle = rgba(P.foam, 0.8);
    ctx.fillText(STR.tagline, w / 2, h * 0.72);
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 2.5);
    ctx.font = FONT(17, '700'); ctx.fillStyle = P.foam;
    ctx.fillText(STR.tapToStart, w / 2, h * 0.8); ctx.globalAlpha = 1;
    ctx.font = FONT(12, '500'); ctx.fillStyle = rgba(P.foam, 0.6);
    ctx.fillText(STR.dragHint + '  ·  ' + STR.keyHint, w / 2, h * 0.86);
    // stats line
    ctx.font = FONT(13, '600'); ctx.fillStyle = P.amberSoft;
    ctx.fillText(`${STR.shopBanked}: ${this.save.plankton} ${STR.hudPlankton}   ·   ${STR.hudBest}: ${Math.round(this.save.best / 40)} leagues`, w / 2, h * 0.92);
    // buttons
    this.button(ctx, 'shop', w / 2 - 130, h * 0.55, 120, 42, '⚓ ' + STR.toShop);
    this.button(ctx, 'mute', w / 2 + 10, h * 0.55, 120, 42, Audio.isMuted() ? '🔇 ' + STR.muted : '🔊 ' + STR.unmuted);
  }

  renderShop(ctx, view) {
    const { w } = view; const ph = Math.min(440, view.h * 0.9);
    const { px, py, pw } = this.panel(ctx, view, ph);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    wobblyText(ctx, STR.shopTitle, w / 2, py + 34, 26, P.foam, 3);
    ctx.font = FONT(12, '500'); ctx.fillStyle = rgba(P.foam, 0.75);
    ctx.fillText(STR.shopBlurb, w / 2, py + 60);
    ctx.fillStyle = P.amber; ctx.font = FONT(15, '800');
    ctx.fillText(`${this.save.plankton} ${STR.hudPlankton} ${STR.shopBanked}`, w / 2, py + 84);
    const rowH = (ph - 150) / UPGRADES.length;
    UPGRADES.forEach((u, i) => {
      const ry = py + 104 + i * rowH;
      const lvl = this.save.upg[u.id] || 0; const maxed = lvl >= u.max;
      const cost = u.baseCost + u.step * lvl;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = FONT(15, '800'); ctx.fillStyle = P.foam; ctx.fillText(u.name, px + 24, ry + 12);
      ctx.font = FONT(11, '500'); ctx.fillStyle = rgba(P.foam, 0.7); ctx.fillText(u.desc, px + 24, ry + 30);
      // level pips
      for (let k = 0; k < u.max; k++) {
        ctx.fillStyle = k < lvl ? P.amber : 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.arc(px + 24 + k * 16, ry + 44, 5, 0, TAU); ctx.fill();
      }
      const bx = px + pw - 132;
      if (maxed) {
        ctx.fillStyle = rgba(P.amberSoft, 0.8); ctx.font = FONT(14, '800'); ctx.textAlign = 'center';
        ctx.fillText(STR.shopMaxed, bx + 54, ry + 24);
      } else {
        this.button(ctx, 'buy:' + u.id, bx, ry + 4, 108, 38,
          `${cost} ☘`, this.save.plankton >= cost, this.save.plankton >= cost);
      }
    });
    this.button(ctx, 'back', px + pw / 2 - 55, py + ph - 46, 110, 36, '‹ ' + STR.shopBack);
  }

  renderWin(ctx, view) {
    const { w, h } = view;
    ctx.fillStyle = rgba('#06243a', 0.5); ctx.fillRect(0, 0, w, h);
    wobblyText(ctx, STR.win, w / 2, h * 0.26, Math.min(56, w * 0.1), P.amberSoft, 4);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = FONT(16, '600'); ctx.fillStyle = P.foam; ctx.fillText(STR.winSub, w / 2, h * 0.37);
    ctx.font = FONT(22, '800'); ctx.fillStyle = P.amber; ctx.fillText(STR.eggsLaid(this.eggs), w / 2, h * 0.47);
    ctx.font = FONT(13, '500'); ctx.fillStyle = rgba(P.foam, 0.8); ctx.fillText(STR.winFunFact, w / 2, h * 0.55);
    ctx.fillText(`+${this.runPlankton} ${STR.hudPlankton}`, w / 2, h * 0.61);
    this.button(ctx, 'retry', w / 2 - 130, h * 0.7, 120, 44, '↺ ' + STR.retry, true, true);
    this.button(ctx, 'shop', w / 2 + 10, h * 0.7, 120, 44, '⚓ ' + STR.toShop);
  }

  renderDead(ctx, view) {
    const { w, h } = view;
    ctx.fillStyle = rgba('#1a0d12', 0.5); ctx.fillRect(0, 0, w, h);
    wobblyText(ctx, STR.deathTitle, w / 2, h * 0.28, Math.min(48, w * 0.09), '#e8a0a0', 7);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = FONT(17, '600'); ctx.fillStyle = P.foam; ctx.fillText(this.deathMsg, w / 2, h * 0.4);
    ctx.font = FONT(13, '500'); ctx.fillStyle = rgba(P.foam, 0.7); ctx.fillText('🐟 ' + this.funFact, w / 2, h * 0.48);
    ctx.font = FONT(14, '700'); ctx.fillStyle = P.amberSoft;
    ctx.fillText(`+${this.runPlankton} ${STR.hudPlankton} banked   ·   ${STR.hudBest}: ${Math.round(this.save.best / 40)} leagues`, w / 2, h * 0.55);
    this.button(ctx, 'retry', w / 2 - 130, h * 0.66, 120, 44, '↺ ' + STR.retry, true, true);
    this.button(ctx, 'shop', w / 2 + 10, h * 0.66, 120, 44, '⚓ ' + STR.toShop);
  }

  entityCount() {
    return (this.seals ? this.seals.length : 0) + (this.boats ? this.boats.length : 0) +
      (this.jellies ? this.jellies.length : 0);
  }
}
