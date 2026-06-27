// Game entities: the player sunfish, hazards, predators, pickups, currents,
// particles. All positions/speeds are in WORLD UNITS (see config.js). Self-
// motion lives here; cross-entity collisions are resolved centrally in game.js.
import {
  REF_H, WATER, FISH, DASH, COMBAT, STATUS, SEAL, SHARK, BARRACUDA, ANGLER,
  PUFFER, SQUID, JELLY, BOAT, MINE, URCHIN, SWORDFISH, COOKIE, ORCA, COPEPOD,
  SEAGULL, PLASTIC, LIONFISH, MORAY, TORPEDO, CRAB, GROUPER, WHIRLPOOL, VENT,
  NURSE, PALETTE as P,
} from './config.js';
import { clamp, lerp, TAU, dist, rgba, hash1 } from './utils.js';
import {
  drawSunfish, drawSeal, drawShark, drawBarracuda, drawAngler, drawPuffer,
  drawSquid, drawSwordfish, drawCookiecutter, drawOrca, drawCopepod,
  drawSeagull, drawBag, drawBooster, drawBoat, drawNet, drawRock, drawCoral,
  drawAnchor, drawUrchin, drawHook, drawMine, drawKelp, drawJelly,
  drawPlankton, drawEgg, drawLionfish, drawMoray, drawElectricRay, drawCrab,
  drawGrouper, drawWhirlpool, drawSeaVent, drawNurseShark,
} from './sprites.js';

export const surfaceLimit = (r) => WATER.surfaceBand + r * 0.4;
export const seabedLimit = (r) => REF_H - WATER.seabedBand - r * 0.4;
const colClampY = (y, m = 0) => clamp(y, WATER.surfaceBand + m, REF_H - WATER.seabedBand - m);

// ------------------------------------------------------------------- Player
export class Player {
  constructor(stats) {
    this.x = 120; this.y = REF_H * 0.5;
    this.vx = 0; this.vy = 0;
    this.r = FISH.radius;
    this.skin = null;
    this.applyStats(stats);
    this.hp = this.maxHp;
    this.face = 1; this.pitch = 0; this.flap = 0; this.blink = 1; this._blinkT = 2;
    this.dashT = 0; this.dashCD = 0; this.invuln = 0; this.hurt = 0; this.mouth = 0;
    this.stun = 0;
    // statuses
    this.slow = 0; this.poison = 0; this.poisonT = 0; this.parasites = 0; this.paraT = 0;
    this.heal = 0; this.healT = 0; this.swift = 0; this.shield = 0;
    this.wounds = [];                 // cookiecutter bite marks (cosmetic gore)
    this.caught = null; this.haul = 0; this.escape = 0; this.netDrain = 0;
    this.grabbed = null; this.grabT = 0; this.grabEsc = 0;
    this.alive = true;
    // velocity wake: a short ring buffer of {x,y,r,a} ghost discs
    this.trail = []; this._trailT = 0; this.trailMax = 14;
    this._pvx = 0; this._pvy = 0;            // previous-frame velocity (for accel)
    // procedural animation springs (secondary motion)
    this.sq = 1; this.sqV = 0;               // squash/stretch scale along travel
    this.bend = 0; this.bendV = 0;           // body bend (radians) from turning
    this.tailLag = 0; this.finLag = 0;       // lagged tail/clavus + fin sway
    this._pdir = 0;                          // previous heading for turn-rate
  }
  applyStats(s) {
    this.stats = s;
    this.maxHp = s.maxHp;
    this.speed = FISH.maxSpeed * s.speedMul;
    this.freq = FISH.followFreq * s.freqMul;
    this.slipLevel = s.slipLevel || 0;
    this.magnetLevel = s.magnetLevel || 0;
    this.armorLevel = s.armorLevel || 0;
  }
  get hitR() { return this.r * FISH.hitboxScale; }
  get captured() { return !!(this.caught || this.grabbed); }

  tryDash(dir, audio, particles) {
    if (this.stats.dashLevel <= 0 || this.dashCD > 0 || this.captured || this.stun > 0) return;
    this.dashT = DASH.dur;
    this.dashCD = DASH.cooldown * (1 - (this.stats.dashLevel - 1) * 0.18);
    this.invuln = Math.max(this.invuln, DASH.iframes + (this.stats.dashLevel - 1) * 0.06);
    const imp = DASH.impulse * (0.85 + this.stats.dashLevel * 0.15);
    this.vx += dir.x * imp; this.vy += dir.y * imp;
    audio.sfx('dash');
    for (let i = 0; i < 10; i++) particles.spawn(this.x - dir.x * this.r, this.y - dir.y * this.r, 'bubble', -dir.x * 60 + (Math.random() - 0.5) * 60, -dir.y * 60 + (Math.random() - 0.5) * 60);
  }

