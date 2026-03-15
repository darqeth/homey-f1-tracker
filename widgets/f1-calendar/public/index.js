'use strict';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

function renderList(races) {
  const userLang = (navigator.language || 'en').toLowerCase();
  const lang = userLang.startsWith('nl') ? 'nl-NL' : 'en-GB';
  const list = document.getElementById('list');
  list.innerHTML = '';

  if (!races || races.length === 0) {
    list.innerHTML = '<div class="error-msg">No data yet.<br>Nog geen data bekend.</div>';
    return;
  }

  for (const race of races) {
    const row = document.createElement('div');
    const cls = ['race-row'];
    if (race.isCancelled) cls.push('cancelled');
    else if (race.isPast) cls.push('past');
    else if (race.isNext) cls.push('next');
    row.className = cls.join(' ');

    const date = race.date ? new Date(race.date) : null;
    const dateStr = date
      ? date.toLocaleDateString(lang, { day: 'numeric', month: 'short' })
      : '';

    const gpName = race.raceName.replace(' Grand Prix', ' GP').replace('Grand Prix', 'GP');

    const roundEl = `<span class="round">${race.isCancelled ? '–' : String(race.round).padStart(2, '0')}</span>`;
    const sprintBadge = race.isSprint
      ? `<span class="sprint-badge${race.isSprintPast ? ' past' : ''}">Sprint</span>${race.sprintWinner ? `<span class="sprint-winner-badge">${race.sprintWinner}</span>` : ''}`
      : '';
    const nameGroupEl = `<div class="name-group"><span class="name">${gpName}</span>${sprintBadge}</div>`;
    const dateEl = `<span class="date">${dateStr}</span>`;
    const podiumClasses = ['gold', 'silver', 'bronze'];
    const winnerEl = (race.top3 || [])
      .map((code, i) => code ? `<span class="winner-badge ${podiumClasses[i]}">${code}</span>` : '')
      .join('');

    row.innerHTML = roundEl + nameGroupEl + dateEl + winnerEl;
    list.appendChild(row);
  }
}

function onHomeyReady(Homey) {
  let readyCalled = false;

  function loadCalendar() {
    Homey.api('GET', '/calendar', {})
      .then(races => {
        renderList(races);
        const now = new Date();
        document.getElementById('updated').textContent =
          now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const height = document.body.scrollHeight;
        if (!readyCalled) {
          Homey.ready({ height });
          readyCalled = true;
        } else {
          Homey.setHeight(height);
        }
      })
      .catch(() => {
        document.getElementById('list').innerHTML =
          '<div class="error-msg">Could not load calendar.<br>Check app connection.</div>';
        if (!readyCalled) {
          Homey.ready({ height: 120 });
          readyCalled = true;
        }
      });
  }

  loadCalendar();
  setInterval(loadCalendar, REFRESH_INTERVAL);
}
