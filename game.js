'use strict';

// ============================================================
// State — single source of truth
// ============================================================
const state = {
  // Navigation
  screen: 'home',
  mode: 'gridshot',
  duration: 30,
  targetSize: 1.0,   // multiplier applied to all target radii
  sensitivity: 1.0,  // pointer delta multiplier

  // Game runtime
  timeRemaining: 0,
  score: 0,
  hits: 0,
  misses: 0,

  // Virtual cursor — used for all hit detection
  vCursorX: 0,
  vCursorY: 0,

  // Tracking runtime
  trackingOnTime: 0,
  trackingTotalTime: 0,
  trackingElapsed: 0,
  isOnTarget: false,
  lastTimestamp: null,
  trackingParams: null,

  // Timer and loop handles
  countdownInterval: null,
  gameLoopId: null,
};

// Expose for DevTools inspection
window.state = state;

// ============================================================
// Constants
// ============================================================
const GRIDSHOT_RADIUS   = 36;   // px
const GRIDSHOT_TARGETS  = 3;
const PRECISION_RADIUS  = 20;   // px — smaller targets
const PRECISION_TARGETS = 5;
const TRACKING_RADIUS   = 40;   // px
const PASU_SPEED_MIN    = 275;  // px/s — minimum target speed
const PASU_SPEED_MAX    = 515; // px/s — maximum target speed

// Returns true for click-to-hit modes (gridshot, precision & pasu)
function isClickMode() {
  return state.mode === 'gridshot' || state.mode === 'precision' || state.mode === 'pasu';
}

// Returns the target radius and count for the current click mode, scaled by targetSize
// Pasu shares the same radius/count as precision
function getGridConfig() {
  const base = (state.mode === 'precision' || state.mode === 'pasu')
    ? { radius: PRECISION_RADIUS, count: PRECISION_TARGETS }
    : { radius: GRIDSHOT_RADIUS,  count: GRIDSHOT_TARGETS };
  return { radius: Math.round(base.radius * state.targetSize), count: base.count };
}

function getTrackingRadius() {
  return Math.round(TRACKING_RADIUS * state.targetSize);
}

const LS_KEY      = 'aimtrainer_history';
const MAX_HISTORY = 50;

// ============================================================
// Utilities
// ============================================================
function formatTime(secs) {
  if (secs >= 60) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  return `${secs}s`;
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Only removes .target elements — preserves the crosshair div
function clearGameArea() {
  document.getElementById('game-area').querySelectorAll('.target').forEach(el => el.remove());
}

// ============================================================
// Screen management
// ============================================================
function goTo(screen) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById(`screen-${screen}`).classList.add('active');
  state.screen = screen;
}

// ============================================================
// localStorage helpers
// ============================================================
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveResult(result) {
  const history = loadHistory();
  history.push(result);
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  localStorage.setItem(LS_KEY, JSON.stringify(history));
}

function getPersonalBest(mode) {
  const history = loadHistory();
  const filtered = history.filter(r => r.mode === mode);
  if (!filtered.length) return null;
  return Math.max(...filtered.map(r => r.score));
}

// ============================================================
// HUD
// ============================================================
function updateHUD() {
  const timerEl = document.getElementById('hud-timer');
  timerEl.textContent = formatTime(state.timeRemaining);
  timerEl.classList.toggle('urgent', state.timeRemaining <= 5);

  document.getElementById('hud-score').textContent = `Score: ${state.score}`;

  if (isClickMode()) {
    const total = state.hits + state.misses;
    const acc = total === 0 ? '—' : `${Math.round((state.hits / total) * 100)}%`;
    document.getElementById('hud-accuracy').textContent = `Acc: ${acc}`;
  } else {
    const pct = state.trackingTotalTime === 0
      ? '—'
      : `${Math.round((state.trackingOnTime / state.trackingTotalTime) * 100)}%`;
    document.getElementById('hud-tracking').textContent = `On Target: ${pct}`;
  }
}

function setupHUD() {
  const accEl   = document.getElementById('hud-accuracy');
  const trackEl = document.getElementById('hud-tracking');
  accEl.style.display   = isClickMode()             ? '' : 'none';
  trackEl.style.display = state.mode === 'tracking' ? '' : 'none';
}

