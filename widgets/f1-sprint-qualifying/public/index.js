'use strict';

const REFRESH_INTERVAL = 5 * 60 * 1000;

function renderEmpty(isNl, headerText, lines) {
  document.getElementById('header').textContent = headerText || '';
  document.getElementById('hero').style.display = 'none';
  document.getElementById('list').innerHTML =
    lines.map(l => `<div class="error-msg">${l}</div>`).join('');
}

function render(data) {
  // Use Homey's server-side language when available, fallback to browser language
  const isNl = (data?.lang || navigator.language || 'en').toLowerCase().startsWith('nl');
  const list = document.getElementById('list');

  // ── Between race weekends ──────────────────────────────────────────────────
  if (!data || data.state === 'between_races') {
    const gp   = data?.nextRaceName || '';
    const time = data?.nextQualiTime || '';
    const hdr  = isNl ? 'Geen actief race weekend' : 'No active race weekend';
    const line1 = isNl
      ? 'Sprint kwalificatieresultaten zijn beschikbaar tijdens een sprint race weekend.'
      : 'Sprint qualifying results are available during a sprint race weekend.';
    const line2 = gp && time
      ? (isNl ? `Volgende sprint kwalificatie: ${gp} — ${time}` : `Next sprint qualifying: ${gp} — ${time}`)
      : gp
        ? (isNl ? `Volgend race weekend: ${gp}` : `Next race weekend: ${gp}`)
        : '';
    renderEmpty(isNl, hdr, line2 ? [line1, line2] : [line1]);
    return;
  }

  // ── No sprint qualifying this weekend ──────────────────────────────────────
  if (data.state === 'no_sprint') {
    const gp  = data.raceName || data.nextRaceName || '';
    const hdr = isNl ? 'Geen sprint kwalificatie' : 'No sprint qualifying';
    const line = isNl
      ? `Dit weekend (${gp || 'huidig race weekend'}) heeft geen sprint kwalificatie.`
      : `This weekend (${gp || 'current race weekend'}) has no sprint qualifying.`;
    renderEmpty(isNl, hdr, [line]);
    return;
  }

  // ── No results yet ─────────────────────────────────────────────────────────
  if (data.state === 'no_results') {
    renderEmpty(isNl, '', [
      isNl ? 'Nog geen sprint kwalificatieresultaten beschikbaar.' : 'No sprint qualifying results available yet.',
    ]);
    return;
  }

  // Header: round + race name
  const round = data.round ? (isNl ? `Ronde ${data.round}` : `Round ${data.round}`) : '';
  document.getElementById('header').textContent =
    [round, data.raceName].filter(Boolean).join(' — ');

  if (!data.results || data.results.length === 0) {
    renderEmpty(isNl, '', [
      isNl ? 'Nog geen sprint kwalificatieresultaten beschikbaar.' : 'No sprint qualifying results available yet.',
    ]);
    return;
  }

  document.getElementById('hero').style.display = '';

  const top = data.results[0];
  const isVer = top.code === 'VER';

  // Hero
  const hero = document.getElementById('hero');
  hero.className = isVer ? 'ver-highlight' : '';

  document.getElementById('hero-pos-badge').textContent =
    isNl ? 'Sprint Pole Position' : 'Sprint Pole Position';
  document.getElementById('hero-firstname').textContent = top.firstName || '';
  document.getElementById('hero-lastname').textContent = (top.lastName || top.name).toUpperCase();
  document.getElementById('hero-team').textContent = top.constructor || '';
  document.getElementById('hero-time').textContent = top.bestLap || '';
  document.getElementById('hero-num-fallback').textContent = top.code || '';

  const img = document.getElementById('hero-photo');
  if (top.photo) {
    img.src = top.photo;
    img.classList.remove('hidden');
    img.onerror = () => img.classList.add('hidden');
  } else {
    img.classList.add('hidden');
  }

  // List
  list.innerHTML = '';
  const podiumClass = ['top1', 'top2', 'top3'];
  const badgeClass  = ['gold', 'silver', 'bronze'];

  for (const entry of data.results) {
    const pos = Number(entry.position);
    const isPodium = pos <= 3;
    const isVerRow = entry.code === 'VER';

    const row = document.createElement('div');
    row.className = 'result-row'
      + (isPodium ? ' ' + podiumClass[pos - 1] : '')
      + (isVerRow ? ' ver-highlight' : '');

    const badgeCls = isPodium ? badgeClass[pos - 1] : 'normal';

    row.innerHTML =
      `<span class="pos-badge ${badgeCls}">${pos}</span>` +
      `<span class="driver-code">${entry.code}</span>` +
      `<span class="constructor-name">${entry.constructor || ''}</span>` +
      `<span class="lap-time">${entry.bestLap || ''}</span>`;

    list.appendChild(row);
  }
}

function onHomeyReady(Homey) {
  Homey.ready({ height: 200 });

  function load() {
    Homey.api('GET', '/sprint-qualifying', {})
      .then(data => {
        render(data);
        const h = document.body.scrollHeight;
        if (h > 0) Homey.setHeight(h);
      })
      .catch(() => {
        const isNl = (navigator.language || 'en').toLowerCase().startsWith('nl');
        renderEmpty(isNl, '', [isNl ? 'Resultaten konden niet geladen worden.' : 'Could not load results.']);
      });
  }

  load();
  setInterval(load, REFRESH_INTERVAL);
}