  hit(dmg, kx, ky, audio, particles) {
    if (this.invuln > 0 || this.shield > 0 || !this.alive) return false;
    this.hp -= dmg;
    this.invuln = COMBAT.hitIFrames * (1 + this.armorLevel * 0.28);
    this.hurt = 1; this.vx += kx; this.vy += ky;
    audio.sfx('hurt');
    for (let i = 0; i < 16; i++) particles.spawn(this.x, this.y, 'blood', (Math.random() - 0.5) * 240, (Math.random() - 0.5) * 240);
    particles.burst(this.x, this.y, 'gore', 4, 70);
    if (Math.random() < 0.5) this.addWound(true);   // a fresh cut to remember it by
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    return true;
  }
  // damage-over-time (poison, parasites, the net) — bypasses i-frames, not shield
  tickDamage(dmg, particles) {
    if (!this.alive || this.shield > 0) return;
    this.hp -= dmg; this.hurt = 1;
    if (particles) for (let i = 0; i < 7; i++) particles.spawn(this.x, this.y, 'blood', (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120);
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
  }
  stunFor(s) { this.stun = Math.max(this.stun, s); }
  applyBoost(type) {
    // 'nurse' is handled in game.js (attaches a pet); no passive regen.
    if (type === 'swift') { this.swift = STATUS.swiftTime; }
    else if (type === 'shield') { this.shield = STATUS.shieldTime; }
  }
  addWound(cut = false) {
    const a = (Math.random() < 0.6 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.9;
    this.wounds.push({ a, r: (cut ? 0.16 : 0.2) + Math.random() * 0.12, cut });
    if (this.wounds.length > 8) this.wounds.shift();
  }

  update(dt, target, particles) {
    const pvx = this._pvx, pvy = this._pvy;   // last frame's velocity (for accel)
    this.dashCD = Math.max(0, this.dashCD - dt);
    this.dashT = Math.max(0, this.dashT - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.hurt = Math.max(0, this.hurt - dt * 2.2);
    // status timers (run even while captured)
    this.slow = Math.max(0, this.slow - dt);
    this.swift = Math.max(0, this.swift - dt);
    this.shield = Math.max(0, this.shield - dt);
    if (this.heal > 0) { this.heal -= dt; this.healT -= dt; if (this.healT <= 0) { this.healT = STATUS.healTick; if (this.hp < this.maxHp) { this.hp++; if (particles) for (let i = 0; i < 6; i++) particles.spawn(this.x, this.y - this.r * 0.4, 'sparkle', (Math.random() - 0.5) * 70, -50, { color: '#aef0c0' }); } } }
    if (this.poison > 0) { this.poison -= dt; this.poisonT -= dt; if (this.poisonT <= 0) { this.poisonT = STATUS.poisonTick; this.tickDamage(STATUS.poisonDmg, particles); } }

    if (this.captured) { this.mouth = 0; this._animate(dt, 0.4); return; }

    const slowF = this.slow > 0 ? STATUS.slowMul : 1;
    const swiftF = this.swift > 0 ? STATUS.swiftMul : 1;
    // open wounds drag you down — a battered fish swims slow and sluggish
    const woundMul = clamp(1 - this.wounds.length * STATUS.woundSlowPer, 1 - STATUS.woundSlowMax, 1);
    const effSpeed = this.speed * slowF * swiftF * woundMul;
    const effFreq = this.freq * (this.slow > 0 ? 0.72 : 1) * (0.8 + 0.2 * woundMul);

    const steering = target && target.active && this.stun <= 0;
    if (steering) {
      const f = effFreq;
      this.vx += (f * f * (target.x - this.x) - 2 * f * this.vx) * dt;
      this.vy += (f * f * (target.y - this.y) - 2 * f * this.vy) * dt;
    }
    const drag = FISH.dragPerSec * (steering ? 0.12 : (this.stun > 0 ? 1.8 : 1));
    this.vx -= this.vx * drag * dt; this.vy -= this.vy * drag * dt;

    const sp = Math.hypot(this.vx, this.vy);
    const max = effSpeed * (this.dashT > 0 ? 2.1 : 1);
    if (sp > max) { this.vx *= max / sp; this.vy *= max / sp; }

    this.x += this.vx * dt; this.y += this.vy * dt;
    const top = surfaceLimit(this.r), bot = seabedLimit(this.r);
    if (this.y < top) { this.y = top; this.vy *= -0.3; }
    if (this.y > bot) { this.y = bot; this.vy *= -0.3; }
    if (this.x < 60) { this.x = 60; this.vx = Math.max(0, this.vx); }

    this.mouth = Math.max(0, this.mouth - dt * 3);
    this._animate(dt, Math.min(1, sp / Math.max(1, this.speed)));
    if (Math.random() < 0.04) particles.spawn(this.x + this.r * 0.4, this.y - this.r * 0.2, 'bubble', 6, -20);
    // open wounds keep weeping blood
    if (this.wounds.length && Math.random() < 0.03 * this.wounds.length + (this.hurt > 0.4 ? 0.16 : 0))
      particles.spawn(this.x + (Math.random() - 0.5) * this.r, this.y + (Math.random() - 0.3) * this.r, 'blood', (Math.random() - 0.5) * 30, 30 + Math.random() * 40, { life: 1.2, size: 2 + Math.random() * 3 });

    // --- swim wake: drop a fading ghost disc when moving, spaced in time ---
    this._trailT -= dt;
    const moveSp = Math.hypot(this.vx, this.vy);
    if (moveSp > 40 && this._trailT <= 0) {
      this._trailT = 0.04;
      const inv = 1 / (moveSp || 1);
      const bx = this.x - this.vx * inv * this.r * 0.5;
      const by = this.y - this.vy * inv * this.r * 0.5;
      this.trail.push({ x: bx, y: by, r: this.r * (0.5 + 0.4 * clamp(moveSp / this.speed, 0, 1)), a: 1 });
      if (this.trail.length > this.trailMax) this.trail.shift();
    }
    for (const g of this.trail) g.a -= dt * 2.2;
    while (this.trail.length && this.trail[0].a <= 0) this.trail.shift();

    // --- thrust bubbles when accelerating hard (a kick of effort) ---
    const ax = (this.vx - pvx), ay = (this.vy - pvy);
    const accel = Math.hypot(ax, ay) / Math.max(dt, 1e-4);
    if (accel > 900 && particles) {
      const sp3 = moveSp || 1;
      const bx = this.x - (this.vx / sp3) * this.r * 0.8;
      const by = this.y - (this.vy / sp3) * this.r * 0.8;
      const n = accel > 2000 ? 3 : 1;
      for (let i = 0; i < n; i++)
        particles.spawn(bx + (Math.random() - 0.5) * this.r * 0.4, by + (Math.random() - 0.5) * this.r * 0.4,
          'wake', -(this.vx / sp3) * 40 + (Math.random() - 0.5) * 40, -(this.vy / sp3) * 40 + (Math.random() - 0.5) * 40);
    }
    this._pvx = this.vx; this._pvy = this.vy;

    // --- procedural animation: drive springs from accel + turn-rate ---
    const sp2 = moveSp;
    const heading = sp2 > 8 ? Math.atan2(this.vy, this.vx) : this._pdir;
    let turn = heading - this._pdir;
    while (turn > Math.PI) turn -= TAU; while (turn < -Math.PI) turn += TAU;
    this._pdir = heading;
    const along = (ax * this.vx + ay * this.vy) / (Math.max(sp2, 1) * Math.max(dt, 1e-4));
    const sqTarget = clamp(1 + along * 0.00018, 0.82, 1.18);
    const ksq = 140, dsq = 14;
    this.sqV += ((sqTarget - this.sq) * ksq - this.sqV * dsq) * dt;
    this.sq += this.sqV * dt;
    const bendTarget = clamp(turn / Math.max(dt, 1e-4) * -0.06, -0.5, 0.5);
    const kb = 90, db = 11;
    this.bendV += ((bendTarget - this.bend) * kb - this.bendV * db) * dt;
    this.bend += this.bendV * dt;
    this.tailLag = lerp(this.tailLag, this.bend, clamp(dt * 8, 0, 1));
    this.finLag = lerp(this.finLag, this.bend, clamp(dt * 5, 0, 1));
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
    // velocity wake (world space, behind the body)
    if (this.trail.length) {
      ctx.save();
      for (const g of this.trail) {
        const a = clamp(g.a, 0, 1);
        ctx.fillStyle = rgba('#dff3f7', a * 0.10);
        ctx.beginPath(); ctx.arc(g.x, g.y, g.r * (1.0 + (1 - a) * 0.6), 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    ctx.save(); ctx.translate(this.x, this.y);
    if (this.shield > 0) {
      ctx.strokeStyle = rgba('#bfe9f0', 0.35 + 0.2 * Math.sin(t * 8)); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, this.r * 1.55, 0, TAU); ctx.stroke();
      ctx.fillStyle = rgba('#bfe9f0', 0.07); ctx.fill();
    }
    if (this.captured) ctx.rotate(Math.sin(t * 18) * 0.12);
    else if (this.stun > 0) ctx.rotate(Math.sin(t * 26) * 0.08 * this.stun);
    ctx.scale(this.face, 1); ctx.rotate(this.pitch);
    // squash/stretch: scale along travel (x), conserve area on y
    const sq = this.sq; ctx.scale(sq, 1 / sq);
    const flashing = this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0;
    if (flashing) ctx.globalAlpha = 0.45;
    const ratio = this.hp / Math.max(1, this.maxHp);
    const sad = clamp((this.hp <= 1 ? 1 : ratio < 0.5 ? 0.6 : 0.25) + this.hurt * 0.5, 0, 1);
    drawSunfish(ctx, this.r, t, {
      flap: this.flap, blink: this.blink, hurt: this.hurt, lookX: 1, mouth: this.mouth,
      dash: this.dashT > 0, skin: this.skin, wounds: this.wounds, sad,
      poison: this.poison > 0, parasites: this.parasites,
      bend: this.bend, tailLag: this.tailLag, finLag: this.finLag,
    });
    ctx.globalAlpha = 1; ctx.restore();
  }
}

// small shared wind-up telegraph spark (drawn in the entity's flipped space)
function telegraph(ctx, t, r) {
  const a = 0.3 + 0.45 * Math.sin(t * 22);
  ctx.fillStyle = rgba('#ffdf7a', a);
  ctx.beginPath(); ctx.arc(r * 1.0, -r * 0.95, 5 + 3 * Math.sin(t * 22), 0, TAU); ctx.fill();
  ctx.fillRect(r * 0.92, -r * 1.45, 3, 8);
}

// -------------------------------------------------------- Sea lion (the seal)
// Nips at your fins and gives chase.
export class Seal {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.r = 46;
    this.kind = 'sealion'; this.damage = SEAL.damage; this.reach = 180;
    this.state = 'patrol'; this.t = 0; this.face = -1; this.mouth = 0;
    this.chaseT = 0; this.lungeDir = { x: -1, y: 0 }; this.dead = false; this.biteCD = 0; this.homeY = y;
  }
  update(dt, env) {
    this.t += dt; this.biteCD = Math.max(0, this.biteCD - dt);
    const p = env.player; const d = dist(this.x, this.y, p.x, p.y);
    this.face = p.x < this.x ? -1 : 1;
    switch (this.state) {
      case 'patrol':
        this.vx = Math.sin(this.t * 0.8) * 36; this.vy = (this.homeY - this.y) * 0.6 + Math.sin(this.t * 0.5) * 18;
        if (d < SEAL.detectRange && p.alive) { this.state = 'chase'; this.chaseT = 0; }
        break;
      case 'chase': {
        this.chaseT += dt;
        const a = Math.atan2(p.y - this.y, p.x - this.x);
        this.vx = Math.cos(a) * SEAL.speed; this.vy = Math.sin(a) * SEAL.speed;
        if (d < 150) { this.state = 'windup'; this.t = 0; this.mouth = 0; }
        else if (this.chaseT > SEAL.giveUp) this.state = 'leaving';
        break;
      }
      case 'windup':
        this.vx *= 0.8; this.vy *= 0.8; this.mouth = Math.min(1, this.mouth + dt / SEAL.lungeWindup);
        if (this.t >= SEAL.lungeWindup) { const a = Math.atan2(p.y - this.y, p.x - this.x); this.lungeDir = { x: Math.cos(a), y: Math.sin(a) }; this.state = 'lunge'; this.t = 0; }
        break;
      case 'lunge':
        this.vx = this.lungeDir.x * SEAL.lungeSpeed; this.vy = this.lungeDir.y * SEAL.lungeSpeed;
        if (this.t >= SEAL.lungeDur) { this.state = 'rest'; this.t = 0; }
        break;
      case 'rest':
        this.vx *= 0.9; this.vy *= 0.9; this.mouth = Math.max(0, this.mouth - dt * 2);
        if (this.t >= SEAL.rest) { this.state = (d < SEAL.detectRange && p.alive) ? 'chase' : 'leaving'; this.chaseT = 0; }
        break;
      case 'leaving':
        this.vx = lerp(this.vx, this.face * 40, dt); this.vy = lerp(this.vy, 120, dt * 2);
        break;
    }
    this.y = colClampY(this.y + this.vy * dt, this.r * 0.3); this.x += this.vx * dt;
  }
  bitePoint() { return { x: this.x + this.face * this.r * 1.1, y: this.y }; }
  canBite() { return (this.state === 'lunge' || this.state === 'chase') && this.biteCD <= 0; }
  telegraphing() { return this.state === 'windup'; }
  render(ctx, t) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.face, 1);
    if (this.state === 'windup') telegraph(ctx, t, this.r);
    drawSeal(ctx, this.r, t, { mouth: this.mouth });
    ctx.restore();
  }
}

// --------------------------------------------------- Blue shark (common) + Orca
// A shared charging-shark brain; `big` makes the rare orca boss.
export class Shark {
  constructor(x, y, opts = {}) {
    this.big = !!opts.big;
    const C = this.big ? ORCA : SHARK;
    this.C = C; this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.r = this.big ? 92 : 58;
    this.kind = this.big ? 'orca' : 'blueshark';
    this.color = this.big ? P.orca : P.blueShark;
    this.damage = C.damage; this.reach = C.reach;
    this.state = 'cruise'; this.t = 0; this.face = -1; this.mouth = 0;
    this.chaseT = 0; this.dir = { x: -1, y: 0 }; this.homeY = y; this.biteCD = 0; this.dead = false;
  }
  update(dt, env) {
    const C = this.C; this.t += dt; this.biteCD = Math.max(0, this.biteCD - dt);
    const p = env.player; const d = dist(this.x, this.y, p.x, p.y);
    if (this.state !== 'charge') this.face = p.x < this.x ? -1 : 1;
    switch (this.state) {
      case 'cruise':
        this.vx = this.face * C.cruise; this.vy = (this.homeY - this.y) * 0.8 + Math.sin(this.t * 0.6) * 16;
        if (d < C.detectRange && p.alive) { this.state = 'chase'; this.chaseT = 0; }
        break;
      case 'chase': {
        this.chaseT += dt;
        const a = Math.atan2(p.y - this.y, p.x - this.x);
        this.vx = Math.cos(a) * C.cruise * 1.7; this.vy = Math.sin(a) * C.cruise * 1.7;
        if (d < (this.big ? 360 : 300)) { this.state = 'windup'; this.t = 0; }
        else if (this.chaseT > 12) this.state = 'leaving';
        break;
      }
      case 'windup': {
        this.mouth = Math.min(1, this.mouth + dt / C.windup);
        const a = Math.atan2(p.y - this.y, p.x - this.x);
        this.vx = lerp(this.vx, -Math.cos(a) * 60, dt * 4); this.vy = lerp(this.vy, -Math.sin(a) * 60, dt * 4);
        this.dir = { x: Math.cos(a), y: Math.sin(a) };
        if (this.t >= C.windup) { this.state = 'charge'; this.t = 0; }
        break;
      }
      case 'charge':
        this.vx = this.dir.x * C.charge; this.vy = this.dir.y * C.charge; this.mouth = 1;
        if (this.t >= C.chargeDur) { this.state = 'rest'; this.t = 0; }
        break;
      case 'rest':
        this.vx *= 0.9; this.vy *= 0.9; this.mouth = Math.max(0, this.mouth - dt * 2);
        if (this.t >= C.rest) { this.state = (d < C.detectRange && p.alive) ? 'chase' : 'cruise'; this.chaseT = 0; }
        break;
      case 'leaving':
        this.vx = lerp(this.vx, this.face * C.cruise, dt); this.vy = lerp(this.vy, 0, dt);
        break;
    }
    this.y = colClampY(this.y + this.vy * dt, this.r * 0.3); this.x += this.vx * dt;
  }
  bitePoint() { return { x: this.x + this.face * this.r * 1.15, y: this.y + this.r * 0.25 }; }
  canBite() { return this.state === 'charge' && this.biteCD <= 0; }
  telegraphing() { return this.state === 'windup'; }
  render(ctx, t) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.face, 1);
    if (this.state === 'windup') telegraph(ctx, t, this.r);
    if (this.big) drawOrca(ctx, this.r, t, { mouth: this.mouth });
    else drawShark(ctx, this.r, t, { mouth: this.mouth, color: this.color });
    ctx.restore();
  }
}

