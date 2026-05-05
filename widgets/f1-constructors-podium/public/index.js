'use strict';

const REFRESH_INTERVAL = 5 * 60 * 1000;

// Shorten long team names to fit the podium slot
function shortenTeam(name) {
  const map = {
    'Red Bull': 'Red Bull',
    'McLaren': 'McLaren',
    'Ferrari': 'Ferrari',
    'Mercedes': 'Mercedes',
    'Aston Martin': 'Aston M.',
    'Alpine': 'Alpine',
    'Williams': 'Williams',
    'RB': 'RB',
    'Haas': 'Haas',
    'Sauber': 'Sauber',
    'Kick Sauber': 'Sauber',
  };
  return map[name] || name.split(' ')[0];
}

function renderPodium(standings) {
  const isNl = (navigator.language || 'en').toLowerCase().startsWith('nl');
  const podium = document.getElementById('podium');
  podium.innerHTML = '';

  if (!standings || standings.length < 3) {
    podium.innerHTML = `<div class="error-msg">${isNl ? 'Nog geen data beschikbaar.' : 'No data yet.'}</div>`;
    return;
  }

  // Klassieke podium volgorde: 2e links, 1e midden, 3e rechts
  const order = [standings[1], standings[0], standings[2]];
  const classes = ['silver', 'gold', 'bronze'];

  for (let i = 0; i < 3; i++) {
    const entry = order[i];
    const cls = classes[i];
    const pos = Number(entry.position);
    const displayName = shortenTeam(entry.name);

    const slot = document.createElement('div');
    slot.className = `slot ${cls}`;
    slot.innerHTML = `
      <div class="info">
        <div class="team-name">${displayName}</div>
        <div class="team-pts">${entry.points} pts</div>
      </div>
      <div class="step">${pos}</div>
    `;
    podium.appendChild(slot);
  }
}

function onHomeyReady(Homey) {
  Homey.ready({ height: 185 });

  const isNl = (navigator.language || 'en').toLowerCase().startsWith('nl');
  document.getElementById('title').textContent =
    isNl ? 'F1 Constructeurs Podium' : 'F1 Constructors Podium';

  function load() {
    Homey.api('GET', '/standings', {})
      .then(standings => {
        renderPodium(standings);
        const now = new Date();
        document.getElementById('updated').textContent =
          now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const height = document.body.scrollHeight;
        if (height > 0) Homey.setHeight(height);
      })
      .catch(() => {
        const isNlCatch = (navigator.language || 'en').toLowerCase().startsWith('nl');
        document.getElementById('podium').innerHTML =
          `<div class="error-msg">${isNlCatch ? 'Standen konden niet geladen worden.<br>Controleer app verbinding.' : 'Could not load standings.<br>Check app connection.'}</div>`;
      });
  }

  load();
  setInterval(load, REFRESH_INTERVAL);
}