// ============================================================
// Virtual cursor & crosshair
// ============================================================
function updateCrosshair() {
  const el = document.getElementById('crosshair');
  if (el) {
    el.style.left = `${state.vCursorX}px`;
    el.style.top  = `${state.vCursorY}px`;
  }
}

// Shared mousemove handler for all game modes.
// With pointer lock active: uses movementX/Y * sensitivity for relative input.
// Without pointer lock: falls back to absolute cursor position (sensitivity has no effect).
function onGameMouseMove(e) {
  const area = document.getElementById('game-area');
  if (document.pointerLockElement === area) {
    const w = area.clientWidth;
    const h = area.clientHeight;
    state.vCursorX = Math.max(0, Math.min(w, state.vCursorX + e.movementX * state.sensitivity));
    state.vCursorY = Math.max(0, Math.min(h, state.vCursorY + e.movementY * state.sensitivity));
  } else {
    // Fallback: track real cursor position
    const rect = area.getBoundingClientRect();
    state.vCursorX = e.clientX - rect.left;
    state.vCursorY = e.clientY - rect.top;
  }
  updateCrosshair();
}

// ============================================================
// Game start / end
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

  goTo('game');
  setupHUD();
  updateHUD();
  startCountdown();

  // Position virtual cursor at center and request pointer lock
  const area = document.getElementById('game-area');
  state.vCursorX = area.clientWidth  / 2;
  state.vCursorY = area.clientHeight / 2;
  updateCrosshair();
  area.requestPointerLock();

  if (state.mode === 'pasu') {
    initPasu();
  } else if (isClickMode()) {
    initGridshot();
  } else {
    initTracking();
  }
}

function endGame() {
  clearInterval(state.countdownInterval);
  cancelAnimationFrame(state.gameLoopId);
  state.countdownInterval = null;
  state.gameLoopId        = null;

  if (document.pointerLockElement) document.exitPointerLock();

  if (state.mode === 'pasu') {
    cleanupPasu();
  } else if (isClickMode()) {
    cleanupGridshot();
  } else {
    cleanupTracking();
  }

  showResults();
  goTo('results');
}

// ============================================================
// Countdown timer
// ============================================================
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
// GRIDSHOT / PRECISION MODE
// ============================================================
function initGridshot() {
  clearGameArea();
  const { count } = getGridConfig();
  for (let i = 0; i < count; i++) spawnGridTarget();
  const area = document.getElementById('game-area');
  area.addEventListener('mousemove', onGameMouseMove);
  area.addEventListener('mousedown', onGridMouseDown);
}

function spawnGridTarget() {
  const area = document.getElementById('game-area');
  const r    = getGridConfig().radius;
  const w    = area.clientWidth;
  const h    = area.clientHeight;
  const x    = r + Math.random() * (w - 2 * r);
  const y    = r + Math.random() * (h - 2 * r);

  const el        = document.createElement('div');
  el.className    = 'target';
  el.style.width  = `${r * 2}px`;
  el.style.height = `${r * 2}px`;
  el.style.left   = `${x}px`;
  el.style.top    = `${y}px`;
  area.appendChild(el);
}

function onGridTargetHit(el) {
  state.hits++;
  state.score += 100;
  el.remove();
  if (state.mode === 'pasu') spawnPasuTarget();
  else spawnGridTarget();
  updateHUD();
}

// Hit detection using virtual cursor position — works correctly with pointer lock
function onGridMouseDown(e) {
  if (e.button !== 0) return;

  const r       = getGridConfig().radius;
  const targets = document.getElementById('game-area').querySelectorAll('.target');
  let hit       = false;

  for (const el of targets) {
    const tx = parseFloat(el.style.left);
    const ty = parseFloat(el.style.top);
    const dx = state.vCursorX - tx;
    const dy = state.vCursorY - ty;
    if (Math.sqrt(dx * dx + dy * dy) <= r) {
      onGridTargetHit(el);
      hit = true;
      break;
    }
  }

  if (!hit) {
    state.misses++;
    updateHUD();
  }
}

