'use strict';

const REFRESH_INTERVAL = 5 * 60 * 1000;

function renderPodium(standings) {
  const podium = document.getElementById('podium');
  podium.innerHTML = '';

  if (!standings || standings.length < 3) {
    podium.innerHTML = '<div class="error-msg">No data yet.<br>Nog geen data beschikbaar.</div>';
    return;
  }

  // Klassieke podium volgorde: 2e links, 1e midden, 3e rechts
  const order = [standings[1], standings[0], standings[2]];
  const classes = ['silver', 'gold', 'bronze'];

  for (let i = 0; i < 3; i++) {
    const entry = order[i];
    const cls = classes[i];
    const pos = Number(entry.position);
    const displayName = entry.code || entry.name.split(' ').pop().substring(0, 3).toUpperCase();

    const slot = document.createElement('div');
    slot.className = `slot ${cls}`;
    slot.innerHTML = `
      <div class="info">
        <div class="driver-code">${displayName}</div>
        <div class="driver-pts">${entry.points} pts</div>
      </div>
      <div class="step">${pos}</div>
    `;
    podium.appendChild(slot);
  }
}

function onHomeyReady(Homey) {
  let readyCalled = false;

  function load() {
    Homey.api('GET', '/standings', {})
      .then(standings => {
        renderPodium(standings);
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
        document.getElementById('podium').innerHTML =
          '<div class="error-msg">Could not load standings.<br>Check app connection.</div>';
        if (!readyCalled) {
          Homey.ready({ height: 120 });
          readyCalled = true;
        }
      });
  }

  load();
  setInterval(load, REFRESH_INTERVAL);
}
