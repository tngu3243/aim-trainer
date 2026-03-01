'use strict';

// ============================================================
// Game lifecycle
// ============================================================
function startGame() {
  state.timeRemaining     = state.duration;
  state.score             = 0;
  state.hits              = 0;
  state.misses            = 0;
  state.trackingOnTime    = 0;
  state.trackingTotalTime = 0;
  state.trackingElapsed   = 0;
  state.isOnTarget        = false;
  state.lastTimestamp     = null;

  resetHUDCache();
  goTo('game');

  // Cache area size once — must happen after goTo('game') so the element is visible
  state.areaW = gameAreaEl.clientWidth;
  state.areaH = gameAreaEl.clientHeight;
  setupHUD();
  updateHUD();
  startCountdown();

  state.vCursorX = state.areaW / 2;
  state.vCursorY = state.areaH / 2;
  updateCrosshair();
  gameAreaEl.requestPointerLock();

  MODE_HANDLERS[state.mode].init();
}

function endGame() {
  clearInterval(state.countdownInterval);
  cancelAnimationFrame(state.gameLoopId);
  state.countdownInterval = null;
  state.gameLoopId        = null;

  if (document.pointerLockElement) document.exitPointerLock();

  MODE_HANDLERS[state.mode].cleanup();
  showResults();
  goTo('results');
}

function startCountdown() {
  state.countdownInterval = setInterval(() => {
    state.timeRemaining--;
    updateHUD();
    if (state.timeRemaining <= 0) {
      clearInterval(state.countdownInterval);
      state.countdownInterval = null;
      endGame();
    }
  }, 1000);
}

// ============================================================
// Event wiring
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  gameAreaEl  = document.getElementById('game-area');
  crosshairEl = document.getElementById('crosshair');

  // ── Crosshair customization ──────────────────────────────
  const ch          = loadCrosshairSettings();
  const chPreviewEl = document.getElementById('ch-preview');

  function applyAndSaveCh() {
    applyCrosshairToEl(ch, crosshairEl);
    applyCrosshairToEl(ch, chPreviewEl);
    saveCrosshairSettings(ch);
  }

  // helper: wire a numeric slider to a ch key
  function chSlider(sliderId, key, valId) {
    const slider = document.getElementById(sliderId);
    const valEl  = document.getElementById(valId);
    slider.value      = ch[key];
    valEl.textContent = ch[key];
    slider.addEventListener('input', () => {
      ch[key] = parseInt(slider.value, 10);
      valEl.textContent = ch[key];
      applyAndSaveCh();
    });
  }

  const chColorEl = document.getElementById('ch-color');
  chColorEl.value = ch.color;
  chColorEl.addEventListener('input', () => { ch.color = chColorEl.value; applyAndSaveCh(); });

  chSlider('ch-size-slider',    'size',      'ch-size-val');
  chSlider('ch-thick-slider',   'thickness', 'ch-thick-val');
  chSlider('ch-gap-slider',     'gap',       'ch-gap-val');
  chSlider('ch-dot-slider',     'dot',       'ch-dot-val');
  chSlider('ch-outline-slider', 'outline',   'ch-outline-val');

  applyAndSaveCh(); // apply saved settings on load
  // ─────────────────────────────────────────────────────────

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
    });
  });

  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.targetSize = parseFloat(btn.dataset.size);
    });
  });

  const sensSlider = document.getElementById('sens-slider');
  const sensValue  = document.getElementById('sens-value');
  sensSlider.addEventListener('input', () => {
    state.sensitivity = parseFloat(sensSlider.value);
    sensValue.textContent = `${state.sensitivity.toFixed(1)}×`;
  });

  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const wrapper = document.getElementById('custom-time-wrapper');
      if (btn.dataset.time === 'custom') {
        wrapper.hidden = false;
      } else {
        wrapper.hidden = true;
        state.duration = parseInt(btn.dataset.time, 10);
      }
    });
  });

  document.getElementById('custom-time').addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    if (val >= 5 && val <= 300) state.duration = val;
  });

  document.getElementById('btn-start').addEventListener('click', () => {
    const customBtn = document.querySelector('.time-btn[data-time="custom"]');
    if (customBtn.classList.contains('active')) {
      const val = parseInt(document.getElementById('custom-time').value, 10);
      if (!val || val < 5 || val > 300) { document.getElementById('custom-time').focus(); return; }
      state.duration = val;
    }
    startGame();
  });

  document.getElementById('btn-stats').addEventListener('click', () => { showStatsScreen(); goTo('stats'); });
  document.getElementById('btn-quit').addEventListener('click', endGame);
  document.getElementById('btn-play-again').addEventListener('click', startGame);
  document.getElementById('btn-menu').addEventListener('click', () => goTo('home'));
  document.getElementById('btn-stats-back').addEventListener('click', () => goTo('home'));
  document.getElementById('btn-clear-history').addEventListener('click', () => {
    if (window.confirm('Clear all session history? This cannot be undone.')) {
      localStorage.removeItem(LS_KEY);
      showStatsScreen();
    }
  });

  goTo('home');
});
