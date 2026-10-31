/* ============================================================
   GREEN ZONE — arena survival engine (canvas 2D)
   ============================================================ */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  const C = {
    green: '#9bf00b',
    greenSoft: '#d6ff8a',
    red: '#ff3b5c',
    redSoft: '#ff9aae',
    orange: '#ff8a00',
    amber: '#ffc247',
    purple: '#b06bff',
    white: '#ffffff',
  };

  const PLAYER = {
    r: 13,
    speed: 340,
    maxHp: 100,
    fireRate: 0.15,
    bulletSpeed: 820,
    bulletDamage: 13,
    dashTime: 0.17,
    dashSpeed: 1420,
    dashCd: 2.3,
  };

  const OVERDRIVE_TIME = 8;

  function hexA(hex, a) {
    const v = Math.round(clamp(a, 0, 1) * 255).toString(16).padStart(2, '0');
    return hex + v;
  }

  function segCircle(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 0.0001) t = clamp(((cx - x1) * dx + (cy - y1) * dy) / len2, 0, 1);
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    return (cx - px) ** 2 + (cy - py) ** 2 <= r * r;
  }

  class GreenZone {
    constructor(canvas, sfx, hooks = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.sfx = sfx;
      this.hooks = hooks;
      this.state = 'idle';
      this.w = 1;
      this.h = 1;
      this.dpr = 1;
      this.sprites = {};
      this.stars = [];
      this.motes = [];
      this.player = null;
      this.shake = 0;
      this.flash = 0;
      this.flashColor = C.red;
      this.slow = 0;
      this.time = 0;
      this.lastHitSfx = -1;

      this.resize();
      this.reset();
      this.makeMotes();
      window.addEventListener('resize', () => this.resize());
    }

    /* ---------------- setup ---------------- */

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width || window.innerWidth));
      const h = Math.max(1, Math.round(rect.height || window.innerHeight));
      const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
      this.w = w;
      this.h = h;
      this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.buildBackground();
      this.makeStars();
      if (this.player) {
        this.player.x = clamp(this.player.x, 30, w - 30);
        this.player.y = clamp(this.player.y, 30, h - 30);
      }
    }

    /* bake the expensive static layers once per resize */
    buildBackground() {
      const w = this.w;
      const h = this.h;
      const dpr = this.dpr;
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * dpr));
      c.height = Math.max(1, Math.round(h * dpr));
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      const grd = g.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.78);
      grd.addColorStop(0, '#0b1a10');
      grd.addColorStop(0.5, '#071009');
      grd.addColorStop(1, '#030604');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);

      const step = 88;
      g.beginPath();
      g.strokeStyle = 'rgba(120, 200, 90, 0.05)';
      g.lineWidth = 1;
      for (let x = 0; x < w + step; x += step) {
        g.moveTo(Math.round(x) + 0.5, 0);
        g.lineTo(Math.round(x) + 0.5, h);
      }
      for (let y = 0; y < h + step; y += step) {
        g.moveTo(0, Math.round(y) + 0.5);
        g.lineTo(w, Math.round(y) + 0.5);
      }
      g.stroke();

      const pad = 7;
      g.strokeStyle = 'rgba(155, 240, 11, 0.1)';
      g.lineWidth = 1;
      g.strokeRect(pad + 0.5, pad + 0.5, w - pad * 2 - 1, h - pad * 2 - 1);
      const corner = 26;
      g.strokeStyle = 'rgba(155, 240, 11, 0.32)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(pad, pad + corner); g.lineTo(pad, pad); g.lineTo(pad + corner, pad);
      g.moveTo(w - pad - corner, pad); g.lineTo(w - pad, pad); g.lineTo(w - pad, pad + corner);
      g.moveTo(pad, h - pad - corner); g.lineTo(pad, h - pad); g.lineTo(pad + corner, h - pad);
      g.moveTo(w - pad - corner, h - pad); g.lineTo(w - pad, h - pad); g.lineTo(w - pad, h - pad - corner);
      g.stroke();

      this.bgLayer = c;
    }

    makeStars() {
      const count = clamp(Math.round((this.w * this.h) / 9000), 40, 150);
      this.stars = [];
      for (let i = 0; i < count; i++) {
        const layer = i % 3;
        this.stars.push({
          x: Math.random() * this.w,
          y: Math.random() * this.h,
          z: layer,
          size: layer === 0 ? 1 : layer === 1 ? 1.5 : 2.2,
          speed: 4 + layer * 9 + Math.random() * 5,
          tw: 0.4 + Math.random() * 1.6,
          ph: Math.random() * TAU,
        });
      }
    }

    makeMotes() {
      this.motes = [];
      for (let i = 0; i < 30; i++) {
        this.motes.push({
          x: Math.random() * this.w,
          y: Math.random() * this.h,
          r: rand(0.8, 2.8),
          vx: rand(-6, 14),
          vy: rand(-16, -4),
          a: rand(0.08, 0.3),
          ph: Math.random() * TAU,
        });
      }
    }

    reset() {
      this.player = {
        x: this.w / 2,
        y: this.h * 0.62,
        vx: 0,
        vy: 0,
        angle: -Math.PI / 2,
        hp: PLAYER.maxHp,
        maxHp: PLAYER.maxHp,
        invuln: 1,
        hitFlash: 0,
        fireCd: 0,
        dashCd: 0,
        dashT: 0,
        dashX: 0,
        dashY: 0,
        regenDelay: 0,
        trailT: 0,
      };
      this.enemies = [];
      this.bullets = [];
      this.ebullets = [];
      this.particles = [];
      this.pickups = [];
      this.texts = [];
      this.rings = [];
      this.boss = null;

      this.score = 0;
      this.combo = 0;
      this.comboTimer = 0;
      this.maxCombo = 0;
      this.kills = 0;
      this.wave = 0;
      this.overdrive = 0;
      this.time = 0;
      this.shake = 0;
      this.flash = 0;
      this.slow = 0;
      this.spawnQueue = [];
      this.spawnTimer = 0;
      this.waveClearPending = false;
      this.waveClearTimer = 0;
      this.deathTimer = 0;
      this.overSent = false;
      this.totalTime = 0;
    }

    start() {
      this.reset();
      this.player.x = this.w / 2;
      this.player.y = this.h * 0.62;
      this.state = 'playing';
      this.startWave(1);
      if (this.sfx) this.sfx.startMusic();
    }

    pause() {
      if (this.state === 'playing') this.state = 'paused';
    }

    resume() {
      if (this.state === 'paused') this.state = 'playing';
    }

    stopToMenu() {
      this.state = 'idle';
      if (this.sfx) this.sfx.stopMusic();
      this.reset();
    }

    /* ---------------- waves ---------------- */

    startWave(n) {
      this.wave = n;
      this.waveClearPending = false;
      this.spawnQueue = [];
      this.spawnTimer = 0.85;
      const isBoss = n % 5 === 0;

      if (isBoss) {
        this.spawnQueue.push({ type: 'boss', delay: 0.3 });
        const adds = 2 + Math.floor(n / 5);
        for (let i = 0; i < adds; i++) {
          this.spawnQueue.push({ type: 'drone', delay: 0.35 + Math.random() * 0.3 });
        }
        if (this.sfx) this.sfx.boss();
      } else {
        const total = Math.min(30, 3 + Math.round(n * 1.7));
        for (let i = 0; i < total; i++) {
          let type = 'drone';
          const r = Math.random();
          if (n >= 2 && r > 0.82) type = 'turret';
          else if (n >= 3 && r > 0.56) type = 'rusher';
          this.spawnQueue.push({
            type,
            delay: i === 0 ? 0.05 : rand(0.22, 0.5),
          });
        }
        if (this.sfx) this.sfx.wave();
      }

      if (this.hooks.wave) this.hooks.wave(n, isBoss);
      this.addText(this.w / 2, this.h * 0.34, 'WAVE ' + n, isBoss ? C.red : C.green, isBoss ? 40 : 30);
    }

    spawnEnemy(type) {
      const w = this.w;
      const h = this.h;
      const scale = 1 + (this.wave - 1) * 0.11;
      let x;
      let y;

      if (type === 'boss') {
        x = w / 2;
        y = -80;
      } else {
        const edge = (Math.random() * 4) | 0;
        if (edge === 0) { x = rand(50, w - 50); y = -34; }
        else if (edge === 1) { x = w + 34; y = rand(60, h - 60); }
        else if (edge === 2) { x = rand(50, w - 50); y = h + 34; }
        else { x = -34; y = rand(60, h - 60); }
      }

      const base = {
        x, y, vx: 0, vy: 0, angle: 0, flash: 0, dead: false, spawnT: 0.45,
        state: 'idle', timer: rand(0.4, 1.2), seed: Math.random() * TAU, type,
      };

      let e;
      if (type === 'drone') {
        e = {
          ...base, r: 15, hp: 34 * scale, speed: clamp(82 + this.wave * 4, 82, 175),
          score: 100, color: C.red, touch: 12,
        };
      } else if (type === 'rusher') {
        e = {
          ...base, r: 13, hp: 26 * scale, speed: 62, dashSpeed: 560 + this.wave * 6,
          score: 150, color: C.orange, touch: 16, aimAngle: 0,
        };
      } else if (type === 'turret') {
        e = {
          ...base, r: 19, hp: 64 * scale, speed: 34, fireCd: rand(0.8, 1.6),
          score: 180, color: C.purple, touch: 14, barrel: 0,
        };
      } else {
        e = {
          ...base, r: 54, hp: 680 + this.wave * 120, speed: 40, score: 2200,
          color: C.red, touch: 30, orbit: rand(0, TAU), fireA: 2.4, fireB: 1.1, adds: 6,
          spawnT: 1.1, maxHp: 680 + this.wave * 120,
        };
        e.maxHp = e.hp;
        this.boss = e;
        this.shake = Math.min(18, this.shake + 10);
      }
      e.maxHp = e.maxHp || e.hp;
      this.enemies.push(e);
    }

    /* ---------------- effects ---------------- */

    burst(x, y, color, count, power, spread = TAU) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * spread - (spread === TAU ? Math.PI : spread / 2);
        const sp = rand(power * 0.25, power);
        this.particles.push({
          x, y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: rand(0.25, 0.8),
          maxLife: 0.8,
          size: rand(1.2, 3.4),
          color,
          drag: rand(1.5, 3.6),
          glow: Math.random() > 0.35,
          shape: Math.random() > 0.82 ? 'square' : 'circle',
        });
      }
    }

    ring(x, y, color, maxR, speed = 420, width = 2) {
      this.rings.push({ x, y, r: 4, maxR, life: 1, speed, color, width });
    }

    addText(x, y, text, color, size = 15) {
      this.texts.push({ x, y, text, color, size, life: 1.1, maxLife: 1.1, vy: -34 });
    }

    /* ---------------- combat ---------------- */

    damageEnemy(e, dmg, hx, hy) {
      if (e.dead) return;
      e.hp -= dmg;
      e.flash = 1;
      if (e.hp <= 0) {
        this.killEnemy(e, hx, hy);
      } else {
        this.burst(hx, hy, e.color, 3, 150, Math.PI);
        if (this.time - this.lastHitSfx > 0.055) {
          this.lastHitSfx = this.time;
          if (this.sfx) this.sfx.hit();
        }
      }
    }

    killEnemy(e, hx, hy) {
      e.dead = true;
      const isBoss = e.type === 'boss';
      this.kills++;
      this.combo++;
      this.comboTimer = 3.2;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      const mult = this.multiplier();
      const gained = Math.round(e.score * mult);
      this.score += gained;

      this.burst(e.x, e.y, e.color, isBoss ? 90 : 16, isBoss ? 620 : 280);
      this.burst(e.x, e.y, C.amber, isBoss ? 40 : 6, isBoss ? 480 : 200);
      this.ring(e.x, e.y, e.color, isBoss ? 300 : 70, isBoss ? 380 : 320, isBoss ? 4 : 2);
      this.shake = Math.min(26, this.shake + (isBoss ? 24 : 4));
      this.flash = Math.min(1, this.flash + (isBoss ? 0.9 : 0.12));
      this.flashColor = e.color;
      this.addText(e.x, e.y - 8, '+' + gained, mult > 1 ? C.greenSoft : '#dfe9dc', isBoss ? 28 : 14);

      if (isBoss) {
        this.boss = null;
        this.slow = 0.55;
        if (this.sfx) this.sfx.explode(true);
        this.dropPickup(e.x - 30, e.y, 'overdrive');
        this.dropPickup(e.x + 30, e.y, 'heal');
        this.dropPickup(e.x, e.y + 24, 'heal');
        this.addText(this.w / 2, this.h * 0.42, 'SENTINEL DESTROYED', C.greenSoft, 26);
        if (this.hooks.toast) this.hooks.toast('SENTINEL DOWN');
      } else {
        if (this.sfx) this.sfx.explode(false);
        if (Math.random() < 0.1) this.dropPickup(e.x, e.y, Math.random() < 0.62 ? 'heal' : 'overdrive');
      }
    }

    dropPickup(x, y, kind) {
      this.pickups.push({
        x, y, vx: rand(-30, 30), vy: rand(-30, 30), kind,
        life: 15, r: 11, ph: Math.random() * TAU,
      });
    }

    multiplier() {
      return clamp(1 + Math.min(this.combo, 20) * 0.1, 1, 3);
    }

    damagePlayer(amount, sx, sy) {
      const p = this.player;
      if (p.invuln > 0 || this.state !== 'playing') return;
      p.hp -= amount;
      p.invuln = 0.75;
      p.hitFlash = 1;
      p.regenDelay = 4.2;
      p.dashT = 0;
      const d = dist(p.x, p.y, sx, sy) || 1;
      p.vx += ((p.x - sx) / d) * 260;
      p.vy += ((p.y - sy) / d) * 260;
      this.shake = Math.min(22, this.shake + 8);
      this.flash = Math.min(1, this.flash + 0.55);
      this.flashColor = C.red;
      this.burst(p.x, p.y, C.red, 12, 260);
      this.ring(p.x, p.y, C.red, 58, 360, 2);
      if (this.sfx) this.sfx.playerHit();
      if (navigator.vibrate && document.body.classList.contains('is-touch')) {
        try { navigator.vibrate(30); } catch (e) { /* noop */ }
      }
      if (p.hp <= 0) this.killPlayer();
      else if (p.hp <= 30 && this.hooks.toast) this.hooks.toast('SHIELDS CRITICAL');
    }

    killPlayer() {
      const p = this.player;
      p.hp = 0;
      this.state = 'dying';
      this.deathTimer = 1.6;
      this.overSent = false;
      this.slow = 1;
      this.shake = 30;
      this.burst(p.x, p.y, C.green, 70, 560);
      this.burst(p.x, p.y, C.white, 24, 380);
      this.ring(p.x, p.y, C.green, 320, 300, 5);
      this.flash = 1;
      this.flashColor = C.green;
      if (this.sfx) {
        this.sfx.explode(true);
        this.sfx.gameOver();
        this.sfx.stopMusic();
      }
      if (this.hooks.death) this.hooks.death();
    }

    shoot() {
      const p = this.player;
      const angle = p.angle;
      const spread = this.overdrive > 0 ? [-0.11, 0, 0.11] : [0];
      for (const off of spread) {
        const a = angle + off + rand(-0.012, 0.012);
        this.bullets.push({
          x: p.x + Math.cos(a) * 20,
          y: p.y + Math.sin(a) * 20,
          px: p.x,
          py: p.y,
          vx: Math.cos(a) * PLAYER.bulletSpeed,
          vy: Math.sin(a) * PLAYER.bulletSpeed,
          life: 0.95,
          r: 3.4,
          dmg: PLAYER.bulletDamage,
          a,
        });
      }
      p.vx -= Math.cos(angle) * 24;
      p.vy -= Math.sin(angle) * 24;
      this.burst(p.x + Math.cos(angle) * 22, p.y + Math.sin(angle) * 22, C.greenSoft, 2, 130, 0.9);
      if (this.sfx) this.sfx.shoot();
    }

    /* ---------------- update ---------------- */

    update(dt, input) {
      if (this.state === 'paused' || this.state === 'idle') return;

      if (this.state === 'dying') {
        const slowDt = dt * (0.35 + 0.65 * (1 - this.slow));
        this.slow = Math.max(0, this.slow - dt * 0.9);
        this.updateParticles(slowDt);
        this.updateRings(slowDt);
        this.updateTexts(slowDt);
        this.updatePickups(slowDt, true);
        this.shake *= Math.pow(0.02, dt);
        this.flash *= Math.pow(0.05, dt);
        this.time += dt;
        this.deathTimer -= dt;
        if (this.deathTimer <= 0 && !this.overSent) {
          this.overSent = true;
          this.state = 'over';
          if (this.hooks.gameover) {
            this.hooks.gameover({
              score: this.score,
              wave: this.wave,
              kills: this.kills,
              time: this.totalTime,
              combo: this.maxCombo,
            });
          }
        }
        this.pushHud();
        return;
      }

      this.time += dt;
      this.totalTime += dt;
      const p = this.player;
      const w = this.w;
      const h = this.h;

      /* --- player --- */
      p.fireCd -= dt;
      p.invuln = Math.max(0, p.invuln - dt);
      p.hitFlash = Math.max(0, p.hitFlash - dt * 4);
      p.dashCd = Math.max(0, p.dashCd - dt);
      this.overdrive = Math.max(0, this.overdrive - dt);

      if (p.regenDelay > 0) {
        p.regenDelay -= dt;
      } else if (p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + 16 * dt);
      }

      if (input.dash && p.dashCd <= 0 && p.dashT <= 0) {
        let dx = input.moveX;
        let dy = input.moveY;
        if (Math.hypot(dx, dy) < 0.1) {
          dx = Math.cos(p.angle);
          dy = Math.sin(p.angle);
        }
        const m = Math.hypot(dx, dy) || 1;
        p.dashX = dx / m;
        p.dashY = dy / m;
        p.dashT = PLAYER.dashTime;
        p.dashCd = PLAYER.dashCd;
        p.invuln = Math.max(p.invuln, 0.32);
        this.shake = Math.min(12, this.shake + 3);
        this.ring(p.x, p.y, C.green, 46, 520, 2);
        this.burst(p.x, p.y, C.green, 10, 240);
        if (this.sfx) this.sfx.dash();
      }

      if (p.dashT > 0) {
        p.dashT -= dt;
        p.x += p.dashX * PLAYER.dashSpeed * dt;
        p.y += p.dashY * PLAYER.dashSpeed * dt;
        p.vx = p.dashX * PLAYER.speed;
        p.vy = p.dashY * PLAYER.speed;
        p.trailT -= dt;
        if (p.trailT <= 0) {
          p.trailT = 0.02;
          this.particles.push({
            x: p.x, y: p.y, vx: rand(-20, 20), vy: rand(-20, 20),
            life: 0.3, maxLife: 0.3, size: 7, color: C.green,
            drag: 2, glow: true, shape: 'circle',
          });
        }
      } else {
        const tx = input.moveX * PLAYER.speed;
        const ty = input.moveY * PLAYER.speed;
        const k = Math.min(1, dt * 12);
        p.vx += (tx - p.vx) * k;
        p.vy += (ty - p.vy) * k;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const speed = Math.hypot(p.vx, p.vy);
        if (speed > 120 && Math.random() < 0.3) {
          this.particles.push({
            x: p.x - (p.vx / speed) * 14, y: p.y - (p.vy / speed) * 14,
            vx: -p.vx * 0.12 + rand(-14, 14), vy: -p.vy * 0.12 + rand(-14, 14),
            life: 0.3, maxLife: 0.3, size: rand(1.5, 3), color: C.green,
            drag: 3, glow: true, shape: 'circle',
          });
        }
      }

      const margin = 28;
      p.x = clamp(p.x, margin, w - margin);
      p.y = clamp(p.y, margin, h - margin);
      if (p.dashT <= 0 && p.dashCd > 0) {
        p.vx *= Math.pow(0.001, dt);
        p.vy *= Math.pow(0.001, dt);
      }

      /* aim resolution: explicit stick > mouse > nearest enemy > travel dir */
      let aimAngle = p.angle;
      if (input.aimActive) {
        aimAngle = Math.atan2(input.aimY, input.aimX);
      } else if (input.pointer && input.pointer.active) {
        const dx = input.pointer.x - p.x;
        const dy = input.pointer.y - p.y;
        if (Math.hypot(dx, dy) > 8) aimAngle = Math.atan2(dy, dx);
      } else {
        const target = this.nearestEnemy(p.x, p.y, 900);
        if (target) aimAngle = Math.atan2(target.y - p.y, target.x - p.x);
        else if (Math.hypot(input.moveX, input.moveY) > 0.1) {
          aimAngle = Math.atan2(input.moveY, input.moveX);
        }
      }
      p.angle = aimAngle;

      if (p.fireCd <= 0 && this.enemies.length && this.state === 'playing') {
        this.shoot();
        p.fireCd = this.overdrive > 0 ? 0.085 : PLAYER.fireRate;
      }

      /* --- bullets --- */
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        b.px = b.x;
        b.py = b.y;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        let hit = false;
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (segCircle(b.px, b.py, b.x, b.y, e.x, e.y, e.r + b.r)) {
            this.damageEnemy(e, b.dmg, b.x, b.y);
            hit = true;
            break;
          }
        }
        if (hit || b.life <= 0 || b.x < -30 || b.x > w + 30 || b.y < -30 || b.y > h + 30) {
          this.bullets.splice(i, 1);
        }
      }

      this.updateEnemies(dt);
      this.updateEnemyBullets(dt);
      this.updatePickups(dt, false);
      this.updateParticles(dt);
      this.updateRings(dt);
      this.updateTexts(dt);

      /* --- score rhythm --- */
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.combo = 0;
      }

      /* --- waves --- */
      if (this.spawnQueue.length) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          const item = this.spawnQueue.shift();
          this.spawnEnemy(item.type);
          this.spawnTimer = item.delay;
        }
      } else if (!this.waveClearPending && this.enemies.length === 0) {
        this.waveClearPending = true;
        this.waveClearTimer = 1.5;
        const bonus = 200 + this.wave * 60;
        this.score += bonus;
        this.addText(w / 2, h * 0.46, 'WAVE CLEAR +' + bonus, C.green, 20);
        if (this.hooks.toast) this.hooks.toast('WAVE ' + this.wave + ' CLEARED');
      }
      if (this.waveClearPending) {
        this.waveClearTimer -= dt;
        if (this.waveClearTimer <= 0) this.startWave(this.wave + 1);
      }

      this.shake *= Math.pow(0.015, dt);
      if (this.shake < 0.15) this.shake = 0;
      this.flash *= Math.pow(0.005, dt);

      this.pushHud();
    }

    nearestEnemy(x, y, maxD) {
      let best = null;
      let bestD = maxD * maxD;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = (e.x - x) ** 2 + (e.y - y) ** 2;
        if (d < bestD) { bestD = d; best = e; }
      }
      return best;
    }

    updateEnemies(dt) {
      const p = this.player;
      const w = this.w;
      const h = this.h;
      const alive = [];

      for (const e of this.enemies) {
        if (e.dead) continue;
        e.flash = Math.max(0, e.flash - dt * 5);
        e.spawnT = Math.max(0, e.spawnT - dt);
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        const nx = dx / d;
        const ny = dy / d;

        if (e.type === 'drone') {
          const speed = e.speed * (e.spawnT > 0 ? 0.45 : 1);
          e.vx += (nx * speed - e.vx) * Math.min(1, dt * 1.9);
          e.vy += (ny * speed - e.vy) * Math.min(1, dt * 1.9);
          e.angle += dt * 1.4;
        } else if (e.type === 'rusher') {
          e.timer -= dt;
          if (e.state === 'idle') {
            e.vx += (nx * e.speed - e.vx) * Math.min(1, dt * 2);
            e.vy += (ny * e.speed - e.vy) * Math.min(1, dt * 2);
            e.aimAngle = Math.atan2(dy, dx);
            if (e.timer <= 0 && e.spawnT <= 0) {
              e.state = 'charge';
              e.timer = 0.5;
              this.ring(e.x, e.y, C.orange, 34, 240, 1.5);
            }
          } else if (e.state === 'charge') {
            e.vx *= Math.pow(0.01, dt);
            e.vy *= Math.pow(0.01, dt);
            e.aimAngle = Math.atan2(dy, dx);
            if (e.timer <= 0) {
              e.state = 'dash';
              e.timer = 0.34;
              e.vx = Math.cos(e.aimAngle) * e.dashSpeed;
              e.vy = Math.sin(e.aimAngle) * e.dashSpeed;
              this.burst(e.x, e.y, C.orange, 6, 160);
            }
          } else if (e.state === 'dash') {
            e.angle = Math.atan2(e.vy, e.vx);
            if (Math.random() < 0.5) {
              this.particles.push({
                x: e.x, y: e.y, vx: rand(-20, 20), vy: rand(-20, 20),
                life: 0.25, maxLife: 0.25, size: 4, color: C.orange,
                drag: 2, glow: true, shape: 'circle',
              });
            }
            if (e.timer <= 0) {
              e.state = 'idle';
              e.timer = rand(1.1, 1.8);
            }
          }
          if (e.state !== 'dash') e.angle = e.aimAngle || e.angle;
        } else if (e.type === 'turret') {
          const want = d < 230 ? -1 : d > 340 ? 1 : 0;
          const strafe = d > 230 && d < 340 ? 1 : 0;
          const tx = want * nx * e.speed + -ny * e.speed * strafe * 0.8;
          const ty = want * ny * e.speed + nx * e.speed * strafe * 0.8;
          e.vx += (tx - e.vx) * Math.min(1, dt * 1.4);
          e.vy += (ty - e.vy) * Math.min(1, dt * 1.4);
          e.barrel = Math.atan2(dy, dx);
          e.angle += dt * 0.5;
          e.fireCd -= dt;
          if (e.fireCd <= 0 && d < 760 && e.spawnT <= 0) {
            e.fireCd = rand(1.35, 1.95);
            const a = e.barrel + rand(-0.05, 0.05);
            this.ebullets.push({
              x: e.x + Math.cos(a) * 22, y: e.y + Math.sin(a) * 22,
              vx: Math.cos(a) * 265, vy: Math.sin(a) * 265,
              life: 3.4, r: 5.5, dmg: 10, color: C.purple,
            });
            this.ring(e.x, e.y, C.purple, 26, 180, 1);
          }
        } else if (e.type === 'boss') {
          e.angle += dt * 0.55;
          if (e.y < 148) {
            e.y += 82 * dt;
          } else {
            const cx = w / 2;
            const cy = clamp(h * 0.33, 120, h * 0.5);
            const R = Math.min(w, h) * 0.24;
            e.orbit += dt * 0.32;
            const tx = cx + Math.cos(e.orbit) * R;
            const ty = cy + Math.sin(e.orbit) * R * 0.6;
            e.x += (tx - e.x) * Math.min(1, dt * 0.9);
            e.y += (ty - e.y) * Math.min(1, dt * 0.9);
          }
          e.fireA -= dt;
          e.fireB -= dt;
          e.adds -= dt;
          if (e.fireA <= 0) {
            e.fireA = 2.7;
            const n = 16 + Math.min(10, Math.floor(this.wave / 5) * 2);
            for (let i = 0; i < n; i++) {
              const a = (i / n) * TAU + e.angle;
              this.ebullets.push({
                x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r,
                vx: Math.cos(a) * 168, vy: Math.sin(a) * 168,
                life: 5, r: 6, dmg: 12, color: C.red,
              });
            }
            this.ring(e.x, e.y, C.red, 120, 300, 2);
            this.shake = Math.min(14, this.shake + 4);
          }
          if (e.fireB <= 0) {
            e.fireB = 1.25;
            const base = Math.atan2(dy, dx);
            for (const off of [-0.2, 0, 0.2]) {
              this.ebullets.push({
                x: e.x + Math.cos(base + off) * 40, y: e.y + Math.sin(base + off) * 40,
                vx: Math.cos(base + off) * 320, vy: Math.sin(base + off) * 320,
                life: 4, r: 5, dmg: 10, color: C.amber,
              });
            }
          }
          if (e.adds <= 0) {
            e.adds = 6.5;
            for (let i = 0; i < 2; i++) {
              if (this.enemies.length < 42) {
                const a = rand(0, TAU);
                const x = e.x + Math.cos(a) * 60;
                const y = e.y + Math.sin(a) * 60;
                const scale = 1 + (this.wave - 1) * 0.11;
                this.enemies.push({
                  x, y, vx: 0, vy: 0, angle: rand(0, TAU), flash: 0, dead: false,
                  spawnT: 0.4, state: 'idle', timer: 1, seed: rand(0, TAU), type: 'drone',
                  r: 15, hp: 34 * scale, maxHp: 34 * scale, speed: clamp(82 + this.wave * 4, 82, 175),
                  score: 100, color: C.red, touch: 12,
                });
              }
            }
          }
        }

        e.x += e.vx * dt;
        e.y += e.vy * dt;

        if (e.type !== 'boss' || e.spawnT <= 0) {
          e.x = clamp(e.x, e.r + 6, w - e.r - 6);
          e.y = clamp(e.y, e.r + 6, h - e.r - 6);
        }

        if (e.spawnT <= 0 && dist(e.x, e.y, p.x, p.y) < e.r + PLAYER.r) {
          this.damagePlayer(e.type === 'boss' ? 28 : e.touch, e.x, e.y);
          if (e.type !== 'boss') {
            const push = 180 / (d || 1);
            e.vx -= nx * push;
            e.vy -= ny * push;
          }
        }

        alive.push(e);
      }

      /* gentle separation so crowds read clearly */
      for (let i = 0; i < alive.length; i++) {
        const a = alive[i];
        if (a.type === 'boss') continue;
        for (let j = i + 1; j < alive.length; j++) {
          const b = alive[j];
          if (b.type === 'boss') continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const min = (a.r + b.r) * 1.4;
          const d2 = dx * dx + dy * dy;
          if (d2 < min * min && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const force = (min - d) * 2.4;
            const fx = (dx / d) * force;
            const fy = (dy / d) * force;
            a.vx -= fx * dt * 8;
            a.vy -= fy * dt * 8;
            b.vx += fx * dt * 8;
            b.vy += fy * dt * 8;
          }
        }
      }

      this.enemies = alive;
    }

    updateEnemyBullets(dt) {
      const p = this.player;
      for (let i = this.ebullets.length - 1; i >= 0; i--) {
        const b = this.ebullets[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        if (dist(b.x, b.y, p.x, p.y) < b.r + PLAYER.r * 0.85) {
          this.damagePlayer(b.dmg, b.x, b.y);
          this.ebullets.splice(i, 1);
          continue;
        }
        if (b.life <= 0 || b.x < -40 || b.x > this.w + 40 || b.y < -40 || b.y > this.h + 40) {
          this.ebullets.splice(i, 1);
        }
      }
    }

    updatePickups(dt, onlyAnimate) {
      const p = this.player;
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const it = this.pickups[i];
        it.life -= dt;
        it.ph += dt * 3;
        if (!onlyAnimate) {
          const dx = p.x - it.x;
          const dy = p.y - it.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < 170) {
            it.vx += (dx / d) * 620 * dt;
            it.vy += (dy / d) * 620 * dt;
          }
          it.vx *= Math.pow(0.4, dt);
          it.vy *= Math.pow(0.4, dt);
          it.x += it.vx * dt;
          it.y += it.vy * dt;
          if (d < PLAYER.r + it.r + 4) {
            this.collect(it);
            this.pickups.splice(i, 1);
            continue;
          }
        }
        if (it.life <= 0) this.pickups.splice(i, 1);
      }
    }

    collect(it) {
      const p = this.player;
      if (it.kind === 'heal') {
        p.hp = Math.min(p.maxHp, p.hp + 26);
        this.addText(p.x, p.y - 26, '+SHIELDS', C.green);
        this.burst(p.x, p.y, C.green, 14, 190);
      } else {
        this.overdrive = OVERDRIVE_TIME;
        this.addText(p.x, p.y - 26, 'OVERDRIVE', C.amber, 18);
        this.burst(p.x, p.y, C.amber, 20, 240);
        this.ring(p.x, p.y, C.amber, 90, 420, 2);
      }
      if (this.sfx) this.sfx.pickup();
      if (this.hooks.pickup) this.hooks.pickup(it.kind);
    }

    updateParticles(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const q = this.particles[i];
        q.life -= dt;
        if (q.life <= 0) { this.particles.splice(i, 1); continue; }
        const drag = Math.pow(0.5, q.drag * dt);
        q.vx *= drag;
        q.vy *= drag;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
      }
    }

    updateRings(dt) {
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.r += r.speed * dt;
        r.life -= dt;
        if (r.life <= 0 || r.r > r.maxR) this.rings.splice(i, 1);
      }
    }

    updateTexts(dt) {
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i];
        t.life -= dt;
        t.y += t.vy * dt;
        t.vy *= Math.pow(0.35, dt);
        if (t.life <= 0) this.texts.splice(i, 1);
      }
    }

    pushHud() {
      if (!this.hooks.hud) return;
      const p = this.player;
      this.hooks.hud({
        hp: p.hp,
        maxHp: p.maxHp,
        score: this.score,
        wave: Math.max(1, this.wave),
        combo: this.combo,
        mult: this.multiplier(),
        dash: 1 - p.dashCd / PLAYER.dashCd,
        dashReady: p.dashCd <= 0,
        overdrive: this.overdrive / OVERDRIVE_TIME,
        low: p.hp <= 30 && this.state === 'playing',
        regen: p.regenDelay <= 0 && p.hp < p.maxHp,
        boss: this.boss ? { hp: Math.max(0, this.boss.hp), maxHp: this.boss.maxHp } : null,
      });
    }

    /* ---------------- render ---------------- */

    glow(x, y, r, color, alpha) {
      const ctx = this.ctx;
      let sprite = this.sprites[color];
      if (!sprite) {
        sprite = document.createElement('canvas');
        sprite.width = sprite.height = 128;
        const g = sprite.getContext('2d');
        const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grd.addColorStop(0, hexA(color, 0.9));
        grd.addColorStop(0.22, hexA(color, 0.5));
        grd.addColorStop(0.55, hexA(color, 0.14));
        grd.addColorStop(1, hexA(color, 0));
        g.fillStyle = grd;
        g.fillRect(0, 0, 128, 128);
        this.sprites[color] = sprite;
      }
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
    }

    drawBackground(now, dt) {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;

      if (this.bgLayer) ctx.drawImage(this.bgLayer, 0, 0, w, h);

      /* stars */
      for (const s of this.stars) {
        s.y += s.speed * dt;
        if (s.y > h + 4) { s.y = -4; s.x = Math.random() * w; }
        const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now * 0.0012 * s.tw + s.ph));
        ctx.globalAlpha = 0.12 + s.z * 0.16 * tw;
        ctx.fillStyle = s.z === 2 ? '#d9ffc0' : '#9bf00b';
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }
      ctx.globalAlpha = 1;

      /* motes: menu atmosphere only, so they never read as pickups */
      if (this.state === 'idle') {
        ctx.globalCompositeOperation = 'lighter';
        for (const m of this.motes) {
          m.x += m.vx * dt;
          m.y += m.vy * dt;
          if (m.y < -20) { m.y = h + 20; m.x = Math.random() * w; }
          if (m.x < -20) m.x = w + 20;
          if (m.x > w + 20) m.x = -20;
          ctx.globalAlpha = m.a * (0.55 + 0.45 * Math.sin(now * 0.001 + m.ph));
          this.glow(m.x, m.y, m.r * 9, C.green, 1);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    drawIdle(now) {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(w * 0.5, h * 0.5);
      ctx.rotate(now * 0.00006);
      ctx.strokeStyle = 'rgba(155, 240, 11, 0.055)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, Math.min(w, h) * (0.3 + i * 0.14), Math.min(w, h) * (0.18 + i * 0.1), i * 0.6, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
    }

    render(now, dt) {
      const ctx = this.ctx;
      this.drawBackground(now, dt);

      if (this.state === 'idle') {
        this.drawIdle(now);
        return;
      }

      const shake = this.shake;
      ctx.save();
      if (shake > 0.2) ctx.translate(rand(-shake, shake), rand(-shake, shake));

      this.drawPickups(now);
      this.drawRings();
      this.drawEnemyBullets();
      this.drawEnemies(now);
      this.drawBullets();
      this.drawPlayer(now);
      this.drawParticles();
      this.drawTexts();

      ctx.restore();

      if (this.boss && !this.boss.dead) this.drawBossBar();

      if (this.flash > 0.01) {
        ctx.globalAlpha = Math.min(0.32, this.flash * 0.26);
        ctx.fillStyle = this.flashColor;
        ctx.fillRect(0, 0, this.w, this.h);
        ctx.globalAlpha = 1;
      }

      const p = this.player;
      if (p && p.hp < 38 && this.state !== 'dying') {
        const lowA = (1 - p.hp / 38) * 0.4;
        const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.3, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.7);
        g.addColorStop(0, 'rgba(255,30,60,0)');
        g.addColorStop(1, `rgba(255,30,60,${lowA})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, this.w, this.h);
      }
    }

    drawPlayer(now) {
      const ctx = this.ctx;
      const p = this.player;
      if (!p || this.state === 'dying' || this.state === 'over') return;

      if (p.dashCd > 0) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(155, 240, 11, 0.22)';
        ctx.lineWidth = 2;
        ctx.arc(p.x, p.y, 22, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.dashCd / PLAYER.dashCd));
        ctx.stroke();
      }

      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.004);
      this.glow(p.x, p.y, 46, C.green, 0.32 + pulse * 0.1);
      if (this.overdrive > 0) this.glow(p.x, p.y, 62, C.amber, 0.22 + pulse * 0.08);
      ctx.globalCompositeOperation = 'source-over';

      const blink = p.invuln > 0 && Math.floor(now / 70) % 2 === 0;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);

      /* thruster */
      const sp = Math.hypot(p.vx, p.vy);
      const flame = 6 + Math.min(16, sp * 0.035) + Math.sin(now * 0.03) * 2;
      ctx.globalCompositeOperation = 'lighter';
      const fg = ctx.createLinearGradient(-6, 0, -20 - flame, 0);
      fg.addColorStop(0, 'rgba(214,255,138,0.9)');
      fg.addColorStop(0.4, 'rgba(155,240,11,0.5)');
      fg.addColorStop(1, 'rgba(155,240,11,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(-7, -5);
      ctx.lineTo(-19 - flame, 0);
      ctx.lineTo(-7, 5);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      /* hull */
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(3, -11);
      ctx.lineTo(-11, -8);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-11, 8);
      ctx.lineTo(3, 11);
      ctx.closePath();
      const hg = ctx.createLinearGradient(-12, 0, 20, 0);
      hg.addColorStop(0, '#20300f');
      hg.addColorStop(0.55, '#5fa30b');
      hg.addColorStop(1, '#c9ff62');
      ctx.fillStyle = hg;
      ctx.fill();
      ctx.strokeStyle = blink ? '#ffffff' : C.greenSoft;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = blink ? '#ffffff' : '#0b1607';
      ctx.arc(4, 0, 3.4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = C.greenSoft;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();

      if (p.invuln > 0) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(196,255,120,${0.12 + 0.18 * pulse})`;
        ctx.lineWidth = 1.5;
        ctx.arc(p.x, p.y, 26, now * 0.004, now * 0.004 + TAU * 0.75);
        ctx.stroke();
      }
    }

    drawEnemies(now) {
      const ctx = this.ctx;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const spawnScale = e.spawnT > 0 ? clamp(1 - e.spawnT / 0.6, 0.3, 1) : 1;
        const r = e.r * spawnScale;

        ctx.globalCompositeOperation = 'lighter';
        this.glow(e.x, e.y, r * 2.4, e.type === 'turret' ? C.purple : e.type === 'rusher' ? C.orange : e.color, 0.32);
        ctx.globalCompositeOperation = 'source-over';

        ctx.save();
        ctx.translate(e.x, e.y);

        if (e.type === 'drone') {
          ctx.rotate(e.angle);
          ctx.beginPath();
          ctx.moveTo(r, 0);
          ctx.lineTo(0, r * 0.78);
          ctx.lineTo(-r, 0);
          ctx.lineTo(0, -r * 0.78);
          ctx.closePath();
          ctx.fillStyle = 'rgba(255, 59, 92, 0.16)';
          ctx.fill();
          ctx.strokeStyle = C.red;
          ctx.lineWidth = 1.8;
          ctx.stroke();
          ctx.beginPath();
          ctx.fillStyle = C.redSoft;
          ctx.arc(0, 0, r * 0.22, 0, TAU);
          ctx.fill();
        } else if (e.type === 'rusher') {
          const charging = e.state === 'charge';
          if (charging) {
            const jitter = Math.sin(now * 0.06) * 2;
            ctx.translate(jitter, jitter);
          }
          ctx.rotate(e.angle);
          ctx.beginPath();
          ctx.moveTo(r * 1.15, 0);
          ctx.lineTo(-r * 0.85, r * 0.8);
          ctx.lineTo(-r * 0.5, 0);
          ctx.lineTo(-r * 0.85, -r * 0.8);
          ctx.closePath();
          ctx.fillStyle = charging ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 138, 0, 0.18)';
          ctx.fill();
          ctx.strokeStyle = charging ? '#ffffff' : C.orange;
          ctx.lineWidth = 1.7;
          ctx.stroke();
        } else if (e.type === 'turret') {
          ctx.rotate(e.angle);
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU;
            const px = Math.cos(a) * r;
            const py = Math.sin(a) * r;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fillStyle = 'rgba(176, 107, 255, 0.15)';
          ctx.fill();
          ctx.strokeStyle = C.purple;
          ctx.lineWidth = 1.8;
          ctx.stroke();
          ctx.rotate(-e.angle);
          ctx.rotate(e.barrel || 0);
          ctx.fillStyle = C.purple;
          ctx.fillRect(r * 0.3, -2.5, r * 0.95, 5);
          ctx.beginPath();
          ctx.fillStyle = '#e6d2ff';
          ctx.arc(0, 0, 3.4, 0, TAU);
          ctx.fill();
        } else if (e.type === 'boss') {
          ctx.rotate(e.angle);
          const sides = 8;
          for (let ring = 0; ring < 2; ring++) {
            const rr = r * (1 - ring * 0.26);
            ctx.beginPath();
            for (let i = 0; i < sides; i++) {
              const a = (i / sides) * TAU + ring * 0.4;
              const px = Math.cos(a) * rr;
              const py = Math.sin(a) * rr;
              if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fillStyle = ring === 0 ? 'rgba(255, 59, 92, 0.08)' : 'rgba(255, 59, 92, 0.12)';
            ctx.fill();
            ctx.strokeStyle = ring === 0 ? C.red : 'rgba(255,154,174,0.8)';
            ctx.lineWidth = ring === 0 ? 2.4 : 1.4;
            ctx.stroke();
          }
          ctx.rotate(-e.angle * 2.4);
          ctx.strokeStyle = 'rgba(255, 194, 71, 0.5)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.62, 0, TAU * 0.7);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.58, Math.PI, Math.PI + TAU * 0.62);
          ctx.stroke();
          const core = 0.5 + 0.5 * Math.sin(now * 0.006);
          ctx.beginPath();
          ctx.fillStyle = `rgba(255, 194, 71, ${0.55 + core * 0.45})`;
          ctx.arc(0, 0, r * 0.2 + core * 2, 0, TAU);
          ctx.fill();
        }

        if (e.flash > 0) {
          const boss = e.type === 'boss';
          ctx.globalAlpha = e.flash * (boss ? 0.22 : 0.6);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, r * (boss ? 0.3 : 0.9), 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.restore();

        /* rusher telegraph line */
        if (e.type === 'rusher' && e.state === 'charge') {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(255, 138, 0, ${0.1 + 0.18 * Math.sin(now * 0.04)})`;
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 7]);
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(e.x + Math.cos(e.aimAngle) * 300, e.y + Math.sin(e.aimAngle) * 300);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    drawBullets() {
      const ctx = this.ctx;
      if (!this.bullets.length) return;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const b of this.bullets) {
        ctx.moveTo(b.x - Math.cos(b.a) * 14, b.y - Math.sin(b.a) * 14);
        ctx.lineTo(b.x, b.y);
      }
      ctx.strokeStyle = 'rgba(155, 240, 11, 0.22)';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = '#eaffc0';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.globalCompositeOperation = 'source-over';
    }

    drawEnemyBullets() {
      const ctx = this.ctx;
      if (!this.ebullets.length) return;
      const groups = {};
      for (const b of this.ebullets) {
        (groups[b.color] || (groups[b.color] = [])).push(b);
      }
      ctx.globalCompositeOperation = 'lighter';
      for (const color in groups) {
        const arr = groups[color];
        ctx.beginPath();
        for (const b of arr) {
          ctx.moveTo(b.x + b.r * 2.1, b.y);
          ctx.arc(b.x, b.y, b.r * 2.1, 0, TAU);
        }
        ctx.fillStyle = hexA(color, 0.13);
        ctx.fill();
        ctx.beginPath();
        for (const b of arr) {
          ctx.moveTo(b.x + b.r, b.y);
          ctx.arc(b.x, b.y, b.r, 0, TAU);
        }
        ctx.fillStyle = hexA(color, 0.85);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      for (const b of this.ebullets) {
        ctx.moveTo(b.x + 2, b.y);
        ctx.arc(b.x, b.y, 2, 0, TAU);
      }
      ctx.fillStyle = '#fff4f6';
      ctx.fill();
    }

    drawPickups(now) {
      const ctx = this.ctx;
      for (const it of this.pickups) {
        const blink = it.life < 3 && Math.floor(now / 120) % 2 === 0;
        if (blink) continue;
        const color = it.kind === 'heal' ? C.green : C.amber;
        const bob = Math.sin(it.ph) * 3;
        ctx.globalCompositeOperation = 'lighter';
        this.glow(it.x, it.y + bob, 34, color, 0.45);
        ctx.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.translate(it.x, it.y + bob);
        ctx.rotate(it.ph * 0.35);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU + Math.PI / 4;
          const px = Math.cos(a) * it.r;
          const py = Math.sin(a) * it.r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = hexA(color, 0.18);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.rotate(-it.ph * 0.35);
        if (it.kind === 'heal') {
          ctx.fillStyle = color;
          ctx.fillRect(-1.5, -5, 3, 10);
          ctx.fillRect(-5, -1.5, 10, 3);
        } else {
          ctx.beginPath();
          ctx.moveTo(-1.5, -5.5);
          ctx.lineTo(4, -0.5);
          ctx.lineTo(0.5, 0);
          ctx.lineTo(3, 5.5);
          ctx.lineTo(-4, -0.5);
          ctx.lineTo(-0.5, 0);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
        }
        ctx.restore();
      }
    }

    drawParticles() {
      const ctx = this.ctx;
      ctx.globalCompositeOperation = 'lighter';
      for (const q of this.particles) {
        const a = clamp(q.life / q.maxLife, 0, 1);
        if (q.glow) {
          ctx.globalAlpha = a * 0.2;
          ctx.fillStyle = q.color;
          ctx.beginPath();
          ctx.arc(q.x, q.y, q.size * 2.7, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = a;
        ctx.fillStyle = q.color;
        if (q.shape === 'square') {
          ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
        } else {
          ctx.beginPath();
          ctx.arc(q.x, q.y, q.size, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    drawRings() {
      const ctx = this.ctx;
      ctx.globalCompositeOperation = 'lighter';
      for (const r of this.rings) {
        const a = clamp(r.life, 0, 1);
        ctx.globalAlpha = a * 0.6;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = r.width;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    drawTexts() {
      const ctx = this.ctx;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const t of this.texts) {
        const a = clamp(t.life / t.maxLife, 0, 1);
        const scale = 1 + (1 - a) * 0.25;
        ctx.globalAlpha = a;
        ctx.font = `800 ${Math.round(t.size * scale)}px "Segoe UI", system-ui, sans-serif`;
        ctx.fillStyle = t.color;
        ctx.shadowColor = 'rgba(0,0,0,0.65)';
        ctx.shadowBlur = 8;
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }

    drawBossBar() {
      const ctx = this.ctx;
      const boss = this.boss;
      const w = Math.min(400, this.w * 0.7);
      const x = this.w / 2 - w / 2;
      const y = 80;
      ctx.save();
      ctx.fillStyle = 'rgba(4, 9, 6, 0.62)';
      ctx.fillRect(x - 14, y - 26, w + 28, 38);
      ctx.textAlign = 'center';
      ctx.font = '700 9px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,154,174,0.9)';
      ctx.fillText('SENTINEL CORE', this.w / 2, y - 8);
      ctx.fillStyle = 'rgba(255, 59, 92, 0.18)';
      ctx.fillRect(x, y, w, 6);
      const hp = clamp(boss.hp / boss.maxHp, 0, 1);
      ctx.fillStyle = C.red;
      ctx.fillRect(x, y, w * hp, 6);
      ctx.fillStyle = 'rgba(255, 59, 92, 0.95)';
      ctx.fillRect(x + Math.max(0, w * hp - 2), y - 2, 2, 10);
      ctx.restore();
    }
  }

  window.GreenZone = GreenZone;
})();
