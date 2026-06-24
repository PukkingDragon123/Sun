// Game entities: the player sunfish, hazards, pickups, currents, particles.
// All positions/speeds are in WORLD UNITS (see config.js). Self-motion lives
// here; cross-entity collisions are resolved centrally in game.js.
import { REF_H, WATER, FISH, DASH, SEAL, JELLY, BOAT, PALETTE as P } from './config.js';
import { clamp, lerp, TAU, dist, rgba, hash1 } from './utils.js';
import {
  drawSunfish, drawSeal, drawBoat, drawNet, drawRock, drawKelp, drawJelly,
  drawPlankton, drawEgg,
} from './sprites.js';

export const surfaceLimit = (r) => WATER.surfaceBand + r * 0.4;
export const seabedLimit = (r) => REF_H - WATER.seabedBand - r * 0.4;

// ------------------------------------------------------------------- Player
export class Player {
  constructor(stats) {
    this.x = 120; this.y = REF_H * 0.5;
    this.vx = 0; this.vy = 0;
    this.r = FISH.radius;
    this.applyStats(stats);
    this.hp = this.maxHp;
    this.face = 1; this.pitch = 0; this.flap = 0; this.blink = 1; this._blinkT = 2;
    this.dashT = 0; this.dashCD = 0; this.invuln = 0; this.hurt = 0; this.mouth = 0;
    this.caught = null; this.haul = 0; this.escape = 0;
    this.alive = true;
  }
  applyStats(s) {
    this.stats = s;
    this.maxHp = s.maxHp;
    this.speed = FISH.maxSpeed * s.speedMul;
    this.freq = FISH.followFreq * s.freqMul;
  }
  get hitR() { return this.r * FISH.hitboxScale; }

  tryDash(dir, audio, particles) {
    if (this.stats.dashLevel <= 0 || this.dashCD > 0 || this.caught) return;
    this.dashT = DASH.dur;
    this.dashCD = DASH.cooldown * (1 - (this.stats.dashLevel - 1) * 0.18);
    this.invuln = Math.max(this.invuln, DASH.iframes + (this.stats.dashLevel - 1) * 0.06);
    const imp = DASH.impulse * (0.85 + this.stats.dashLevel * 0.15);
    this.vx += dir.x * imp; this.vy += dir.y * imp;
    audio.sfx('dash');
    for (let i = 0; i < 10; i++) {
      particles.spawn(this.x - dir.x * this.r, this.y - dir.y * this.r, 'bubble',
        -dir.x * 60 + (Math.random() - 0.5) * 60, -dir.y * 60 + (Math.random() - 0.5) * 60);
    }
  }

  hit(dmg, kx, ky, audio, particles) {
    if (this.invuln > 0 || !this.alive) return false;
    this.hp -= dmg; this.invuln = 1.1; this.hurt = 1;
    this.vx += kx; this.vy += ky;
    audio.sfx('hurt');
    for (let i = 0; i < 12; i++)
      particles.spawn(this.x, this.y, 'inkpuff', (Math.random() - 0.5) * 220, (Math.random() - 0.5) * 220);
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    return true;
  }

