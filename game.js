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

  // Game runtime
  timeRemaining: 0,
  score: 0,
  hits: 0,
  misses: 0,

  // Tracking runtime
  trackingOnTime: 0,
  trackingTotalTime: 0,
  trackingElapsed: 0,
  cursorX: 0,
  cursorY: 0,
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
const GRIDSHOT_RADIUS  = 36;   // px
const GRIDSHOT_TARGETS = 3;
const PRECISION_RADIUS = 20;   // px — smaller targets
const PRECISION_TARGETS = 5;
const TRACKING_RADIUS  = 40;   // px

// Returns true for click-to-hit modes (gridshot & precision)
function isClickMode() {
  return state.mode === 'gridshot' || state.mode === 'precision';
}

// Returns the target radius and count for the current click mode, scaled by targetSize
function getGridConfig() {
  const base = state.mode === 'precision'
    ? { radius: PRECISION_RADIUS, count: PRECISION_TARGETS }
    : { radius: GRIDSHOT_RADIUS,  count: GRIDSHOT_TARGETS };
  return { radius: Math.round(base.radius * state.targetSize), count: base.count };
}

function getTrackingRadius() {
  return Math.round(TRACKING_RADIUS * state.targetSize);
}
const LS_KEY           = 'aimtrainer_history';
const MAX_HISTORY      = 50;

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

function clearGameArea() {
  document.getElementById('game-area').innerHTML = '';
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
  const accEl     = document.getElementById('hud-accuracy');
  const trackEl   = document.getElementById('hud-tracking');
  accEl.style.display   = isClickMode()              ? '' : 'none';
  trackEl.style.display = state.mode === 'tracking'  ? '' : 'none';
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

  if (isClickMode()) {
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

  if (isClickMode()) {
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
// GRIDSHOT MODE
// ============================================================
function initGridshot() {
  clearGameArea();
  const { count } = getGridConfig();
  for (let i = 0; i < count; i++) spawnGridTarget();
  document.getElementById('game-area').addEventListener('click', onGridAreaClick);
}

function spawnGridTarget() {
  const area = document.getElementById('game-area');
  const r    = getGridConfig().radius;
  const w    = area.clientWidth;
  const h    = area.clientHeight;
  const x    = r + Math.random() * (w - 2 * r);
  const y    = r + Math.random() * (h - 2 * r);

  const el   = document.createElement('div');
  el.className    = 'target';
  el.style.width  = `${r * 2}px`;
  el.style.height = `${r * 2}px`;
  el.style.left   = `${x}px`;
  el.style.top    = `${y}px`;

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onGridTargetHit(el);
  });

  area.appendChild(el);
}

function onGridTargetHit(el) {
  state.hits++;
  state.score += 100;
  el.remove();
  spawnGridTarget();
  updateHUD();
}

function onGridAreaClick(e) {
  if (!e.target.classList.contains('target')) {
    state.misses++;
    updateHUD();
  }
}

function cleanupGridshot() {
  const area = document.getElementById('game-area');
  area.removeEventListener('click', onGridAreaClick);
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

  const el       = document.createElement('div');
  el.className   = 'target';
  el.id          = 'tracking-target';
  el.style.width  = `${getTrackingRadius() * 2}px`;
  el.style.height = `${getTrackingRadius() * 2}px`;
  el.style.left   = `${state.trackingParams.cx}px`;
  el.style.top    = `${state.trackingParams.cy}px`;
  area.appendChild(el);

  area.addEventListener('mousemove', onTrackingMouseMove);
  state.gameLoopId = requestAnimationFrame(trackingLoop);
}

function onTrackingMouseMove(e) {
  const rect = document.getElementById('game-area').getBoundingClientRect();
  state.cursorX = e.clientX - rect.left;
  state.cursorY = e.clientY - rect.top;
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

  const dx  = state.cursorX - tx;
  const dy  = state.cursorY - ty;
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
  area.removeEventListener('mousemove', onTrackingMouseMove);
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
    const total   = state.hits + state.misses;
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
      mode:          'tracking',
      duration:      state.duration,
      score:         state.score,
      timeOnTarget:  pct,
      date:          Date.now(),
    };

    stats = [
      { label: 'Score',          value: state.score },
      { label: 'Time on Target', value: `${pct}%` },
      { label: 'Duration',       value: `${state.duration}s` },
    ];
  }

  // Check personal best BEFORE saving (to compare against prior best)
  const prevBest = getPersonalBest(state.mode);
  saveResult(result);

  // Show PB badge
  const badge = document.getElementById('pb-badge');
  if (prevBest === null || result.score > prevBest) {
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }

  // Render stat cards
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

  ['gridshot', 'precision', 'tracking'].forEach(mode => {
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
    const row  = document.createElement('div');
    row.className = 'history-row';

    let detail = '';
    if (r.mode === 'gridshot' || r.mode === 'precision') {
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

  // Timer presets
  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const wrapper = document.getElementById('custom-time-wrapper');
      if (btn.dataset.time === 'custom') {
        wrapper.hidden = false;
        // Duration stays as whatever it was until user types
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
    // Guard: if custom is selected but no valid value entered, do nothing
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
