'use strict';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

function setDebug(msg, ok) {
  const el = document.getElementById('debug');
  if (el) {
    el.style.background = ok ? '#27ae60' : '#c0392b';
    el.textContent = msg;
  }
}

async function loadCalendar() {
  setDebug('Calling API…', true);
  try {
    const races = await HomeyWidget.api.get('/calendar');
    setDebug('OK – ' + races.length + ' races', true);
    renderList(races);

    const now = new Date();
    document.getElementById('updated').textContent =
      now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (err) {
    setDebug('ERROR: ' + (err && err.message ? err.message : String(err)), false);
    const list = document.getElementById('list');
    if (list) list.innerHTML =
      '<div class="error-msg">Could not load calendar.<br>Check app connection.</div>';
  }
}

function renderList(races) {
  const lang = navigator.language.startsWith('nl') ? 'nl-NL' : 'en-GB';
  const list = document.getElementById('list');
  list.innerHTML = '';

  let nextEl = null;

  for (const race of races) {
    const row = document.createElement('div');
    const cls = ['race-row'];
    if (race.isPast) cls.push('past');
    if (race.isNext) cls.push('next');
    row.className = cls.join(' ');

    const date = race.date ? new Date(race.date) : null;
    const dateStr = date
      ? date.toLocaleDateString(lang, { day: 'numeric', month: 'short' })
      : '';

    // Shorten "Australian Grand Prix" → "Australian GP"
    const gpName = race.raceName.replace(' Grand Prix', ' GP').replace('Grand Prix', 'GP');

    const roundEl = `<span class="round">${String(race.round).padStart(2, '0')}</span>`;
    const nameEl = `<span class="name">${gpName}</span>`;
    const dateEl = `<span class="date">${dateStr}</span>`;
    const winnerEl = race.winner
      ? `<span class="winner-badge">${race.winner}</span>`
      : '';

    row.innerHTML = roundEl + nameEl + dateEl + winnerEl;
    list.appendChild(row);

    if (race.isNext) nextEl = row;
  }

  // Scroll so the next race is visible (centered in the list)
  if (nextEl) {
    setTimeout(() => nextEl.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
  }
}

// Initial load
loadCalendar();

// Reload when widget settings change
HomeyWidget.on('settings', loadCalendar);

// Auto-refresh
setInterval(loadCalendar, REFRESH_INTERVAL);
