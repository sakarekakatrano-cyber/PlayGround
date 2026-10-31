/* ============================================================
   GREEN ZONE — unified input (keyboard, mouse, gamepad, touch)
   ============================================================ */
(function () {
  'use strict';

  const DEAD = 0.18;
  const STICK_MAX = 54;

  const el = (id) => document.getElementById(id);

  function deadzone(x, y, dz) {
    const m = Math.hypot(x, y);
    if (m <= dz) return { x: 0, y: 0, m: 0 };
    const scale = Math.min(1, (m - dz) / (1 - dz)) / (m || 1);
    return { x: x * scale, y: y * scale, m: Math.hypot(x * scale, y * scale) };
  }

  class Input {
    constructor(canvas) {
      this.canvas = canvas;
      this.keys = new Set();
      this.move = { x: 0, y: 0 };
      this.aim = { x: 0, y: 0 };
      this.aimActive = false;
      this.pointer = { x: 0, y: 0, active: false, last: -Infinity };
      this.pad = { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, aimActive: false };
      this.padConnected = false;
      this.padName = '';
      this.dashQueued = false;
      this.pauseQueued = false;
      this.pausedByVisibility = false;
      this.sticks = {
        left: { id: null, ox: 0, oy: 0, el: el('stickL'), knob: el('knobL') },
        right: { id: null, ox: 0, oy: 0, el: el('stickR'), knob: el('knobR') },
      };
      this.onGamepadChange = null;
      this.bind();
    }

    bind() {
      const canvas = this.canvas;

      window.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
        if (e.repeat) return;
        this.keys.add(k);
        if (k === ' ' || k === 'shift' || k === 'e') this.dashQueued = true;
        if (k === 'escape' || k === 'p') this.pauseQueued = true;
      }, { passive: false });

      window.addEventListener('keyup', (e) => {
        this.keys.delete(e.key.toLowerCase());
      });

      window.addEventListener('blur', () => {
        this.keys.clear();
        this.releaseSticks();
      });

      canvas.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch') return;
        const r = canvas.getBoundingClientRect();
        this.pointer.x = e.clientX - r.left;
        this.pointer.y = e.clientY - r.top;
        this.pointer.active = true;
        this.pointer.last = performance.now();
      });

      canvas.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch') {
          this.pointer.active = true;
          this.pointer.last = performance.now();
          const r = canvas.getBoundingClientRect();
          this.pointer.x = e.clientX - r.left;
          this.pointer.y = e.clientY - r.top;
          return;
        }
        e.preventDefault();
        document.body.classList.add('is-touch');
        const side = e.clientX < window.innerWidth * 0.5 ? 'left' : 'right';
        const stick = this.sticks[side];
        if (stick.id !== null) return;
        stick.id = e.pointerId;
        stick.ox = e.clientX;
        stick.oy = e.clientY;
        if (stick.el) {
          stick.el.style.left = e.clientX + 'px';
          stick.el.style.top = e.clientY + 'px';
          stick.el.classList.add('is-active');
        }
        if (stick.knob) stick.knob.style.transform = 'translate(0px, 0px)';
        this.setStick(side, 0, 0);
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      }, { passive: false });

      canvas.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'touch') return;
        const side = this.sticks.left.id === e.pointerId ? 'left' : this.sticks.right.id === e.pointerId ? 'right' : null;
        if (!side) return;
        const stick = this.sticks[side];
        let dx = e.clientX - stick.ox;
        let dy = e.clientY - stick.oy;
        const m = Math.hypot(dx, dy);
        if (m > STICK_MAX) {
          dx = (dx / m) * STICK_MAX;
          dy = (dy / m) * STICK_MAX;
        }
        if (stick.knob) stick.knob.style.transform = `translate(${dx}px, ${dy}px)`;
        const nx = dx / STICK_MAX;
        const ny = dy / STICK_MAX;
        const dz = deadzone(nx, ny, 0.14);
        this.setStick(side, dz.x, dz.y);
      }, { passive: true });

      const endTouch = (e) => {
        const side = this.sticks.left.id === e.pointerId ? 'left' : this.sticks.right.id === e.pointerId ? 'right' : null;
        if (side) this.releaseStick(side);
      };
      canvas.addEventListener('pointerup', endTouch);
      canvas.addEventListener('pointercancel', endTouch);
      canvas.addEventListener('lostpointercapture', endTouch);
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      window.addEventListener('gamepadconnected', (e) => {
        this.padConnected = true;
        this.padName = e.gamepad.id;
        if (this.onGamepadChange) this.onGamepadChange(true, e.gamepad.id);
      });
      window.addEventListener('gamepaddisconnected', () => {
        this.padConnected = false;
        if (this.onGamepadChange) this.onGamepadChange(false, '');
      });

      const kick = () => {
        if (this.onFirstGesture) this.onFirstGesture();
      };
      window.addEventListener('pointerdown', kick, { once: false });
      window.addEventListener('keydown', kick, { once: false });
    }

    setStick(side, x, y) {
      if (side === 'left') {
        this.move.x = x;
        this.move.y = y;
      } else {
        this.aim.x = x;
        this.aim.y = y;
        this.aimActive = Math.hypot(x, y) > 0.001;
      }
    }

    releaseStick(side) {
      const stick = this.sticks[side];
      stick.id = null;
      if (stick.el) stick.el.classList.remove('is-active');
      if (stick.knob) stick.knob.style.transform = 'translate(0px, 0px)';
      this.setStick(side, 0, 0);
    }

    releaseSticks() {
      this.releaseStick('left');
      this.releaseStick('right');
    }

    queueDash() { this.dashQueued = true; }
    queuePause() { this.pauseQueued = true; }
    takeDash() { const v = this.dashQueued; this.dashQueued = false; return v; }
    takePause() { const v = this.pauseQueued; this.pauseQueued = false; return v; }

    keyVector() {
      let x = 0;
      let y = 0;
      const k = this.keys;
      if (k.has('a') || k.has('arrowleft')) x -= 1;
      if (k.has('d') || k.has('arrowright')) x += 1;
      if (k.has('w') || k.has('arrowup')) y -= 1;
      if (k.has('s') || k.has('arrowdown')) y += 1;
      const m = Math.hypot(x, y);
      return m > 0 ? { x: x / m, y: y / m } : { x: 0, y: 0 };
    }

    pollGamepad(now) {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let pad = null;
      for (const p of pads) { if (p && p.connected) { pad = p; break; } }
      if (!pad) {
        this.pad.move.x = this.pad.move.y = 0;
        this.pad.aim.x = this.pad.aim.y = 0;
        this.pad.aimActive = false;
        this.padConnected = false;
        return;
      }
      this.padConnected = true;
      this.padName = pad.id;

      let mx = pad.axes[0] || 0;
      let my = pad.axes[1] || 0;
      // D-pad fallback
      if (pad.buttons[12] && pad.buttons[12].pressed) my = -1;
      if (pad.buttons[13] && pad.buttons[13].pressed) my = 1;
      if (pad.buttons[14] && pad.buttons[14].pressed) mx = -1;
      if (pad.buttons[15] && pad.buttons[15].pressed) mx = 1;
      const md = deadzone(mx, my, DEAD);
      this.pad.move.x = md.x;
      this.pad.move.y = md.y;

      const ax = pad.axes[2] || 0;
      const ay = pad.axes[3] || 0;
      const ad = deadzone(ax, ay, 0.3);
      this.pad.aim.x = ad.x;
      this.pad.aim.y = ad.y;
      this.pad.aimActive = Math.hypot(ad.x, ad.y) > 0.01;

      const btn = (i) => pad.buttons[i] && pad.buttons[i].pressed;
      if (btn(0) && !this._prevA) this.dashQueued = true;
      if ((btn(9) || btn(8)) && !this._prevStart) this.pauseQueued = true;
      this._prevA = btn(0);
      this._prevStart = btn(9) || btn(8);
    }

    /**
     * Combined input snapshot. Aim is a direction vector when the player
     * is actively steering it; otherwise the game auto-aims.
     */
    sample(now) {
      this.pollGamepad(now);

      let mv = this.keyVector();
      if (!mv.x && !mv.y && (this.move.x || this.move.y)) mv = this.move;
      if (this.pad.move.x || this.pad.move.y) mv = this.pad.move;

      const rx = this.aimActive ? this.aim : { x: 0, y: 0 };
      const p = this.pad.aimActive ? this.pad.aim : { x: 0, y: 0 };
      const ax = this.aimActive ? rx.x : p.x;
      const ay = this.aimActive ? rx.y : p.y;

      if (now - this.pointer.last > 3500) this.pointer.active = false;

      return {
        moveX: mv.x,
        moveY: mv.y,
        aimX: ax,
        aimY: ay,
        aimActive: Math.hypot(ax, ay) > 0.01,
        pointer: this.pointer,
        dash: this.takeDash(),
        pause: this.takePause(),
      };
    }

    reset() {
      this.keys.clear();
      this.releaseSticks();
      this.dashQueued = false;
      this.pauseQueued = false;
    }
  }

  window.Input = Input;
})();