function cleanupGridshot() {
  const area = document.getElementById('game-area');
  area.removeEventListener('mousemove', onGameMouseMove);
  area.removeEventListener('mousedown', onGridMouseDown);
  clearGameArea();
}

// ============================================================
// PASU MODE — precision targets that move (bounce off walls)
// ============================================================
function initPasu() {
  clearGameArea();
  const { count } = getGridConfig();
  for (let i = 0; i < count; i++) spawnPasuTarget();
  const area = document.getElementById('game-area');
  area.addEventListener('mousemove', onGameMouseMove);
  area.addEventListener('mousedown', onGridMouseDown);
  state.lastTimestamp = null;
  state.gameLoopId = requestAnimationFrame(pasuLoop);
}

function spawnPasuTarget() {
  const area  = document.getElementById('game-area');
  const r     = getGridConfig().radius;
  const w     = area.clientWidth;
  const h     = area.clientHeight;
  const x     = r + Math.random() * (w - 2 * r);
  const y     = r + Math.random() * (h - 2 * r);
  const angle = Math.random() * Math.PI * 2;
  const speed = PASU_SPEED_MIN + Math.random() * (PASU_SPEED_MAX - PASU_SPEED_MIN);

  const el        = document.createElement('div');
  el.className    = 'target';
  el.style.width  = `${r * 2}px`;
  el.style.height = `${r * 2}px`;
  el.style.left   = `${x}px`;
  el.style.top    = `${y}px`;
  el.dataset.vx   = String(Math.cos(angle) * speed);
  el.dataset.vy   = String(Math.sin(angle) * speed);
  el.dataset.turn = String((Math.random() - 0.5) * 3); // rad/s, initial turning bias
  area.appendChild(el);
}

function pasuLoop(timestamp) {
  if (state.gameLoopId === null) return;

  if (!state.lastTimestamp) state.lastTimestamp = timestamp;
  const dt = Math.min((timestamp - state.lastTimestamp) / 1000, 0.1);
  state.lastTimestamp = timestamp;

  const area = document.getElementById('game-area');
  const r    = getGridConfig().radius;
  const w    = area.clientWidth;
  const h    = area.clientHeight;

  area.querySelectorAll('.target').forEach(el => {
    let x    = parseFloat(el.style.left);
    let y    = parseFloat(el.style.top);
    let vx   = parseFloat(el.dataset.vx);
    let vy   = parseFloat(el.dataset.vy);
    let turn = parseFloat(el.dataset.turn);

    // Drift the turn rate each frame for organic, unpredictable curving
    turn += (Math.random() - 0.5) * 6 * dt;
    turn  = Math.max(-3, Math.min(3, turn));

    // Rotate velocity direction by turn rate, preserving speed
    const speed = Math.hypot(vx, vy);
    const newAngle = Math.atan2(vy, vx) + turn * dt;
    vx = Math.cos(newAngle) * speed;
    vy = Math.sin(newAngle) * speed;

    x += vx * dt;
    y += vy * dt;

    if (x - r < 0)  { x = r;     vx =  Math.abs(vx); }
    if (x + r > w)  { x = w - r; vx = -Math.abs(vx); }
    if (y - r < 0)  { y = r;     vy =  Math.abs(vy); }
    if (y + r > h)  { y = h - r; vy = -Math.abs(vy); }

    el.style.left   = `${x}px`;
    el.style.top    = `${y}px`;
    el.dataset.vx   = String(vx);
    el.dataset.vy   = String(vy);
    el.dataset.turn = String(turn);
  });

  state.gameLoopId = requestAnimationFrame(pasuLoop);
}

function cleanupPasu() {
  cancelAnimationFrame(state.gameLoopId);
  state.gameLoopId = null;
  const area = document.getElementById('game-area');
  area.removeEventListener('mousemove', onGameMouseMove);
  area.removeEventListener('mousedown', onGridMouseDown);
  clearGameArea();
}

