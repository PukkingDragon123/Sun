// Synthesized audio via Web Audio API — no asset files needed. Everything is
// wrapped defensively so audio can never crash the game loop.
let ctx = null, master = null, musicBus = null, sfxBus = null, seaBus = null;
let noiseBuf = null;
let muted = false;
let melodyTimer = 0, melodyStep = 0;
let seaNodes = null, padNodes = null;

function ensure() {
  if (ctx) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.28; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    seaBus = ctx.createGain(); seaBus.gain.value = 0.0; seaBus.connect(master);
    // shared noise buffer
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; d[i] = last * 3.0; // brownish noise
    }
    return true;
  } catch (e) { return false; }
}

function env(node, t0, a, peak, d) {
  const g = node.gain;
  g.cancelScheduledValues(t0);
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
  g.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}

function tone(freq, t0, a, peak, d, type = 'sine', bus = sfxBus, glideTo = null) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + a + d);
  const g = ctx.createGain(); o.connect(g); g.connect(bus);
  env(g, t0, a, peak, d);
  o.start(t0); o.stop(t0 + a + d + 0.05);
}

function noise(t0, dur, peak, filterType, freq, q, bus = sfxBus, sweepTo = null) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.setValueAtTime(freq, t0);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  if (q != null) f.Q.value = q;
  const g = ctx.createGain(); src.connect(f); f.connect(g); g.connect(bus);
  env(g, t0, dur * 0.2, peak, dur * 0.8);
  src.start(t0); src.stop(t0 + dur + 0.05);
}

const SFX = {
  pickup() { const t = ctx.currentTime; tone(660, t, 0.01, 0.5, 0.12, 'sine'); tone(990, t + 0.06, 0.01, 0.4, 0.16, 'sine'); },
  dash() { noise(ctx.currentTime, 0.34, 0.5, 'bandpass', 280, 0.8, sfxBus, 1700); },
  hurt() { const t = ctx.currentTime; tone(150, t, 0.005, 0.7, 0.22, 'square', sfxBus, 70); noise(t, 0.22, 0.5, 'lowpass', 500, 1, sfxBus); },
  snare() { const t = ctx.currentTime; tone(220, t, 0.01, 0.45, 0.3, 'sawtooth', sfxBus, 160); },
  escape() { const t = ctx.currentTime; tone(400, t, 0.005, 0.5, 0.14, 'triangle', sfxBus, 900); },
  ui() { tone(520, ctx.currentTime, 0.005, 0.3, 0.07, 'triangle'); },
  buy() { const t = ctx.currentTime; tone(587, t, 0.01, 0.4, 0.1); tone(880, t + 0.08, 0.01, 0.4, 0.14); },
  eggs() {
    const t = ctx.currentTime; const sc = [523, 659, 784, 988, 1175];
    sc.forEach((f, i) => tone(f, t + i * 0.12, 0.02, 0.45, 0.6, 'sine', musicBus));
  },
  warn() { tone(330, ctx.currentTime, 0.01, 0.3, 0.18, 'sawtooth'); },
};

// gentle pentatonic music-box motif scheduled on the loop tick
const SCALE = [392, 440, 523, 587, 659, 784];
function tickMelody(dt) {
  if (!padNodes) return;
  melodyTimer -= dt;
  if (melodyTimer <= 0) {
    melodyTimer = 1.6 + Math.random() * 2.2;
    melodyStep++;
    if (Math.random() < 0.82) {
      const f = SCALE[Math.floor(Math.random() * SCALE.length)] * (Math.random() < 0.3 ? 0.5 : 1);
      tone(f, ctx.currentTime, 0.02, 0.32, 1.4, 'sine', musicBus);
    }
  }
}

export const Audio = {
  unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
  isMuted() { return muted; },
  setMuted(m) { muted = m; if (master) master.gain.value = muted ? 0 : 0.85; },
  toggleMute() { this.setMuted(!muted); return muted; },
  sfx(name) { if (!ensure() || muted) return; try { SFX[name] && SFX[name](); } catch (e) {} },

  music(on) {
    if (!ensure()) return;
    if (on && !padNodes) {
      const t = ctx.currentTime;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      lp.connect(musicBus);
      const freqs = [130.8, 196.0, 261.6]; const oscs = [];
      for (const fr of freqs) {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = fr;
        const g = ctx.createGain(); g.gain.value = 0.12; o.connect(g); g.connect(lp);
        o.start(t); oscs.push(o);
      }
      // slow tremolo on the filter for a breathing pad
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
      const lg = ctx.createGain(); lg.gain.value = 300; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t);
      padNodes = { oscs, lfo, lp };
    } else if (!on && padNodes) {
      try { padNodes.oscs.forEach((o) => o.stop()); padNodes.lfo.stop(); } catch (e) {}
      padNodes = null;
    }
  },

  sea(on) {
    if (!ensure()) return;
    const tgt = on ? 0.5 : 0.0;
    seaBus.gain.cancelScheduledValues(ctx.currentTime);
    seaBus.gain.linearRampToValueAtTime(tgt, ctx.currentTime + 0.8);
    if (on && !seaNodes) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12;
      const lg = ctx.createGain(); lg.gain.value = 160; lfo.connect(lg); lg.connect(lp.frequency);
      src.connect(lp); lp.connect(seaBus); src.start(); lfo.start();
      seaNodes = { src, lfo };
    }
  },

  update(dt) { if (ctx && !muted) tickMelody(dt); },
};
