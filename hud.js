'use strict';

// ============================================================
// HUD — dirty-checked to skip DOM writes when values haven't changed
// ============================================================
function resetHUDCache() {
  hudPrev = { timer: -1, score: -1, stat: '' };
}

function updateHUD() {
  if (state.timeRemaining !== hudPrev.timer) {
    const timerEl = document.getElementById('hud-timer');
    timerEl.textContent = formatTime(state.timeRemaining);
    timerEl.classList.toggle('urgent', state.timeRemaining <= 5);
    hudPrev.timer = state.timeRemaining;
  }

  if (state.score !== hudPrev.score) {
    document.getElementById('hud-score').textContent = `Score: ${state.score}`;
    hudPrev.score = state.score;
  }

  const stat = isClickMode()
    ? (state.hits + state.misses === 0 ? '—' : `${Math.round(state.hits / (state.hits + state.misses) * 100)}%`)
    : (state.trackingTotalTime === 0   ? '—' : `${Math.round(state.trackingOnTime / state.trackingTotalTime * 100)}%`);

  if (stat !== hudPrev.stat) {
    const id     = isClickMode() ? 'hud-accuracy' : 'hud-tracking';
    const prefix = isClickMode() ? 'Acc: ' : 'On Target: ';
    document.getElementById(id).textContent = prefix + stat;
    hudPrev.stat = stat;
  }
}

function setupHUD() {
  document.getElementById('hud-accuracy').style.display = isClickMode()             ? '' : 'none';
  document.getElementById('hud-tracking').style.display = state.mode === 'tracking' ? '' : 'none';
}

// ============================================================
// Virtual cursor & crosshair
// ============================================================
function updateCrosshair() {
  crosshairEl.style.left = `${state.vCursorX}px`;
  crosshairEl.style.top  = `${state.vCursorY}px`;
}

function onGameMouseMove(e) {
  if (document.pointerLockElement === gameAreaEl) {
    const effectiveSens = (state.valorantSens !== null)
      ? state.valorantSens * 0.07 * (state.areaW / 103)
      : state.sensitivity;
    state.vCursorX = Math.max(0, Math.min(state.areaW, state.vCursorX + e.movementX * effectiveSens));
    state.vCursorY = Math.max(0, Math.min(state.areaH, state.vCursorY + e.movementY * effectiveSens));
  } else {
    const rect = gameAreaEl.getBoundingClientRect();
    state.vCursorX = e.clientX - rect.left;
    state.vCursorY = e.clientY - rect.top;
  }
  updateCrosshair();
}
