// Bootstrap: responsive DPR-capped canvas, fixed-timestep loop, pause-on-blur,
// dev overlay. All gameplay lives in Game; this file is just the harness.
import { STEP, DPR_CAP, REF_H } from './config.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Game } from './game.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });
const devEl = document.getElementById('dev');
const game = new Game();
const view = { w: 0, h: 0, scale: 1, camX: 0, worldViewW: 0 };

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  view.w = window.innerWidth; view.h = window.innerHeight;
  canvas.width = Math.round(view.w * dpr); canvas.height = Math.round(view.h * dpr);
  canvas.style.width = view.w + 'px'; canvas.style.height = view.h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  view.scale = view.h / REF_H;
  view.worldViewW = view.w / view.scale;
}
addEventListener('resize', resize);
addEventListener('orientationchange', resize);
resize();

Input.init(canvas);
// unlock the audio context on the very first interaction (browser policy)
const unlock = () => Audio.unlock();
addEventListener('pointerdown', unlock, { once: true });
addEventListener('keydown', unlock, { once: true });

let paused = false;
addEventListener('blur', () => { paused = true; });
addEventListener('focus', () => { paused = false; last = performance.now(); });
document.addEventListener('visibilitychange', () => {
  paused = document.hidden; if (!paused) last = performance.now();
});

const dev = new URLSearchParams(location.search).has('dev');
if (dev) devEl.style.display = 'block';

let acc = 0, last = performance.now(), frames = 0, fpsAt = last, fps = 0;
const stepSec = STEP / 1000;

function frame(now) {
  requestAnimationFrame(frame);
  if (paused) { last = now; return; }
  let dtMs = now - last; last = now;
  if (dtMs > 250) dtMs = 250;        // clamp after a stall
  const nowSec = now / 1000;
  Input.update(nowSec);
  Audio.update(dtMs / 1000);

  acc += dtMs;
  let steps = 0;
  while (acc >= STEP && steps < 5) { game.update(stepSec, nowSec); acc -= STEP; steps++; }
  if (steps === 5) acc = 0;          // don't spiral

  game.render(ctx, view);

  if (dev) {
    frames++;
    if (now - fpsAt >= 500) { fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; }
    devEl.textContent = `${fps} fps · ${game.state} · ent ${game.entityCount?.() ?? 0}`;
  }
}
requestAnimationFrame(frame);

// expose for quick debugging
window.__sunfish = game;