// ============================================================
// TRACKING MODE
// ============================================================
function initTracking() {
  clearGameArea();
  const area = document.getElementById('game-area');

  state.trackingParams = {
    cx:   area.clientWidth  / 2,
    cy:   area.clientHeight / 2,
    Ax:   area.clientWidth  * 0.35,
    Ay:   area.clientHeight * 0.35,
    wx:   0.8,
    wy:   1.1,
    phiX: Math.random() * Math.PI * 2,
    phiY: Math.random() * Math.PI * 2,
  };

  const el        = document.createElement('div');
  el.className    = 'target';
  el.id           = 'tracking-target';
  el.style.width  = `${getTrackingRadius() * 2}px`;
  el.style.height = `${getTrackingRadius() * 2}px`;
  el.style.left   = `${state.trackingParams.cx}px`;
  el.style.top    = `${state.trackingParams.cy}px`;
  area.appendChild(el);

  area.addEventListener('mousemove', onGameMouseMove);
  state.gameLoopId = requestAnimationFrame(trackingLoop);
}

function trackingLoop(timestamp) {
  if (state.gameLoopId === null) return;

  if (!state.lastTimestamp) state.lastTimestamp = timestamp;
  const dt = Math.min((timestamp - state.lastTimestamp) / 1000, 0.1); // cap at 100ms
  state.lastTimestamp = timestamp;

  state.trackingElapsed   += dt;
  state.trackingTotalTime += dt;

  const p  = state.trackingParams;
  const tx = p.cx + p.Ax * Math.sin(p.wx * state.trackingElapsed + p.phiX);
  const ty = p.cy + p.Ay * Math.sin(p.wy * state.trackingElapsed + p.phiY);

  const el = document.getElementById('tracking-target');
  if (!el) return;
  el.style.left = `${tx}px`;
  el.style.top  = `${ty}px`;

  const dx  = state.vCursorX - tx;
  const dy  = state.vCursorY - ty;
  const hit = Math.sqrt(dx * dx + dy * dy) <= getTrackingRadius();

  if (hit !== state.isOnTarget) {
    el.classList.toggle('on-target', hit);
    state.isOnTarget = hit;
  }

  if (hit) state.trackingOnTime += dt;

  state.score = Math.round(
    (state.trackingOnTime / Math.max(state.trackingTotalTime, 0.001)) * 10000
  );

  updateHUD();
  state.gameLoopId = requestAnimationFrame(trackingLoop);
}

function cleanupTracking() {
  cancelAnimationFrame(state.gameLoopId);
  state.gameLoopId = null;
  const area = document.getElementById('game-area');
  area.removeEventListener('mousemove', onGameMouseMove);
  clearGameArea();
}

// ============================================================
// Results
// ============================================================
function showResults() {
  const container = document.getElementById('results-stats');
  container.innerHTML = '';

  let result;
  let stats;

  if (isClickMode()) {
    const total    = state.hits + state.misses;
    const accuracy = total === 0 ? 0 : Math.round((state.hits / total) * 100);
    const hps      = (state.hits / Math.max(state.duration, 1)).toFixed(2);

    result = {
      mode:       state.mode,
      duration:   state.duration,
      score:      state.score,
      hits:       state.hits,
      misses:     state.misses,
      accuracy,
      hitsPerSec: parseFloat(hps),
      date:       Date.now(),
    };

    stats = [
      { label: 'Score',      value: state.score },
      { label: 'Hits',       value: state.hits },
      { label: 'Misses',     value: state.misses },
      { label: 'Accuracy',   value: `${accuracy}%` },
      { label: 'Hits / sec', value: hps },
    ];
  } else {
    const pct = Math.round(
      (state.trackingOnTime / Math.max(state.trackingTotalTime, 0.001)) * 100
    );

    result = {
      mode:         'tracking',
      duration:     state.duration,
      score:        state.score,
      timeOnTarget: pct,
      date:         Date.now(),
    };

    stats = [
      { label: 'Score',          value: state.score },
      { label: 'Time on Target', value: `${pct}%` },
      { label: 'Duration',       value: `${state.duration}s` },
    ];
  }

  // Check personal best BEFORE saving (compare against prior best only)
  const prevBest = getPersonalBest(state.mode);
  saveResult(result);

  const badge = document.getElementById('pb-badge');
  badge.hidden = !(prevBest === null || result.score > prevBest);

  stats.forEach(({ label, value }) => {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `
      <span class="stat-label">${label}</span>
      <span class="stat-value">${value}</span>
    `;
    container.appendChild(card);
  });
}

