'use strict';

const REFRESH_INTERVAL = 5 * 60 * 1000;

// Mapping constructorId (Ergast) → F1 media CDN team name
const CONSTRUCTOR_CAR = {
  mercedes:      'mercedes',
  red_bull:      'red-bull-racing',
  ferrari:       'ferrari',
  mclaren:       'mclaren',
  aston_martin:  'aston-martin',
  alpine:        'alpine',
  williams:      'williams',
  haas:          'haas-f1-team',
  sauber:        'kick-sauber',
  rb:            'racing-bulls',
};

function carImageUrl(constructorId) {
  const name = CONSTRUCTOR_CAR[constructorId] || constructorId;
  return `https://media.formula1.com/content/dam/fom-website/teams/2025/${name}.png.transform/1col/image.png`;
}

function renderStandings(standings) {
  const isNl = (navigator.language || 'en').toLowerCase().startsWith('nl');

  if (!standings || standings.length === 0) {
    document.getElementById('list').innerHTML =
      `<div class="error-msg">${isNl ? 'Nog geen standen beschikbaar.' : 'No standings available yet.'}</div>`;
    return;
  }

  const top  = standings[0];
  const year = new Date().getFullYear();

  // ── Hero ──
  document.getElementById('hero-pos-badge').textContent =
    isNl ? 'Constructeursleider' : 'Constructor\'s Leader';
  document.getElementById('hero-team-name').textContent = top.name;
  document.getElementById('hero-season').textContent = year + (isNl ? ' Seizoen' : ' Season');
  document.getElementById('hero-pts').textContent = top.points;
  document.getElementById('hero-wins').textContent = top.wins || '0';
  document.getElementById('hero-podiums').textContent = top.podiums || '0';
  document.getElementById('hero-poles').textContent = top.poles || '0';

  const img = document.getElementById('hero-car');
  const fallback = document.getElementById('hero-car-fallback');
  if (top.constructorId) {
    img.src = carImageUrl(top.constructorId);
    img.classList.remove('hidden');
    img.onerror = () => {
      img.classList.add('hidden');
      fallback.textContent = top.name;
      fallback.style.display = 'block';
    };
  } else {
    img.classList.add('hidden');
    fallback.textContent = top.name;
    fallback.style.display = 'block';
  }

  // ── List ──
  const list = document.getElementById('list');
  list.innerHTML = '';

  const podiumClass = ['top1', 'top2', 'top3'];
  const badgeClass  = ['gold', 'silver', 'bronze'];

  for (const entry of standings) {
    const pos      = Number(entry.position);
    const isPodium = pos <= 3;

    const row = document.createElement('div');
    row.className = 'standing-row' + (isPodium ? ' ' + podiumClass[pos - 1] : '');

    const badgeCls = isPodium ? badgeClass[pos - 1] : 'normal';

    row.innerHTML =
      `<span class="pos-badge ${badgeCls}">${pos}</span>` +
      `<span class="team-name">${entry.name}</span>` +
      `<div class="points-wrap">` +
        `<span class="points">${entry.points}</span>` +
        `<span class="pts-label">pts</span>` +
      `</div>`;

    list.appendChild(row);
  }
}

function onHomeyReady(Homey) {
  Homey.ready({ height: 300 });

  function load() {
    Homey.api('GET', '/standings', {})
      .then(standings => {
        renderStandings(standings);
        const height = document.body.scrollHeight;
        if (height > 0) Homey.setHeight(height);
      })
      .catch(() => {
        const isNl = (navigator.language || 'en').toLowerCase().startsWith('nl');
        document.getElementById('list').innerHTML =
          `<div class="error-msg">${isNl ? 'Standen konden niet geladen worden.' : 'Could not load standings.'}</div>`;
      });
  }

  load();
  setInterval(load, REFRESH_INTERVAL);
}