// --------------------------------------------------------------- Barracuda
export class Barracuda {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.r = 30;
    this.kind = 'barracuda'; this.damage = BARRACUDA.damage; this.reach = 200;
    this.state = 'cruise'; this.t = 0; this.face = -1; this.mouth = 0;
    this.homeY = y; this.dir = { x: -1, y: 0 }; this.biteCD = 0; this.dead = false;
  }
  update(dt, env) {
    this.t += dt; this.biteCD = Math.max(0, this.biteCD - dt);
    const p = env.player; const d = dist(this.x, this.y, p.x, p.y);
    if (this.state !== 'dart') this.face = p.x < this.x ? -1 : 1;
    switch (this.state) {
      case 'cruise': {
        const inRange = d < BARRACUDA.detectRange && p.alive;
        const ty = inRange ? p.y : this.homeY;
        this.vy = lerp(this.vy, (ty - this.y) * 1.4, dt * 3);
        this.vx = lerp(this.vx, Math.sin(this.t * 1.2) * 30, dt * 3);
        if (inRange && Math.abs(p.y - this.y) < 50 && this.biteCD <= 0) { this.state = 'windup'; this.t = 0; this.dir = { x: p.x < this.x ? -1 : 1, y: 0 }; }
        break;
      }
      case 'windup':
        this.vx *= 0.85; this.vy *= 0.85;
        this.dir = { x: Math.cos(Math.atan2(p.y - this.y, p.x - this.x)), y: Math.sin(Math.atan2(p.y - this.y, p.x - this.x)) };
        if (this.t >= BARRACUDA.dartWindup) { this.state = 'dart'; this.t = 0; this.mouth = 1; }
        break;
      case 'dart':
        this.vx = this.dir.x * BARRACUDA.dart; this.vy = this.dir.y * BARRACUDA.dart;
        if (this.t >= BARRACUDA.dartDur) { this.state = 'rest'; this.t = 0; this.biteCD = 1.4; }
        break;
      case 'rest':
        this.vx *= 0.86; this.vy *= 0.86; this.mouth = Math.max(0, this.mouth - dt * 2);
        if (this.t >= BARRACUDA.rest) { this.state = 'cruise'; this.homeY = colClampY(p.y + (Math.random() - 0.5) * 160, 60); }
        break;
    }
    this.y = colClampY(this.y + this.vy * dt, this.r); this.x += this.vx * dt;
  }
  bitePoint() { return { x: this.x + this.face * this.r * 1.3, y: this.y }; }
  canBite() { return this.state === 'dart'; }
  telegraphing() { return this.state === 'windup'; }
  render(ctx, t) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.face, 1);
    if (this.state === 'windup') ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 30);
    drawBarracuda(ctx, this.r, t, { mouth: this.mouth }); ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// -------------------------------------------------------------- Anglerfish
// Lurks almost motionless in the dark, lamp glowing. Wakes only when you stray
// into its little circle of light, then lunges. High damage, low mobility.
export class Angler {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.r = 46;
    this.kind = 'angler'; this.damage = ANGLER.damage; this.reach = 200;
    this.state = 'lurk'; this.t = 0; this.face = -1; this.mouth = 0; this.lure = 1;
    this.dir = { x: -1, y: 0 }; this.biteCD = 0; this.homeY = y; this.dead = false;
  }
  update(dt, env) {
    this.t += dt; this.biteCD = Math.max(0, this.biteCD - dt);
    const p = env.player; const d = dist(this.x, this.y, p.x, p.y);
    this.face = p.x < this.x ? -1 : 1;
    switch (this.state) {
      case 'lurk':
        this.vx = Math.sin(this.t * 0.5) * 10; this.vy = (this.homeY - this.y) * 0.5 + Math.sin(this.t * 0.4) * 8;
        this.lure = 0.7 + 0.3 * Math.sin(this.t * 2);
        if (d < ANGLER.lureRange && p.alive && this.biteCD <= 0) { this.state = 'windup'; this.t = 0; }
        break;
      case 'windup':
        this.vx *= 0.8; this.vy *= 0.8; this.lure = Math.max(0.1, this.lure - dt * 2); this.mouth = Math.min(1, this.mouth + dt / ANGLER.lungeWindup);
        if (this.t >= ANGLER.lungeWindup) { const a = Math.atan2(p.y - this.y, p.x - this.x); this.dir = { x: Math.cos(a), y: Math.sin(a) }; this.state = 'lunge'; this.t = 0; }
        break;
      case 'lunge':
        this.vx = this.dir.x * ANGLER.lungeSpeed; this.vy = this.dir.y * ANGLER.lungeSpeed;
        if (this.t >= ANGLER.lungeDur) { this.state = 'rest'; this.t = 0; this.biteCD = 1.6; }
        break;
      case 'rest':
        this.vx *= 0.88; this.vy *= 0.88; this.mouth = Math.max(0, this.mouth - dt * 1.6); this.lure = lerp(this.lure, 1, dt);
        if (this.t >= ANGLER.rest) this.state = 'lurk';
        break;
    }
    this.y = colClampY(this.y + this.vy * dt, this.r * 0.4); this.x += this.vx * dt;
  }
  bitePoint() { return { x: this.x + this.face * this.r * 0.8, y: this.y + this.r * 0.35 }; }
  canBite() { return this.state === 'lunge'; }
  telegraphing() { return this.state === 'windup'; }
  render(ctx, t) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.face, 1);
    drawAngler(ctx, this.r, t, { mouth: this.mouth, lure: this.lure });
    ctx.restore();
  }
}