  update(dt, target, particles) {
    this.dashCD = Math.max(0, this.dashCD - dt);
    this.dashT = Math.max(0, this.dashT - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurt = Math.max(0, this.hurt - dt * 2.2);

    if (this.caught) { this.mouth = 0; this._animate(dt, 0.4); return; }

    const steering = target && target.active;
    if (steering) {
      const f = this.freq;
      this.vx += (f * f * (target.x - this.x) - 2 * f * this.vx) * dt;
      this.vy += (f * f * (target.y - this.y) - 2 * f * this.vy) * dt;
    }
    // water drag (gentle while steering, stronger while coasting)
    const drag = FISH.dragPerSec * (steering ? 0.12 : 1);
    this.vx -= this.vx * drag * dt; this.vy -= this.vy * drag * dt;

    // clamp speed (dash lets it briefly exceed)
    const sp = Math.hypot(this.vx, this.vy);
    const max = this.speed * (this.dashT > 0 ? 2.1 : 1);
    if (sp > max) { this.vx *= max / sp; this.vy *= max / sp; }

    this.x += this.vx * dt; this.y += this.vy * dt;

    // bounds: surface + seabed + start wall
    const top = surfaceLimit(this.r), bot = seabedLimit(this.r);
    if (this.y < top) { this.y = top; this.vy *= -0.3; }
    if (this.y > bot) { this.y = bot; this.vy *= -0.3; }
    if (this.x < 60) { this.x = 60; this.vx = Math.max(0, this.vx); }

    this.mouth = Math.max(0, this.mouth - dt * 3);
    this._animate(dt, Math.min(1, sp / this.speed));

    // ambient bubble from the gills now and then
    if (Math.random() < 0.04) particles.spawn(this.x + this.r * 0.4, this.y - this.r * 0.2, 'bubble', 6, -20);
  }

  _animate(dt, effort) {
    this.flap += dt * FISH.finFlap * (0.5 + effort * 1.1);
    if (Math.abs(this.vx) > 18) this.face = this.vx < 0 ? -1 : 1;
    this.pitch = clamp(Math.atan2(this.vy, Math.max(60, Math.abs(this.vx))) * 0.55, -0.5, 0.5);
    this._blinkT -= dt;
    if (this._blinkT <= 0) { this._blinkT = 2 + Math.random() * 3; this.blink = 0; }
    this.blink = Math.min(1, this.blink + dt * 7);
  }

  render(ctx, t) {
    ctx.save(); ctx.translate(this.x, this.y);
    if (this.caught) ctx.rotate(Math.sin(t * 18) * 0.12); // thrash in the net
    ctx.scale(this.face, 1); ctx.rotate(this.pitch);
    const flashing = this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0;
    if (flashing) ctx.globalAlpha = 0.45;
    drawSunfish(ctx, this.r, t, {
      flap: this.flap, blink: this.blink, hurt: this.hurt, lookX: 1,
      mouth: this.mouth, dash: this.dashT > 0,
    });
    ctx.globalAlpha = 1; ctx.restore();
  }
}

// -------------------------------------------------------------------- Seal
export class Seal {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.r = 46;
    this.state = 'patrol'; this.t = 0; this.face = -1; this.mouth = 0;
    this.chaseT = 0; this.lungeDir = { x: -1, y: 0 }; this.dead = false; this.biteCD = 0;
    this.homeY = y;
  }
  update(dt, env) {
    this.t += dt; this.biteCD = Math.max(0, this.biteCD - dt);
    const p = env.player;
    const d = dist(this.x, this.y, p.x, p.y);
    this.face = p.x < this.x ? -1 : 1;

    switch (this.state) {
      case 'patrol': {
        this.vx = Math.sin(this.t * 0.8) * 40;
        this.vy = (this.homeY - this.y) * 0.6 + Math.sin(this.t * 0.5) * 20;
        if (d < SEAL.detectRange && p.alive) { this.state = 'chase'; this.chaseT = 0; }
        break;
      }
      case 'chase': {
        this.chaseT += dt;
        const a = Math.atan2(p.y - this.y, p.x - this.x);
        this.vx = Math.cos(a) * SEAL.speed; this.vy = Math.sin(a) * SEAL.speed;
        if (d < 150) { this.state = 'windup'; this.t = 0; this.mouth = 0; }
        else if (this.chaseT > SEAL.giveUp) this.state = 'leaving';
        break;
      }
      case 'windup': {
        this.vx *= 0.8; this.vy *= 0.8;
        this.mouth = Math.min(1, this.mouth + dt / SEAL.lungeWindup);
        if (this.t >= SEAL.lungeWindup) {
          const a = Math.atan2(p.y - this.y, p.x - this.x);
          this.lungeDir = { x: Math.cos(a), y: Math.sin(a) };
          this.state = 'lunge'; this.t = 0;
        }
        break;
      }
      case 'lunge': {
        this.vx = this.lungeDir.x * SEAL.lungeSpeed;
        this.vy = this.lungeDir.y * SEAL.lungeSpeed;
        if (this.t >= SEAL.lungeDur) { this.state = 'rest'; this.t = 0; }
        break;
      }
      case 'rest': {
        this.vx *= 0.9; this.vy *= 0.9; this.mouth = Math.max(0, this.mouth - dt * 2);
        if (this.t >= SEAL.rest) {
          this.state = (d < SEAL.detectRange && p.alive) ? 'chase' : 'leaving';
          this.chaseT = 0;
        }
        break;
      }
      case 'leaving': {
        this.vx = lerp(this.vx, this.face * 40, dt); this.vy = lerp(this.vy, 120, dt * 2);
        break;
      }
    }
    // keep within the water column
    this.y = clamp(this.y + this.vy * dt, WATER.surfaceBand, REF_H - WATER.seabedBand * 0.5);
    this.x += this.vx * dt;
  }
  // mouth tip world position for bite checks
  bitePoint() { return { x: this.x + this.face * this.r * 1.1, y: this.y }; }
  canBite() { return (this.state === 'lunge' || this.state === 'chase') && this.biteCD <= 0; }
  render(ctx, t) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.face, 1);
    // windup telegraph
    if (this.state === 'windup') {
      const a = 0.3 + 0.4 * Math.sin(t * 22);
      ctx.fillStyle = rgba('#ffdf7a', a);
      ctx.beginPath(); ctx.arc(this.r * 1.0, -this.r * 0.9, 5 + 3 * Math.sin(t * 22), 0, TAU); ctx.fill();
      ctx.fillStyle = rgba('#ffdf7a', a);
      ctx.fillRect(this.r * 0.9, -this.r * 1.4, 3, 8);
    }
    drawSeal(ctx, this.r, t, { mouth: this.mouth });
    ctx.restore();
  }
}

