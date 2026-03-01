'use strict';

// ============================================================
// Results screen
// ============================================================
function showResults() {
  const container = document.getElementById('results-stats');
  container.innerHTML = '';

  let result, stats;

  if (isClickMode()) {
    const total    = state.hits + state.misses;
    const accuracy = total === 0 ? 0 : Math.round(state.hits / total * 100);
    const hps      = (state.hits / Math.max(state.duration, 1)).toFixed(2);
    result = { mode: state.mode, duration: state.duration, score: state.score, hits: state.hits, misses: state.misses, accuracy, hitsPerSec: parseFloat(hps), date: Date.now() };
    stats  = [
      { label: 'Score',      value: state.score },
      { label: 'Hits',       value: state.hits },
      { label: 'Misses',     value: state.misses },
      { label: 'Accuracy',   value: `${accuracy}%` },
      { label: 'Hits / sec', value: hps },
    ];
  } else {
    const pct = Math.round(state.trackingOnTime / Math.max(state.trackingTotalTime, 0.001) * 100);
    result = { mode: 'tracking', duration: state.duration, score: state.score, timeOnTarget: pct, date: Date.now() };
    stats  = [
      { label: 'Score',          value: state.score },
      { label: 'Time on Target', value: `${pct}%` },
      { label: 'Duration',       value: `${state.duration}s` },
    ];
  }

  // Single localStorage round-trip: find PB and save in one pass
  const history  = loadHistory();
  const prevBest = history.reduce((m, r) => r.mode === state.mode ? Math.max(m, r.score) : m, -Infinity);
  history.push(result);
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  localStorage.setItem(LS_KEY, JSON.stringify(history));

  document.getElementById('pb-badge').hidden = !(prevBest === -Infinity || result.score > prevBest);

  stats.forEach(({ label, value }) => {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `<span class="stat-label">${label}</span><span class="stat-value">${value}</span>`;
    container.appendChild(card);
  });
}

// ============================================================
// Stats screen
// ============================================================
function showStatsScreen() {
  const history = loadHistory();

  const pbContainer = document.getElementById('personal-bests');
  pbContainer.innerHTML = '';
  ['gridshot', 'precision', 'pasu', 'tracking'].forEach(mode => {
    const sessions = history.filter(r => r.mode === mode);
    const pb       = sessions.length ? Math.max(...sessions.map(r => r.score)) : null;
    const card = document.createElement('div');
    card.className = 'pb-card';
    card.innerHTML = `<span class="pb-mode">${mode}</span><span class="pb-score">${pb !== null ? pb.toLocaleString() : '—'}</span>`;
    pbContainer.appendChild(card);
  });

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
    const detail = CLICK_MODES.has(r.mode)
      ? `${r.hits}H / ${r.misses}M · ${r.accuracy}% acc · ${r.duration}s`
      : `${r.timeOnTarget}% on target · ${r.duration}s`;
    row.innerHTML = `
      <span class="history-mode ${r.mode}">${r.mode}</span>
      <span class="history-score">${r.score.toLocaleString()}</span>
      <span class="history-detail">${detail}</span>
      <span class="history-date">${formatDate(r.date)}</span>
    `;
    histContainer.appendChild(row);
  });
}