// ============================================================
// Stats screen
// ============================================================
function showStatsScreen() {
  const history = loadHistory();

  // Personal bests
  const pbContainer = document.getElementById('personal-bests');
  pbContainer.innerHTML = '';

  ['gridshot', 'precision', 'pasu', 'tracking'].forEach(mode => {
    const sessions = history.filter(r => r.mode === mode);
    const pb       = sessions.length ? Math.max(...sessions.map(r => r.score)) : null;

    const card = document.createElement('div');
    card.className = 'pb-card';
    card.innerHTML = `
      <span class="pb-mode">${mode}</span>
      <span class="pb-score">${pb !== null ? pb.toLocaleString() : '—'}</span>
    `;
    pbContainer.appendChild(card);
  });

  // Recent sessions (last 10, most recent first)
  const histContainer = document.getElementById('session-history');
  histContainer.innerHTML = '';

  const recent = [...history].reverse().slice(0, 10);

  if (!recent.length) {
    histContainer.innerHTML = '<div class="history-empty">No sessions yet. Go train!</div>';
    return;
  }

  recent.forEach(r => {
    const row = document.createElement('div');
    row.className = 'history-row';

    let detail = '';
    if (r.mode === 'gridshot' || r.mode === 'precision' || r.mode === 'pasu') {
      detail = `${r.hits}H / ${r.misses}M · ${r.accuracy}% acc · ${r.duration}s`;
    } else {
      detail = `${r.timeOnTarget}% on target · ${r.duration}s`;
    }

    row.innerHTML = `
      <span class="history-mode ${r.mode}">${r.mode}</span>
      <span class="history-score">${r.score.toLocaleString()}</span>
      <span class="history-detail">${detail}</span>
      <span class="history-date">${formatDate(r.date)}</span>
    `;
    histContainer.appendChild(row);
  });
}

// ============================================================
// Event wiring
// ============================================================
document.addEventListener('DOMContentLoaded', () => {

  // Mode selector
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
    });
  });

  // Size selector
  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.targetSize = parseFloat(btn.dataset.size);
    });
  });

  // Sensitivity slider
  const sensSlider = document.getElementById('sens-slider');
  const sensValue  = document.getElementById('sens-value');
  sensSlider.addEventListener('input', () => {
    state.sensitivity = parseFloat(sensSlider.value);
    sensValue.textContent = `${state.sensitivity.toFixed(1)}×`;
  });

  // Timer presets
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

  // Custom time input
  document.getElementById('custom-time').addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    if (val >= 5 && val <= 300) {
      state.duration = val;
    }
  });

  // Home screen buttons
  document.getElementById('btn-start').addEventListener('click', () => {
    const customBtn = document.querySelector('.time-btn[data-time="custom"]');
    if (customBtn.classList.contains('active')) {
      const val = parseInt(document.getElementById('custom-time').value, 10);
      if (!val || val < 5 || val > 300) {
        document.getElementById('custom-time').focus();
        return;
      }
      state.duration = val;
    }
    startGame();
  });

  document.getElementById('btn-stats').addEventListener('click', () => {
    showStatsScreen();
    goTo('stats');
  });

  // Game screen
  document.getElementById('btn-quit').addEventListener('click', endGame);

  // Results screen
  document.getElementById('btn-play-again').addEventListener('click', startGame);
  document.getElementById('btn-menu').addEventListener('click', () => goTo('home'));

  // Stats screen
  document.getElementById('btn-stats-back').addEventListener('click', () => goTo('home'));
  document.getElementById('btn-clear-history').addEventListener('click', () => {
    if (window.confirm('Clear all session history? This cannot be undone.')) {
      localStorage.removeItem(LS_KEY);
      showStatsScreen();
    }
  });

  // Start on home
  goTo('home');
});