// --------------------------------------------------------------- Swordfish
// Early, easy predator: telegraphs a long line, then lunges dead straight.
export class Swordfish {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.r = 40;
    this.kind = 'swordfish'; this.damage = SWORDFISH.damage; this.reach = SWORDFISH.reach;
    this.state = 'cruise'; this.t = 0; this.face = -1; this.homeY = y; this.dir = { x: -1, y: 0 }; this.biteCD = 0; this.dead = false;
  }
  update(dt, env) {
    this.t += dt; this.biteCD = Math.max(0, this.biteCD - dt);
    const p = env.player; const d = dist(this.x, this.y, p.x, p.y);
    if (this.state !== 'lunge') this.face = p.x < this.x ? -1 : 1;
    switch (this.state) {
      case 'cruise': {
        const inRange = d < SWORDFISH.detectRange && p.alive;
        const ty = inRange ? p.y : this.homeY;
        this.vy = lerp(this.vy, (ty - this.y) * 1.0, dt * 2);
        this.vx = lerp(this.vx, this.face * SWORDFISH.cruise, dt * 2);
        if (inRange && Math.abs(p.y - this.y) < 60 && this.biteCD <= 0) { this.state = 'windup'; this.t = 0; }
        break;
      }
      case 'windup':
        this.vx *= 0.8; this.vy *= 0.8;
        this.dir = { x: this.face, y: clamp((p.y - this.y) / 300, -0.25, 0.25) };
        if (this.t >= SWORDFISH.windup) { this.state = 'lunge'; this.t = 0; }
        break;
      case 'lunge':
        this.vx = this.dir.x * SWORDFISH.lungeSpeed; this.vy = this.dir.y * SWORDFISH.lungeSpeed;
        if (this.t >= SWORDFISH.lungeDur) { this.state = 'rest'; this.t = 0; this.biteCD = 1.5; }
        break;
      case 'rest':
        this.vx *= 0.9; this.vy *= 0.9;
        if (this.t >= SWORDFISH.rest) { this.state = 'cruise'; this.homeY = colClampY(p.y + (Math.random() - 0.5) * 200, 80); }
        break;
    }
    this.y = colClampY(this.y + this.vy * dt, this.r * 0.4); this.x += this.vx * dt;
  }
  bitePoint() { return { x: this.x + this.face * this.r * 1.7, y: this.y }; }
  canBite() { return this.state === 'lunge'; }
  telegraphing() { return this.state === 'windup'; }
  render(ctx, t) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.face, 1);
    drawSwordfish(ctx, this.r, t, { lunging: this.state === 'lunge' });
    ctx.restore();
  }
}

// ------------------------------------------------------- Cookiecutter shark
// Tiny, very fast; takes a circular bite (a "cookie" wound) and zips away.
export class Cookiecutter {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.r = 22;
    this.kind = 'cookiecutter'; this.damage = COOKIE.damage; this.reach = COOKIE.reach;
    this.state = 'cruise'; this.t = 0; this.face = -1; this.dir = { x: -1, y: 0 }; this.biteCD = 0; this.dead = false;
  }
  update(dt, env) {
    this.t += dt; this.biteCD = Math.max(0, this.biteCD - dt);
    const p = env.player; const d = dist(this.x, this.y, p.x, p.y);
    if (this.state !== 'dart') this.face = p.x < this.x ? -1 : 1;
    switch (this.state) {
      case 'cruise': {
        if (d < COOKIE.detectRange && p.alive) {
          const a = Math.atan2(p.y - this.y, p.x - this.x);
          this.vx = Math.cos(a) * COOKIE.cruise; this.vy = Math.sin(a) * COOKIE.cruise;
          if (d < 150 && this.biteCD <= 0) { this.state = 'windup'; this.t = 0; }
        } else { this.vx = this.face * 40; this.vy = Math.sin(this.t) * 30; }
        break;
      }
      case 'windup':
        this.vx *= 0.7; this.vy *= 0.7;
        this.dir = { x: Math.cos(Math.atan2(p.y - this.y, p.x - this.x)), y: Math.sin(Math.atan2(p.y - this.y, p.x - this.x)) };
        if (this.t >= COOKIE.windup) { this.state = 'dart'; this.t = 0; }
        break;
      case 'dart':
        this.vx = this.dir.x * COOKIE.dartSpeed; this.vy = this.dir.y * COOKIE.dartSpeed;
        if (this.t >= COOKIE.dartDur) { this.state = 'rest'; this.t = 0; this.biteCD = COOKIE.rest; }
        break;
      case 'rest':
        this.vx *= 0.9; this.vy *= 0.9;
        if (this.t >= COOKIE.rest) this.state = 'cruise';
        break;
    }
    this.y = colClampY(this.y + this.vy * dt, this.r); this.x += this.vx * dt;
  }
  bitePoint() { return { x: this.x + this.dir.x * this.r * 1.2, y: this.y + this.dir.y * this.r * 1.2 }; }
  canBite() { return this.state === 'dart'; }
  telegraphing() { return this.state === 'windup'; }
  render(ctx, t) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.face, 1);
    drawCookiecutter(ctx, this.r, t, { biting: this.state === 'dart' });
    ctx.restore();
  }
}

// ------------------------------------------------------- Parasitic copepod
// Drifts in, latches on, and becomes a health-draining passenger (the game
// converts a contact into a player parasite). Removed by a diving seagull.
export class Copepod {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.r = 11;
    this.kind = 'copepod'; this.state = 'drift'; this.t = Math.random() * 5; this.dead = false; this.homeY = y;
  }
  update(dt, env) {
    this.t += dt; const p = env.player; const d = dist(this.x, this.y, p.x, p.y);
    if (d < COPEPOD.detectRange && p.alive) {
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      this.vx = Math.cos(a) * COPEPOD.speed; this.vy = Math.sin(a) * COPEPOD.speed;
    } else { this.vx = Math.sin(this.t * 0.7) * 24; this.vy = (this.homeY - this.y) * 0.4; }
    this.y = colClampY(this.y + this.vy * dt, this.r); this.x += this.vx * dt;
  }
  render(ctx, t) { ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.x % 2 < 1 ? -1 : 1, 1); drawCopepod(ctx, this.r, t); ctx.restore(); }
}

// ---------------------------------------------------------------- Seagull
// Dives from the surface at a parasite-ridden fish. Taking the hit clears the
// parasites (game handles contact). Leaves once it bottoms out.
export class Seagull {
  constructor(x, y) {
    this.x = x; this.y = WATER.surfaceBand - 70; this.vx = 0; this.vy = 0;
    this.state = 'dive'; this.t = 0; this.done = false; this.face = 1; this.target = { x, y };
  }
  update(dt, env) {
    this.t += dt; const p = env.player;
    if (this.state === 'dive') {
      const tx = p.alive ? p.x : this.target.x, ty = p.alive ? p.y : this.target.y;
      const a = Math.atan2(ty - this.y, tx - this.x);
      this.vx = Math.cos(a) * SEAGULL.diveSpeed; this.vy = Math.sin(a) * SEAGULL.diveSpeed;
      this.face = this.vx < 0 ? -1 : 1;
      if (this.t > 2.6) this.state = 'leave';   // keep tracking until it connects (you can't dodge the cure)
    } else {
      this.vy = -SEAGULL.diveSpeed * 0.8; this.vx = this.face * 120;
      if (this.y < WATER.surfaceBand - 90) this.done = true;
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
  }
  render(ctx, t) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.face, 1);
    ctx.rotate(Math.atan2(this.vy, Math.abs(this.vx) + 1) * 0.5);
    drawSeagull(ctx, 26, t, { diving: this.state === 'dive' });
    ctx.restore();
  }
}

