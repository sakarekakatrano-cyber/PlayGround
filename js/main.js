/* ============================================================
   GREEN ZONE — app shell: boot, menus, HUD, game loop
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('stage');
  const sfx = new Sfx();
  const input = new Input(canvas);

  const BEST_KEY = 'gz.best';
  let best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
  let mode = 'boot';
  let bootTimer = null;
  let bootStepTimer = null;
  let toastTimer = null;
  let audioReady = false;

  /* ---------------- tiny UI helpers ---------------- */

  function show(id) {
    const node = $(id);
    if (node) node.classList.remove('is-hidden');
  }

  function hide(id) {
    const node = $(id);
    if (node) node.classList.add('is-hidden');
  }

  function toast(message, ms = 1700) {
    const node = $('toast');
    node.textContent = message;
    node.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('is-on'), ms);
  }

  function fmt(n) {
    return Math.round(n).toLocaleString('en-US');
  }

  function rankFor(score) {
    if (score >= 24000) return 'LEGEND';
    if (score >= 12000) return 'VETERAN';
    if (score >= 5000) return 'OPERATIVE';
    if (score > 0) return 'RECRUIT';
    return 'UNRANKED';
  }

  function refreshBestLabels() {
    $('menuBest').textContent = fmt(best);
    $('tileBest').textContent = fmt(best);
    $('tileRank').textContent = rankFor(best);
  }

  function refreshSound() {
    const on = !sfx.muted;
    $('soundState').textContent = on ? 'ON' : 'OFF';
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundWave').style.display = on ? '' : 'none';
  }

  /* ---------------- game ---------------- */

  const game = new GreenZone(canvas, sfx, {
    hud: updateHud,
    wave: (n, isBoss) => {
      toast(isBoss ? 'WAVE ' + n + ' — SENTINEL INBOUND' : 'WAVE ' + n);
    },
    toast,
    gameover: onGameOver,
    pickup: (kind) => {
      if (kind === 'overdrive') toast('OVERDRIVE ONLINE', 1200);
    },
  });

  const hudPrev = {};

  function updateHud(st) {
    const hpPct = Math.max(0, Math.min(100, (st.hp / st.maxHp) * 100));
    if (hudPrev.hp !== Math.ceil(st.hp)) {
      $('shieldFill').style.width = hpPct + '%';
      $('shieldText').textContent = Math.max(0, Math.ceil(st.hp));
      $('shieldFill').classList.toggle('is-low', hpPct <= 30);
      hudPrev.hp = Math.ceil(st.hp);
    }
    $('shieldFill').classList.toggle('is-regen', !!st.regen);

    if (hudPrev.score !== st.score) {
      $('score').textContent = String(st.score).padStart(6, '0');
      hudPrev.score = st.score;
    }
    if (hudPrev.wave !== st.wave) {
      $('wave').textContent = st.wave;
      hudPrev.wave = st.wave;
    }

    const comboOn = st.combo >= 2;
    if (hudPrev.combo !== st.combo) {
      $('combo').textContent = comboOn ? 'CHAIN ' + st.combo + '  ·  ×' + st.mult.toFixed(1) : '';
      $('combo').classList.toggle('is-on', comboOn);
      hudPrev.combo = st.combo;
    }

    const odPct = Math.round(st.overdrive * 100);
    if (hudPrev.od !== odPct) {
      $('odFill').style.transform = 'scaleX(' + st.overdrive + ')';
      $('overdrive').classList.toggle('is-on', st.overdrive > 0);
      hudPrev.od = odPct;
    }

    const cd = 1 - Math.max(0, Math.min(1, st.dash));
    $('dashCooldown').style.transform = 'scaleY(' + cd + ')';
  }

  function startGame() {
    sfx.init();
    audioReady = true;
    hide('menu');
    hide('pause');
    hide('over');
    hide('controls');
    hide('boot');
    show('hud');
    mode = 'playing';
    hudPrev.hp = hudPrev.score = hudPrev.wave = hudPrev.combo = hudPrev.od = null;
    input.reset();
    $('combo').classList.remove('is-on');
    $('overdrive').classList.remove('is-on');
    game.start();
    $('playBtn').blur();
  }

  function togglePause() {
    if (mode === 'playing' && game.state === 'playing') {
      mode = 'paused';
      game.pause();
      $('pauseWave').textContent = 'WAVE ' + Math.max(1, game.wave);
      $('pauseScore').textContent = fmt(game.score);
      show('pause');
      sfx.stopMusic();
      input.reset();
      $('resumeBtn').focus();
    } else if (mode === 'paused') {
      mode = 'playing';
      game.resume();
      hide('pause');
      input.reset();
      if (!sfx.muted) sfx.startMusic();
      toast('RESUMED', 900);
    }
  }

  function goToMenu() {
    game.stopToMenu();
    mode = 'menu';
    hide('hud');
    hide('pause');
    hide('over');
    hide('controls');
    show('menu');
    refreshBestLabels();
    input.reset();
  }

  function onGameOver(result) {
    mode = 'over';
    hide('hud');
    const isBest = result.score > best;
    if (isBest) {
      best = result.score;
      localStorage.setItem(BEST_KEY, String(best));
      refreshBestLabels();
    }
    $('finalScore').textContent = fmt(result.score);
    $('finalBest').textContent = fmt(best);
    $('overWave').textContent = String(Math.max(1, result.wave));
    $('newBest').classList.toggle('is-hidden', !isBest);
    $('overKicker').textContent = result.wave >= 10 ? 'DEEP ORBIT COLLAPSE' : 'SIGNAL LOST';
    show('over');
    input.reset();
    $('retryBtn').focus();
    toast('PRESS ENTER TO RETRY', 2600);
  }

  /* ---------------- boot ---------------- */

  const bootStatuses = [
    'CALIBRATING SHIELDS',
    'LINKING CONTROLLER',
    'MAPPING SECTOR 7',
    'SPINNING UP CORE',
  ];

  function finishBoot() {
    if (mode !== 'boot') return;
    mode = 'menu';
    clearInterval(bootTimer);
    clearInterval(bootStepTimer);
    hide('boot');
    show('menu');
    refreshBestLabels();
    refreshSound();
    $('skipBoot').blur();
  }

  function runBoot() {
    let i = 0;
    bootStepTimer = setInterval(() => {
      i = (i + 1) % bootStatuses.length;
      $('bootStatus').textContent = bootStatuses[i];
    }, 620);
    bootTimer = setTimeout(finishBoot, 2550);
    $('skipBoot').addEventListener('click', finishBoot);
  }

  /* ---------------- UI wiring ---------------- */

  $('playBtn').addEventListener('click', startGame);
  $('controlsBtn').addEventListener('click', () => {
    sfx.ui();
    show('controls');
  });
  $('controlsClose').addEventListener('click', () => {
    sfx.ui();
    hide('controls');
    $('controlsBtn').focus();
  });
  $('controls').addEventListener('click', (e) => {
    if (e.target === $('controls')) hide('controls');
  });
  function toggleSound() {
    sfx.init();
    sfx.setMuted(!sfx.muted);
    refreshSound();
    if (!sfx.muted) {
      sfx.ui();
      if (mode === 'playing' && game.state === 'playing') sfx.startMusic();
    }
  }

  $('soundBtn').addEventListener('click', toggleSound);

  $('pauseBtn').addEventListener('click', () => {
    if (mode === 'playing' && game.state === 'playing') togglePause();
  });
  $('resumeBtn').addEventListener('click', togglePause);
  $('restartBtn').addEventListener('click', startGame);
  $('quitBtn').addEventListener('click', goToMenu);
  $('retryBtn').addEventListener('click', startGame);
  $('homeBtn').addEventListener('click', goToMenu);

  const dashBtn = $('dashBtn');
  dashBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    sfx.init();
    input.queueDash();
  });
  dashBtn.addEventListener('contextmenu', (e) => e.preventDefault());

  input.onFirstGesture = () => {
    if (audioReady) return;
    audioReady = true;
    sfx.init();
  };

  /* show touch affordances as soon as any touch happens, not just inside the arena */
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') document.body.classList.add('is-touch');
  }, { passive: true });

  input.onGamepadChange = (connected, id) => {
    const label = $('gpadLabel');
    label.classList.toggle('is-off', !connected);
    label.textContent = connected ? 'GAMEPAD CONNECTED' : 'GAMEPAD READY';
    if (connected) {
      const short = String(id || '').replace(/\s*\(.*?\)\s*/g, ' ').trim().slice(0, 34);
      toast('CONTROLLER CONNECTED' + (short ? ' — ' + short.toUpperCase() : ''), 2200);
    } else if (mode === 'playing') {
      toast('CONTROLLER DISCONNECTED', 1800);
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && mode === 'playing') togglePause();
  });
  window.addEventListener('blur', () => {
    if (mode === 'playing') togglePause();
  });

  window.addEventListener('keydown', (e) => {
    const k = e.key;
    const low = k.toLowerCase();
    const tag = e.target && e.target.tagName;
    const onControl = tag === 'BUTTON' || tag === 'A';
    if (low === 'm' && !onControl) {
      toggleSound();
      return;
    }
    if (mode === 'menu' && (k === 'Enter' || k === ' ')) {
      if (onControl) return; // native button activation handles it
      e.preventDefault();
      startGame();
      return;
    }
    if (mode === 'paused' && (k === 'Enter' || k === ' ')) {
      if (onControl) return;
      e.preventDefault();
      togglePause();
      return;
    }
    if (mode === 'over' && (k === 'Enter' || k === ' ')) {
      if (onControl) return;
      e.preventDefault();
      startGame();
      return;
    }
    if (k === 'Escape' && mode === 'menu') {
      const panel = $('controls');
      if (!panel.classList.contains('is-hidden')) {
        hide('controls');
        $('controlsBtn').focus();
      }
    }
  });

  /* ---------------- loop ---------------- */

  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;

    const snapshot = input.sample(now);

    if (mode === 'playing') {
      if (snapshot.pause) {
        togglePause();
      } else {
        game.update(dt, snapshot);
      }
    } else if (mode === 'paused' && snapshot.pause) {
      togglePause();
    }

    game.render(now, dt);
  }

  /* ---------------- start ---------------- */

  refreshBestLabels();
  refreshSound();
  runBoot();
  requestAnimationFrame(frame);

  // debug/test handle (harmless in production)
  window.__gz = { game, sfx, input, get mode() { return mode; } };
})();
