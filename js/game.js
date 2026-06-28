// Central game controller: states (menu/shop/wardrobe/loot/play/laying/win/
// dead), camera, collisions, the net & squid capture mechanics, status
// effects, region checkpoints + revive, HUD and screens, plus persistent
// roguelike meta-progression (eggs, upgrades, skins) in localStorage.
import {
  REF_H, WATER, WORLD, COMBAT, BOAT, PUFFER, SQUID, JELLY, MINE, URCHIN, HOOK,
  PLASTIC, WAVE, STATUS, SEAGULL, BOOSTERS, UPGRADES, RARITY, LOOTBOX, SKINS,
  DEFAULT_SKIN, LIONFISH, TORPEDO, WHIRLPOOL, VENT, ECONOMY, PALETTE as P,
} from './config.js';
import { clamp, lerp, dist, TAU, rgba, mixHex, hash1 } from './utils.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Background } from './background.js';
import { generateWorld, zoneAt, zoneIndexAt, zoneStartX } from './world.js';
import {
  Player, Seal, Shark, Barracuda, Angler, Puffer, Squid, Boat, Jelly,
  Swordfish, Cookiecutter, Copepod, Seagull, Lionfish, Crab, Grouper,
  ElectricRay, Moray, Whirlpool, SeaVent, NurseShark, Particles, seabedLimit,
} from './entities.js';
import { drawSunfish, drawClam, drawEgg, drawShark } from './sprites.js';
import { STR } from './strings.js';

const SAVE_KEY = 'sunfish.useless.v2';
const FONT = (s, w = '700') => `${w} ${s}px "Outfit","Trebuchet MS","Segoe UI",system-ui,sans-serif`;
const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s]));
const PREDATOR_TYPES = new Set(['seal', 'shark', 'orca', 'barracuda', 'angler', 'swordfish', 'cookiecutter', 'squid', 'lionfish', 'moray', 'torpedo', 'crab', 'grouper']);