// ----------------------------------------------------- Nurse shark (pet)
// A friendly companion picked up via the 'nurse' booster. Follows the player
// (lerps to an anchor behind/beside), does NOT heal during the run. At the
// spawning ground it heals the player to full, then swims away. Leaves on death.
export class NurseShark {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.r = NURSE.r;
    this.face = -1; this.t = 0;
    this.state = 'follow';        // 'follow' | 'healing' | 'leaving'
    this.side = 1;                // which side it tucks to
    this.healT = 0; this.leaveT = 0; this.dead = false;
  }
  anchor(p) {
    const behind = -p.face;       // opposite the way the fish points
    return { x: p.x + behind * NURSE.offBehind * p.r, y: p.y + this.side * NURSE.offSide * p.r };
  }
  update(dt, p, particles) {
    this.t += dt;
    if (this.state === 'leaving') {
      this.leaveT += dt;
      this.vx = lerp(this.vx, this.face * NURSE.leaveSpeed, dt * 2);
      this.vy = lerp(this.vy, -40, dt * 2);
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.leaveT > NURSE.leaveTime) this.dead = true;
      return;
    }
    const a = this.anchor(p);
    const k = clamp(dt * NURSE.followLerp, 0, 1);
    const nx = lerp(this.x, a.x, k), ny = lerp(this.y, a.y, k);
    this.vx = (nx - this.x) / Math.max(dt, 1e-4);
    this.vy = (ny - this.y) / Math.max(dt, 1e-4);
    this.x = nx; this.y = ny;
    if (Math.abs(this.vx) > 12) this.face = this.vx < 0 ? -1 : 1;
    if (this.state === 'healing') {
      this.healT -= dt;
      if (particles && Math.random() < 0.7)
        particles.spawn(p.x + (Math.random() - 0.5) * p.r, p.y - p.r * 0.3, 'sparkle', (Math.random() - 0.5) * 80, -60, { color: '#aef0c0' });
      if (this.healT <= 0) { this.state = 'leaving'; this.leaveT = 0; }
    }
  }
  beginLayHeal(p, particles) {
    p.hp = p.maxHp;
    this.state = 'healing'; this.healT = 0.9;
    if (particles) particles.burst(p.x, p.y, 'sparkle', 18, 140, { color: '#aef0c0' });
  }
  leave() { if (this.state !== 'leaving') { this.state = 'leaving'; this.leaveT = 0; } }
  render(ctx, t) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.face, 1);
    drawNurseShark(ctx, this.r, t, {});
    ctx.restore();
  }
}

// ------------------------------------------------------------------- Lionfish
// A slow, beautiful CONTACT hazard. It barely chases — it drifts and lazily
// creeps toward the player when close. It never lunges or bites; brushing its
// long venomous spines is what hurts you (1 dmg + poison), resolved by a
// dedicated collide() block in game.js. canBite()=>false keeps it out of
// handleBite() and the danger telegraph.
export class Lionfish {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.r = 40;
    this.kind = 'lionfish'; this.damage = LIONFISH.damage; this.reach = 0;
    this.state = 'drift'; this.t = 0; this.face = -1; this.flare = 0;
    this.biteCD = 0; this.homeY = y; this.dead = false;
  }
  update(dt, env) {
    const p = env.player; this.t += dt; this.biteCD = Math.max(0, this.biteCD - dt);
    const d = dist(this.x, this.y, p.x, p.y);
    this.face = p.x < this.x ? -1 : 1;
    const near = d < LIONFISH.detectRange && p.alive;
    this.flare = lerp(this.flare, near ? 1 : 0, dt * 2);
    const driftX = Math.sin(this.t * 0.5) * LIONFISH.driftSpeed;
    const creepX = near ? (p.x - this.x) * 0.18 : 0;
    const creepY = near ? (p.y - this.y) * 0.18 : 0;
    this.vx = lerp(this.vx, clamp(driftX + creepX, -LIONFISH.driftSpeed * 1.6, LIONFISH.driftSpeed * 1.6), dt * 2);
    this.vy = lerp(this.vy, (this.homeY - this.y) * 0.5 + Math.sin(this.t * 0.4) * 12 + creepY, dt * 2);
    this.y = colClampY(this.y + this.vy * dt, this.r * 0.4); this.x += this.vx * dt;
  }
  spinePoint() { return { x: this.x, y: this.y }; }
  get hitR() { return this.r * 1.35 * (0.85 + this.flare * 0.25); }
  canBite() { return false; }
  telegraphing() { return false; }
  render(ctx, t) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.face, 1);
    drawLionfish(ctx, this.r, t, { flare: this.flare });
    ctx.restore();
  }
}

// ------------------------------------------------------------------- Moray eel
// An ambush biter anchored in a seabed burrow. Lies hidden (only the head
// shows) until the player drifts within range at roughly its depth, then rears
// back (windup telegraph) and LUNGES forward in an extending S-curve, then
// retracts into the burrow. It never roams x.
export class Moray {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.r = 38;
    this.kind = 'moray'; this.damage = MORAY.damage; this.reach = MORAY.reach;
    this.state = 'lurk'; this.t = 0; this.face = -1; this.dead = false;
    this.biteCD = 0; this.homeY = y; this.extend = 0; this.mouth = 0; this.dir = { x: -1, y: 0 };
  }
  update(dt, env) {
    const C = MORAY; this.t += dt; this.biteCD = Math.max(0, this.biteCD - dt);
    const p = env.player; const d = dist(this.x, this.y, p.x, p.y);
    if (this.state === 'lurk' || this.state === 'windup') this.face = p.x < this.x ? -1 : 1;
    switch (this.state) {
      case 'lurk':
        this.vx = 0; this.vy = (this.homeY - this.y) * 0.6;
        this.extend = lerp(this.extend, 0, dt * 4); this.mouth = lerp(this.mouth, 0, dt * 5);
        if (d < C.detectRange && Math.abs(p.y - this.y) < C.reach && p.alive && this.biteCD <= 0) { this.state = 'windup'; this.t = 0; }
        break;
      case 'windup':
        this.vx *= 0.8; this.vy *= 0.8;
        this.extend = lerp(this.extend, 0, dt * 6); this.mouth = Math.min(1, this.mouth + dt / C.windup);
        if (this.t >= C.windup) { const a = Math.atan2(p.y - this.y, p.x - this.x); this.dir = { x: Math.cos(a), y: Math.sin(a) }; this.state = 'lunge'; this.t = 0; }
        break;
      case 'lunge': {
        const f = Math.min(1, this.t / C.lungeDur);
        this.extend = Math.sin(f * Math.PI);
        this.vx = this.dir.x * C.lungeSpeed * (1 - f);
        this.vy = this.dir.y * C.lungeSpeed * (1 - f) * 0.6;
        this.mouth = 1;
        if (this.t >= C.lungeDur) { this.state = 'rest'; this.t = 0; this.biteCD = 0.6; }
        break;
      }
      case 'rest':
        this.vx *= 0.8; this.vy = (this.homeY - this.y) * 0.8;
        this.extend = lerp(this.extend, 0, dt * 5); this.mouth = Math.max(0, this.mouth - dt * 3);
        if (this.t >= C.rest) this.state = 'lurk';
        break;
    }
    this.y = colClampY(this.y + this.vy * dt, this.r * 0.4); this.x += this.vx * dt;
  }
  bitePoint() {
    const ext = this.face * (0.5 + this.extend * 2.6) * this.r;
    return { x: this.x + ext, y: this.y + this.dir.y * this.extend * 1.4 * this.r };
  }
  canBite() { return this.state === 'lunge' && this.extend > 0.4 && this.biteCD <= 0; }
  telegraphing() { return this.state === 'windup'; }
  render(ctx, t) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.face, 1);
    if (this.state === 'windup') telegraph(ctx, t, this.r);
    drawMoray(ctx, this.r, t, {
      extend: this.extend, mouth: this.mouth,
      windup: this.state === 'windup' ? Math.min(1, this.t / MORAY.windup) : 0,
    });
    ctx.restore();
  }
}

