'use strict';

const REFRESH_INTERVAL = 5 * 60 * 1000;

function renderList(standings) {
  const list = document.getElementById('list');
  list.innerHTML = '';

  if (!standings || standings.length === 0) {
    list.innerHTML = '<div class="error-msg">No standings available yet.<br>Nog geen klassement beschikbaar.</div>';
    return;
  }

  const podiumClass = ['top1', 'top2', 'top3'];
  const badgeClass = ['gold', 'silver', 'bronze'];

  for (const entry of standings) {
    const pos = Number(entry.position);
    const isPodium = pos <= 3;

    const row = document.createElement('div');
    row.className = 'standing-row' + (isPodium ? ' ' + podiumClass[pos - 1] : '');

    const badgeCls = isPodium ? badgeClass[pos - 1] : 'normal';
    const posEl = `<span class="pos-badge ${badgeCls}">${pos}</span>`;
    const nameEl = `<span class="driver-name">${entry.name}</span>`;
    const conEl = `<span class="constructor-name">${entry.constructor || ''}</span>`;
    const ptsEl = `<span class="points">${entry.points}</span>`;
    const lblEl = `<span class="pts-label">pts</span>`;

    row.innerHTML = posEl + nameEl + conEl + ptsEl + lblEl;
    list.appendChild(row);
  }
}

function onHomeyReady(Homey) {
  let readyCalled = false;

  function loadStandings() {
    Homey.api('GET', '/standings', {})
      .then(standings => {
        renderList(standings);
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
          '<div class="error-msg">Could not load standings.<br>Check app connection.</div>';
        if (!readyCalled) {
          Homey.ready({ height: 120 });
          readyCalled = true;
        }
      });
  }

  loadStandings();
  setInterval(loadStandings, REFRESH_INTERVAL);
}