function freshSave() {
  return { eggs: 0, laidTotal: 0, best: 0, runs: 0, wins: 0, mute: false, upg: {}, skins: [DEFAULT_SKIN], skin: DEFAULT_SKIN };
}
function loadSave() {
  const base = freshSave();
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) {}
  if (!s) {
    try {
      const old = JSON.parse(localStorage.getItem('sunfish.useless.v1'));
      if (old) { base.eggs = old.plankton || 0; base.best = old.best || 0; base.runs = old.runs || 0; base.mute = !!old.mute; base.upg = old.upg || {}; }
    } catch (e) {}
    return base;
  }
  s = Object.assign(base, s);
  if (!Array.isArray(s.skins) || !s.skins.length) s.skins = [DEFAULT_SKIN];
  if (!s.skins.includes(DEFAULT_SKIN)) s.skins.unshift(DEFAULT_SKIN);
  if (!SKIN_BY_ID[s.skin]) s.skin = DEFAULT_SKIN;
  if (s.upg && s.upg.skin && !s.upg.slip) s.upg.slip = s.upg.skin;
  return s;
}

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
// word-wrap centered text; returns the y after the last line
function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = String(text).split(' '); let line = '', yy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = word; yy += lineH; }
    else line = test;
  }
  ctx.fillText(line, x, yy); return yy;
}
// little hand-drawn vector icons for each upgrade (no emoji = less generic)
function drawUpgradeIcon(ctx, id, cx, cy, R, col) {
  ctx.save(); ctx.translate(cx, cy);
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(2, R * 0.2); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  switch (id) {
    case 'vitality':
      ctx.beginPath(); ctx.moveTo(0, 0.5 * R);
      ctx.bezierCurveTo(-1.1 * R, -0.35 * R, -0.45 * R, -0.95 * R, 0, -0.3 * R);
      ctx.bezierCurveTo(0.45 * R, -0.95 * R, 1.1 * R, -0.35 * R, 0, 0.5 * R); ctx.fill(); break;
    case 'grace': case 'headstart': {
      const n = id === 'headstart' ? 2 : 3; ctx.lineWidth = R * 0.24;
      for (let i = 0; i < n; i++) { const ox = (i - (n - 1) / 2) * R * 0.55; ctx.beginPath(); ctx.moveTo(ox - 0.25 * R, -0.5 * R); ctx.lineTo(ox + 0.25 * R, 0); ctx.lineTo(ox - 0.25 * R, 0.5 * R); ctx.stroke(); } break;
    }
    case 'dash':
      ctx.beginPath(); ctx.moveTo(0.18 * R, -0.7 * R); ctx.lineTo(-0.4 * R, 0.08 * R); ctx.lineTo(0.0, 0.08 * R); ctx.lineTo(-0.12 * R, 0.7 * R); ctx.lineTo(0.42 * R, -0.12 * R); ctx.lineTo(0.06 * R, -0.12 * R); ctx.closePath(); ctx.fill(); break;
    case 'slip':
      ctx.beginPath(); ctx.moveTo(0, -0.75 * R); ctx.bezierCurveTo(0.6 * R, -0.1 * R, 0.5 * R, 0.6 * R, 0, 0.6 * R); ctx.bezierCurveTo(-0.5 * R, 0.6 * R, -0.6 * R, -0.1 * R, 0, -0.75 * R); ctx.fill(); break;
    case 'roe':
      for (const [px, py] of [[-0.32, 0.12], [0.32, 0.12], [0, -0.32], [0, 0.5]]) { ctx.beginPath(); ctx.arc(px * R, py * R, 0.24 * R, 0, TAU); ctx.fill(); } break;
    case 'magnet':
      ctx.lineWidth = R * 0.34; ctx.beginPath(); ctx.arc(0, -0.05 * R, 0.5 * R, Math.PI, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.5 * R, -0.05 * R); ctx.lineTo(-0.5 * R, 0.5 * R); ctx.moveTo(0.5 * R, -0.05 * R); ctx.lineTo(0.5 * R, 0.5 * R); ctx.stroke();
      ctx.fillStyle = '#e2604f'; ctx.fillRect(-0.67 * R, 0.42 * R, 0.34 * R, 0.16 * R);
      ctx.fillStyle = '#dfe7ea'; ctx.fillRect(0.33 * R, 0.42 * R, 0.34 * R, 0.16 * R); break;
    case 'armor':
      ctx.beginPath(); ctx.moveTo(0, -0.72 * R); ctx.lineTo(0.6 * R, -0.45 * R); ctx.lineTo(0.5 * R, 0.3 * R); ctx.lineTo(0, 0.72 * R); ctx.lineTo(-0.5 * R, 0.3 * R); ctx.lineTo(-0.6 * R, -0.45 * R); ctx.closePath(); ctx.fill(); break;
    case 'wind': {
      ctx.lineWidth = R * 0.2; ctx.beginPath(); ctx.arc(0, 0, 0.5 * R, Math.PI * 0.45, Math.PI * 2.05); ctx.stroke();
      const a = Math.PI * 2.05, ax = Math.cos(a) * 0.5 * R, ay = Math.sin(a) * 0.5 * R;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - 0.22 * R, ay - 0.04 * R); ctx.moveTo(ax, ay); ctx.lineTo(ax + 0.02 * R, ay - 0.24 * R); ctx.stroke(); break;
    }
    default: ctx.beginPath(); ctx.arc(0, 0, 0.4 * R, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

export class Game {
  constructor() {
    this.save = loadSave();
    Audio.setMuted(this.save.mute);
    this.bg = new Background();
    this.particles = new Particles(460);
    this.state = 'menu';
    this.t = 0; this.camX = 0;
    this.menuFlap = 0; this.banner = null;
    this._buttons = [];
    this.view = { w: 800, h: 450, scale: 1, camX: 0, worldViewW: 800 };
    this.deathMsg = ''; this.reviveCost = 0; this.canRevive = false;
    this.eggsTarget = 0; this.layCount = 0; this.effort = 0;
    this.loot = { phase: 'idle', t: 0, result: null, msg: null };
    this.funFact = STR.funFacts[0];
    this.gullTimer = SEAGULL.interval; this.netDrainT = 0; this.spawnCD = 0;
    this.clearEntities();
  }

  clearEntities() {
    this.enemies = []; this.squids = []; this.puffers = []; this.jellies = [];
    this.boats = []; this.copepods = []; this.seagulls = [];
    this.nurse = null;
  }

  skinObj() { return SKIN_BY_ID[this.save.skin] || SKINS[0]; }
  owns(id) { return this.save.skins.includes(id); }

  stats() {
    const u = this.save.upg;
    return {
      maxHp: COMBAT.baseMaxHP + (u.vitality || 0),
      speedMul: 1 + (u.grace || 0) * 0.09,
      freqMul: 1 + (u.grace || 0) * 0.05,
      dashLevel: u.dash || 0,
      slipLevel: u.slip || 0,
      roeLevel: u.roe || 0,
      magnetLevel: u.magnet || 0,
      armorLevel: u.armor || 0,
      headstart: u.headstart || 0,
      wind: u.wind || 0,
    };
  }

  startRun(intro = false) {
    this.seed = (Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    this.world = generateWorld(this.seed);
    const st = this.stats();
    this.player = new Player(st);
    this.player.skin = this.skinObj();
    const hs = clamp(st.headstart, 0, WORLD.zones.length - 2);
    const sx = hs > 0 ? zoneStartX(hs) + 140 : 120;
    this.player.x = sx; this.player.y = REF_H * 0.5;

    this.clearEntities();
    this.spawnIdx = 0; this.runPlankton = 0; this.runPoints = 0; this.runHits = 0; this.runBanked = false; this.usedWind = false;
    this.runEggs = 0;   // now ONLY the lay mini-game tally; 0 until the spawning ground
    this.cpPlanktonMark = 0;   // plankton total at the last checkpoint lay
    this.netDrainT = 0; this.spawnCD = 0;
    const sp = this.world.spawners;
    while (this.spawnIdx < sp.length && sp[this.spawnIdx].x < sx - 200) this.spawnIdx++;

    this.regionIdx = zoneIndexAt(this.player.x);
    this.maxZoneReached = this.regionIdx;
    this.checkpointX = sx; this.checkpointRegionIdx = this.regionIdx;
    this.recenterCamera();
    this.funFact = STR.funFacts[Math.floor(Math.random() * STR.funFacts.length)];
    // the hatchling intro only makes sense when you actually start at the egg
    if (intro && hs === 0) { this.state = 'intro'; this.introT = 0; Audio.music(true); }
    else this.beginPlay();
  }
  beginPlay() {
    this.state = 'play';
    this.banner = { text: WORLD.zones[this.regionIdx].name, life: 2.6 };
    Audio.music(true); Audio.sea(true);
  }

  recenterCamera() {
    const maxCam = Math.max(0, this.world.goal + 240 - this.view.worldViewW);
    this.camX = clamp(this.player.x - this.view.worldViewW * 0.34, 0, maxCam);
  }

  // ---------------------------------------------------------------- UPDATE
  update(dt, now) {
    this.t += dt;
    if (Input.muteRequested()) { this.save.mute = Audio.toggleMute(); this.persist(); }
    this.menuFlap += dt * 2.2;
    if (this.banner) { this.banner.life -= dt; if (this.banner.life <= 0) this.banner = null; }
    this.particles.update(dt);

    if (this.state === 'intro') { this.updateIntro(dt); return; }
    if (this.state === 'dying') { this.updateDying(dt); return; }
    if (this.state === 'cplay') { this.updateCheckpointLay(dt); return; }
    if (this.state === 'menu' || this.state === 'shop' || this.state === 'wardrobe' || this.state === 'loot') { this.updateUI(dt); return; }
    if (this.state === 'dead' || this.state === 'win') { this.updateEnd(); return; }

    const pl = this.player;
    this.activateSpawners(dt);

    const { scale } = this.view;
    let target = { x: 0, y: 0, active: false };
    if (this.state === 'play') {
      if (Input.active) target = { x: this.camX + Input.sx / scale, y: Input.sy / scale, active: true };
      else if (Math.hypot(Input.dir.x, Input.dir.y) > 0.1) target = { x: pl.x + Input.dir.x * 150, y: pl.y + Input.dir.y * 150, active: true };
      if (Input.consumeDash(now)) {
        let d = (Math.hypot(Input.dir.x, Input.dir.y) > 0.1) ? { x: Input.dir.x, y: Input.dir.y } : (Input.active ? Input.flickDir() : null);
        if (!d) { const sp = Math.hypot(pl.vx, pl.vy); d = sp > 12 ? { x: pl.vx / sp, y: pl.vy / sp } : { x: pl.face, y: 0 }; }
        pl.tryDash(d, Audio, this.particles);
      }
    }

    if (pl.caught) this.updateCaught(dt, now);
    else if (pl.grabbed) this.updateGrabbed(dt, now);
    else pl.update(dt, target, this.particles);

    // currents + slow ambient WAVE surge (strongest near the surface)
    if (this.state === 'play' && !pl.captured) {
      for (const c of this.world.currents) if (c.contains(pl.x, pl.y)) { pl.vx += c.fx * dt; pl.vy += c.fy * dt; }
      const span = REF_H - WATER.seabedBand - WATER.surfaceBand;
      const depthF = lerp(1, WAVE.depthKeep, clamp((pl.y - WATER.surfaceBand) / span, 0, 1));
      pl.vx += Math.sin(this.t * WAVE.freq + pl.x * WAVE.swirl) * WAVE.surge * depthF * dt;
      pl.vy += Math.cos(this.t * WAVE.freq * 0.7 + pl.x * WAVE.swirl) * WAVE.surge * 0.3 * depthF * dt;
    }

    const env = { player: pl };
    for (const e of this.enemies) e.update(dt, env);
    for (const s of this.squids) s.update(dt, env);
    // a faint little streamline behind any creature swimming/dashing hard
    for (const e of this.enemies) {
      const sp = Math.hypot(e.vx || 0, e.vy || 0);
      if (sp > 300 && Math.random() < 0.5) {
        const inv = 1 / sp, r = e.r || 30;
        this.particles.spawn(e.x - e.vx * inv * r * 0.7, e.y - e.vy * inv * r * 0.7, 'wake', -e.vx * inv * 24, -e.vy * inv * 24, { size: r * 0.16, life: 0.38 });
      }
    }
    for (const s of this.puffers) s.update(dt, env);
    for (const c of this.copepods) c.update(dt, env);
    for (const b of this.boats) b.update(dt);
    for (const j of this.jellies) j.update(dt);
    if (this.nurse) { this.nurse.update(dt, pl, this.particles); if (this.nurse.dead) this.nurse = null; }

    const L = this.camX - 500, Rr = this.camX + this.view.worldViewW + 600;
    for (const m of this.world.mines) if (m.x > L && m.x < Rr) m.update(dt);
    for (const h of this.world.hooks) if (h.x > L && h.x < Rr) h.update(dt);
    for (const b of this.world.bags) if (b.x > L && b.x < Rr) b.update(dt);
    for (const bo of this.world.boosters) if (!bo.dead && bo.x > L && bo.x < Rr) bo.update(dt);
    for (const w of this.world.whirlpools) if (w.x > L && w.x < Rr) w.update(dt);
    for (const v of this.world.vents) if (v.x > L && v.x < Rr) v.update(dt);

    const magR = pl.magnetLevel > 0 ? 80 + pl.magnetLevel * 70 : 0;
    for (const p of this.world.plankton) {
      if (p.dead || p.x < L || p.x > Rr) continue;
      let pull = null;
      if (magR && this.state === 'play' && !pl.captured) { const dd = dist(p.x, p.y, pl.x, pl.y); if (dd < magR) pull = { x: pl.x, y: pl.y, k: clamp(dt * 3.5, 0, 1) }; }
      p.update(dt, pull);
    }

    // cull entities well behind the camera or finished
    const behind = this.camX - 700;
    this.enemies = this.enemies.filter((e) => !e.dead && e.x > behind);
    this.puffers = this.puffers.filter((e) => !e.dead && e.x > behind);
    this.copepods = this.copepods.filter((c) => !c.dead && c.x > behind);
    this.jellies = this.jellies.filter((j) => !j.dead && j.x > this.camX - 400);
    this.squids = this.squids.filter((s) => !s.dead && (pl.grabbed === s || s.x > behind));
    this.boats = this.boats.filter((b) => b.x > behind && b.x < this.camX + this.view.worldViewW + 1600);

    if (this.state === 'play' && !pl.captured) this.collide(dt);

    const zi = zoneIndexAt(pl.x);
    if (zi !== this.regionIdx) {
      const forward = zi > this.regionIdx;
      this.regionIdx = zi;
      if (forward) {
        this.checkpointX = Math.max(this.checkpointX, zoneStartX(zi));
        this.checkpointRegionIdx = zi;
        const newZone = zi > (this.maxZoneReached || 0);
        if (newZone) {                                         // award points once per new zone
          this.maxZoneReached = zi;
          // plankton gathered since the last checkpoint converts to EXTRA points
          const since = Math.max(0, this.runPlankton - (this.cpPlanktonMark || 0));
          const bonus = ECONOMY.pointsPerCheckpoint + Math.round(since * ECONOMY.checkpointPlanktonBonus);
          this.runPoints += bonus;
          this.cpPointsAwarded = bonus; this.cpPointsPlankton = since;
          // a celebratory pop so the checkpoint really lands
          Audio.sfx('reveal');
          this.particles.spawn(pl.x, pl.y, 'ring', 0, 0, { color: P.amber, life: 0.6, size: 14 });
          this.particles.burst(pl.x, pl.y - pl.r * 0.4, 'sparkle', 22, 210, { color: P.amberSoft });
        }
        if (zi >= 4) Audio.sfx('warn');
        // every new region checkpoint (except the final Spawning Ground, which
        // runs the full mini-game) plays a short lay-egg cutscene that banks a
        // clutch from the plankton gathered since the last checkpoint + health.
        if (newZone && zi < WORLD.zones.length - 1) this.beginCheckpointLay(zi);
        else this.banner = { text: STR.checkpoint(WORLD.zones[zi].name), life: 2.8 };
      } else this.banner = { text: WORLD.zones[zi].name, life: 2.2 };
    }

    if (Math.random() < 0.3) this.particles.spawn(this.camX + Math.random() * this.view.worldViewW, REF_H - WATER.seabedBand - Math.random() * 40, 'bubble', 0, -20);

    if (this.state === 'play' && pl.x >= this.world.goal - 30) this.beginLaying();
    if (this.state === 'laying') this.updateLaying(dt);

    if (!pl.alive && this.state === 'play') this.die();

    const camTarget = clamp(pl.x - this.view.worldViewW * 0.34, 0, Math.max(0, this.world.goal + 240 - this.view.worldViewW));
    this.camX = lerp(this.camX, camTarget, clamp(dt * 5, 0, 1));
  }

  // how many hunters may stalk you at once (ramps up region by region)
  maxPredators() { return 2 + (this.regionIdx >= 4 ? 1 : 0) + (this.regionIdx >= 6 ? 1 : 0); }

  activateSpawners(dt) {
    this.spawnCD = Math.max(0, (this.spawnCD || 0) - dt);
    const rightEdge = this.camX + this.view.worldViewW;
    const lookX = rightEdge + 120;
    const sp = this.world.spawners;
    while (this.spawnIdx < sp.length && sp[this.spawnIdx].x < lookX) {
      const s = sp[this.spawnIdx];
      // drop spawners we've already swum past — nothing pops in behind/on us
      if (s.x < this.camX - 120) { this.spawnIdx++; continue; }
      if (PREDATOR_TYPES.has(s.type)) {
        // predators arrive ONE AT A TIME, with a cooldown and a concurrent cap —
        // no more being swarmed by sharks and sea lions the instant you arrive.
        if (this.spawnCD > 0) break;
        if (this.enemies.length + this.squids.length >= this.maxPredators()) break;
        this.spawnCD = 1.1 + Math.random() * 0.9;
      }
      this.spawnIdx++;
      // predators always slide in from just beyond the right edge, never on top
      // of you — even if pacing held them back while you swam ahead.
      const sx = PREDATOR_TYPES.has(s.type) ? Math.max(s.x, rightEdge + 60) : s.x;
      this.spawnOne(s, sx);
    }
  }

  spawnOne(s, x) {
    switch (s.type) {
      case 'seal': this.enemies.push(new Seal(x, s.y)); break;
      case 'shark': this.enemies.push(new Shark(x, s.y)); break;
      case 'orca': this.enemies.push(new Shark(x, s.y, { big: true })); break;
      case 'barracuda': this.enemies.push(new Barracuda(x, s.y)); break;
      case 'angler': this.enemies.push(new Angler(x, s.y)); break;
      case 'swordfish': this.enemies.push(new Swordfish(x, s.y)); break;
      case 'cookiecutter': this.enemies.push(new Cookiecutter(x, s.y)); break;
      case 'lionfish': this.enemies.push(new Lionfish(x, s.y)); break;
      case 'moray': this.enemies.push(new Moray(x, s.y)); break;
      case 'torpedo': this.enemies.push(new ElectricRay(x, s.y)); break;
      case 'crab': this.enemies.push(new Crab(x, s.y)); break;
      case 'grouper': this.enemies.push(new Grouper(x, s.y)); break;
      case 'puffer': this.puffers.push(new Puffer(x, s.y)); break;
      case 'squid': this.squids.push(new Squid(x, s.y)); break;
      case 'copepod': this.copepods.push(new Copepod(x, s.y)); break;
      case 'jelly': this.jellies.push(new Jelly(x, s.y)); break;
      case 'boat': this.boats.push(new Boat(x + (s.dir < 0 ? this.view.worldViewW : 0), s.dir)); break;
    }
  }

  collide(dt = 1 / 60) {
    const pl = this.player;
    const L = pl.x - 340, Rr = pl.x + 340;

    const solid = (o) => {
      if (o.x < L || o.x > Rr) return;
      const d = dist(o.x, o.y, pl.x, pl.y), min = o.hitR + pl.hitR;
      if (d < min) {
        const nx = (pl.x - o.x) / (d || 1), ny = (pl.y - o.y) / (d || 1);
        const speed = Math.hypot(pl.vx, pl.vy);
        pl.x = o.x + nx * min; pl.y = o.y + ny * min;
        const into = pl.vx * nx + pl.vy * ny;
        if (into < 0) { pl.vx -= into * nx; pl.vy -= into * ny; }
        if (speed > COMBAT.rockSplatSpeed) pl.hit(1, nx * 150, ny * 150, Audio, this.particles);
      }
    };
    for (const r of this.world.rocks) solid(r);
    for (const c of this.world.corals) solid(c);
    for (const a of this.world.anchors) solid(a);

    for (const u of this.world.urchins) {
      if (u.x < L || u.x > Rr) continue;
      const d = dist(u.x, u.y, pl.x, pl.y);
      if (d < u.hitR + pl.hitR) {
        const nx = (pl.x - u.x) / (d || 1), ny = (pl.y - u.y) / (d || 1);
        if (pl.hit(URCHIN.damage, nx * 200, ny * 200, Audio, this.particles)) { pl.x = u.x + nx * (u.hitR + pl.hitR); pl.y = u.y + ny * (u.hitR + pl.hitR); }
      }
    }

    for (const m of this.world.mines) {
      if (m.dead || m.x < L || m.x > Rr) continue;
      const d = dist(m.x, m.y, pl.x, pl.y);
      if (d < m.hitR + pl.hitR) {
        m.dead = true;
        const nx = (pl.x - m.x) / (d || 1), ny = (pl.y - m.y) / (d || 1);
        this.particles.burst(m.x, m.y, 'foam', 18, 280); this.particles.burst(m.x, m.y, 'inkpuff', 10, 180);
        this.particles.spawn(m.x, m.y, 'ring', 0, 0, { color: P.danger, life: 0.5, size: 12 });
        Audio.sfx('mine');
        pl.vx += nx * MINE.blastKnock; pl.vy += ny * MINE.blastKnock;
        pl.hit(MINE.damage, 0, 0, Audio, this.particles);
      }
    }

    // whirlpools — drag the player toward the eye + a gentle tangential spin.
    // No damage; the danger is being pulled into hazards.
    for (const w of this.world.whirlpools) {
      if (w.x < L || w.x > Rr) continue;
      const dx = w.x - pl.x, dy = w.y - pl.y, d = Math.hypot(dx, dy) || 1;
      if (d < w.r) {
        const f = 1 - d / w.r;
        const nx = dx / d, ny = dy / d;
        pl.vx += nx * WHIRLPOOL.pull * f * dt;
        pl.vy += ny * WHIRLPOOL.pull * f * dt;
        pl.vx += -ny * WHIRLPOOL.swirl * f * dt;
        pl.vy += nx * WHIRLPOOL.swirl * f * dt;
        if (Math.random() < 0.2 * f) this.particles.spawn(pl.x, pl.y, 'bubble', -nx * 60, -ny * 60);
      }
    }

    // sea vents — a strong updraft inside the rising column, plus a touch of
    // centring so you can't ride the edge. Capped + clearly telegraphed.
    for (const v of this.world.vents) {
      if (v.x < L || v.x > Rr) continue;
      if (v.inColumn(pl.x, pl.y)) {
        pl.vy -= VENT.lift * dt;
        pl.vx += clamp(v.x - pl.x, -1, 1) * VENT.lateral * dt;
        if (Math.random() < 0.3) this.particles.spawn(pl.x + (Math.random() - 0.5) * v.r, pl.y, 'bubble', 0, -120);
      }
    }

    for (const h of this.world.hooks) {
      if (h.biteCD > 0 || h.x < L || h.x > Rr) continue;
      const bp = h.baitPoint();
      if (dist(bp.x, bp.y, pl.x, pl.y) < h.hitR + pl.hitR + 6) {
        if (pl.hit(HOOK.damage, (pl.x - h.x) * 0.6, -220, Audio, this.particles)) { h.biteCD = 1.6; this.particles.burst(bp.x, bp.y, 'foam', 8, 160); }
      }
    }

    // biting predators (one array, per-instance damage)
    this.handleBite(this.enemies);

    // lionfish — a contact hazard: brushing its venomous spines stings + poisons.
    // (canBite()=>false so handleBite/telegraph skip it; handled here.)
    for (const e of this.enemies) {
      if (e.kind !== 'lionfish' || e.x < L || e.x > Rr) continue;
      const sp = e.spinePoint();
      if (dist(sp.x, sp.y, pl.x, pl.y) < pl.hitR + e.hitR) {
        pl.poison = Math.max(pl.poison, STATUS.poisonTime);
        if (pl.hit(LIONFISH.damage, (pl.x - e.x) * 1.4, (pl.y - e.y) * 1.4, Audio, this.particles)) this.runHits++;
      }
    }

    // electric ray — radial shock (not a bite): the discharge ring zaps + stuns.
    for (const e of this.enemies) {
      if (e.kind !== 'torpedo' || !e.canBite() || e.x < L || e.x > Rr) continue;
      const d = dist(e.x, e.y, pl.x, pl.y);
      if (d < e.shockRadius() + pl.hitR) {
        const nx = (pl.x - e.x) / (d || 1), ny = (pl.y - e.y) / (d || 1);
        if (pl.hit(TORPEDO.damage, nx * 240, ny * 240, Audio, this.particles)) {
          pl.stunFor(TORPEDO.stun);
          e.biteCD = Math.max(e.biteCD, 1.0);
          this.runHits++;
          this.particles.spawn(e.x, e.y, 'ring', 0, 0, { color: P.bio, life: 0.5, size: 16 });
          for (let i = 0; i < 10; i++) this.particles.spawn(pl.x, pl.y, 'glow', (Math.random() - 0.5) * 160, (Math.random() - 0.5) * 160, { color: P.bio, life: 0.6 });
          Audio.sfx('hurt');
        }
      }
    }

    for (const pf of this.puffers) {
      if (!pf.spiky || pf.x < L || pf.x > Rr) continue;
      if (dist(pf.x, pf.y, pl.x, pl.y) < pf.hitR + pl.hitR) pl.hit(PUFFER.damage, (pl.x - pf.x) * 1.6, (pl.y - pf.y) * 1.6, Audio, this.particles);
    }

    for (const s of this.squids) {
      if (!s.canBite()) continue;
      const bp = s.bitePoint();
      if (pl.invuln <= 0 && !pl.captured && dist(bp.x, bp.y, pl.x, pl.y) < pl.hitR + s.r * 0.7) { pl.grabbed = s; pl.grabT = 0; pl.grabEsc = 0; s.state = 'hold'; s.t = 0; Audio.sfx('snare'); }
    }

    for (const b of this.boats) {
      const pp = b.propPoint();
      if (dist(pp.x, pp.y, pl.x, pl.y) < pl.hitR + BOAT.propRadius) {
        if (pl.hit(BOAT.propDamage, (pl.x - pp.x) * 2, -180, Audio, this.particles)) { this.runHits++; this.particles.burst(pl.x, pl.y, 'foam', 14, 220); }
      }
      const nb = b.netBounds();
      if (pl.invuln <= 0 && !pl.captured && pl.x > nb.x0 && pl.x < nb.x1 && pl.y > nb.y0 && pl.y < nb.y1) { pl.caught = b; pl.haul = 0; pl.escape = 0; this.netDrainT = 0; Audio.sfx('snare'); }
    }

    // jellyfish — sting AND slow you (swarms are deadly)
    for (const j of this.jellies) {
      if (dist(j.x, j.y, pl.x, pl.y) < pl.hitR + j.hitR) {
        pl.slow = STATUS.slowTime;
        if (pl.hit(JELLY.damage, (pl.x - j.x) * 2, (pl.y - j.y) * 2, Audio, this.particles)) { j.driftX = (pl.x - j.x); this.runHits++; }
      }
    }

    // plastic bags — look like jellyfish, poison you
    for (const b of this.world.bags) {
      if (b.x < L || b.x > Rr) continue;
      if (dist(b.x, b.y, pl.x, pl.y) < pl.hitR + b.hitR) {
        pl.poison = Math.max(pl.poison, STATUS.poisonTime);
        pl.hit(PLASTIC.damage, (pl.x - b.x) * 1.2, (pl.y - b.y) * 1.2, Audio, this.particles);
      }
    }

    // booster pickups
    for (const bo of this.world.boosters) {
      if (bo.dead || bo.x < L - 40 || bo.x > Rr + 40) continue;
      if (dist(bo.x, bo.y, pl.x, pl.y) < pl.hitR + bo.r + 10) {
        bo.dead = true; pl.applyBoost(bo.type);
        if (bo.type === 'nurse') this.nurse = new NurseShark(pl.x - pl.face * pl.r * 1.7, pl.y + pl.r * 0.9);
        const def = BOOSTERS.find((d) => d.id === bo.type);
        this.banner = { text: (def ? def.name : 'Booster') + '!', life: 2.0 };
        Audio.sfx('buy'); this.particles.burst(bo.x, bo.y, 'sparkle', 14, 160, { color: def ? def.color : '#ffd97a' });
      }
    }

    // plankton -> collected count + run points (NO eggs mid-run)
    for (const p of this.world.plankton) {
      if (p.dead || p.x < L - 60 || p.x > Rr + 60) continue;
      if (dist(p.x, p.y, pl.x, pl.y) < pl.hitR + p.r + 14) {
        p.dead = true;
        this.runPlankton += p.value;
        this.runPoints += p.value * ECONOMY.pointsPerPlankton;
        pl.mouth = 1;
        Audio.sfx('pickup');
        this.particles.burst(p.x, p.y, 'sparkle', p.value > 1 ? 12 : 6, 150, { color: P.amberSoft });
        if (p.value > 1 && pl.hp < pl.maxHp && Math.random() < 0.4) pl.hp++;
      }
    }
  }

  handleBite(arr) {
    const pl = this.player;
    for (const e of arr) {
      if (e.kind === 'torpedo') continue;   // ray uses a radial shock, not a bite
      if (!e.canBite || !e.canBite()) continue;
      const bp = e.bitePoint();
      if (dist(bp.x, bp.y, pl.x, pl.y) < pl.hitR + e.r * 0.5 + 16) {
        const kb = e.kind === 'orca' ? 2.4 : 1.4;
        if (pl.hit(e.damage, (pl.x - e.x) * kb, (pl.y - e.y) * kb, Audio, this.particles)) {
          e.biteCD = 1.3; e.state = 'rest'; e.t = 0; this.runHits++;
          if (e.kind === 'cookiecutter') { pl.addWound(); this.particles.burst(pl.x, pl.y, 'blood', 18, 280); }     // cut like a cookie
        }
      }
    }
  }

  updateCaught(dt, now) {
    const pl = this.player, b = pl.caught;
    if (!b) return;
    pl.x = lerp(pl.x, b.x, clamp(dt * 1.8, 0, 1));
    const surfTarget = b.hullY + 46;
    pl.y = lerp(pl.y, lerp(seabedLimit(pl.r), surfTarget, pl.haul), clamp(dt * 4, 0, 1));
    pl.vx *= 0.8; pl.vy *= 0.8;
    pl.haul += dt / COMBAT.netSnareTime;
    // tangled in the net — bleeding out while you struggle
    this.netDrainT += dt;
    if (this.netDrainT >= 2.2) { this.netDrainT = 0; pl.tickDamage(1, this.particles); if (!pl.alive) { pl.caught = null; this.die('caught'); return; } }
    const slip = 1 + pl.slipLevel * 0.4;
    let struggling = Input.speed > 650;
    if (!struggling && Math.hypot(Input.dir.x, Input.dir.y) > 0.1) struggling = true;
    if (struggling) {
      pl.haul -= dt * 1.5 * slip; pl.escape += dt * 0.85 * slip;
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

  updateGrabbed(dt, now) {
    const pl = this.player, s = pl.grabbed;
    if (!s) return;
    const tx = s.x + s.face * s.r * 0.5, ty = s.y;
    pl.x = lerp(pl.x, tx, clamp(dt * 3, 0, 1)); pl.y = lerp(pl.y, ty, clamp(dt * 3, 0, 1));
    pl.vx *= 0.7; pl.vy *= 0.7;
    pl.grabT += dt / SQUID.grabTime;
    const slip = 1 + pl.slipLevel * 0.45;
    let struggling = Input.speed > 620;
    if (!struggling && Math.hypot(Input.dir.x, Input.dir.y) > 0.1) struggling = true;
    if (struggling) { pl.grabT -= dt * 1.3 * slip; pl.grabEsc += dt * 0.9 * slip; if (Math.random() < 0.5) this.particles.spawn(pl.x, pl.y, 'bubble', (Math.random() - 0.5) * 140, -40); }
    pl.grabT = clamp(pl.grabT, 0, 1.3);
    if (pl.grabEsc >= 1) {
      const a = Math.atan2(pl.y - s.y, pl.x - s.x);
      pl.grabbed = null; pl.invuln = Math.max(pl.invuln, 0.7); pl.vx = Math.cos(a) * 260; pl.vy = Math.sin(a) * 260 - 60;
      s.state = 'rest'; s.t = 0; s.biteCD = 1.8; Audio.sfx('escape'); this.particles.burst(pl.x, pl.y, 'bubble', 12, 160);
    } else if (pl.grabT >= 1) {
      const a = Math.atan2(pl.y - s.y, pl.x - s.x);
      s.state = 'rest'; s.t = 0; s.biteCD = 1.8; pl.grabbed = null;
      pl.hit(SQUID.damage, Math.cos(a) * 200, Math.sin(a) * 200, Audio, this.particles);
      pl.stunFor(0.5);
      if (!pl.alive) this.die('squid');
    }
  }

  // a short cutscene at each region checkpoint: lay a small clutch (banked at
  // once) from the plankton gathered since the last checkpoint + current health.
  beginCheckpointLay(zi) {
    this.state = 'cplay'; this.cpT = 0; this.cpZone = zi;
    const since = Math.max(0, this.runPlankton - (this.cpPlanktonMark || 0));
    this.cpPlanktonMark = this.runPlankton;
    const s = this.stats();
    this.cpEggs = Math.max(0, Math.round((since * ECONOMY.cpClutchPerPlankton + this.player.hp * ECONOMY.healthMul) * 0.5 * (1 + s.roeLevel)));
    this.cpLaid = 0;
    this.save.eggs += this.cpEggs;
    this.save.laidTotal = (this.save.laidTotal || 0) + this.cpEggs;
    this.persist();
    this.player.vx *= 0.3; this.player.vy *= 0.3;
    Audio.sfx('eggs');
  }
  updateCheckpointLay(dt) {
    this.cpT += dt;
    const pl = this.player;
    pl.vx *= 0.9; pl.vy *= 0.9; pl.mouth = 0.4;
    pl.y += Math.sin(this.cpT * 3) * 6 * dt;                 // gentle bob
    const dur = 2.4, prog = clamp(this.cpT / dur, 0, 1);
    this.cpLaid = Math.round(this.cpEggs * prog);
    if (Math.random() < 0.7) this.particles.spawn(pl.x - pl.r, pl.y + (Math.random() - 0.5) * pl.r, 'egg', -50 - Math.random() * 60, (Math.random() - 0.5) * 60, { life: 3.2, size: 4 + Math.random() * 4 });
    if (Math.random() < 0.3) this.particles.spawn(pl.x, pl.y, 'sparkle', (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100, { color: P.amberSoft });
    if (this.nurse) { this.nurse.update(dt, pl, this.particles); if (this.nurse.dead) this.nurse = null; }
    const camTarget = clamp(pl.x - this.view.worldViewW * 0.34, 0, Math.max(0, this.world.goal + 240 - this.view.worldViewW));
    this.camX = lerp(this.camX, camTarget, clamp(dt * 3, 0, 1));
    Input.takeTap(); Input.anyJustPressed();                // flush input during the beat
    if (this.cpT > dur + 0.5) {
      this.state = 'play';
      this.banner = { text: STR.checkpoint(WORLD.zones[this.cpZone].name), life: 2.4 };
    }
  }
  beginLaying() {
    if (this.state !== 'play') return;
    this.state = 'laying';
    this.layT = 0; this.layCount = 0; this.effort = 0; this.layDone = false; this.layTaps = 0;
    this.runEggs = 0;            // accumulator: eggs laid this mini-game
    this._laySfxT = 0;
    this.player.vx *= 0.3; this.player.vy *= 0.3;
    Audio.sfx('eggs');
    // nurse pet heals to full (rewarding more eggs) then swims away
    if (this.nurse) this.nurse.beginLayHeal(this.player, this.particles);
    // eggs accrue per second at full effort; the plankton you ate MULTIPLIES it
    const s = this.stats();
    this.layRoeMul = 1 + s.roeLevel;
    this.layPlanktonMul = 1 + this.runPlankton * ECONOMY.planktonBonusPer;
    this.layRatePerSec = (ECONOMY.layBase + this.player.hp * ECONOMY.healthMul) * this.layRoeMul * this.layPlanktonMul;
  }
  updateLaying(dt) {
    this.layT += dt;
    const pl = this.player;
    pl.vx *= 0.92; pl.vy *= 0.92; pl.mouth = 0.4;
    const dur = ECONOMY.layDuration;

    // CLICK / TAP as fast as you can — each press kicks the FRENZY meter up and
    // pops out an egg. (dragging fast helps too, but clicking is the core verb.)
    if (Input.anyJustPressed()) {
      this.effort = clamp(this.effort + ECONOMY.effortPerClick, 0, 1);
      this.layTaps = (this.layTaps || 0) + 1;
      this.particles.spawn(pl.x - pl.r, pl.y + (Math.random() - 0.5) * pl.r, 'egg', -60 - Math.random() * 80, (Math.random() - 0.5) * 90, { life: 3.4, size: 5 + Math.random() * 4 });
    }
    let drive = 0;
    if (Input.active) drive = clamp(Input.speed / 900, 0, 1.2);
    const dm = Math.hypot(Input.dir.x, Input.dir.y);
    if (dm > drive) drive = dm;
    this.effort += drive * ECONOMY.effortPerInput * 60 * dt;
    this.effort -= ECONOMY.effortDrainPerSec * dt;
    this.effort = clamp(this.effort, 0, 1);

    // eggs accrue from sustained effort — plankton multiplier already baked in
    const rate = (ECONOMY.layMinRate + (1 - ECONOMY.layMinRate) * this.effort) * this.layRatePerSec;
    this.runEggs += rate * dt;
    this.layCount = Math.floor(this.runEggs);
    this.eggsTarget = this.layCount;

    // a throttled little chime so a fast frenzy sounds satisfying, not spammy
    this._laySfxT = (this._laySfxT || 0) + dt;
    if (this.effort > 0.05 && this._laySfxT > 0.11) { this._laySfxT = 0; Audio.sfx('pickup'); }
    if (Math.random() < 0.2 + this.effort * 0.5) this.particles.spawn(pl.x, pl.y, 'sparkle', (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120, { color: P.amberSoft });

    if (this.layT >= dur && !this.layDone) {
      this.layDone = true;
      this.eggsTarget = this.layCount = Math.floor(this.runEggs);
      this.save.eggs += this.eggsTarget;
      this.save.laidTotal = (this.save.laidTotal || 0) + this.eggsTarget;
      this.save.wins = (this.save.wins || 0) + 1;
      this.save.best = this.world.goal;
      this.runBanked = true;
      this.persist();
      this.ending = this.pickEnding();
      this.state = 'win';
    }
  }

  die(cause) {
    if (this.state !== 'play') return;
    this.deathCause = cause;
    if (this.nurse) this.nurse.leave();
    const msgs = STR.deaths;
    const byCause = { caught: 2, squid: 10 };
    this.deathMsg = cause in byCause ? msgs[byCause[cause]] : msgs[Math.floor(Math.random() * msgs.length)];
    this.particles.burst(this.player.x, this.player.y, 'blood', 32, 260);
    this.particles.burst(this.player.x, this.player.y, 'gore', 9, 90);
    Audio.sea(false);
    this.reviveCost = Math.round(25 + this.checkpointRegionIdx * 22);
    this.canRevive = (this.stats().wind > 0 && !this.usedWind) || this.save.eggs >= this.reviveCost;
    this.state = 'dying'; this.dyingT = 0;   // sink, sadly, before the end screen
  }

  // the limp, sinking death — drift down to the seabed, then show the screen
  updateDying(dt) {
    this.dyingT += dt;
    const pl = this.player;
    pl.vy = Math.min(260, pl.vy + 240 * dt); pl.vx *= 0.95;
    pl.x += pl.vx * dt; pl.y += pl.vy * dt;
    pl.y = Math.min(pl.y, REF_H - WATER.seabedBand - pl.r * 0.3);
    pl.pitch = lerp(pl.pitch, 1.6, dt * 1.3);     // roll limp
    pl.flap += dt * 0.5;
    if (Math.random() < 0.5) this.particles.spawn(pl.x + (Math.random() - 0.5) * pl.r, pl.y, 'bubble', (Math.random() - 0.5) * 30, -30);
    if (this.player.wounds.length && Math.random() < 0.4) this.particles.spawn(pl.x + (Math.random() - 0.5) * pl.r, pl.y, 'blood', (Math.random() - 0.5) * 20, 24, { life: 1.4 });
    if (this.nurse) { this.nurse.update(dt, pl, this.particles); if (this.nurse.dead) this.nurse = null; }
    const camTarget = clamp(pl.x - this.view.worldViewW * 0.34, 0, Math.max(0, this.world.goal + 240 - this.view.worldViewW));
    this.camX = lerp(this.camX, camTarget, clamp(dt * 2, 0, 1));
    Input.takeTap(); Input.anyJustPressed();   // death is unskippable — flush & ignore input
    if (this.dyingT > 2.6) this.state = 'dead';
  }

  // intro: a hopeful egg hatches, you swim with your sibling, the sea takes them
  updateIntro(dt) {
    Input.takeTap(); Input.anyJustPressed();   // the intro is unskippable — flush & ignore input
    this.introT += dt;
    if (this.introT >= 13.2) { Audio.unlock(); this.beginPlay(); }
  }

  bankRun() {
    if (this.runBanked) return; this.runBanked = true;
    this.save.best = Math.max(this.save.best, Math.round(this.player.x));
    // death banks a consolation of half your collected plankton, as eggs
    const consolation = Math.floor(this.runPlankton * ECONOMY.consolationPlankton);
    this.save.eggs += consolation;
    this.runConsolation = consolation;
    this.save.runs = (this.save.runs || 0) + 1;
    this.persist();
  }

  continueRun() {
    const free = this.stats().wind > 0 && !this.usedWind;
    if (free) this.usedWind = true;
    else { if (this.save.eggs < this.reviveCost) { Audio.sfx('hurt'); return; } this.save.eggs -= this.reviveCost; this.persist(); }
    const pl = this.player;
    pl.alive = true; pl.hp = pl.maxHp; pl.caught = null; pl.grabbed = null; pl.stun = 0;
    pl.poison = 0; pl.parasites = 0; pl.slow = 0;
    pl.x = Math.max(60, this.checkpointX + 140); pl.y = REF_H * 0.5; pl.vx = 0; pl.vy = 0; pl.invuln = 2.6;
    this.clearEntities();
    this.spawnIdx = 0; this.spawnCD = 0;
    const sp = this.world.spawners;
    while (this.spawnIdx < sp.length && sp[this.spawnIdx].x < pl.x + 200) this.spawnIdx++;
    this.regionIdx = zoneIndexAt(pl.x);
    this.recenterCamera();
    this.banner = { text: WORLD.zones[this.regionIdx].name, life: 2.4 };
    Audio.unlock(); Audio.sea(true); Audio.music(true);
    this.state = 'play';
  }

  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) {} }

  // ----- menu / shop / wardrobe / loot / end input ------------------------
  updateUI(dt) {
    if (this.state === 'loot') this.updateLoot(dt);
    const tap = Input.takeTap();
    const key = Input.anyJustPressed();
    if (this.state === 'menu') {
      if (tap) {
        const hit = this.hitButton(tap);
        if (hit === 'shop') { this.state = 'shop'; Audio.sfx('ui'); return; }
        if (hit === 'wardrobe') { this.state = 'wardrobe'; Audio.sfx('ui'); return; }
        if (hit === 'loot') { this.openLoot(); return; }
        if (hit === 'mute') { this.save.mute = Audio.toggleMute(); this.persist(); return; }
      }
      if (tap || key) { Audio.unlock(); this.startRun(true); }
    } else if (this.state === 'shop') {
      if (tap) { const hit = this.hitButton(tap); if (hit === 'back') { this.state = 'menu'; Audio.sfx('ui'); } else if (hit && hit.startsWith('buy:')) this.buy(hit.slice(4)); }
      else if (key) { this.state = 'menu'; Audio.sfx('ui'); }
    } else if (this.state === 'wardrobe') {
      if (tap) { const hit = this.hitButton(tap); if (hit === 'back') { this.state = 'menu'; Audio.sfx('ui'); } else if (hit === 'loot') { this.openLoot(); } else if (hit && hit.startsWith('equip:')) this.equip(hit.slice(6)); }
      else if (key) { this.state = 'menu'; Audio.sfx('ui'); }
    } else if (this.state === 'loot') {
      if (tap) { const hit = this.hitButton(tap); if (hit === 'back') { this.state = 'wardrobe'; Audio.sfx('ui'); } else if (hit === 'crack') this.crackClam(); else if (hit === 'wear' && this.loot.result) { this.equip(this.loot.result.skin.id); this.state = 'wardrobe'; } }
    }
  }

  updateEnd() {
    const tap = Input.takeTap();
    const key = Input.anyJustPressed();
    if (this.state === 'dead' && tap) {
      const hit = this.hitButton(tap);
      if (hit === 'revive') { this.continueRun(); return; }
      if (hit === 'shop') { this.bankRun(); this.state = 'shop'; Audio.sfx('ui'); return; }
      if (hit === 'wardrobe') { this.bankRun(); this.state = 'wardrobe'; Audio.sfx('ui'); return; }
      this.bankRun(); Audio.sfx('ui'); this.state = 'menu'; return;
    }
    if (this.state === 'win' && tap) {
      const hit = this.hitButton(tap);
      if (hit === 'shop') { this.state = 'shop'; Audio.sfx('ui'); return; }
      if (hit === 'wardrobe') { this.state = 'wardrobe'; Audio.sfx('ui'); return; }
      Audio.sfx('ui'); this.state = 'menu'; return;
    }
    if (key) { if (this.state === 'dead') this.bankRun(); Audio.sfx('ui'); this.state = 'menu'; }
  }

  hitButton(tap) { for (const b of this._buttons) if (tap.x >= b.x && tap.x <= b.x + b.w && tap.y >= b.y && tap.y <= b.y + b.h) return b.id; return null; }
  buy(id) {
    const def = UPGRADES.find((u) => u.id === id); if (!def) return;
    const lvl = this.save.upg[id] || 0; if (lvl >= def.max) return;
    const cost = def.baseCost + def.step * lvl;
    if (this.save.eggs < cost) { Audio.sfx('hurt'); return; }
    this.save.eggs -= cost; this.save.upg[id] = lvl + 1; this.persist(); Audio.sfx('buy');
  }
  equip(id) { if (!this.owns(id)) return; this.save.skin = id; if (this.player) this.player.skin = this.skinObj(); this.persist(); Audio.sfx('equip'); }

  openLoot() { this.state = 'loot'; this.loot = { phase: 'idle', t: 0, result: null, msg: null }; Audio.sfx('ui'); }
  updateLoot(dt) { const l = this.loot; l.t += dt; if (l.phase === 'opening' && l.t > 1.25) { l.phase = 'reveal'; l.t = 0; Audio.sfx('reveal'); } }
  crackClam() {
    const l = this.loot; if (l.phase === 'opening') return;
    if (this.save.eggs < LOOTBOX.cost) { l.msg = STR.lootNeed; Audio.sfx('hurt'); return; }
    this.save.eggs -= LOOTBOX.cost; l.result = this.rollSkin(); l.phase = 'opening'; l.t = 0; l.msg = null; this.persist(); Audio.sfx('chest');
  }
  rollSkin() {
    const keys = Object.keys(RARITY);
    let total = 0; for (const k of keys) total += RARITY[k].weight;
    let r = Math.random() * total, rar = keys[0];
    for (const k of keys) { r -= RARITY[k].weight; if (r <= 0) { rar = k; break; } }
    // never award the starter Moonfish; always prefer a skin you don't own yet,
    // so every clam gives something NEW until the wardrobe is complete.
    const lootable = SKINS.filter((s) => s.id !== DEFAULT_SKIN);
    let pool = lootable.filter((s) => s.rarity === rar && !this.owns(s.id));
    if (!pool.length) pool = lootable.filter((s) => !this.owns(s.id));     // any new skin, any rarity
    let dupe = false;
    if (!pool.length) { pool = lootable.filter((s) => s.rarity === rar); dupe = true; }  // collection complete
    if (!pool.length) pool = lootable;
    const skin = pool[Math.floor(Math.random() * pool.length)];
    let refund = 0;
    if (this.owns(skin.id)) { dupe = true; refund = RARITY[skin.rarity].refund; this.save.eggs += refund; }
    else this.save.skins.push(skin.id);
    return { skin, dupe, refund };
  }

  // ---------------------------------------------------------------- RENDER
  render(ctx, view) {
    this.view = view; this.view.camX = this.camX;
    // live music level/beat (synced visuals pulse with whatever song is playing)
    this.musicLevel = Audio.level(); this.musicBeat = Audio.beat();
    const vis = this.zoneVisuals();
    this.bg.render(ctx, { ...view, camX: this.camX }, this.t, vis.tint, vis.dark, vis.zoneId, this.musicLevel);

    const worldState = this.state === 'play' || this.state === 'laying' || this.state === 'cplay' || this.state === 'dead' || this.state === 'win' || this.state === 'dying';
    if (worldState) this.renderWorld(ctx, view);
    else if (this.state !== 'intro') this.renderMenuWorld(ctx, view);

    this._buttons = [];
    if (this.state === 'menu') this.renderMenu(ctx, view);
    else if (this.state === 'shop') this.renderShop(ctx, view);
    else if (this.state === 'wardrobe') this.renderWardrobe(ctx, view);
    else if (this.state === 'loot') this.renderLoot(ctx, view);
    else if (this.state === 'intro') this.renderIntro(ctx, view);
    else if (this.state === 'win') this.renderWin(ctx, view);
    else if (this.state === 'dead') this.renderDead(ctx, view);
    else if (this.state === 'dying') this.renderDyingOverlay(ctx, view);
    else this.renderHUD(ctx, view);
  }

  zoneVisuals() {
    const uiState = this.state === 'menu' || this.state === 'shop' || this.state === 'wardrobe' || this.state === 'loot';
    if (uiState || !this.world) { const z = WORLD.zones[0]; return { tint: z.tint, dark: 0, zoneId: z.id }; }
    const x = this.player ? this.player.x : 0, f = x / WORLD.goalDistance;
    let prev = WORLD.zones[0];
    for (let i = 0; i < WORLD.zones.length; i++) {
      const z = WORLD.zones[i];
      if (f <= z.end) { const start = i === 0 ? 0 : WORLD.zones[i - 1].end; const tt = clamp((f - start) / (z.end - start), 0, 1); return { tint: mixHex(prev.tint, z.tint, tt), dark: lerp(prev.dark, z.dark, tt), zoneId: z.id }; }
      prev = z;
    }
    const z = WORLD.zones[WORLD.zones.length - 1];
    return { tint: z.tint, dark: z.dark, zoneId: z.id };
  }

  worldXform(ctx, view) { ctx.save(); ctx.scale(view.scale, view.scale); ctx.translate(-this.camX, 0); }

  // live wave surge at a world x, so kelp etc. sway in time with the push
  waveFlow(x) { return Math.sin(this.t * WAVE.freq + x * WAVE.swirl); }
  // displacement of kelp as the player swims through it (proximity × velocity)
  kelpPush(x) {
    const pl = this.player; if (!pl) return 0;
    const prox = clamp(1 - Math.abs(pl.x - x) / 95, 0, 1);
    return prox * clamp(pl.vx / 240, -1.3, 1.3);
  }

  renderWorld(ctx, view) {
    this.worldXform(ctx, view);
    const L = this.camX - 140, Rr = this.camX + view.worldViewW + 140;
    const inView = (x) => x > L && x < Rr;
    for (const k of this.world.kelp) if (inView(k.x)) k.render(ctx, this.t, this.waveFlow(k.x), this.kelpPush(k.x));
    for (const c of this.world.currents) if (c.x1 > L && c.x0 < Rr) this.bg.drawCurrent(ctx, c, this.t);
    for (const a of this.world.anchors) if (inView(a.x)) a.render(ctx);
    for (const r of this.world.rocks) if (inView(r.x)) r.render(ctx);
    for (const c of this.world.corals) if (inView(c.x)) c.render(ctx);
    for (const u of this.world.urchins) if (inView(u.x)) u.render(ctx);
    for (const bo of this.world.boosters) if (!bo.dead && inView(bo.x)) bo.render(ctx, this.t);
    for (const p of this.world.plankton) if (!p.dead && inView(p.x)) p.render(ctx);
    for (const h of this.world.hooks) if (inView(h.x)) h.render(ctx, this.t);
    for (const m of this.world.mines) if (!m.dead && inView(m.x)) m.render(ctx, this.t);
    for (const w of this.world.whirlpools) if (inView(w.x)) w.render(ctx, this.t);
    for (const v of this.world.vents) if (inView(v.x)) v.render(ctx, this.t);
    for (const b of this.world.bags) if (inView(b.x)) b.render(ctx, this.t);
    for (const j of this.jellies) j.render(ctx, this.t);
    for (const s of this.puffers) s.render(ctx, this.t);
    for (const c of this.copepods) c.render(ctx, this.t);
    // attack-area telegraphs so you can read & dodge
    if (this.state === 'play') { for (const e of this.enemies) this.drawDanger(ctx, e); for (const s of this.squids) this.drawDanger(ctx, s); }
    for (const e of this.enemies) e.render(ctx, this.t);
    for (const s of this.squids) s.render(ctx, this.t);
    for (const b of this.boats) b.render(ctx, this.t, this.player.caught === b);
    for (const g of this.seagulls) g.render(ctx, this.t);
    if (this.nurse) this.nurse.render(ctx, this.t);
    if (this.player) this.player.render(ctx, this.t);
    this.particles.render(ctx);
    if (this.world.goal > L && this.world.goal < Rr + 400) this.drawGoal(ctx);
    ctx.restore();
  }

  // translucent red lane showing where a wind-up attack will land
  drawDanger(ctx, e) {
    if (!e.telegraphing || !e.telegraphing()) return;
    const pl = this.player, bp = e.bitePoint();
    let ax = pl.x - bp.x, ay = pl.y - bp.y; const m = Math.hypot(ax, ay) || 1; ax /= m; ay /= m;
    const len = (e.reach || 300), w = e.r * 0.6 + 18;
    const px = -ay, py = ax;
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.3 * Math.sin(this.t * 16);
    ctx.fillStyle = rgba(P.danger, 0.16); ctx.strokeStyle = rgba(P.danger, 0.55); ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bp.x + px * w, bp.y + py * w);
    ctx.lineTo(bp.x + ax * len + px * w * 0.5, bp.y + ay * len + py * w * 0.5);
    ctx.lineTo(bp.x + ax * len - px * w * 0.5, bp.y + ay * len - py * w * 0.5);
    ctx.lineTo(bp.x - px * w, bp.y - py * w);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  drawGoal(ctx) {
    const gx = this.world.goal, top = WATER.surfaceBand, bot = REF_H - WATER.seabedBand;
    ctx.save();
    const g = ctx.createLinearGradient(gx, top, gx, bot);
    g.addColorStop(0, rgba(P.amberSoft, 0.0)); g.addColorStop(0.5, rgba(P.amberSoft, 0.22)); g.addColorStop(1, rgba(P.amber, 0.0));
    ctx.fillStyle = g; ctx.fillRect(gx - 80, top, 240, bot - top);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = rgba(P.amberSoft, 0.5); ctx.beginPath(); ctx.arc(gx + 30 + Math.sin(this.t + i) * 20, top + 60 + i * (bot - top) / 5, 4, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  renderMenuWorld(ctx, view) {
    this.worldXform(ctx, { ...view });
    if (this.state === 'menu') {
      const cx = this.camX + view.worldViewW * 0.5;
      const cy = REF_H * 0.52 + Math.sin(this.menuFlap * 0.7) * 18;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(this.menuFlap * 0.5) * 0.06);
      drawSunfish(ctx, 64, this.t, { flap: this.menuFlap, blink: 1, lookX: 1, skin: this.skinObj() });
      ctx.restore();
    }
    this.particles.render(ctx);
    ctx.restore();
  }

  // intro cutscene: a hopeful egg hatches, you swim with a sibling, the sea
  // takes them. Skippable. Drawn in screen space over the ocean backdrop.
  renderIntro(ctx, view) {
    const { w, h } = view; const S = view.scale; const T = this.introT; const cx = w / 2, cy = h * 0.46;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // soft rising bubbles throughout, for life
    for (let i = 0; i < 12; i++) {
      const bx = cx + Math.sin(i * 2.1) * w * 0.32;
      const by = h - ((T * 28 + i * 82) % (h * 0.95));
      ctx.fillStyle = rgba('#dff3f7', 0.16);
      ctx.beginPath(); ctx.arc(bx, by, (1.3 + (i % 3)) * S, 0, TAU); ctx.fill();
    }
    if (T < 4.6) {
      // a hopeful egg, jiggling, then cracking slowly open
      const hatch = clamp((T - 3.0) / 1.6, 0, 1);
      ctx.save(); ctx.translate(cx, cy + Math.sin(T * 1.5) * 6 * S); ctx.rotate(Math.sin(T * (3 + hatch * 6)) * 0.05 * (1 - hatch * 0.5));
      if (hatch < 1) drawEgg(ctx, 50 * S * (1 - hatch * 0.5));
      if (hatch > 0.2) { ctx.save(); const s = 0.35 + hatch * 0.75; ctx.scale(s, s); drawSunfish(ctx, 34 * S, this.t, { flap: this.menuFlap * 2, blink: 1, lookX: 1, skin: this.skinObj(), sad: 0.1 }); ctx.restore(); }
      ctx.restore();
    } else {
      const loss = clamp((T - 8.4) / 1.8, 0, 1);
      const together = clamp((T - 4.6) / 1.2, 0, 1);
      const sep = (38 + together * 20) * S + Math.sin(T * 1.2) * 8 * S;
      // you (left)
      ctx.save(); ctx.translate(cx - sep, cy + Math.sin(T * 1.6) * 9 * S); ctx.rotate(Math.sin(T * 1.3) * 0.08);
      drawSunfish(ctx, 40 * S, this.t, { flap: this.menuFlap * 1.5, blink: 1, lookX: 1, skin: this.skinObj(), sad: 0.12 + loss * 0.7 }); ctx.restore();
      // a little heart between you while you're together and happy
      if (T > 5.4 && T < 8.0) { ctx.save(); ctx.globalAlpha = 0.45 + 0.3 * Math.sin(T * 2); this.drawTinyHeart(ctx, cx, cy - 42 * S - Math.sin(T * 2) * 6 * S, (7 + Math.sin(T * 3)) * S); ctx.restore(); }
      // sibling (right) — fades as it's taken
      if (loss < 0.55) { ctx.save(); ctx.globalAlpha = 1 - loss / 0.55; ctx.translate(cx + sep, cy + Math.sin(T * 1.6 + 1) * 9 * S); ctx.rotate(Math.sin(T * 1.3 + 1) * 0.08); drawSunfish(ctx, 40 * S, this.t, { flap: this.menuFlap * 1.5, blink: 1, lookX: 1, skin: SKIN_BY_ID.moon }); ctx.restore(); }
      // the shadow looms in slowly, then strikes
      if (T > 7.6 && T < 10.2) { const k = clamp((T - 7.6) / 1.8, 0, 1); ctx.save(); ctx.translate(lerp(cx + w * 0.6, cx + sep, k), cy - 6 * S); ctx.scale(-1, 1); ctx.globalAlpha = 0.3 + 0.6 * k; drawShark(ctx, 80 * S, this.t, { mouth: clamp((k - 0.7) / 0.25, 0, 1), color: '#06121c' }); ctx.restore(); }
      if (loss >= 0.4) { ctx.save(); ctx.fillStyle = rgba(P.blood, 0.45 * (1 - (loss - 0.4) * 1.4)); ctx.beginPath(); ctx.arc(cx + sep, cy, 28 * S, 0, TAU); ctx.fill(); ctx.restore(); }
    }
    const line = T < 3.0 ? STR.intro.egg : T < 4.6 ? STR.intro.hatch : T < 8.4 ? STR.intro.siblings : STR.intro.loss;
    ctx.globalAlpha = 0.92; ctx.font = FONT(19, '700'); ctx.fillStyle = P.foam;
    line.split('\n').forEach((ln, i) => ctx.fillText(ln, cx, h * 0.78 + i * 26));
    ctx.globalAlpha = 1;
    if (T > 12.4) { ctx.fillStyle = rgba('#04101c', clamp((T - 12.4) / 0.8, 0, 1) * 0.85); ctx.fillRect(0, 0, w, h); }
  }
  drawTinyHeart(ctx, x, y, s) {
    ctx.fillStyle = rgba('#ff8fa3', 0.9);
    ctx.beginPath(); ctx.moveTo(x, y + s * 0.4);
    ctx.bezierCurveTo(x - s, y - s * 0.5, x - s * 0.4, y - s, x, y - s * 0.4);
    ctx.bezierCurveTo(x + s * 0.4, y - s, x + s, y - s * 0.5, x, y + s * 0.4); ctx.fill();
  }

  renderDyingOverlay(ctx, view) {
    const { w, h } = view; const a = clamp(this.dyingT / 2.6, 0, 1);
    ctx.fillStyle = rgba('#04101c', a * 0.5); ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = clamp(this.dyingT * 1.2, 0, 0.85); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = FONT(20, '700'); ctx.fillStyle = rgba(P.foam, 0.85); ctx.fillText(STR.deathSink, w / 2, h * 0.3);
    ctx.globalAlpha = 1;
  }

  // ---- HUD ----
  renderHUD(ctx, view) {
    const { w } = view; const pad = 14 * Math.max(1, view.scale * 0.7);
    const pl = this.player; if (!pl) return;
    // pain: the screen edges redden when hurt, and pulse when near death
    const lowHp = pl.alive && pl.hp <= 1;
    const hf = clamp(pl.hurt, 0, 1) * 0.5 + (lowHp ? 0.16 + 0.1 * Math.sin(this.t * 6) : 0);
    if (hf > 0.01) {
      const vg = ctx.createRadialGradient(w / 2, view.h / 2, view.h * 0.32, w / 2, view.h / 2, view.h * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, rgba(P.blood, clamp(hf, 0, 0.6)));
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, view.h);
    }
    for (let i = 0; i < pl.maxHp; i++) this.drawHeart(ctx, pad + i * 30, pad + 12, 11, i < pl.hp);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    // POINTS — the primary run score
    ctx.font = FONT(20, '800'); ctx.fillStyle = P.amber;
    ctx.fillText(`${this.runPoints.toLocaleString()}`, w - pad, pad + 10);
    ctx.font = FONT(9, '600'); ctx.fillStyle = rgba(P.foam, 0.6);
    ctx.fillText(STR.hudPoints, w - pad, pad + 25);
    // PLANKTON — collected count, with a small bio-green dot
    const py2 = pad + 44;
    ctx.fillStyle = P.bio; ctx.beginPath(); ctx.arc(w - pad - 64, py2, 5, 0, TAU); ctx.fill();
    ctx.font = FONT(15, '700'); ctx.fillStyle = P.foam; ctx.textAlign = 'right';
    ctx.fillText(`${Math.floor(this.runPlankton)}`, w - pad, py2);
    ctx.font = FONT(9, '600'); ctx.fillStyle = rgba(P.foam, 0.6);
    ctx.fillText(STR.hudPlankton, w - pad, py2 + 13);

    this.drawProgress(ctx, view);
    this.drawStatusChips(ctx, view, pad);

    if (this.stats().dashLevel > 0) {
      const r = 16, dx = pad + r, dy = view.h - pad - r;
      ctx.strokeStyle = rgba(P.foam, 0.4); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(dx, dy, r, 0, TAU); ctx.stroke();
      const ready = 1 - clamp(pl.dashCD / 1.15, 0, 1);
      ctx.strokeStyle = ready >= 1 ? P.amber : rgba(P.amberSoft, 0.7);
      ctx.beginPath(); ctx.arc(dx, dy, r, -Math.PI / 2, -Math.PI / 2 + ready * TAU); ctx.stroke();
      ctx.fillStyle = rgba(P.foam, 0.8); ctx.font = FONT(9); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('DASH', dx, dy);
    }
    if (this.banner) {
      const a = clamp(this.banner.life, 0, 1) * clamp(2.6 - this.banner.life, 0, 1);
      ctx.globalAlpha = clamp(a + 0.2, 0, 1);
      const bsc = 1 + (this.musicBeat || 0) * 0.06;
      ctx.save(); ctx.translate(w / 2, view.h * 0.26); ctx.scale(bsc, bsc);
      wobblyText(ctx, this.banner.text, 0, 0, 28, P.foam, 5);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    if (pl.caught || pl.grabbed) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(this.t * 10);
      wobblyText(ctx, pl.grabbed ? STR.grabbed : STR.caught, w / 2, view.h * 0.4, 26, '#ffd36b', 9);
      ctx.globalAlpha = 1;
      ctx.font = FONT(15); ctx.textAlign = 'center'; ctx.fillStyle = P.foam; ctx.fillText(STR.struggle, w / 2, view.h * 0.46);
      const bw = Math.min(260, w * 0.5), bx = (w - bw) / 2, by = view.h * 0.5;
      const haul = pl.grabbed ? pl.grabT : pl.haul, esc = pl.grabbed ? pl.grabEsc : pl.escape;
      ctx.fillStyle = rgba('#000', 0.4); roundRect(ctx, bx, by, bw, 12, 6); ctx.fill();
      ctx.fillStyle = P.blood; roundRect(ctx, bx, by, bw * clamp(haul, 0, 1), 12, 6); ctx.fill();
      ctx.fillStyle = P.amber; roundRect(ctx, bx, by + 16, bw * clamp(esc, 0, 1), 8, 4); ctx.fill();
    }
    if (this.state === 'cplay') {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // celebratory header + the points you just banked (and the plankton bonus)
      ctx.globalAlpha = clamp(this.cpT * 3, 0, 1);
      wobblyText(ctx, STR.checkpointHit, w / 2, view.h * 0.30, 26, P.amberSoft, 6);
      ctx.globalAlpha = 1;
      ctx.font = FONT(14, '800'); ctx.fillStyle = P.amber;
      const plk = this.cpPointsPlankton ? `   ·   +${this.cpPointsPlankton} plankton bonus` : '';
      ctx.fillText(`+${(this.cpPointsAwarded || 0).toLocaleString()} pts${plk}`, w / 2, view.h * 0.30 + 28);
      // the clutch laid at this checkpoint
      ctx.font = FONT(32, '800'); ctx.fillStyle = P.amber;
      ctx.fillText(`${(this.cpLaid || 0).toLocaleString()}`, w / 2, view.h * 0.155);
      ctx.font = FONT(12, '600'); ctx.fillStyle = rgba(P.foam, 0.85);
      ctx.fillText(STR.cpLay, w / 2, view.h * 0.155 + 22);
    }
    if (this.state === 'laying') {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // ticking egg count — pops a touch while the frenzy is high
      const pop = 1 + this.effort * 0.07;
      ctx.save(); ctx.translate(w / 2, view.h * 0.15); ctx.scale(pop, pop);
      ctx.font = FONT(44, '800'); ctx.fillStyle = P.amber;
      ctx.fillText(`${this.layCount.toLocaleString()}`, 0, 0);
      ctx.restore();
      ctx.font = FONT(14, '600'); ctx.fillStyle = rgba(P.foam, 0.85);
      ctx.fillText(STR.hudEggs, w / 2, view.h * 0.15 + 32);
      // plankton multiplier — collecting plankton pays off big here
      ctx.font = FONT(15, '800'); ctx.fillStyle = P.bio;
      ctx.fillText(`plankton ×${(this.layPlanktonMul || 1).toFixed(1)}`, w / 2, view.h * 0.235);
      // prompt (pulses)
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(this.t * 10);
      ctx.font = FONT(17, '800'); ctx.fillStyle = P.foam;
      ctx.fillText(STR.layPrompt, w / 2, view.h * 0.31); ctx.globalAlpha = 1;
      // FRENZY meter (glows hot when you click fast)
      const bw = Math.min(320, w * 0.55), bx = (w - bw) / 2, by = view.h * 0.37;
      ctx.font = FONT(10, '800'); ctx.fillStyle = rgba(P.foam, 0.85);
      ctx.fillText(STR.layEffort, w / 2, by - 12);
      ctx.fillStyle = rgba('#06243a', 0.5); roundRect(ctx, bx, by, bw, 18, 9); ctx.fill();
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, '#2e7d8a'); g.addColorStop(1, this.effort > 0.7 ? '#ff7a4d' : P.amber);
      ctx.fillStyle = g; roundRect(ctx, bx, by, bw * clamp(this.effort, 0, 1), 18, 9); ctx.fill();
      if (this.effort > 0.7) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba('#ffd97a', (this.effort - 0.7) * 0.6);
        roundRect(ctx, bx, by, bw * this.effort, 18, 9); ctx.fill(); ctx.restore();
      }
      ctx.strokeStyle = rgba(P.foam, 0.4); ctx.lineWidth = 1.5; roundRect(ctx, bx, by, bw, 18, 9); ctx.stroke();
      // countdown
      const left = Math.max(0, ECONOMY.layDuration - this.layT);
      ctx.font = FONT(12, '700'); ctx.fillStyle = rgba(P.foam, 0.7);
      ctx.fillText(`${left.toFixed(1)}s`, w / 2, by + 36);
    }
  }

  drawStatusChips(ctx, view, pad) {
    const pl = this.player; const chips = [];
    if (pl.shield > 0) chips.push([STR.statusShield, '#bfe9f0']);
    if (pl.swift > 0) chips.push([STR.statusSwift, '#7fd0ff']);
    if (pl.heal > 0) chips.push([STR.statusHeal, '#aef0c0']);
    if (pl.slow > 0) chips.push([STR.statusSlow, '#9fb3bf']);
    if (pl.poison > 0) chips.push([STR.statusPoison, P.poison]);
    if (pl.wounds.length >= 3) chips.push([STR.statusWounded, P.blood]);
    let cx = pad, cy = pad + 30;
    ctx.font = FONT(11, '800'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const [label, col] of chips) {
      const tw = ctx.measureText(label).width + 16;
      ctx.fillStyle = rgba('#06243a', 0.6); roundRect(ctx, cx, cy, tw, 17, 8); ctx.fill();
      ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = col; ctx.fillText(label, cx + 8, cy + 9);
      cx += tw + 6;
    }
  }

  drawHeart(ctx, x, y, s, full) {
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, s * 0.35);
    ctx.bezierCurveTo(-s, -s * 0.6, -s * 0.5, -s * 1.1, 0, -s * 0.45);
    ctx.bezierCurveTo(s * 0.5, -s * 1.1, s, -s * 0.6, 0, s * 0.35);
    ctx.closePath();
    ctx.fillStyle = full ? P.blood : 'rgba(255,255,255,0.12)'; ctx.fill();
    ctx.strokeStyle = P.ink; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  drawProgress(ctx, view) {
    const { w } = view; const bw = Math.min(360, w * 0.5), bx = (w - bw) / 2, by = 20;
    ctx.font = FONT(10); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = rgba(P.foam, 0.8);
    ctx.fillText(STR.goalAtlantic, bx - 4, by - 10);
    ctx.textAlign = 'right'; ctx.fillText(STR.goalPacific, bx + bw + 4, by - 10);
    ctx.fillStyle = rgba('#06243a', 0.55); roundRect(ctx, bx, by, bw, 9, 4); ctx.fill();
    for (const z of WORLD.zones) { const zx = bx + bw * z.end; ctx.fillStyle = rgba(P.foam, 0.18); ctx.fillRect(zx - 0.5, by, 1, 9); }
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, '#2e7d8a'); g.addColorStop(1, P.amber);
    const f = clamp((this.player ? this.player.x : 0) / this.world.goal, 0, 1);
    ctx.fillStyle = g; roundRect(ctx, bx, by, bw * f, 9, 4); ctx.fill();
    ctx.save(); ctx.translate(bx + bw * f, by + 4.5); ctx.scale(0.16, 0.16);
    drawSunfish(ctx, 40, this.t, { flap: this.menuFlap * 3, blink: 1, lookX: 1, skin: this.skinObj() });
    ctx.restore();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = FONT(11, '700'); ctx.fillStyle = rgba(P.foam, 0.85);
    ctx.fillText(WORLD.zones[this.regionIdx].name, w / 2, by + 22);
  }

  // ---- screens ----
  panel(ctx, view, h) {
    const { w } = view; const pw = Math.min(580, w * 0.94), px = (w - pw) / 2, py = (view.h - h) / 2;
    ctx.fillStyle = rgba('#0a2236', 0.85); roundRect(ctx, px, py, pw, h, 18); ctx.fill();
    ctx.strokeStyle = rgba(P.foam, 0.25); ctx.lineWidth = 2; ctx.stroke();
    return { px, py, pw };
  }
  button(ctx, id, x, y, w, h, label, enabled = true, accent = false) {
    this._buttons.push({ id, x, y, w, h });
    // hover lifts + brightens (mouse only); the accent CTA breathes with the music
    const hov = enabled && Input.hasMouse && Input.sx >= x && Input.sx <= x + w && Input.sy >= y && Input.sy <= y + h;
    const beat = accent && enabled ? (this.musicBeat || 0) : 0;
    const lift = (hov ? 2.5 : 0) + beat * 1.6;
    const r = Math.min(14, h / 2), by = y - lift;
    ctx.save();
    if (hov) { ctx.shadowColor = accent ? 'rgba(255,205,100,0.75)' : 'rgba(125,210,235,0.6)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 2; }
    else { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3; }
    const br = hov ? 0.14 : 0;
    const top = enabled ? (accent ? mixHex('#ffd574', '#ffffff', br) : mixHex('#4393a8', '#ffffff', br)) : 'rgba(110,120,128,0.32)';
    const bot = enabled ? (accent ? '#e7a32c' : '#22596a') : 'rgba(86,96,104,0.28)';
    const g = ctx.createLinearGradient(0, by, 0, by + h); g.addColorStop(0, top); g.addColorStop(1, bot);
    ctx.fillStyle = g; roundRect(ctx, x, by, w, h, r); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = rgba(P.ink, 0.85); ctx.lineWidth = 2; roundRect(ctx, x, by, w, h, r); ctx.stroke();
    if (enabled) { ctx.strokeStyle = `rgba(255,255,255,${hov ? 0.5 : 0.28})`; ctx.lineWidth = 1.5; roundRect(ctx, x + 2.5, by + 2.5, w - 5, h * 0.5, r - 2); ctx.stroke(); }
    ctx.fillStyle = enabled ? (accent ? '#3a2a10' : '#f3fbfc') : 'rgba(255,255,255,0.5)';
    ctx.font = FONT(15, '800'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, by + h / 2 + 1);
  }

  renderMenu(ctx, view) {
    const { w, h } = view;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // the title breathes with the music (beat + level)
    const tp = 1 + (this.musicLevel || 0) * 0.05 + (this.musicBeat || 0) * 0.05;
    ctx.save(); ctx.translate(w / 2, h * 0.17); ctx.scale(tp, tp);
    wobblyText(ctx, STR.title, 0, 0, Math.min(58, w * 0.105), P.foam, 2);
    ctx.restore();
    ctx.font = FONT(15, '600'); ctx.fillStyle = P.amberSoft;
    ctx.fillText(STR.subtitle, w / 2, h * 0.17 + Math.min(44, w * 0.08));
    ctx.globalAlpha = clamp(0.55 + 0.35 * Math.sin(this.t * 2.5) + (this.musicBeat || 0) * 0.4, 0, 1);
    ctx.font = FONT(17, '700'); ctx.fillStyle = P.foam;
    ctx.fillText(STR.tapToStart, w / 2, h * 0.72); ctx.globalAlpha = 1;
    // a rotating real sunfish fact — genuinely educational
    const fact = STR.funFacts[Math.floor(this.t / 6) % STR.funFacts.length];
    ctx.font = FONT(11, '800'); ctx.fillStyle = P.amberSoft; ctx.fillText(STR.didYouKnow.toUpperCase(), w / 2, h * 0.79);
    ctx.font = FONT(12.5, '500'); ctx.fillStyle = rgba(P.foam, 0.82); wrapText(ctx, fact, w / 2, h * 0.83, Math.min(560, w * 0.8), 16);
    ctx.font = FONT(12, '600'); ctx.fillStyle = P.amberSoft;
    const pct = Math.round((this.save.best / WORLD.goalDistance) * 100);
    ctx.fillText(`${this.save.eggs.toLocaleString()} eggs banked   ·   ${(this.save.laidTotal || 0).toLocaleString()} laid   ·   furthest ${pct}%`, w / 2, h * 0.93);
    ctx.font = FONT(11, '600'); ctx.fillStyle = rgba(P.foam, 0.55);
    ctx.fillText(STR.credit + '   ·   ' + STR.musicCredit, w / 2, h * 0.975);

    const bw = Math.min(150, w * 0.26), bh = 44, gap = 12;
    const totalW = bw * 3 + gap * 2; let bx = w / 2 - totalW / 2; const by = h * 0.55;
    this.button(ctx, 'shop', bx, by, bw, bh, STR.toShop); bx += bw + gap;
    this.button(ctx, 'wardrobe', bx, by, bw, bh, STR.toWardrobe); bx += bw + gap;
    this.button(ctx, 'loot', bx, by, bw, bh, STR.toLoot);
    this.button(ctx, 'mute', w - 110 - 12, 12, 110, 34, Audio.isMuted() ? STR.muted : STR.unmuted);
  }

  renderShop(ctx, view) {
    const { w, h } = view; const S = view.scale;
    const pw = Math.min(440, w * 0.55), pad = Math.max(16, w * 0.03);
    const ph = Math.min(500, h * 0.95), px = w - pw - pad, py = (h - ph) / 2;

    // --- left: your fish drifting peacefully in the open ocean ---
    const fishX = px / 2, fishY = h * 0.48, fr = Math.min(px * 0.3, h * 0.2);
    const sg = ctx.createRadialGradient(fishX, fishY, 0, fishX, fishY, fr * 2.6);
    sg.addColorStop(0, rgba(mixHex(P.surfaceTeal, '#bfe9f0', 0.4), 0.22)); sg.addColorStop(1, rgba(P.surfaceTeal, 0));
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(fishX, fishY, fr * 2.6, 0, TAU); ctx.fill();
    for (let i = 0; i < 6; i++) { const by = fishY + fr - ((this.t * 22 + i * 60) % (fr * 2.4)); ctx.fillStyle = rgba('#dff3f7', 0.16); ctx.beginPath(); ctx.arc(fishX + Math.sin(i * 1.7 + this.t * 0.5) * fr * 0.6, by, (1.3 + i % 3) * S, 0, TAU); ctx.fill(); }
    ctx.save(); ctx.translate(fishX, fishY + Math.sin(this.t * 0.9) * 10); ctx.rotate(Math.sin(this.t * 0.6) * 0.05);
    drawSunfish(ctx, fr, this.t, { flap: this.menuFlap, blink: 1, lookX: 1, skin: this.skinObj(), sad: 0 });
    ctx.restore();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = FONT(16, '800'); ctx.fillStyle = P.foam; ctx.fillText(this.skinObj().name, fishX, fishY + fr + 26);
    ctx.font = FONT(11, '600'); ctx.fillStyle = rgba(P.amberSoft, 0.85); ctx.fillText(STR.lifetimeEggs(this.save.laidTotal || 0), fishX, fishY + fr + 46);

    // --- right: the upgrade panel ---
    ctx.fillStyle = rgba('#0a2236', 0.9); roundRect(ctx, px, py, pw, ph, 18); ctx.fill();
    ctx.strokeStyle = rgba(P.foam, 0.25); ctx.lineWidth = 2; ctx.stroke();
    wobblyText(ctx, STR.shopTitle, px + pw / 2, py + 28, 22, P.foam, 3);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = FONT(14, '800'); ctx.fillStyle = P.amber; ctx.fillText(`🥚 ${this.save.eggs.toLocaleString()} ${STR.shopBanked}`, px + pw / 2, py + 54);
    const top = py + 74, botY = py + ph - 48, rowH = (botY - top) / UPGRADES.length;
    UPGRADES.forEach((u, i) => {
      const ry = top + i * rowH, mid = ry + rowH / 2;
      const lvl = this.save.upg[u.id] || 0, maxed = lvl >= u.max;
      const cost = u.baseCost + u.step * lvl, afford = this.save.eggs >= cost;
      ctx.fillStyle = rgba('#06243a', 0.5); roundRect(ctx, px + 12, ry + 3, pw - 24, rowH - 6, 10); ctx.fill();
      // icon chip
      ctx.fillStyle = rgba(maxed ? P.amber : '#2e6f80', 0.92); roundRect(ctx, px + 18, mid - 15, 30, 30, 8); ctx.fill();
      ctx.strokeStyle = rgba(P.ink, 0.6); ctx.lineWidth = 2; ctx.stroke();
      drawUpgradeIcon(ctx, u.id, px + 33, mid, 10, maxed ? '#3a2a10' : '#f3fbfc');
      // name + desc
      ctx.textAlign = 'left';
      ctx.font = FONT(14, '800'); ctx.fillStyle = P.foam; ctx.fillText(u.name, px + 58, mid - 9);
      ctx.font = FONT(10, '500'); ctx.fillStyle = rgba(P.foam, 0.7); ctx.fillText(u.desc, px + 58, mid + 5);
      // pip meter under the name
      for (let k = 0; k < u.max; k++) { ctx.fillStyle = k < lvl ? P.amber : 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(px + 60 + k * 13, mid + 16, 3.5, 0, TAU); ctx.fill(); }
      // cost button / maxed
      const bw = 84, bx = px + pw - bw - 14;
      if (maxed) { ctx.fillStyle = rgba(P.amberSoft, 0.85); ctx.font = FONT(12, '800'); ctx.textAlign = 'center'; ctx.fillText(STR.shopMaxed, bx + bw / 2, mid); }
      else this.button(ctx, 'buy:' + u.id, bx, mid - 16, bw, 32, `🥚 ${cost}`, afford, afford);
    });
    this.button(ctx, 'back', px + pw / 2 - 55, py + ph - 40, 110, 30, '‹ ' + STR.shopBack);
  }

  renderWardrobe(ctx, view) {
    const { w } = view; const ph = Math.min(480, view.h * 0.94);
    const { px, py, pw } = this.panel(ctx, view, ph);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    wobblyText(ctx, STR.wardrobeTitle, w / 2, py + 30, 25, P.foam, 3);
    ctx.font = FONT(12, '500'); ctx.fillStyle = rgba(P.foam, 0.72);
    ctx.fillText(`${this.save.skins.length}/${SKINS.length} found · ${STR.wardrobeBlurb}`, w / 2, py + 52);

    const cols = 4, rows = Math.ceil(SKINS.length / cols), gap = 10, padX = 22;
    const topY = py + 70, botY = py + ph - 54;
    const cellW = (pw - padX * 2 - gap * (cols - 1)) / cols;
    const cellH = (botY - topY - gap * (rows - 1)) / rows;
    const cell = Math.min(cellW, cellH);
    const gridW = cell * cols + gap * (cols - 1);
    const startX = px + (pw - gridW) / 2;
    SKINS.forEach((sk, i) => {
      const cx = startX + (i % cols) * (cell + gap);
      const cy = topY + Math.floor(i / cols) * (cell + gap);
      const owned = this.owns(sk.id), equipped = this.save.skin === sk.id;
      const rc = RARITY[sk.rarity].color;
      ctx.fillStyle = rgba('#061a2a', 0.6); roundRect(ctx, cx, cy, cell, cell, 10); ctx.fill();
      ctx.strokeStyle = equipped ? P.amber : rgba(rc, owned ? 0.9 : 0.3); ctx.lineWidth = equipped ? 3 : 2; ctx.stroke();
      if (owned) {
        ctx.save(); ctx.beginPath(); roundRect(ctx, cx, cy, cell, cell, 10); ctx.clip();
        ctx.translate(cx + cell / 2, cy + cell * 0.52); const s = cell / 200;
        ctx.scale(s, s); drawSunfish(ctx, 56, this.t, { flap: this.menuFlap, blink: 1, lookX: 1, skin: sk });
        ctx.restore();
        ctx.font = FONT(9, '700'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = equipped ? P.amber : rgba(P.foam, 0.85);
        ctx.fillText(equipped ? STR.wardrobeEquipped : sk.name, cx + cell / 2, cy + cell - 11);
        if (!equipped) this._buttons.push({ id: 'equip:' + sk.id, x: cx, y: cy, w: cell, h: cell });
      } else {
        ctx.fillStyle = rgba(rc, 0.5); ctx.font = FONT(cell * 0.4, '800'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', cx + cell / 2, cy + cell / 2 - 4);
        ctx.font = FONT(9, '600'); ctx.fillStyle = rgba(P.foam, 0.45); ctx.fillText(RARITY[sk.rarity].label, cx + cell / 2, cy + cell - 11);
      }
    });
    this.button(ctx, 'loot', px + pw / 2 - 124, py + ph - 44, 110, 34, '🦪 ' + STR.toLoot, true, true);
    this.button(ctx, 'back', px + pw / 2 + 14, py + ph - 44, 110, 34, '‹ ' + STR.shopBack);
  }

  renderLoot(ctx, view) {
    const { w } = view; const ph = Math.min(440, view.h * 0.9);
    const { px, py, pw } = this.panel(ctx, view, ph);
    const l = this.loot;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    wobblyText(ctx, STR.lootTitle, w / 2, py + 34, 24, P.foam, 3);
    const ccx = w / 2, ccy = py + ph * 0.46;
    if (l.phase === 'reveal' && l.result) {
      const { skin, dupe, refund } = l.result; const rc = RARITY[skin.rarity].color;
      const bob = Math.sin(l.t * 3) * 8;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + l.t; ctx.strokeStyle = rgba(rc, 0.4); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ccx + Math.cos(a) * 50, ccy + Math.sin(a) * 50); ctx.lineTo(ccx + Math.cos(a) * (90 + Math.sin(l.t * 4 + i) * 12), ccy + Math.sin(a) * (90 + Math.sin(l.t * 4 + i) * 12)); ctx.stroke(); }
      ctx.restore();
      ctx.save(); ctx.translate(ccx, ccy + bob); ctx.scale(0.8, 0.8); drawSunfish(ctx, 56, this.t, { flap: this.menuFlap, blink: 1, lookX: 1, skin }); ctx.restore();
      ctx.font = FONT(13, '800'); ctx.fillStyle = rc; ctx.fillText(RARITY[skin.rarity].label.toUpperCase(), ccx, py + ph * 0.7);
      ctx.font = FONT(22, '800'); ctx.fillStyle = P.foam; ctx.fillText(skin.name, ccx, py + ph * 0.76);
      ctx.font = FONT(13, '600'); ctx.fillStyle = rgba(P.foam, 0.85); ctx.fillText(dupe ? STR.lootDupe(refund) : STR.lootGot, ccx, py + ph * 0.82);
      const by = py + ph - 44, bw = 104, gap = 8, three = !dupe;
      const totalW = (three ? 3 : 2) * bw + (three ? 2 : 1) * gap; let bx = px + pw / 2 - totalW / 2;
      this.button(ctx, 'crack', bx, by, bw, 34, '🦪 ' + STR.lootAgain, this.save.eggs >= LOOTBOX.cost, true); bx += bw + gap;
      if (three) { this.button(ctx, 'wear', bx, by, bw, 34, '✦ ' + STR.lootEquipNow, true, true); bx += bw + gap; }
      this.button(ctx, 'back', bx, by, bw, 34, '‹ ' + STR.shopBack);
    } else {
      const opening = l.phase === 'opening';
      const open = opening ? clamp((l.t - 0.55) / 0.6, 0, 1) : 0;
      const shake = opening && l.t < 0.55 ? Math.sin(l.t * 50) * 4 : 0;
      ctx.save(); ctx.translate(ccx + shake, ccy + Math.sin(this.t * 2) * 5); ctx.scale(1.4, 1.4); drawClam(ctx, 52, open, this.t); ctx.restore();
      ctx.font = FONT(13, '500'); ctx.fillStyle = rgba(P.foam, 0.8); ctx.fillText(STR.lootBlurb(LOOTBOX.cost), ccx, py + ph * 0.74);
      ctx.font = FONT(14, '800'); ctx.fillStyle = P.amber; ctx.fillText(`🥚 ${this.save.eggs.toLocaleString()} ${STR.shopBanked}`, ccx, py + ph * 0.8);
      if (l.msg) { ctx.font = FONT(12, '700'); ctx.fillStyle = P.danger; ctx.fillText(l.msg, ccx, py + ph * 0.85); }
      if (!opening) {
        this.button(ctx, 'crack', px + pw / 2 - 124, py + ph - 44, 130, 36, STR.lootOpen, this.save.eggs >= LOOTBOX.cost, true);
        this.button(ctx, 'back', px + pw / 2 + 24, py + ph - 44, 100, 36, '‹ ' + STR.shopBack);
      }
    }
  }

  pickEnding() {
    const e = STR.endings;
    if (this.eggsTarget >= 450) return e.bountiful;
    if (this.runHits === 0) return e.perfect;
    if (this.player.wounds.length >= 4) return e.battered;
    return e.plain;
  }
  renderWin(ctx, view) {
    const { w, h } = view;
    ctx.fillStyle = rgba('#06243a', 0.5); ctx.fillRect(0, 0, w, h);
    const end = this.ending || STR.endings.plain;
    wobblyText(ctx, end.title, w / 2, h * 0.18, Math.min(48, w * 0.092), P.amberSoft, 4);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = FONT(15, '600'); ctx.fillStyle = P.foam; wrapText(ctx, end.line, w / 2, h * 0.28, Math.min(640, w * 0.84), 20);
    ctx.font = FONT(23, '800'); ctx.fillStyle = P.amber; ctx.fillText(STR.eggsLaid(this.eggsTarget), w / 2, h * 0.41);
    ctx.font = FONT(12, '600'); ctx.fillStyle = rgba(P.amberSoft, 0.95); ctx.fillText(STR.lifetimeEggs(this.save.laidTotal || 0), w / 2, h * 0.47);
    // your useless legacy — a few hatchlings drift up
    for (let i = 0; i < 6; i++) {
      const rise = (this.t * 16 + i * 70) % (h * 0.4);
      const bx = w / 2 + Math.sin(i * 1.7 + this.t * 0.6) * w * 0.2;
      const by = h * 0.7 - rise * 0.28;
      ctx.save(); ctx.translate(bx, by); ctx.scale(0.5, 0.5); ctx.globalAlpha = 0.75;
      drawSunfish(ctx, 14, this.t, { flap: this.menuFlap * 2 + i, blink: 1, lookX: 1, skin: this.skinObj() });
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.font = FONT(11, '800'); ctx.fillStyle = P.amberSoft; ctx.fillText(STR.didYouKnow.toUpperCase(), w / 2, h * 0.54);
    ctx.font = FONT(12, '500'); ctx.fillStyle = rgba(P.foam, 0.82); wrapText(ctx, this.funFact, w / 2, h * 0.585, Math.min(640, w * 0.84), 16);
    this.button(ctx, 'retry', w / 2 - 190, h * 0.82, 116, 44, STR.retry, true, true);
    this.button(ctx, 'wardrobe', w / 2 - 58, h * 0.82, 116, 44, STR.toWardrobe);
    this.button(ctx, 'shop', w / 2 + 74, h * 0.82, 116, 44, STR.toShop);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = FONT(11, '600'); ctx.fillStyle = rgba(P.foam, 0.5);
    ctx.fillText(STR.musicCredit, w / 2, h * 0.93);
  }

  renderDead(ctx, view) {
    const { w, h } = view;
    ctx.fillStyle = rgba('#1a0d12', 0.5); ctx.fillRect(0, 0, w, h);
    wobblyText(ctx, STR.deathTitle, w / 2, h * 0.24, Math.min(48, w * 0.09), '#e8a0a0', 7);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = FONT(17, '600'); ctx.fillStyle = P.foam; ctx.fillText(this.deathMsg, w / 2, h * 0.35);
    ctx.font = FONT(11, '800'); ctx.fillStyle = P.amberSoft; ctx.fillText(STR.didYouKnow.toUpperCase(), w / 2, h * 0.42);
    ctx.font = FONT(12.5, '500'); ctx.fillStyle = rgba(P.foam, 0.78); wrapText(ctx, this.funFact, w / 2, h * 0.46, Math.min(640, w * 0.84), 16);
    ctx.font = FONT(13, '700'); ctx.fillStyle = P.amberSoft;
    const pct = Math.round((this.player.x / WORLD.goalDistance) * 100);
    ctx.fillText(`${this.runPoints.toLocaleString()} pts · +${this.runConsolation || 0} eggs · reached ${pct}% · ${WORLD.zones[this.regionIdx].name}`, w / 2, h * 0.56);
    const free = this.stats().wind > 0 && !this.usedWind;
    const canRevive = free || this.save.eggs >= this.reviveCost;
    let bx = w / 2 - (canRevive ? 250 : 125);
    if (canRevive) { this.button(ctx, 'revive', bx, h * 0.66, 130, 44, free ? STR.continueFree : STR.continueBtn(this.reviveCost), true, true); bx += 142; }
    this.button(ctx, 'retry', bx, h * 0.66, 116, 44, STR.retry, true, !canRevive); bx += 128;
    this.button(ctx, 'shop', bx, h * 0.66, 116, 44, STR.toShop);
  }

  entityCount() {
    return this.enemies.length + this.squids.length + this.puffers.length + this.jellies.length +
      this.boats.length + this.copepods.length + this.seagulls.length;
  }
}