// ----------------------------------------------------------- Electric ray
// A slow torpedo ray. Drifts and flaps until the player wanders inside
// detectRange, then CHARGES in place (telegraph), then DISCHARGES a radial
// shock. Contact during the brief discharge window deals 1 damage + stun; the
// threat is the shock radius, not a bite (handleBite skips kind 'torpedo';
// a dedicated radial check in collide() resolves the zap).
export class ElectricRay {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.r = 50;
    this.kind = 'torpedo'; this.damage = TORPEDO.damage; this.reach = TORPEDO.shockRadius;
    this.state = 'drift'; this.t = 0; this.face = -1;
    this.charge = 0; this.discharge = 0; this.shockR = 0;
    this.homeY = y; this.biteCD = 0; this.dead = false;
  }
  update(dt, env) {
    this.t += dt; this.biteCD = Math.max(0, this.biteCD - dt);
    const p = env.player; const d = dist(this.x, this.y, p.x, p.y);
    if (this.state === 'drift' || this.state === 'rest') this.face = p.x < this.x ? -1 : 1;
    switch (this.state) {
      case 'drift':
        this.vx = Math.sin(this.t * 0.5) * 26;
        this.vy = (this.homeY - this.y) * 0.5 + Math.sin(this.t * 0.4) * 12;
        this.charge = lerp(this.charge, 0, dt * 4); this.discharge = 0;
        if (d < TORPEDO.detectRange && p.alive && this.biteCD <= 0) { this.state = 'charge'; this.t = 0; }
        break;
      case 'charge':
        this.vx *= 0.86; this.vy *= 0.86;
        this.charge = Math.min(1, this.t / TORPEDO.chargeTime);
        if (this.t >= TORPEDO.chargeTime) { this.state = 'discharge'; this.t = 0; this.shockR = 0; }
        break;
      case 'discharge':
        this.vx *= 0.9; this.vy *= 0.9;
        this.discharge = 1 - this.t / TORPEDO.dischargeTime;
        this.shockR = TORPEDO.shockRadius * Math.min(1, this.t / TORPEDO.dischargeTime);
        this.charge = 1;
        if (this.t >= TORPEDO.dischargeTime) { this.state = 'rest'; this.t = 0; this.biteCD = TORPEDO.rest; }
        break;
      case 'rest':
        this.vx *= 0.9; this.vy *= 0.9;
        this.charge = lerp(this.charge, 0, dt * 3); this.discharge = 0;
        if (this.t >= TORPEDO.rest) this.state = 'drift';
        break;
    }
    this.y = colClampY(this.y + this.vy * dt, this.r * 0.4); this.x += this.vx * dt;
  }
  bitePoint() { return { x: this.x, y: this.y }; }
  shockRadius() { return TORPEDO.shockRadius; }
  canBite() { return this.state === 'discharge' && this.biteCD <= 0; }
  telegraphing() { return this.state === 'charge'; }
  render(ctx, t) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.face, 1);
    drawElectricRay(ctx, this.r, t, { charge: this.charge, discharge: this.discharge });
    ctx.restore();
  }
}

// ------------------------------------------------------------------- Crab
// A seabed scuttler: walks the floor with a stepping gait, claws idly open and
// shut. When the player drifts near AND low, it raises the crusher claw (windup
// telegraph) then SNAPS forward for a committed, dodgeable pinch. Stays pinned
// to the floor band.
export class Crab {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.r = 34;
    this.kind = 'crab'; this.damage = CRAB.damage; this.reach = CRAB.reach;
    this.state = 'cruise'; this.t = 0; this.face = -1; this.dead = false;
    this.biteCD = 0; this.homeY = y;
    this.walk = Math.random() * TAU; this.snap = 0; this.wind = 0; this.dir = { x: -1, y: 0 };
  }
  update(dt, env) {
    const p = env.player; this.t += dt; this.biteCD = Math.max(0, this.biteCD - dt);
    const d = dist(this.x, this.y, p.x, p.y);
    if (this.state !== 'snap') this.face = p.x < this.x ? -1 : 1;
    const floor = seabedLimit(this.r);
    const near = d < CRAB.detectRange && p.alive;
    const low = p.y > floor - CRAB.reach * 1.4;
    switch (this.state) {
      case 'cruise':
        this.vx = (near ? this.face * CRAB.speed : Math.sin(this.t * 0.7) * CRAB.speed * 0.5);
        this.vy = (this.homeY - this.y) * 2;
        this.snap = lerp(this.snap, 0, dt * 4); this.wind = lerp(this.wind, 0, dt * 6);
        if (near && low && d < CRAB.reach * 1.6 && this.biteCD <= 0) { this.state = 'windup'; this.t = 0; }
        break;
      case 'windup':
        this.vx *= 0.7; this.vy = (this.homeY - this.y) * 2;
        this.wind = Math.min(1, this.wind + dt / CRAB.windup);
        this.snap = lerp(this.snap, 0.15, dt * 6);
        this.dir = { x: this.face, y: 0 };
        if (this.t >= CRAB.windup) { this.state = 'snap'; this.t = 0; }
        break;
      case 'snap':
        this.vx = this.dir.x * CRAB.snapSpeed;
        this.vy = (this.homeY - this.y) * 2;
        this.wind = lerp(this.wind, 0, dt * 10);
        this.snap = Math.min(1, this.snap + dt / Math.max(0.001, CRAB.snapDur * 0.5));
        if (this.t >= CRAB.snapDur) { this.state = 'rest'; this.t = 0; this.biteCD = CRAB.rest; }
        break;
      case 'rest':
        this.vx *= 0.85; this.vy = (this.homeY - this.y) * 2;
        this.snap = lerp(this.snap, 0, dt * 3);
        if (this.t >= CRAB.rest) this.state = 'cruise';
        break;
    }
    this.walk += dt * (4 + Math.abs(this.vx) * 0.03);
    this.y = colClampY(this.y + this.vy * dt, this.r * 0.4); this.x += this.vx * dt;
  }
  bitePoint() { return { x: this.x + this.face * this.r * 1.3, y: this.y - this.r * 0.1 }; }
  canBite() { return this.state === 'snap' && this.biteCD <= 0; }
  telegraphing() { return this.state === 'windup'; }
  render(ctx, t) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.face, 1);
    if (this.state === 'windup') telegraph(ctx, t, this.r);
    drawCrab(ctx, this.r, t, { walk: this.walk, snap: this.snap, wind: this.wind, move: Math.min(1, Math.abs(this.vx) / 90) });
    ctx.restore();
  }
}

// --------------------------------------------------------------- Giant grouper
// A big, slow ambush gulper. Lurks nearly still, breathing. When the player
// drifts in FRONT of it and close, it opens a huge mouth (windup telegraph) and
// GULPS — a brief suction that drags the player toward the maw — then lunges
// forward a short way and snaps shut for a heavy 2-damage bite.
export class Grouper {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.r = 70;
    this.kind = 'grouper'; this.damage = GROUPER.damage; this.reach = GROUPER.reach;
    this.state = 'lurk'; this.t = 0; this.face = -1; this.gape = 0; this.suck = 0;
    this.dir = { x: -1, y: 0 }; this.biteCD = 0; this.homeY = y; this.dead = false;
  }
  update(dt, env) {
    this.t += dt; this.biteCD = Math.max(0, this.biteCD - dt);
    const p = env.player; const d = dist(this.x, this.y, p.x, p.y);
    if (this.state !== 'lunge') this.face = p.x < this.x ? -1 : 1;
    const inFront = (p.x - this.x) * this.face > -this.r * 0.3;
    switch (this.state) {
      case 'lurk':
        this.vx = lerp(this.vx, Math.sin(this.t * 0.4) * 10, dt * 2);
        this.vy = lerp(this.vy, (this.homeY - this.y) * 0.5 + Math.sin(this.t * 0.5) * 8, dt * 2);
        this.gape = lerp(this.gape, 0, dt * 3); this.suck = lerp(this.suck, 0, dt * 4);
        if (d < GROUPER.detectRange && inFront && p.alive && this.biteCD <= 0) { this.state = 'windup'; this.t = 0; }
        break;
      case 'windup': {
        this.vx = lerp(this.vx, -this.face * 24, dt * 4); this.vy = lerp(this.vy, 0, dt * 3);
        this.gape = Math.min(1, this.gape + dt / GROUPER.windup);
        this.suck = this.gape;
        const mp = this.bitePoint();
        const dx = mp.x - p.x, dy = mp.y - p.y, dl = Math.hypot(dx, dy) || 1;
        const falloff = clamp(1 - dl / (GROUPER.detectRange * 1.1), 0, 1);
        const pull = GROUPER.suction * falloff * this.gape * dt;
        if (p.alive && !p.captured) { p.vx += (dx / dl) * pull; p.vy += (dy / dl) * pull; }
        if (this.t >= GROUPER.windup) { const a = Math.atan2(p.y - this.y, p.x - this.x); this.dir = { x: Math.cos(a), y: Math.sin(a) }; this.state = 'lunge'; this.t = 0; }
        break;
      }
      case 'lunge':
        this.vx = this.dir.x * GROUPER.lungeSpeed; this.vy = this.dir.y * GROUPER.lungeSpeed;
        this.gape = 1; this.suck = lerp(this.suck, 0, dt * 6);
        if (this.t >= GROUPER.lungeDur) { this.state = 'rest'; this.t = 0; this.biteCD = GROUPER.rest; }
        break;
      case 'rest':
        this.vx *= 0.86; this.vy *= 0.86;
        this.gape = Math.max(0, this.gape - dt * 4); this.suck = lerp(this.suck, 0, dt * 4);
        if (this.t >= GROUPER.rest) { this.state = 'lurk'; this.homeY = colClampY(this.y, this.r * 0.4); }
        break;
    }
    this.y = colClampY(this.y + this.vy * dt, this.r * 0.4); this.x += this.vx * dt;
  }
  bitePoint() { return { x: this.x + this.face * this.r * 1.05, y: this.y + this.r * 0.12 }; }
  canBite() { return this.state === 'lunge' && this.biteCD <= 0; }
  telegraphing() { return this.state === 'windup'; }
  render(ctx, t) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.face, 1);
    if (this.state === 'windup') telegraph(ctx, t, this.r);
    drawGrouper(ctx, this.r, t, { gape: this.gape, suck: this.suck });
    ctx.restore();
  }
}

