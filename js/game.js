// Central game controller: states (menu/shop/wardrobe/loot/play/laying/win/
// dead), camera, collisions, the net & squid capture mechanics, status
// effects, region checkpoints + revive, HUD and screens, plus persistent
// roguelike meta-progression (eggs, upgrades, skins) in localStorage.
import {
  REF_H, WATER, WORLD, COMBAT, BOAT, PUFFER, SQUID, JELLY, MINE, URCHIN, HOOK,
  PLASTIC, WAVE, STATUS, SEAGULL, BOOSTERS, UPGRADES, RARITY, LOOTBOX, SKINS,
  DEFAULT_SKIN, PALETTE as P,
} from './config.js';
import { clamp, lerp, dist, TAU, rgba, mixHex, hash1 } from './utils.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Background } from './background.js';
import { generateWorld, zoneAt, zoneIndexAt, zoneStartX } from './world.js';
import {
  Player, Seal, Shark, Barracuda, Angler, Puffer, Squid, Boat, Jelly,
  Swordfish, Cookiecutter, Copepod, Seagull, Particles, seabedLimit,
} from './entities.js';
import { drawSunfish, drawClam } from './sprites.js';
import { STR } from './strings.js';

const SAVE_KEY = 'sunfish.useless.v2';
const FONT = (s, w = '700') => `${w} ${s}px "Trebuchet MS","Segoe UI",system-ui,sans-serif`;
const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s]));

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
    this.eggsTarget = 0; this.layCount = 0;
    this.loot = { phase: 'idle', t: 0, result: null, msg: null };
    this.funFact = STR.funFacts[0];
    this.gullTimer = SEAGULL.interval; this.netDrainT = 0;
    this.clearEntities();
  }

  clearEntities() {
    this.enemies = []; this.squids = []; this.puffers = []; this.jellies = [];
    this.boats = []; this.copepods = []; this.seagulls = [];
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

  startRun() {
    this.seed = (Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    this.world = generateWorld(this.seed);
    const st = this.stats();
    this.player = new Player(st);
    this.player.skin = this.skinObj();
    const hs = clamp(st.headstart, 0, WORLD.zones.length - 2);
    const sx = hs > 0 ? zoneStartX(hs) + 140 : 120;
    this.player.x = sx; this.player.y = REF_H * 0.5;

    this.clearEntities();
    this.spawnIdx = 0; this.runEggs = 0; this.runHits = 0; this.runBanked = false; this.usedWind = false;
    this.gullTimer = SEAGULL.interval; this.netDrainT = 0;
    const sp = this.world.spawners;
    while (this.spawnIdx < sp.length && sp[this.spawnIdx].x < sx - 200) this.spawnIdx++;

    this.regionIdx = zoneIndexAt(this.player.x);
    this.checkpointX = sx; this.checkpointRegionIdx = this.regionIdx;
    this.recenterCamera();
    this.state = 'play';
    this.banner = { text: WORLD.zones[this.regionIdx].name, life: 2.6 };
    this.funFact = STR.funFacts[Math.floor(Math.random() * STR.funFacts.length)];
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

    if (this.state === 'menu' || this.state === 'shop' || this.state === 'wardrobe' || this.state === 'loot') { this.updateUI(dt); return; }
    if (this.state === 'dead' || this.state === 'win') { this.updateEnd(); return; }

    const pl = this.player;
    this.activateSpawners();

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
    for (const s of this.puffers) s.update(dt, env);
    for (const c of this.copepods) c.update(dt, env);
    for (const b of this.boats) b.update(dt);
    for (const j of this.jellies) j.update(dt);

    // summon a seagull to pluck off parasites (you must take the peck)
    if (this.state === 'play' && pl.parasites > 0) {
      this.gullTimer -= dt;
      if (this.gullTimer <= 0 && this.seagulls.length === 0) { this.seagulls.push(new Seagull(pl.x + (Math.random() - 0.5) * 120)); this.gullTimer = SEAGULL.interval; }
    }
    for (const g of this.seagulls) g.update(dt, env);
    this.seagulls = this.seagulls.filter((g) => !g.done);

    const L = this.camX - 500, Rr = this.camX + this.view.worldViewW + 600;
    for (const m of this.world.mines) if (m.x > L && m.x < Rr) m.update(dt);
    for (const h of this.world.hooks) if (h.x > L && h.x < Rr) h.update(dt);
    for (const b of this.world.bags) if (b.x > L && b.x < Rr) b.update(dt);
    for (const bo of this.world.boosters) if (!bo.dead && bo.x > L && bo.x < Rr) bo.update(dt);

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

    if (this.state === 'play' && !pl.captured) this.collide();

    const zi = zoneIndexAt(pl.x);
    if (zi !== this.regionIdx) {
      const forward = zi > this.regionIdx;
      this.regionIdx = zi;
      if (forward) { this.checkpointX = Math.max(this.checkpointX, zoneStartX(zi)); this.checkpointRegionIdx = zi; this.banner = { text: STR.checkpoint(WORLD.zones[zi].name), life: 2.8 }; if (zi >= 4) Audio.sfx('warn'); }
      else this.banner = { text: WORLD.zones[zi].name, life: 2.2 };
    }

    if (Math.random() < 0.3) this.particles.spawn(this.camX + Math.random() * this.view.worldViewW, REF_H - WATER.seabedBand - Math.random() * 40, 'bubble', 0, -20);

    if (this.state === 'play' && pl.x >= this.world.goal - 30) this.beginLaying();
    if (this.state === 'laying') this.updateLaying(dt);

    if (!pl.alive && this.state === 'play') this.die();

    const camTarget = clamp(pl.x - this.view.worldViewW * 0.34, 0, Math.max(0, this.world.goal + 240 - this.view.worldViewW));
    this.camX = lerp(this.camX, camTarget, clamp(dt * 5, 0, 1));
  }

  activateSpawners() {
    const lookX = this.camX + this.view.worldViewW + 240;
    const sp = this.world.spawners;
    while (this.spawnIdx < sp.length && sp[this.spawnIdx].x < lookX) {
      const s = sp[this.spawnIdx++];
      switch (s.type) {
        case 'seal': this.enemies.push(new Seal(s.x, s.y)); break;
        case 'shark': this.enemies.push(new Shark(s.x, s.y)); break;
        case 'orca': this.enemies.push(new Shark(s.x, s.y, { big: true })); break;
        case 'barracuda': this.enemies.push(new Barracuda(s.x, s.y)); break;
        case 'angler': this.enemies.push(new Angler(s.x, s.y)); break;
        case 'swordfish': this.enemies.push(new Swordfish(s.x, s.y)); break;
        case 'cookiecutter': this.enemies.push(new Cookiecutter(s.x, s.y)); break;
        case 'puffer': this.puffers.push(new Puffer(s.x, s.y)); break;
        case 'squid': this.squids.push(new Squid(s.x, s.y)); break;
        case 'copepod': this.copepods.push(new Copepod(s.x, s.y)); break;
        case 'jelly': this.jellies.push(new Jelly(s.x, s.y)); break;
        case 'boat': this.boats.push(new Boat(s.x + (s.dir < 0 ? this.view.worldViewW : 0), s.dir)); break;
      }
    }
  }

  collide() {
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

    for (const h of this.world.hooks) {
      if (h.biteCD > 0 || h.x < L || h.x > Rr) continue;
      const bp = h.baitPoint();
      if (dist(bp.x, bp.y, pl.x, pl.y) < h.hitR + pl.hitR + 6) {
        if (pl.hit(HOOK.damage, (pl.x - h.x) * 0.6, -220, Audio, this.particles)) { h.biteCD = 1.6; this.particles.burst(bp.x, bp.y, 'foam', 8, 160); }
      }
    }

    // biting predators (one array, per-instance damage)
    this.handleBite(this.enemies);

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

    // parasitic copepods latch on
    for (const c of this.copepods) {
      if (c.dead || c.x < L || c.x > Rr) continue;
      if (dist(c.x, c.y, pl.x, pl.y) < pl.hitR + c.r + 8) {
        c.dead = true;
        if (pl.parasites < 6) { pl.parasites++; pl.paraT = STATUS.parasiteDrainEach / Math.max(1, pl.parasites); if (pl.parasites === 1) this.gullTimer = Math.min(this.gullTimer, 3); }
        Audio.sfx('hurt'); this.particles.burst(c.x, c.y, 'blood', 5, 90);
      }
    }

    // a diving seagull plucks the parasites off — at the cost of one peck
    for (const g of this.seagulls) {
      if (g.state !== 'dive') continue;
      if (dist(g.x, g.y, pl.x, pl.y) < pl.hitR + 34) {
        if (pl.parasites > 0) { pl.parasites = 0; pl.tickDamage(SEAGULL.damage, this.particles); }
        g.state = 'leave'; this.particles.burst(pl.x, pl.y, 'foam', 8, 120); Audio.sfx('warn');
      }
    }

    // booster pickups
    for (const bo of this.world.boosters) {
      if (bo.dead || bo.x < L - 40 || bo.x > Rr + 40) continue;
      if (dist(bo.x, bo.y, pl.x, pl.y) < pl.hitR + bo.r + 10) {
        bo.dead = true; pl.applyBoost(bo.type);
        const def = BOOSTERS.find((d) => d.id === bo.type);
        this.banner = { text: (def ? def.name : 'Booster') + '!', life: 2.0 };
        Audio.sfx('buy'); this.particles.burst(bo.x, bo.y, 'sparkle', 14, 160, { color: def ? def.color : '#ffd97a' });
      }
    }

    // plankton -> eggs
    const eggMul = 1 + this.stats().roeLevel * 0.35;
    for (const p of this.world.plankton) {
      if (p.dead || p.x < L - 60 || p.x > Rr + 60) continue;
      if (dist(p.x, p.y, pl.x, pl.y) < pl.hitR + p.r + 14) {
        p.dead = true; this.runEggs += p.value * eggMul; pl.mouth = 1;
        Audio.sfx('pickup');
        this.particles.burst(p.x, p.y, 'sparkle', p.value > 1 ? 12 : 6, 150, { color: P.amberSoft });
        if (p.value > 1 && pl.hp < pl.maxHp && Math.random() < 0.4) pl.hp++;
      }
    }
  }

  handleBite(arr) {
    const pl = this.player;
    for (const e of arr) {
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

  beginLaying() {
    if (this.state !== 'play') return;
    this.state = 'laying'; this.layT = 0; this.layCount = 0;
    this.player.vx *= 0.3; Audio.sfx('eggs');
    const s = this.stats();
    const bonus = Math.round((30 + this.player.hp * 22) * (1 + s.roeLevel * 0.4));
    this.eggsTarget = Math.floor(this.runEggs) + bonus;
  }
  updateLaying(dt) {
    this.layT += dt;
    const pl = this.player;
    pl.vx *= 0.92; pl.vy *= 0.92; pl.mouth = 0.4;
    const dur = 3.4, prog = clamp(this.layT / dur, 0, 1);
    this.layCount = Math.floor(this.eggsTarget * prog);
    if (Math.random() < 0.9) this.particles.spawn(pl.x - pl.r, pl.y + (Math.random() - 0.5) * pl.r, 'egg', -50 - Math.random() * 70, (Math.random() - 0.5) * 70, { life: 3.8, size: 5 + Math.random() * 4 });
    if (Math.random() < 0.3) this.particles.spawn(pl.x, pl.y, 'sparkle', (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120, { color: P.amberSoft });
    if (this.layT > dur + 0.6) {
      this.save.eggs += this.eggsTarget;
      this.save.laidTotal = (this.save.laidTotal || 0) + this.eggsTarget;
      this.save.wins = (this.save.wins || 0) + 1;
      this.save.best = this.world.goal; this.runBanked = true; this.persist();
      this.state = 'win';
    }
  }

  die(cause) {
    if (this.state !== 'play') return;
    this.deathCause = cause;
    const msgs = STR.deaths;
    const byCause = { caught: 2, squid: 10 };
    this.deathMsg = cause in byCause ? msgs[byCause[cause]] : msgs[Math.floor(Math.random() * msgs.length)];
    this.particles.burst(this.player.x, this.player.y, 'blood', 26, 260);
    this.particles.burst(this.player.x, this.player.y, 'inkpuff', 14, 180);
    Audio.sea(false);
    this.reviveCost = Math.round(25 + this.checkpointRegionIdx * 22);
    this.canRevive = (this.stats().wind > 0 && !this.usedWind) || this.save.eggs >= this.reviveCost;
    this.state = 'dead';
  }

  bankRun() {
    if (this.runBanked) return; this.runBanked = true;
    this.save.best = Math.max(this.save.best, Math.round(this.player.x));
    this.save.eggs += Math.floor(this.runEggs);
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
    this.spawnIdx = 0;
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
      if (tap || key) { Audio.unlock(); this.startRun(); }
    } else if (this.state === 'shop') {
      if (tap) { const hit = this.hitButton(tap); if (hit === 'back') { this.state = 'menu'; Audio.sfx('ui'); } else if (hit && hit.startsWith('buy:')) this.buy(hit.slice(4)); }
      else if (key) { this.state = 'menu'; Audio.sfx('ui'); }
    } else if (this.state === 'wardrobe') {
      if (tap) { const hit = this.hitButton(tap); if (hit === 'back') { this.state = 'menu'; Audio.sfx('ui'); } else if (hit === 'loot') { this.openLoot(); } else if (hit && hit.startsWith('equip:')) this.equip(hit.slice(6)); }
      else if (key) { this.state = 'menu'; Audio.sfx('ui'); }
    } else if (this.state === 'loot') {
      if (tap) { const hit = this.hitButton(tap); if (hit === 'back') { this.state = 'wardrobe'; Audio.sfx('ui'); } else if (hit === 'crack') this.crackClam(); else if (hit === 'wear' && this.loot.result) this.equip(this.loot.result.skin.id); }
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
    const pool = SKINS.filter((s) => s.rarity === rar);
    const skin = pool[Math.floor(Math.random() * pool.length)];
    const dupe = this.owns(skin.id);
    let refund = 0;
    if (dupe) { refund = RARITY[rar].refund; this.save.eggs += refund; }
    else this.save.skins.push(skin.id);
    return { skin, dupe, refund };
  }

  // ---------------------------------------------------------------- RENDER
  render(ctx, view) {
    this.view = view; this.view.camX = this.camX;
    const vis = this.zoneVisuals();
    this.bg.render(ctx, { ...view, camX: this.camX }, this.t, vis.tint, vis.dark, vis.zoneId);

    if (this.state === 'play' || this.state === 'laying' || this.state === 'dead' || this.state === 'win') this.renderWorld(ctx, view);
    else this.renderMenuWorld(ctx, view);

    this._buttons = [];
    if (this.state === 'menu') this.renderMenu(ctx, view);
    else if (this.state === 'shop') this.renderShop(ctx, view);
    else if (this.state === 'wardrobe') this.renderWardrobe(ctx, view);
    else if (this.state === 'loot') this.renderLoot(ctx, view);
    else if (this.state === 'win') this.renderWin(ctx, view);
    else if (this.state === 'dead') this.renderDead(ctx, view);
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

  renderWorld(ctx, view) {
    this.worldXform(ctx, view);
    const L = this.camX - 140, Rr = this.camX + view.worldViewW + 140;
    const inView = (x) => x > L && x < Rr;
    for (const k of this.world.kelp) if (inView(k.x)) k.render(ctx, this.t);
    for (const c of this.world.currents) if (c.x1 > L && c.x0 < Rr) this.bg.drawCurrent(ctx, c, this.t);
    for (const a of this.world.anchors) if (inView(a.x)) a.render(ctx);
    for (const r of this.world.rocks) if (inView(r.x)) r.render(ctx);
    for (const c of this.world.corals) if (inView(c.x)) c.render(ctx);
    for (const u of this.world.urchins) if (inView(u.x)) u.render(ctx);
    for (const bo of this.world.boosters) if (!bo.dead && inView(bo.x)) bo.render(ctx, this.t);
    for (const p of this.world.plankton) if (!p.dead && inView(p.x)) p.render(ctx);
    for (const h of this.world.hooks) if (inView(h.x)) h.render(ctx, this.t);
    for (const m of this.world.mines) if (!m.dead && inView(m.x)) m.render(ctx, this.t);
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
    const cx = this.camX + view.worldViewW * 0.5;
    const cy = REF_H * 0.52 + Math.sin(this.menuFlap * 0.7) * 18;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(this.menuFlap * 0.5) * 0.06);
    drawSunfish(ctx, 64, this.t, { flap: this.menuFlap, blink: 1, lookX: 1, skin: this.skinObj() });
    ctx.restore();
    this.particles.render(ctx);
    ctx.restore();
  }

  // ---- HUD ----
  renderHUD(ctx, view) {
    const { w } = view; const pad = 14 * Math.max(1, view.scale * 0.7);
    const pl = this.player; if (!pl) return;
    for (let i = 0; i < pl.maxHp; i++) this.drawHeart(ctx, pad + i * 30, pad + 12, 11, i < pl.hp);
    ctx.font = FONT(18); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = P.amber; ctx.beginPath(); ctx.ellipse(w - pad - 78, pad + 12, 6, 7.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = P.foam; ctx.fillText(`${Math.floor(this.runEggs)}`, w - pad, pad + 12);
    ctx.font = FONT(9, '600'); ctx.fillStyle = rgba(P.foam, 0.6); ctx.fillText(STR.hudEggs, w - pad, pad + 28);

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
      wobblyText(ctx, this.banner.text, w / 2, view.h * 0.26, 28, P.foam, 5);
      ctx.globalAlpha = 1;
    }
    if (pl.parasites > 0) {
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 6); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = FONT(14, '700'); ctx.fillStyle = '#ffd36b'; ctx.fillText(STR.statusParasite(pl.parasites), w / 2, view.h * 0.32);
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
    if (this.state === 'laying') {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = FONT(34, '800'); ctx.fillStyle = P.amber; ctx.fillText(`${this.layCount.toLocaleString()}`, w / 2, view.h * 0.18);
      ctx.font = FONT(14, '600'); ctx.fillStyle = rgba(P.foam, 0.85); ctx.fillText(STR.hudEggs, w / 2, view.h * 0.18 + 26);
    }
  }

  drawStatusChips(ctx, view, pad) {
    const pl = this.player; const chips = [];
    if (pl.shield > 0) chips.push([STR.statusShield, '#bfe9f0']);
    if (pl.swift > 0) chips.push([STR.statusSwift, '#7fd0ff']);
    if (pl.heal > 0) chips.push([STR.statusHeal, '#aef0c0']);
    if (pl.slow > 0) chips.push([STR.statusSlow, '#9fb3bf']);
    if (pl.poison > 0) chips.push([STR.statusPoison, P.poison]);
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
    wobblyText(ctx, STR.title, w / 2, h * 0.18, Math.min(72, w * 0.13), P.foam, 2);
    ctx.font = FONT(18, '600'); ctx.fillStyle = P.amberSoft; ctx.textBaseline = 'middle';
    ctx.fillText(STR.subtitle, w / 2, h * 0.18 + Math.min(54, w * 0.1));
    ctx.font = FONT(14, '500'); ctx.fillStyle = rgba(P.foam, 0.8);
    ctx.fillText(STR.tagline, w / 2, h * 0.74);
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 2.5);
    ctx.font = FONT(17, '700'); ctx.fillStyle = P.foam;
    ctx.fillText(STR.tapToStart, w / 2, h * 0.81); ctx.globalAlpha = 1;
    ctx.font = FONT(12, '500'); ctx.fillStyle = rgba(P.foam, 0.6);
    ctx.fillText(STR.dragHint + '  ·  ' + STR.keyHint, w / 2, h * 0.87);
    ctx.font = FONT(13, '600'); ctx.fillStyle = P.amberSoft;
    const pct = Math.round((this.save.best / WORLD.goalDistance) * 100);
    ctx.fillText(`🥚 ${this.save.eggs.toLocaleString()} ${STR.shopBanked}   ·   ${(this.save.laidTotal || 0).toLocaleString()} laid   ·   ${STR.hudBest} ${pct}%`, w / 2, h * 0.93);

    const bw = Math.min(150, w * 0.26), bh = 44, gap = 12;
    const totalW = bw * 3 + gap * 2; let bx = w / 2 - totalW / 2; const by = h * 0.55;
    this.button(ctx, 'shop', bx, by, bw, bh, '⚓ ' + STR.toShop); bx += bw + gap;
    this.button(ctx, 'wardrobe', bx, by, bw, bh, '🐟 ' + STR.toWardrobe); bx += bw + gap;
    this.button(ctx, 'loot', bx, by, bw, bh, '🦪 ' + STR.toLoot);
    this.button(ctx, 'mute', w - 110 - 12, 12, 110, 34, Audio.isMuted() ? '🔇 ' + STR.muted : '🔊 ' + STR.unmuted);
  }

  renderShop(ctx, view) {
    const { w } = view; const ph = Math.min(484, view.h * 0.94);
    const { px, py, pw } = this.panel(ctx, view, ph);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    wobblyText(ctx, STR.shopTitle, w / 2, py + 30, 25, P.foam, 3);
    ctx.font = FONT(12, '500'); ctx.fillStyle = rgba(P.foam, 0.75); ctx.fillText(STR.shopBlurb, w / 2, py + 52);
    ctx.fillStyle = P.amber; ctx.font = FONT(15, '800'); ctx.fillText(`🥚 ${this.save.eggs.toLocaleString()} ${STR.shopBanked}`, w / 2, py + 74);
    const rowH = (ph - 140) / UPGRADES.length;
    UPGRADES.forEach((u, i) => {
      const ry = py + 94 + i * rowH;
      const lvl = this.save.upg[u.id] || 0; const maxed = lvl >= u.max;
      const cost = u.baseCost + u.step * lvl;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = FONT(15, '800'); ctx.fillStyle = P.foam; ctx.fillText(u.name, px + 24, ry + 8);
      ctx.font = FONT(11, '500'); ctx.fillStyle = rgba(P.foam, 0.7); ctx.fillText(u.desc, px + 24, ry + 25);
      for (let k = 0; k < u.max; k++) { ctx.fillStyle = k < lvl ? P.amber : 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(px + 24 + k * 16, ry + 39, 5, 0, TAU); ctx.fill(); }
      const bx = px + pw - 132;
      if (maxed) { ctx.fillStyle = rgba(P.amberSoft, 0.8); ctx.font = FONT(14, '800'); ctx.textAlign = 'center'; ctx.fillText(STR.shopMaxed, bx + 54, ry + 20); }
      else this.button(ctx, 'buy:' + u.id, bx, ry + 2, 108, 36, `🥚 ${cost}`, this.save.eggs >= cost, this.save.eggs >= cost);
    });
    this.button(ctx, 'back', px + pw / 2 - 55, py + ph - 42, 110, 32, '‹ ' + STR.shopBack);
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
      this.button(ctx, 'crack', px + pw / 2 - 124, py + ph - 44, 110, 34, '🦪 ' + STR.lootAgain, this.save.eggs >= LOOTBOX.cost, true);
      if (!dupe) this.button(ctx, 'wear', px + pw / 2 + 14, py + ph - 44, 110, 34, '✦ ' + STR.lootEquipNow);
      else this.button(ctx, 'back', px + pw / 2 + 14, py + ph - 44, 110, 34, '‹ ' + STR.shopBack);
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

  renderWin(ctx, view) {
    const { w, h } = view;
    ctx.fillStyle = rgba('#06243a', 0.5); ctx.fillRect(0, 0, w, h);
    wobblyText(ctx, STR.win, w / 2, h * 0.22, Math.min(56, w * 0.1), P.amberSoft, 4);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = FONT(16, '600'); ctx.fillStyle = P.foam; ctx.fillText(STR.winSub, w / 2, h * 0.33);
    ctx.font = FONT(24, '800'); ctx.fillStyle = P.amber; ctx.fillText(STR.eggsLaid(this.eggsTarget), w / 2, h * 0.44);
    ctx.font = FONT(13, '600'); ctx.fillStyle = rgba(P.amberSoft, 0.95); ctx.fillText(STR.lifetimeEggs(this.save.laidTotal || 0), w / 2, h * 0.52);
    ctx.font = FONT(13, '500'); ctx.fillStyle = rgba(P.foam, 0.8); ctx.fillText(STR.winFunFact, w / 2, h * 0.58);
    this.button(ctx, 'retry', w / 2 - 190, h * 0.7, 116, 44, '↺ ' + STR.retry, true, true);
    this.button(ctx, 'wardrobe', w / 2 - 58, h * 0.7, 116, 44, '🐟 ' + STR.toWardrobe);
    this.button(ctx, 'shop', w / 2 + 74, h * 0.7, 116, 44, '⚓ ' + STR.toShop);
  }

  renderDead(ctx, view) {
    const { w, h } = view;
    ctx.fillStyle = rgba('#1a0d12', 0.5); ctx.fillRect(0, 0, w, h);
    wobblyText(ctx, STR.deathTitle, w / 2, h * 0.24, Math.min(48, w * 0.09), '#e8a0a0', 7);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = FONT(17, '600'); ctx.fillStyle = P.foam; ctx.fillText(this.deathMsg, w / 2, h * 0.35);
    ctx.font = FONT(13, '500'); ctx.fillStyle = rgba(P.foam, 0.7); ctx.fillText('🐟 ' + this.funFact, w / 2, h * 0.43);
    ctx.font = FONT(14, '700'); ctx.fillStyle = P.amberSoft;
    const pct = Math.round((this.player.x / WORLD.goalDistance) * 100);
    ctx.fillText(`+${Math.floor(this.runEggs)} 🥚 banked   ·   reached ${pct}% · ${WORLD.zones[this.regionIdx].name}`, w / 2, h * 0.5);
    const free = this.stats().wind > 0 && !this.usedWind;
    const canRevive = free || this.save.eggs >= this.reviveCost;
    let bx = w / 2 - (canRevive ? 250 : 125);
    if (canRevive) { this.button(ctx, 'revive', bx, h * 0.62, 130, 44, free ? STR.continueFree : STR.continueBtn(this.reviveCost), true, true); bx += 142; }
    this.button(ctx, 'retry', bx, h * 0.62, 116, 44, '↺ ' + STR.retry, true, !canRevive); bx += 128;
    this.button(ctx, 'shop', bx, h * 0.62, 116, 44, '⚓ ' + STR.toShop);
  }

  entityCount() {
    return this.enemies.length + this.squids.length + this.puffers.length + this.jellies.length +
      this.boats.length + this.copepods.length + this.seagulls.length;
  }
}
