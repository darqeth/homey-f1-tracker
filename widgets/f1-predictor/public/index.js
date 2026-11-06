'use strict';

const REFRESH_INTERVAL = 30 * 60 * 1000;
const ROWS = 5;

const isNl = (navigator.language || 'en').toLowerCase().startsWith('nl');
const t = (nl, en) => (isNl ? nl : en);

function render(data, championship) {
  const rowsEl = document.getElementById('rows');
  const isDrivers = championship !== 'constructors';
  document.getElementById('title').textContent = isDrivers
    ? t('Titelkansen coureurs', 'Drivers title odds')
    : t('Titelkansen teams', 'Constructors title odds');

  if (!data) {
    rowsEl.innerHTML = `<div class="error-msg">${t('Nog geen data beschikbaar.', 'No data yet.')}</div>`;
    return;
  }

  const races = data.racesRemaining;
  document.getElementById('subtitle').textContent = races
    ? t(`Nog ${races} race${races === 1 ? '' : 's'} · ${data.pointsRemaining} ptn te verdelen`,
        `${races} race${races === 1 ? '' : 's'} left · ${data.pointsRemaining} pts available`)
    : t('Seizoen afgelopen', 'Season finished');

  const list = (isDrivers ? data.drivers : data.constructors).slice(0, ROWS);
  const decided = list.length > 1 && !list.slice(1).some(e => e.canWin);

  rowsEl.innerHTML = list.map((e, i) => {
    const label = isDrivers ? e.code : e.name;
    const sub = isDrivers ? e.constructor : '';
    const pct = e.probability >= 1 || e.probability === 0 ? Math.round(e.probability) : '<1';
    const out = !e.canWin;
    const ver = isDrivers ? e.driverId === 'max_verstappen' : e.constructorId === 'red_bull';
    const badge = decided && i === 0 ? `<span class="champion">${t('KAMPIOEN', 'CHAMPION')}</span>` : '';
    return `
      <div class="row${out ? ' out' : ''}${ver ? ' ver' : ''}">
        <div class="code">${isDrivers ? label : String(i + 1)}</div>
        <div class="team">${isDrivers ? sub : label}${badge}</div>
        <div class="pct">${pct}%</div>
        <div class="detail">
          <div class="bar"><span style="width:${e.probability}%"></span></div>
          <div class="pts">${e.points} → ${e.projectedPoints} ${t('ptn verwacht', 'pts projected')}</div>
        </div>
      </div>`;
  }).join('');

  document.getElementById('footnote').textContent =
    t('Op basis van 10.000 simulaties van vorm en circuithistorie.',
      'Based on 10,000 simulations of form and circuit history.');
}

function onHomeyReady(Homey) {
  Homey.ready({ height: 260 });
  const { championship } = Homey.getSettings() || {};

  function load() {
    Homey.api('GET', '/prediction', {})
      .then(data => {
        render(data, championship);
        const height = document.body.scrollHeight;
        if (height > 0) Homey.setHeight(height);
      })
      .catch(() => {
        document.getElementById('rows').innerHTML =
          `<div class="error-msg">${t('Voorspelling kon niet geladen worden.', 'Could not load prediction.')}</div>`;
      });
  }

  load();
  setInterval(load, REFRESH_INTERVAL);
}