// ------------------------------------------------------------- Pufferfish
export class Puffer {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.r = 34;
    this.t = Math.random() * 5; this.inflate = 0; this.homeY = y; this.dead = false;
  }
  update(dt, env) {
    this.t += dt; const p = env.player; const d = dist(this.x, this.y, p.x, p.y);
    const target = (d < PUFFER.triggerRange && p.alive) ? 1 : 0;
    const rate = target > this.inflate ? dt / PUFFER.inflate : -dt / PUFFER.deflate;
    this.inflate = clamp(this.inflate + (target > this.inflate ? 1 : -1) * Math.abs(rate), 0, 1);
    this.x += Math.sin(this.t * 0.5) * 12 * dt;
    this.y = colClampY(this.homeY + Math.sin(this.t * 0.8) * 16, this.r);
  }
  get hitR() { return this.r * (0.7 + this.inflate * 0.55); }
  get spiky() { return this.inflate > 0.55; }
  render(ctx, t) { ctx.save(); ctx.translate(this.x, this.y); drawPuffer(ctx, this.r, t, { inflate: this.inflate }); ctx.restore(); }
}

// ------------------------------------------------------------------- Squid
export class Squid {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.r = 44;
    this.state = 'drift'; this.t = 0; this.face = -1; this.grab = 0;
    this.dir = { x: -1, y: 0 }; this.biteCD = 0; this.homeY = y; this.dead = false;
  }
  update(dt, env) {
    this.t += dt; this.biteCD = Math.max(0, this.biteCD - dt);
    const p = env.player; const d = dist(this.x, this.y, p.x, p.y);
    this.face = p.x < this.x ? -1 : 1;
    switch (this.state) {
      case 'drift':
        this.vx = Math.sin(this.t * 0.6) * 26; this.vy = (this.homeY - this.y) * 0.5 + Math.sin(this.t * 0.5) * 14; this.grab = lerp(this.grab, 0, dt * 3);
        if (d < SQUID.detectRange && p.alive) this.state = 'chase';
        break;
      case 'chase': {
        const a = Math.atan2(p.y - this.y, p.x - this.x);
        this.vx = Math.cos(a) * SQUID.speed; this.vy = Math.sin(a) * SQUID.speed; this.grab = lerp(this.grab, 0.4, dt * 3);
        if (d < SQUID.grabRange && this.biteCD <= 0) { this.state = 'windup'; this.t = 0; }
        else if (d > SQUID.detectRange * 1.3) this.state = 'drift';
        break;
      }
      case 'windup':
        this.vx *= 0.8; this.vy *= 0.8; this.grab = lerp(this.grab, 0.7, dt * 5);
        if (this.t >= 0.4) { const a = Math.atan2(p.y - this.y, p.x - this.x); this.dir = { x: Math.cos(a), y: Math.sin(a) }; this.state = 'lunge'; this.t = 0; }
        break;
      case 'lunge':
        this.vx = this.dir.x * SQUID.speed * 2.1; this.vy = this.dir.y * SQUID.speed * 2.1; this.grab = 1;
        if (this.t >= 0.42) { this.state = 'rest'; this.t = 0; this.biteCD = 1.8; }
        break;
      case 'hold':
        this.vx *= 0.7; this.vy *= 0.7; this.grab = 1;
        break;
      case 'rest':
        this.vx *= 0.86; this.vy *= 0.86; this.grab = lerp(this.grab, 0.2, dt * 2);
        if (this.t >= 1.2) this.state = (d < SQUID.detectRange && p.alive) ? 'chase' : 'drift';
        break;
    }
    this.y = colClampY(this.y + this.vy * dt, this.r * 0.4); this.x += this.vx * dt;
  }
  bitePoint() { return { x: this.x + this.face * this.r * 0.9, y: this.y }; }
  canBite() { return this.state === 'lunge' && this.biteCD <= 0; }
  telegraphing() { return this.state === 'windup'; }
  render(ctx, t) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.face, 1);
    if (this.state === 'windup') telegraph(ctx, t, this.r);
    drawSquid(ctx, this.r, t, { grab: this.grab });
    ctx.restore();
  }
}

