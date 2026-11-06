'use strict';

const REFRESH_INTERVAL = 30 * 60 * 1000;

const isNl = (navigator.language || 'en').toLowerCase().startsWith('nl');
const t = (nl, en) => (isNl ? nl : en);

function formatPct(p) {
  return p >= 1 || p === 0 ? `${Math.round(p)}%` : '<1%';
}

function render(data, championship) {
  const isDrivers = championship !== 'constructors';
  const podium = document.getElementById('podium');
  document.getElementById('title').textContent = t('Titelkansen', 'Title odds');

  const list = data && (isDrivers ? data.drivers : data.constructors);
  if (!list || list.length < 3) {
    podium.innerHTML = `<div class="error-msg">${t('Nog geen data beschikbaar.', 'No data yet.')}</div>`;
    return;
  }

  const races = data.racesRemaining;
  document.getElementById('subtitle').textContent = races
    ? t(`nog ${races} race${races === 1 ? '' : 's'}`, `${races} race${races === 1 ? '' : 's'} left`)
    : t('seizoen afgelopen', 'season finished');

  // Classic podium order: 2nd left, 1st centre, 3rd right
  const slots = [[list[1], 'silver'], [list[0], 'gold'], [list[2], 'bronze']];
  podium.innerHTML = slots.map(([e, cls]) => {
    const label = isDrivers ? e.code : e.name;
    const sub = isDrivers ? e.constructor : `${e.points} ${t('ptn', 'pts')}`;
    const ver = isDrivers ? e.driverId === 'max_verstappen' : e.constructorId === 'red_bull';
    return `
      <div class="slot ${cls}${ver ? ' ver-highlight' : ''}">
        <div class="info">
          <div class="driver-code">${label}</div>
          <div class="driver-team">${sub}</div>
        </div>
        <div class="step">${formatPct(e.probability)}</div>
      </div>`;
  }).join('');
}

function onHomeyReady(Homey) {
  Homey.ready({ height: 185 });
  const { championship } = Homey.getSettings() || {};

  function load() {
    Homey.api('GET', '/prediction', {})
      .then(data => {
        render(data, championship);
        const height = document.body.scrollHeight;
        if (height > 0) Homey.setHeight(height);
      })
      .catch(() => {
        document.getElementById('podium').innerHTML =
          `<div class="error-msg">${t('Voorspelling kon niet geladen worden.', 'Could not load prediction.')}</div>`;
      });
  }

  load();
  setInterval(load, REFRESH_INTERVAL);
}
