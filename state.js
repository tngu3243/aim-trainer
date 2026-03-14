'use strict';

// ============================================================
// Shared DOM references — assigned once at DOMContentLoaded
// ============================================================
let gameAreaEl       = null;
let crosshairEl      = null;
let trackingTargetEl = null;

// ============================================================
// Per-session cached values (computed once at game init)
// ============================================================
let cachedRadius = 0;    // target radius for the active game
let pasuBodies   = [];   // pasu physics objects: { el, x, y, vx, vy, turn }
let hudPrev      = { timer: -1, score: -1, stat: '' }; // HUD dirty-check

// ============================================================
// Game state — single source of truth
// ============================================================
const state = {
  screen: 'home',
  mode: 'gridshot',
  duration: 30,
  targetSize: 1.0,
  sensitivity: 1.0,
  valorantSens: null,   // null = use slider; number = Valorant in-game sens

  timeRemaining: 0,
  score: 0,
  hits: 0,
  misses: 0,

  vCursorX: 0,
  vCursorY: 0,

  trackingOnTime: 0,
  trackingTotalTime: 0,
  trackingElapsed: 0,
  isOnTarget: false,
  lastTimestamp: null,
  trackingParams: null,

  areaW: 0,   // cached at game start to avoid per-frame clientWidth reads
  areaH: 0,

  countdownInterval: null,
  gameLoopId: null,
};
window.state = state;

// ============================================================
// Constants
// ============================================================
const GRIDSHOT_RADIUS   = 36;
const GRIDSHOT_TARGETS  = 3;
const PRECISION_RADIUS  = 20;
const PRECISION_TARGETS = 5;
const TRACKING_RADIUS   = 40;
const PASU_SPEED_MIN    = 275;
const PASU_SPEED_MAX    = 515;
const LS_KEY            = 'aimtrainer_history';
const MAX_HISTORY       = 50;

// Modes where you click targets to score
const CLICK_MODES = new Set(['gridshot', 'precision', 'pasu']);

// ============================================================
// Mode helpers
// ============================================================
function isClickMode() {
  return CLICK_MODES.has(state.mode);
}

function getGridConfig() {
  const isPrecisionLike = state.mode === 'precision' || state.mode === 'pasu';
  return {
    radius: Math.round((isPrecisionLike ? PRECISION_RADIUS : GRIDSHOT_RADIUS) * state.targetSize),
    count:   isPrecisionLike ? PRECISION_TARGETS : GRIDSHOT_TARGETS,
  };
}

function getTrackingRadius() {
  return Math.round(TRACKING_RADIUS * state.targetSize);
}

// ============================================================
// Shared utilities
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
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Returns a positioned, sized target div — caller appends it to the DOM
function createTarget(x, y, r) {
  const el = document.createElement('div');
  el.className = 'target';
  el.style.cssText = `width:${r * 2}px;height:${r * 2}px;left:${x}px;top:${y}px`;
  return el;
}

function clearGameArea() {
  gameAreaEl.querySelectorAll('.target').forEach(el => el.remove());
}

function goTo(screen) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById(`screen-${screen}`).classList.add('active');
  state.screen = screen;
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; }
}

// ============================================================
// Crosshair settings
// ============================================================
const CH_KEY      = 'aimtrainer_crosshair';
const CH_DEFAULTS = { color: '#ffffff', size: 10, thickness: 2, gap: 4, dot: 0, outline: 0 };

function loadCrosshairSettings() {
  try { return { ...CH_DEFAULTS, ...JSON.parse(localStorage.getItem(CH_KEY)) }; }
  catch { return { ...CH_DEFAULTS }; }
}

function saveCrosshairSettings(ch) {
  localStorage.setItem(CH_KEY, JSON.stringify(ch));
}

function applyCrosshairToEl(ch, el) {
  el.style.setProperty('--ch-color',     ch.color);
  el.style.setProperty('--ch-size',      ch.size);
  el.style.setProperty('--ch-thickness', ch.thickness);
  el.style.setProperty('--ch-gap',       ch.gap);
  el.style.setProperty('--ch-dot',       ch.dot);
  el.style.setProperty('--ch-outline',   ch.outline);
}