// -------------------------------------------------------------------- Boat
export class Boat {
  constructor(x, dir) {
    this.x = x; this.dir = dir; this.w = 240; this.r = 130;
    this.netW = this.w * 1.25; this.netD = BOAT.netDepth; this.y = BOAT.hullY; this.t = 0;
  }
  get hullY() { return this.y + Math.sin(this.t * 1.5) * 6; }
  update(dt) { this.t += dt; this.x += this.dir * BOAT.speed * dt; }
  netBounds() { return { x0: this.x - this.netW / 2, x1: this.x + this.netW / 2, y0: this.hullY + 30, y1: this.hullY + 30 + this.netD }; }
  propPoint() { return { x: this.x - this.dir * this.w * 0.46, y: this.hullY + this.w * 0.16 }; }
  render(ctx, t, caughtFish) {
    const hy = this.hullY;
    ctx.save(); ctx.translate(this.x, hy + 30); drawNet(ctx, this.netW, this.netD, t, caughtFish ? 0.8 : 0); ctx.restore();
    ctx.save(); ctx.translate(this.x, hy); ctx.scale(this.dir, 1); drawBoat(ctx, this.w, t); ctx.restore();
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

// ------------------------------------------------ Plastic bag (looks edible)
export class PlasticBag {
  constructor(x, y) { this.x = x; this.y = y; this.r = 34; this.t = Math.random() * 6; this.driftX = (Math.random() - 0.5) * 20; this.dead = false; }
  get hitR() { return this.r * 0.7; }
  update(dt) {
    this.t += dt;
    this.x += (this.driftX + Math.sin(this.t * 0.6) * 14) * dt;
    this.y -= PLASTIC.driftSpeed * dt * (0.6 + 0.4 * Math.sin(this.t * 0.8));
    if (this.y < WATER.surfaceBand - 40) this.y = REF_H - WATER.seabedBand - 40; // recirculate
  }
  render(ctx, t) { ctx.save(); ctx.translate(this.x, this.y); drawBag(ctx, this.r, this.t); ctx.restore(); }
}

// ---------------------------------------------------------- Booster pickup
export class Booster {
  constructor(x, y, type) { this.x = x; this.y = y; this.type = type; this.r = 22; this.t = Math.random() * 6; this.baseY = y; this.dead = false; }
  update(dt) { this.t += dt; this.y = this.baseY + Math.sin(this.t * 1.4) * 12; }
  render(ctx, t) { ctx.save(); ctx.translate(this.x, this.y); drawBooster(ctx, this.r, t, this.type); ctx.restore(); }
}

// ------------------------------------------------------------- Sea mine
export class Mine {
  constructor(x, y) {
    this.x = x; this.y = y; this.r = MINE.radius; this.t = Math.random() * 6;
    this.vx = (Math.random() - 0.5) * MINE.driftSpeed; this.vy = (Math.random() - 0.5) * MINE.driftSpeed; this.dead = false;
  }
  get hitR() { return this.r * 0.95; }
  update(dt) {
    this.t += dt; this.x += this.vx * dt; this.y += this.vy * dt;
    const top = WATER.surfaceBand + this.r, bot = REF_H - WATER.seabedBand - this.r;
    if (this.y < top) { this.y = top; this.vy = Math.abs(this.vy); }
    if (this.y > bot) { this.y = bot; this.vy = -Math.abs(this.vy); }
  }
  render(ctx, t) { ctx.save(); ctx.translate(this.x, this.y); drawMine(ctx, this.r, this.t, true); ctx.restore(); }
}

// ----------------------------------------------------- baited fishing hook
export class Hook {
  constructor(x, y) { this.x = x; this.y = y; this.r = 16; this.t = Math.random() * 6; this.biteCD = 0; }
  update(dt) { this.t += dt; this.biteCD = Math.max(0, this.biteCD - dt); this.x += Math.sin(this.t * 0.8) * 8 * dt; }
  baitPoint() { return { x: this.x, y: this.y + this.r * 0.42 }; }
  get hitR() { return this.r * 0.9; }
  render(ctx, t) { ctx.save(); ctx.translate(this.x, this.y); drawHook(ctx, this.r * 2.2, this.t, this.y - WATER.surfaceBand); ctx.restore(); }
}

// ------------------------------------------------------------- solid blockers
export class Rock {
  constructor(x, y, r, seed) { this.x = x; this.y = y; this.r = r; this.seed = seed; }
  get hitR() { return this.r * 0.7; }
  render(ctx) { ctx.save(); ctx.translate(this.x, this.y); drawRock(ctx, this.r, this.seed); ctx.restore(); }
}
export class Coral {
  constructor(x, y, r, seed) { this.x = x; this.y = y; this.r = r; this.seed = seed; }
  get hitR() { return this.r * 0.62; }
  render(ctx) { ctx.save(); ctx.translate(this.x, this.y); drawCoral(ctx, this.r, this.seed); ctx.restore(); }
}
export class Anchor {
  constructor(x, y, r) { this.x = x; this.y = y; this.r = r; this.t = Math.random() * 6; }
  get hitR() { return this.r * 0.42; }
  update(dt) { this.t += dt; }
  render(ctx) { ctx.save(); ctx.translate(this.x, this.y); drawAnchor(ctx, this.r, this.t); ctx.restore(); }
}
export class Urchin {
  constructor(x, y, r, seed) { this.x = x; this.y = y; this.r = r || URCHIN.radius; this.seed = seed; }
  get hitR() { return this.r * 0.9; }
  render(ctx) { ctx.save(); ctx.translate(this.x, this.y); drawUrchin(ctx, this.r, this.seed); ctx.restore(); }
}

// ---------------------------------------------------------------- Plankton
export class Plankton {
  constructor(x, y, big = false) { this.x = x; this.y = y; this.r = big ? 26 : 17; this.value = big ? 5 : 1; this.t = Math.random() * 6; this.dead = false; this.baseY = y; }
  update(dt, pull) {
    this.t += dt; this.y = this.baseY + Math.sin(this.t * 1.5) * 10;
    if (pull) { this.x = lerp(this.x, pull.x, pull.k); this.y = lerp(this.y, pull.y, pull.k); this.baseY = this.y; }
  }
  render(ctx) { ctx.save(); ctx.translate(this.x, this.y); drawPlankton(ctx, this.r, this.t); ctx.restore(); }
}

// ------------------------------------------------------------------ Kelp
export class Kelp {
  constructor(x, h, seed) { this.x = x; this.h = h; this.seed = seed; }
  render(ctx, t, flow = 0) { ctx.save(); ctx.translate(this.x, REF_H - WATER.seabedBand + 10); drawKelp(ctx, this.h, t, this.seed, flow); ctx.restore(); }
}

// ------------------------------------------------------- Current (push field)
export class Current {
  constructor(x0, x1, y0, y1, fx, fy, strong = false) { this.x0 = x0; this.x1 = x1; this.y0 = y0; this.y1 = y1; this.fx = fx; this.fy = fy; this.strong = strong; }
  contains(x, y) { return x > this.x0 && x < this.x1 && y > this.y0 && y < this.y1; }
}

// --------------------------------------------------- Whirlpool (pull field)
// A slow rotating vortex. No direct damage — it drags you toward its eye (and
// gently spins you) so it can pull you into mines, urchins, predators. The pull
// is applied to the player in game.collide(); this class only spins + draws.
export class Whirlpool {
  constructor(x, y) {
    this.x = x; this.y = y; this.r = WHIRLPOOL.radius;
    this.t = Math.random() * 6; this.spin = Math.random() * TAU; this.dead = false;
  }
  update(dt) { this.t += dt; this.spin += dt * WHIRLPOOL.swirl; }
  render(ctx, t) {
    ctx.save(); ctx.translate(this.x, this.y);
    drawWhirlpool(ctx, this.r, this.t, { spin: this.spin });
    ctx.restore();
  }
}

// ------------------------------------------------------- Sea vent (push field)
// A hydrothermal vent on the seabed. Its hot column shoves the player strongly
// UPWARD while they're inside it (and a touch toward centre so you don't skim
// the edge forever). The push is applied in game.collide(). `y` = floor mouth.
export class SeaVent {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.r = VENT.radius; this.colH = VENT.column; this.t = Math.random() * 6; this.dead = false;
  }
  update(dt) { this.t += dt; }
  inColumn(px, py) {
    if (py > this.y + this.r * 0.4 || py < this.y - this.colH) return false;
    const up = clamp((this.y - py) / this.colH, 0, 1);
    const halfW = this.r * (1 - up * 0.5);
    return Math.abs(px - this.x) < halfW;
  }
  render(ctx, t) {
    ctx.save(); ctx.translate(this.x, this.y);
    drawSeaVent(ctx, this.r, this.t, { active: 1, colH: this.colH });
    ctx.restore();
  }
}

// --------------------------------------------------------- Particle pool
export class Particles {
  constructor(max = 460) {
    this.max = max; this.pool = new Array(max);
    for (let i = 0; i < max; i++) this.pool[i] = { life: 0 };
    this.head = 0;
  }
  spawn(x, y, kind, vx = 0, vy = 0, opts = {}) {
    const pr = this.pool[this.head]; this.head = (this.head + 1) % this.max;
    pr.x = x; pr.y = y; pr.vx = vx; pr.vy = vy; pr.kind = kind;
    pr.life = pr.maxLife = opts.life ?? (kind === 'bubble' ? 2.4 : kind === 'ring' ? 0.5 : kind === 'blood' ? 1.9 : kind === 'gore' ? 2.2 : kind === 'wake' ? 0.55 : 0.8);
    pr.size = opts.size ?? (kind === 'bubble' ? 2 + Math.random() * 4 : kind === 'ring' ? 10 : kind === 'blood' ? 2 + Math.random() * 5 : kind === 'gore' ? 7 + Math.random() * 9 : kind === 'wake' ? 3 + Math.random() * 5 : 3 + Math.random() * 4);
    pr.color = opts.color ?? null; pr.seed = Math.random() * 100;
  }
  burst(x, y, kind, n, spd, opts) {
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = spd * (0.4 + Math.random() * 0.6); this.spawn(x, y, kind, Math.cos(a) * s, Math.sin(a) * s, opts); }
  }
  update(dt) {
    for (const pr of this.pool) {
      if (pr.life <= 0) continue;
      pr.life -= dt; pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      if (pr.kind === 'bubble') { pr.vy -= 26 * dt; pr.x += Math.sin((pr.maxLife - pr.life) * 6 + pr.seed) * 14 * dt; pr.vx *= 0.98; }
      else if (pr.kind === 'inkpuff') { pr.vx *= 0.9; pr.vy *= 0.9; }
      else if (pr.kind === 'blood') { pr.vy += 26 * dt; pr.vx *= 0.95; pr.vy *= 0.99; }
      else if (pr.kind === 'gore') { pr.vx *= 0.92; pr.vy *= 0.95; pr.size += 22 * dt; }
      else if (pr.kind === 'sparkle') { pr.vy += 40 * dt; pr.vx *= 0.96; }
      else if (pr.kind === 'egg') { pr.vy -= 8 * dt; pr.vx *= 0.99; }
      else if (pr.kind === 'foam') { pr.vy += 60 * dt; }
      else if (pr.kind === 'ring') { pr.size += 320 * dt; }
      else if (pr.kind === 'glow') { pr.vy -= 6 * dt; pr.vx *= 0.99; }
      else if (pr.kind === 'wake') { pr.vx *= 0.9; pr.vy *= 0.9; pr.size += 30 * dt; }
    }
  }
  render(ctx) {
    for (const pr of this.pool) {
      if (pr.life <= 0) continue;
      const a = clamp(pr.life / pr.maxLife, 0, 1);
      if (pr.kind === 'bubble') { ctx.strokeStyle = rgba('#dff3f7', a * 0.7); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.size, 0, TAU); ctx.stroke(); }
      else if (pr.kind === 'inkpuff') { ctx.fillStyle = rgba('#16302f', a * 0.5); ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.size * (1.4 - a), 0, TAU); ctx.fill(); }
      else if (pr.kind === 'blood') { const ea = a * a; ctx.fillStyle = rgba(a > 0.55 ? P.blood : P.bloodDark, ea * 0.9); ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.size * (1.25 - a * 0.25), 0, TAU); ctx.fill(); }
      else if (pr.kind === 'gore') { ctx.fillStyle = rgba(P.bloodDark, a * 0.28); ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.size, 0, TAU); ctx.fill(); }
      else if (pr.kind === 'sparkle') { ctx.fillStyle = rgba(pr.color || '#ffd97a', a); ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.size * a, 0, TAU); ctx.fill(); }
      else if (pr.kind === 'egg') { ctx.save(); ctx.translate(pr.x, pr.y); ctx.globalAlpha = a; drawEgg(ctx, pr.size); ctx.restore(); ctx.globalAlpha = 1; }
      else if (pr.kind === 'foam') { ctx.fillStyle = rgba('#eaf6f7', a * 0.8); ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.size, 0, TAU); ctx.fill(); }
      else if (pr.kind === 'ring') { ctx.strokeStyle = rgba(pr.color || P.danger, a * 0.8); ctx.lineWidth = 3 * a + 1; ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.size, 0, TAU); ctx.stroke(); }
      else if (pr.kind === 'glow') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(pr.color || P.bio, a * 0.7); ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.size, 0, TAU); ctx.fill(); ctx.restore(); }
      else if (pr.kind === 'wake') { ctx.fillStyle = rgba('#dff3f7', a * 0.22); ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.size, 0, TAU); ctx.fill(); }
    }
  }
}
