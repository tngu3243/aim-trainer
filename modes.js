'use strict';

// ============================================================
// Shared click-mode helpers (gridshot, precision, pasu)
// ============================================================
function initClickListeners() {
  gameAreaEl.addEventListener('mousemove', onGameMouseMove);
  gameAreaEl.addEventListener('mousedown', onGridMouseDown);
}

function cleanupClickListeners() {
  gameAreaEl.removeEventListener('mousemove', onGameMouseMove);
  gameAreaEl.removeEventListener('mousedown', onGridMouseDown);
  clearGameArea();
}

// Squared-distance hit detection — avoids Math.sqrt on every click
function onGridMouseDown(e) {
  if (e.button !== 0) return;
  const r2 = cachedRadius * cachedRadius;
  let hit  = false;

  if (state.mode === 'pasu') {
    for (const body of pasuBodies) {
      const dx = state.vCursorX - body.x;
      const dy = state.vCursorY - body.y;
      if (dx * dx + dy * dy <= r2) { onGridTargetHit(body.el); hit = true; break; }
    }
  } else {
    for (const el of gameAreaEl.querySelectorAll('.target')) {
      const dx = state.vCursorX - parseFloat(el.style.left);
      const dy = state.vCursorY - parseFloat(el.style.top);
      if (dx * dx + dy * dy <= r2) { onGridTargetHit(el); hit = true; break; }
    }
  }

  if (!hit) { state.misses++; updateHUD(); }
}

function onGridTargetHit(el) {
  state.hits++;
  state.score += 100;
  if (state.mode === 'pasu') {
    const idx = pasuBodies.findIndex(b => b.el === el);
    if (idx !== -1) pasuBodies.splice(idx, 1);
  }
  el.remove();
  if (state.mode === 'pasu') spawnPasuTarget();
  else spawnGridTarget();
  updateHUD();
}

// ============================================================
// Gridshot / Precision
// ============================================================
function initGridshot() {
  const { radius, count } = getGridConfig();
  cachedRadius = radius;
  clearGameArea();
  for (let i = 0; i < count; i++) spawnGridTarget();
  initClickListeners();
}

function spawnGridTarget() {
  const r        = cachedRadius;
  const minDist2 = (r * 2) * (r * 2);
  const existing = [...gameAreaEl.querySelectorAll('.target')].map(el => ({
    x: parseFloat(el.style.left),
    y: parseFloat(el.style.top),
  }));

  let x, y, attempts = 0;
  do {
    x = r + Math.random() * (state.areaW - 2 * r);
    y = r + Math.random() * (state.areaH - 2 * r);
    attempts++;
  } while (
    attempts < 200 &&
    existing.some(t => { const dx = x - t.x, dy = y - t.y; return dx * dx + dy * dy < minDist2; })
  );

  gameAreaEl.appendChild(createTarget(x, y, r));
}

function cleanupGridshot() {
  cleanupClickListeners();
}

// ============================================================
// Pasu — precision-sized targets with curved omnidirectional movement
// ============================================================
function initPasu() {
  const { radius, count } = getGridConfig();
  cachedRadius = radius;
  clearGameArea();
  pasuBodies = [];
  for (let i = 0; i < count; i++) spawnPasuTarget();
  initClickListeners();
  state.lastTimestamp = null;
  state.gameLoopId = requestAnimationFrame(pasuLoop);
}

function spawnPasuTarget() {
  const r     = cachedRadius;
  const x     = r + Math.random() * (state.areaW - 2 * r);
  const y     = r + Math.random() * (state.areaH - 2 * r);
  const angle = Math.random() * Math.PI * 2;
  const speed = PASU_SPEED_MIN + Math.random() * (PASU_SPEED_MAX - PASU_SPEED_MIN);
  const el    = createTarget(x, y, r);
  gameAreaEl.appendChild(el);
  pasuBodies.push({ el, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, turn: (Math.random() - 0.5) * 3 });
}

