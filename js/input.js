// Unified input. Pointer drag is the core verb (touch + mouse); keyboard
// (physical codes) and gamepad left-stick are first-class alternates.
import { DASH } from './config.js';

const KEYDIR = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};

export const Input = {
  sx: 0, sy: 0,            // pointer position in CSS pixels
  active: false,           // is the fish currently being steered by pointer?
  hasMouse: false,
  velX: 0, velY: 0, speed: 0,
  dir: { x: 0, y: 0 },     // keyboard/gamepad steer vector
  usingPad: false,
  _isDown: false, _ptype: 'mouse',
  _lx: 0, _ly: 0, _lt: 0,
  _flickArmed: true,
  _dashAt: -999,
  _anyPressed: false,
  _muteReq: false,
  _keys: new Set(),

  init(canvas) {
    const rect = () => canvas.getBoundingClientRect();
    const setPos = (e) => {
      const r = rect();
      this.sx = e.clientX - r.left; this.sy = e.clientY - r.top;
    };
    canvas.addEventListener('pointerdown', (e) => {
      this._ptype = e.pointerType; this._isDown = true; this.active = true;
      setPos(e); this._lx = this.sx; this._ly = this.sy; this._anyPressed = true;
      this._tap = { x: this.sx, y: this.sy };   // for UI hit-testing
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      this._ptype = e.pointerType; setPos(e);
      if (e.pointerType === 'mouse') { this.hasMouse = true; this.active = true; }
      else if (this._isDown) this.active = true;
    });
    const up = (e) => {
      this._isDown = false;
      if (e.pointerType !== 'mouse') this.active = false; // touch release -> coast
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.active = false;
    });
    // block page scroll/zoom on the canvas
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this._keys.add(e.code); this._anyPressed = true;
      if (e.code === 'Space') this._dashAt = performance.now() / 1000;
      if (e.code === 'KeyM') this._muteReq = true;
      if (KEYDIR[e.code] || e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this._keys.delete(e.code));
  },

  // Poll gamepad and recompute derived state. Call once per frame with seconds.
  update(now) {
    // keyboard direction
    let kx = 0, ky = 0;
    for (const code of this._keys) {
      const d = KEYDIR[code]; if (d) { kx += d[0]; ky += d[1]; }
    }
    // gamepad
    let gx = 0, gy = 0, padDash = false; this.usingPad = false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.22) { gx += ax; gy += ay; this.usingPad = true; }
      if (gp.buttons[12] && gp.buttons[12].pressed) { gy -= 1; this.usingPad = true; }
      if (gp.buttons[13] && gp.buttons[13].pressed) { gy += 1; this.usingPad = true; }
      if (gp.buttons[14] && gp.buttons[14].pressed) { gx -= 1; this.usingPad = true; }
      if (gp.buttons[15] && gp.buttons[15].pressed) { gx += 1; this.usingPad = true; }
      if (gp.buttons[0] && gp.buttons[0].pressed) padDash = true;
      if (gp.buttons[9] && gp.buttons[9].pressed) this._anyPressed = true;
    }
    if (this.usingPad && (gx || gy)) { kx = gx; ky = gy; }
    const m = Math.hypot(kx, ky);
    this.dir.x = m > 1 ? kx / m : kx;
    this.dir.y = m > 1 ? ky / m : ky;
    if ((this.usingPad && (gx || gy)) || (kx || ky)) this._anyPressed = this._anyPressed; // keep
    if (padDash) this._dashAt = now;

    // pointer velocity + flick-to-dash
    const dt = Math.max(0.001, now - this._lt); this._lt = now;
    if (this.active) {
      const vx = (this.sx - this._lx) / dt, vy = (this.sy - this._ly) / dt;
      // light smoothing
      this.velX = this.velX * 0.5 + vx * 0.5;
      this.velY = this.velY * 0.5 + vy * 0.5;
      this.speed = Math.hypot(this.velX, this.velY);
      this._lx = this.sx; this._ly = this.sy;
      if (this.speed < 420) this._flickArmed = true;
      if (this._flickArmed && this.speed > DASH.flickSpeed) {
        this._flickArmed = false; this._dashAt = now;
      }
    } else {
      this.velX *= 0.6; this.velY *= 0.6; this.speed = Math.hypot(this.velX, this.velY);
      this._flickArmed = true;
    }
  },

  // dash buffered within the queue window?
  consumeDash(now) {
    if (now - this._dashAt <= DASH.queue) { this._dashAt = -999; return true; }
    return false;
  },
  flickDir() {
    const m = Math.hypot(this.velX, this.velY);
    return m > 1 ? { x: this.velX / m, y: this.velY / m } : { x: 1, y: 0 };
  },
  anyJustPressed() { const v = this._anyPressed; this._anyPressed = false; return v; },
  muteRequested() { const v = this._muteReq; this._muteReq = false; return v; },
  // consume a fresh tap (screen coords) for UI hit-testing, or null
  takeTap() { const t = this._tap; this._tap = null; return t; },
};
