// Audio via the Web Audio API. The ambience and SFX are synthesized (no assets
// required), but if a background song FILE is supplied it becomes the music bed
// and the synth pad steps aside. Everything is wrapped defensively so audio can
// never crash the game loop.
//
// Supplying a song (so it ships in the self-contained standalone too):
//   - drop an audio file in the repo (assets/song.mp3, assets/music.mp3, …);
//   - the standalone build inlines it as window.__SUNFISH_MUSIC (a data URI);
//   - or set window.__SUNFISH_MUSIC_URL to any URL before the game boots.
// The modular build also just fetches the conventional asset paths below.
let ctx = null, master = null, musicBus = null, sfxBus = null, seaBus = null;
let noiseBuf = null;
let muted = false;
let melodyTimer = 0, melodyStep = 0;
let seaNodes = null, padNodes = null;
// live level metering (for syncing visuals to the music) + external song
let analyser = null, levelData = null, _level = 0, _beat = 0, _beatAvg = 0;
let songBuf = null, songSrc = null, songGain = null, songLoading = false, songTried = false, musicOn = false, usingSong = false;

function ensure() {
  if (ctx) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85;
    // analyser sits between the master and the speakers (pass-through), so we can
    // read the live output level of WHATEVER is playing — song or synth.
    analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.6;
    levelData = new Uint8Array(analyser.fftSize);
    master.connect(analyser); analyser.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.32; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    seaBus = ctx.createGain(); seaBus.gain.value = 0.0; seaBus.connect(master);
    // shared noise buffer (brownish)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; d[i] = last * 3.0;
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

// a softer, rounder blip: a tone with a quiet octave shimmer on top
function ping(freq, t0, peak, d, type = 'sine', bus = sfxBus) {
  tone(freq, t0, 0.008, peak, d, type, bus);
  tone(freq * 2.01, t0, 0.008, peak * 0.28, d * 0.7, 'sine', bus);
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

// polished SFX — warmer envelopes, octave shimmer, gentle chords
const SFX = {
  pickup() { const t = ctx.currentTime; ping(720, t, 0.42, 0.12, 'sine'); ping(1080, t + 0.05, 0.34, 0.14, 'sine'); },
  dash() { const t = ctx.currentTime; noise(t, 0.32, 0.45, 'bandpass', 260, 0.8, sfxBus, 1900); tone(180, t, 0.006, 0.3, 0.2, 'sine', sfxBus, 520); },
  hurt() { const t = ctx.currentTime; tone(150, t, 0.004, 0.7, 0.24, 'square', sfxBus, 66); noise(t, 0.24, 0.5, 'lowpass', 520, 1, sfxBus, 180); },
  snare() { const t = ctx.currentTime; tone(220, t, 0.01, 0.42, 0.3, 'sawtooth', sfxBus, 150); noise(t, 0.18, 0.2, 'bandpass', 900, 1.4); },
  escape() { const t = ctx.currentTime; tone(420, t, 0.004, 0.5, 0.16, 'triangle', sfxBus, 980); ping(820, t + 0.05, 0.25, 0.12); },
  ui() { const t = ctx.currentTime; ping(560, t, 0.26, 0.08, 'triangle'); },
  buy() { const t = ctx.currentTime; [523, 659, 784].forEach((f, i) => ping(f, t + i * 0.05, 0.34, 0.12, 'sine')); },
  eggs() { const t = ctx.currentTime; [523, 659, 784, 988, 1175].forEach((f, i) => tone(f, t + i * 0.11, 0.02, 0.42, 0.6, 'sine', musicBus)); },
  warn() { const t = ctx.currentTime; tone(330, t, 0.01, 0.3, 0.2, 'sawtooth'); tone(247, t + 0.12, 0.01, 0.26, 0.22, 'sawtooth'); },
  mine() { const t = ctx.currentTime; noise(t, 0.5, 0.8, 'lowpass', 900, 1, sfxBus, 90); tone(90, t, 0.005, 0.7, 0.45, 'sawtooth', sfxBus, 36); },
  chest() { const t = ctx.currentTime; tone(180, t, 0.01, 0.4, 0.12, 'square', sfxBus, 130); noise(t + 0.05, 0.18, 0.3, 'highpass', 2000, 0.7); },
  reveal() { const t = ctx.currentTime; [523, 659, 784, 988, 1318].forEach((f, i) => ping(f, t + i * 0.06, 0.36, 0.4, 'triangle', musicBus)); },
  equip() { const t = ctx.currentTime; ping(659, t, 0.32, 0.09, 'sine'); ping(988, t + 0.05, 0.28, 0.12, 'sine'); },
};

// gentle pentatonic music-box motif (only when the synth pad — not a song — plays)
const SCALE = [392, 440, 523, 587, 659, 784];
function tickMelody(dt) {
  if (!padNodes || usingSong) return;
  melodyTimer -= dt;
  if (melodyTimer <= 0) {
    melodyTimer = 2.6 + Math.random() * 3.2;
    melodyStep++;
    if (Math.random() < 0.82) {
      const f = SCALE[Math.floor(Math.random() * SCALE.length)] * (Math.random() < 0.3 ? 0.5 : 1);
      tone(f, ctx.currentTime, 0.02, 0.32, 1.4, 'sine', musicBus);
    }
  }
}

// ---- synth pad (fallback music bed) ----------------------------------------
function startPad() {
  if (padNodes || usingSong) return;
  const t = ctx.currentTime;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(musicBus);
  const freqs = [130.8, 196.0, 261.6]; const oscs = [];
  for (const fr of freqs) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = fr;
    const g = ctx.createGain(); g.gain.value = 0.12; o.connect(g); g.connect(lp);
    o.start(t); oscs.push(o);
  }
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
  const lg = ctx.createGain(); lg.gain.value = 300; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t);
  padNodes = { oscs, lfo, lp };
}
function stopPad() {
  if (!padNodes) return;
  try { padNodes.oscs.forEach((o) => o.stop()); padNodes.lfo.stop(); } catch (e) {}
  padNodes = null;
}