function pasuLoop(timestamp) {
  if (state.gameLoopId === null) return;

  if (!state.lastTimestamp) state.lastTimestamp = timestamp;
  const dt = Math.min((timestamp - state.lastTimestamp) / 1000, 0.1);
  state.lastTimestamp = timestamp;

  const r = cachedRadius;
  const w = state.areaW;
  const h = state.areaH;

  for (const body of pasuBodies) {
    let { x, y, vx, vy, turn } = body;

    turn += (Math.random() - 0.5) * 6 * dt;
    if      (turn >  3) turn =  3;
    else if (turn < -3) turn = -3;

    const speed    = Math.hypot(vx, vy);
    const newAngle = Math.atan2(vy, vx) + turn * dt;
    vx = Math.cos(newAngle) * speed;
    vy = Math.sin(newAngle) * speed;

    x += vx * dt;
    y += vy * dt;

    if (x - r < 0)  { x = r;     vx =  Math.abs(vx); }
    if (x + r > w)  { x = w - r; vx = -Math.abs(vx); }
    if (y - r < 0)  { y = r;     vy =  Math.abs(vy); }
    if (y + r > h)  { y = h - r; vy = -Math.abs(vy); }

    body.x = x; body.y = y; body.vx = vx; body.vy = vy; body.turn = turn;
    body.el.style.left = `${x}px`;
    body.el.style.top  = `${y}px`;
  }

  state.gameLoopId = requestAnimationFrame(pasuLoop);
}

function cleanupPasu() {
  cancelAnimationFrame(state.gameLoopId);
  state.gameLoopId = null;
  pasuBodies = [];
  cleanupClickListeners();
}

// ============================================================
// Tracking
// ============================================================
function initTracking() {
  cachedRadius = getTrackingRadius();
  clearGameArea();

  state.trackingParams = {
    cx:   state.areaW / 2,
    cy:   state.areaH / 2,
    Ax:   state.areaW * 0.35,
    Ay:   state.areaH * 0.35,
    wx:   0.8,
    wy:   1.1,
    phiX: Math.random() * Math.PI * 2,
    phiY: Math.random() * Math.PI * 2,
  };

  trackingTargetEl    = createTarget(state.trackingParams.cx, state.trackingParams.cy, cachedRadius);
  trackingTargetEl.id = 'tracking-target';
  gameAreaEl.appendChild(trackingTargetEl);

  gameAreaEl.addEventListener('mousemove', onGameMouseMove);
  state.gameLoopId = requestAnimationFrame(trackingLoop);
}

function trackingLoop(timestamp) {
  if (state.gameLoopId === null) return;

  if (!state.lastTimestamp) state.lastTimestamp = timestamp;
  const dt = Math.min((timestamp - state.lastTimestamp) / 1000, 0.1);
  state.lastTimestamp = timestamp;

  state.trackingElapsed   += dt;
  state.trackingTotalTime += dt;

  const p  = state.trackingParams;
  const tx = p.cx + p.Ax * Math.sin(p.wx * state.trackingElapsed + p.phiX);
  const ty = p.cy + p.Ay * Math.sin(p.wy * state.trackingElapsed + p.phiY);

  trackingTargetEl.style.left = `${tx}px`;
  trackingTargetEl.style.top  = `${ty}px`;

  const dx  = state.vCursorX - tx;
  const dy  = state.vCursorY - ty;
  const hit = dx * dx + dy * dy <= cachedRadius * cachedRadius;

  if (hit !== state.isOnTarget) {
    trackingTargetEl.classList.toggle('on-target', hit);
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
  state.gameLoopId    = null;
  trackingTargetEl    = null;
  gameAreaEl.removeEventListener('mousemove', onGameMouseMove);
  clearGameArea();
}

// ============================================================
// Dispatch table — maps each mode to its init/cleanup pair
// ============================================================
const MODE_HANDLERS = {
  gridshot:  { init: initGridshot,  cleanup: cleanupGridshot  },
  precision: { init: initGridshot,  cleanup: cleanupGridshot  },
  pasu:      { init: initPasu,      cleanup: cleanupPasu      },
  tracking:  { init: initTracking,  cleanup: cleanupTracking  },
};