// -------------------------------------------------------------------- Boat
export class Boat {
  constructor(x, dir) {
    this.x = x; this.dir = dir; this.w = 240; this.r = 130;
    this.netW = this.w * 1.25; this.netD = BOAT.netDepth;
    this.y = BOAT.hullY; this.t = 0;
  }
  get hullY() { return this.y + Math.sin(this.t * 1.5) * 6; }
  update(dt) { this.t += dt; this.x += this.dir * BOAT.speed * dt; }
  // net snare rectangle in world space (below the hull)
  netBounds() {
    return { x0: this.x - this.netW / 2, x1: this.x + this.netW / 2, y0: this.hullY + 30, y1: this.hullY + 30 + this.netD };
  }
  propPoint() { return { x: this.x - this.dir * this.w * 0.46, y: this.hullY + this.w * 0.16 }; }
  render(ctx, t, caughtFish) {
    const hy = this.hullY;
    // net first (behind hull)
    ctx.save(); ctx.translate(this.x, hy + 30);
    drawNet(ctx, this.netW, this.netD, t, caughtFish ? 0.8 : 0);
    ctx.restore();
    // hull
    ctx.save(); ctx.translate(this.x, hy); ctx.scale(this.dir, 1);
    drawBoat(ctx, this.w, t);
    ctx.restore();
    // propeller wake glint
    const pp = this.propPoint();
    ctx.fillStyle = rgba(P.foam, 0.25);
    ctx.beginPath(); ctx.arc(pp.x, pp.y, BOAT.propRadius * (1 + 0.1 * Math.sin(t * 30)), 0, TAU); ctx.fill();
  }
}

// --------------------------------------------------------------- Jellyfish
export class Jelly {
  constructor(x, y) { this.x = x; this.y = y; this.r = 40; this.t = Math.random() * 6; this.driftX = (Math.random() - 0.5) * 30; this.dead = false; }
  get hitR() { return this.r * 0.8; }
  update(dt) {
    this.t += dt;
    this.x += (this.driftX + Math.sin(this.t * 0.8) * 18) * dt;
    this.y -= JELLY.driftSpeed * dt * (0.7 + 0.3 * Math.sin(this.t));
    if (this.y < WATER.surfaceBand - 60) this.dead = true;
  }
  render(ctx, t) { ctx.save(); ctx.translate(this.x, this.y); drawJelly(ctx, this.r, this.t); ctx.restore(); }
}

// ------------------------------------------------------------------- Rock
export class Rock {
  constructor(x, y, r, seed) { this.x = x; this.y = y; this.r = r; this.seed = seed; }
  get hitR() { return this.r * 0.7; }
  render(ctx) { ctx.save(); ctx.translate(this.x, this.y); drawRock(ctx, this.r, this.seed); ctx.restore(); }
}

