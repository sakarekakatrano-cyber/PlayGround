/* ============================================================
   GREEN ZONE — tiny WebAudio synth
   No assets, no dependencies. All sounds are generated.
   ============================================================ */
(function () {
  'use strict';

  class Sfx {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.musicNodes = null;
      this.noise = null;
      this.muted = localStorage.getItem('gz.muted') === '1';
      this.lastShot = 0;
    }

    get supported() {
      return !!(window.AudioContext || window.webkitAudioContext);
    }

    init() {
      if (!this.supported) return false;
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.7;
        this.master.connect(this.ctx.destination);
        this.noise = this.makeNoise();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }

    makeNoise() {
      const ctx = this.ctx;
      const buf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      return buf;
    }

    setMuted(muted) {
      this.muted = muted;
      localStorage.setItem('gz.muted', muted ? '1' : '0');
      if (this.master && this.ctx) {
        this.master.gain.cancelScheduledValues(this.ctx.currentTime);
        this.master.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx.currentTime, 0.03);
      }
      if (muted) this.stopMusic();
    }

    now() { return this.ctx ? this.ctx.currentTime : 0; }

    tone({ type = 'sine', f0 = 440, f1 = f0, dur = 0.15, vol = 0.2, delay = 0, attack = 0.005, curve = 'exp' }) {
      if (!this.ctx || this.muted) return;
      const t = this.now() + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, f0), t);
      if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      else osc.frequency.linearRampToValueAtTime(Math.max(20, f1), t + dur);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }

    burst({ dur = 0.25, vol = 0.25, f0 = 1600, f1 = 120, q = 1.1, delay = 0, type = 'lowpass' }) {
      if (!this.ctx || this.muted) return;
      const t = this.now() + delay;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      const filter = this.ctx.createBiquadFilter();
      filter.type = type;
      filter.Q.value = q;
      filter.frequency.setValueAtTime(f0, t);
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter).connect(gain).connect(this.master);
      src.start(t, Math.random() * 0.2, dur + 0.05);
    }

    shoot() {
      if (!this.ctx || this.muted) return;
      const t = this.now();
      if (t - this.lastShot < 0.045) return;
      this.lastShot = t;
      this.tone({ type: 'square', f0: 880, f1: 420, dur: 0.06, vol: 0.035 });
      this.tone({ type: 'sine', f0: 1400, f1: 700, dur: 0.04, vol: 0.02 });
    }

    hit() {
      this.tone({ type: 'triangle', f0: 320, f1: 170, dur: 0.08, vol: 0.09 });
      this.burst({ dur: 0.08, vol: 0.1, f0: 2600, f1: 700 });
    }

    explode(big) {
      this.burst({ dur: big ? 0.55 : 0.26, vol: big ? 0.4 : 0.22, f0: big ? 1200 : 1900, f1: big ? 45 : 110 });
      this.tone({ type: 'sawtooth', f0: big ? 120 : 220, f1: 40, dur: big ? 0.5 : 0.22, vol: big ? 0.18 : 0.08 });
    }

    playerHit() {
      this.tone({ type: 'sawtooth', f0: 190, f1: 70, dur: 0.22, vol: 0.22 });
      this.burst({ dur: 0.2, vol: 0.2, f0: 900, f1: 180 });
    }

    pickup() {
      this.tone({ type: 'sine', f0: 660, f1: 660, dur: 0.09, vol: 0.13 });
      this.tone({ type: 'sine', f0: 990, f1: 990, dur: 0.14, vol: 0.12, delay: 0.07 });
      this.tone({ type: 'sine', f0: 1320, f1: 1320, dur: 0.16, vol: 0.09, delay: 0.14 });
    }

    dash() {
      this.burst({ dur: 0.24, vol: 0.18, f0: 500, f1: 3200, q: 2.2, type: 'bandpass' });
      this.tone({ type: 'sine', f0: 240, f1: 880, dur: 0.18, vol: 0.05 });
    }

    wave() {
      this.tone({ type: 'sine', f0: 330, f1: 330, dur: 0.5, vol: 0.09, attack: 0.05 });
      this.tone({ type: 'sine', f0: 494, f1: 494, dur: 0.5, vol: 0.07, delay: 0.08, attack: 0.05 });
      this.tone({ type: 'sine', f0: 660, f1: 660, dur: 0.55, vol: 0.06, delay: 0.16, attack: 0.05 });
    }

    boss() {
      this.tone({ type: 'sawtooth', f0: 70, f1: 55, dur: 1.1, vol: 0.18, attack: 0.2 });
      this.tone({ type: 'sawtooth', f0: 105, f1: 82, dur: 1.1, vol: 0.1, attack: 0.2 });
      this.burst({ dur: 0.8, vol: 0.18, f0: 300, f1: 60 });
    }

    gameOver() {
      this.tone({ type: 'sawtooth', f0: 220, f1: 55, dur: 1.2, vol: 0.16, attack: 0.02 });
      this.tone({ type: 'sine', f0: 110, f1: 40, dur: 1.4, vol: 0.12, delay: 0.1 });
      this.burst({ dur: 1.1, vol: 0.22, f0: 1400, f1: 50 });
    }

    ui() {
      this.tone({ type: 'sine', f0: 620, f1: 780, dur: 0.07, vol: 0.07 });
    }

    /* low ambient pad — starts with gameplay */
    startMusic() {
      if (!this.ctx || this.muted || this.musicNodes) return;
      const ctx = this.ctx;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.master);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 340;
      filter.Q.value = 3;
      filter.connect(gain);

      const oscs = [];
      [55, 82.5, 110, 164.8].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = i === 0 ? 'sine' : 'sawtooth';
        osc.frequency.value = freq;
        osc.detune.value = (i - 1.5) * 7;
        const g = ctx.createGain();
        g.gain.value = i === 0 ? 0.5 : 0.13;
        osc.connect(g).connect(filter);
        osc.start();
        oscs.push(osc);
      });

      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.08;
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain).connect(filter.frequency);
      lfo.start();

      gain.gain.setTargetAtTime(0.09, this.now(), 1.4);
      this.musicNodes = { gain, oscs, lfo };
      this.musicGain = gain;
    }

    stopMusic() {
      if (!this.musicNodes || !this.ctx) return;
      const { gain, oscs, lfo } = this.musicNodes;
      const t = this.now();
      gain.gain.cancelScheduledValues(t);
      gain.gain.setTargetAtTime(0, t, 0.25);
      oscs.forEach((o) => { try { o.stop(t + 1.2); } catch (e) { /* noop */ } });
      try { lfo.stop(t + 1.2); } catch (e) { /* noop */ }
      this.musicNodes = null;
    }
  }

  window.Sfx = Sfx;
})();