// ---- external background song ----------------------------------------------
function songSources() {
  // Only explicit sources, so a build with no song makes ZERO network requests
  // (no 404 console noise). The standalone build injects window.__SUNFISH_MUSIC
  // (a data URI); the served build can set window.__SUNFISH_MUSIC_URL to a path.
  const list = [];
  if (typeof window !== 'undefined') {
    if (window.__SUNFISH_MUSIC) list.push(window.__SUNFISH_MUSIC);
    if (window.__SUNFISH_MUSIC_URL) list.push(window.__SUNFISH_MUSIC_URL);
  }
  return list;
}
function loadSong() {
  if (songLoading || songBuf || songTried) return;
  songLoading = true;
  const tryNext = (i) => {
    const srcs = songSources();
    if (i >= srcs.length) { songLoading = false; songTried = true; return; }   // none found -> synth bed
    fetch(srcs[i])
      .then((r) => { if (!r.ok) throw 0; return r.arrayBuffer(); })
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => { songBuf = buf; songLoading = false; songTried = true; if (musicOn) startSong(); })
      .catch(() => tryNext(i + 1));
  };
  tryNext(0);
}
function startSong() {
  if (!songBuf || usingSong) return;
  try {
    stopPad();
    songSrc = ctx.createBufferSource(); songSrc.buffer = songBuf; songSrc.loop = true;
    songGain = ctx.createGain(); songGain.gain.value = 0.0001;
    songSrc.connect(songGain); songGain.connect(musicBus);
    const t = ctx.currentTime;
    songSrc.start(t);
    songGain.gain.exponentialRampToValueAtTime(0.95, t + 1.4);   // gentle fade-in
    usingSong = true;
  } catch (e) {}
}
function stopSong() {
  if (!usingSong) return;
  try {
    const t = ctx.currentTime;
    songGain.gain.cancelScheduledValues(t);
    songGain.gain.setValueAtTime(Math.max(0.0002, songGain.gain.value), t);
    songGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    songSrc.stop(t + 0.7);
  } catch (e) {}
  usingSong = false; songSrc = null; songGain = null;
}

export const Audio = {
  unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); if (ctx) loadSong(); },
  isMuted() { return muted; },
  setMuted(m) { muted = m; if (master) master.gain.value = muted ? 0 : 0.85; },
  toggleMute() { this.setMuted(!muted); return muted; },
  sfx(name) { if (!ensure() || muted) return; try { SFX[name] && SFX[name](); } catch (e) {} },
  // does a real song file back the music? (else the synth pad is playing)
  hasSong() { return usingSong; },

  // smoothed live output level (0..1) of whatever is playing — for visual sync.
  // Call once per frame; cheap. Returns 0 when muted/silent.
  level() {
    if (!analyser) return 0;
    try {
      analyser.getByteTimeDomainData(levelData);
      let peak = 0;
      for (let i = 0; i < levelData.length; i++) { const v = Math.abs(levelData[i] - 128) / 128; if (v > peak) peak = v; }
      _level += (peak - _level) * 0.28;
      const rise = peak - _beatAvg; _beatAvg += (peak - _beatAvg) * 0.12;
      _beat = Math.max(_beat * 0.86, rise > 0.10 ? Math.min(1, rise * 4) : 0);
    } catch (e) {}
    return _level;
  },
  // a 0..1 value that spikes on musical transients (kick/onset), decays smoothly
  beat() { return _beat; },

  music(on) {
    if (!ensure()) return;
    musicOn = on;
    if (on) {
      loadSong();
      if (songBuf) startSong();
      else startPad();                 // synth bed until/unless a song is found
    } else {
      stopSong(); stopPad();
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