// ---------------------------------------------------------------- Plankton
export class Plankton {
  constructor(x, y, big = false) { this.x = x; this.y = y; this.r = big ? 26 : 17; this.value = big ? 5 : 1; this.t = Math.random() * 6; this.dead = false; this.baseY = y; }
  update(dt) { this.t += dt; this.y = this.baseY + Math.sin(this.t * 1.5) * 10; }
  render(ctx) { ctx.save(); ctx.translate(this.x, this.y); drawPlankton(ctx, this.r, this.t); ctx.restore(); }
}

// ------------------------------------------------------------------ Kelp (decoration, parallax)
export class Kelp {
  constructor(x, h, seed) { this.x = x; this.h = h; this.seed = seed; }
  render(ctx, t) { ctx.save(); ctx.translate(this.x, REF_H - WATER.seabedBand + 10); drawKelp(ctx, this.h, t, this.seed); ctx.restore(); }
}

// ------------------------------------------------------- Current (push field)
export class Current {
  constructor(x0, x1, y0, y1, fx, fy) { this.x0 = x0; this.x1 = x1; this.y0 = y0; this.y1 = y1; this.fx = fx; this.fy = fy; }
  contains(x, y) { return x > this.x0 && x < this.x1 && y > this.y0 && y < this.y1; }
}

// --------------------------------------------------------- Particle pool
export class Particles {
  constructor(max = 360) {
    this.max = max; this.pool = new Array(max);
    for (let i = 0; i < max; i++) this.pool[i] = { life: 0 };
    this.head = 0;
  }
  spawn(x, y, kind, vx = 0, vy = 0, opts = {}) {
    const pr = this.pool[this.head]; this.head = (this.head + 1) % this.max;
    pr.x = x; pr.y = y; pr.vx = vx; pr.vy = vy; pr.kind = kind;
    pr.life = pr.maxLife = opts.life ?? (kind === 'bubble' ? 2.4 : 0.8);
    pr.size = opts.size ?? (kind === 'bubble' ? 2 + Math.random() * 4 : 3 + Math.random() * 4);
    pr.color = opts.color ?? null; pr.seed = Math.random() * 100;
  }
  burst(x, y, kind, n, spd, opts) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = spd * (0.4 + Math.random() * 0.6);
      this.spawn(x, y, kind, Math.cos(a) * s, Math.sin(a) * s, opts);
    }
  }
  update(dt) {
    for (const pr of this.pool) {
      if (pr.life <= 0) continue;
      pr.life -= dt;
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      if (pr.kind === 'bubble') { pr.vy -= 26 * dt; pr.x += Math.sin((pr.maxLife - pr.life) * 6 + pr.seed) * 14 * dt; pr.vx *= 0.98; }
      else if (pr.kind === 'inkpuff') { pr.vx *= 0.9; pr.vy *= 0.9; }
      else if (pr.kind === 'sparkle') { pr.vy += 40 * dt; pr.vx *= 0.96; }
      else if (pr.kind === 'egg') { pr.vy -= 8 * dt; pr.vx *= 0.99; }
      else if (pr.kind === 'foam') { pr.vy += 60 * dt; }
    }
  }
  render(ctx) {
    for (const pr of this.pool) {
      if (pr.life <= 0) continue;
      const a = clamp(pr.life / pr.maxLife, 0, 1);
      if (pr.kind === 'bubble') {
        ctx.strokeStyle = rgba('#dff3f7', a * 0.7); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.size, 0, TAU); ctx.stroke();
      } else if (pr.kind === 'inkpuff') {
        ctx.fillStyle = rgba('#16302f', a * 0.5);
        ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.size * (1.4 - a), 0, TAU); ctx.fill();
      } else if (pr.kind === 'sparkle') {
        ctx.fillStyle = rgba(pr.color || '#ffd97a', a);
        ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.size * a, 0, TAU); ctx.fill();
      } else if (pr.kind === 'egg') {
        ctx.save(); ctx.translate(pr.x, pr.y); ctx.globalAlpha = a; drawEgg(ctx, pr.size); ctx.restore(); ctx.globalAlpha = 1;
      } else if (pr.kind === 'foam') {
        ctx.fillStyle = rgba('#eaf6f7', a * 0.8);
        ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.size, 0, TAU); ctx.fill();
      }
    }
  }
}
