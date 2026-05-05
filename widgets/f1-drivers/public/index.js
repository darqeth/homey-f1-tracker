'use strict';

const REFRESH_INTERVAL = 5 * 60 * 1000;

// Mapping driverId (Ergast) → F1 media CDN path segment
const DRIVER_PHOTO = {
  russell:          'R/GRUSSELL_George_Russell/grussell',
  max_verstappen:   'V/MVERSTAPPEN_Max_Verstappen/mverstappen',
  hamilton:         'H/LHAMILTON_Lewis_Hamilton/lhamilton',
  leclerc:          'L/CLECLERC_Charles_Leclerc/cleclerc',
  norris:           'N/LNORRIS_Lando_Norris/lnorris',
  piastri:          'P/OPIASTRI_Oscar_Piastri/opiastri',
  sainz:            'S/CSAINZ_Carlos_Sainz/csainz',
  alonso:           'A/FALONSO_Fernando_Alonso/falonso',
  stroll:           'S/LSTROLL_Lance_Stroll/lstroll',
  gasly:            'G/PGASLY_Pierre_Gasly/pgasly',
  ocon:             'O/EOCON_Esteban_Ocon/eocon',
  albon:            'A/AALBON_Alexander_Albon/aalbon',
  bottas:           'B/VBOTTAS_Valtteri_Bottas/vbottas',
  zhou:             'Z/GZHOU_Guanyu_Zhou/gzhou',
  hulkenberg:       'H/NHULKENBERG_Nico_Hulkenberg/nhulkenberg',
  kevin_magnussen:  'M/KMAGNUSSEN_Kevin_Magnussen/kmagnussen',
  tsunoda:          'T/YTSUNODA_Yuki_Tsunoda/ytsunoda',
  ricciardo:        'R/DRICCIARDO_Daniel_Ricciardo/dricciardo',
  lawson:           'L/LLAWSON_Liam_Lawson/llawson',
  bearman:          'B/OBEARMAN_Oliver_Bearman/obearman',
  colapinto:        'C/FCOLAPINTO_Franco_Colapinto/fcolapinto',
  doohan:           'D/JDOOHAN_Jack_Doohan/jdoohan',
  bortoleto:        'B/GBORTOLETO_Gabriel_Bortoleto/gbortoleto',
  hadjar:           'H/ISHADJAR_Isack_Hadjar/ishadjar',
  antonelli:        'A/AANTONELLI_Kimi_Antonelli/aantonelli',
};

const PHOTO_BASE = 'https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/';

function driverPhotoUrl(driverId) {
  const path = DRIVER_PHOTO[driverId];
  return path ? PHOTO_BASE + path + '.png.transform/1col/image.png' : null;
}

function renderStandings(standings) {
  const isNl = (navigator.language || 'en').toLowerCase().startsWith('nl');

  if (!standings || standings.length === 0) {
    document.getElementById('list').innerHTML =
      `<div class="error-msg">${isNl ? 'Nog geen standen beschikbaar.' : 'No standings available yet.'}</div>`;
    return;
  }

  const top = standings[0];
  const isVer = top.name.includes('Verstappen');

  // ── Hero ──
  const hero = document.getElementById('hero');
  hero.className = isVer ? 'ver-highlight' : '';

  document.getElementById('hero-pos-badge').textContent =
    isNl ? 'Kampioenschapsleider' : 'Championship Leader';
  document.getElementById('hero-firstname').textContent = top.firstName || '';
  document.getElementById('hero-lastname').textContent = (top.lastName || top.name).toUpperCase();
  document.getElementById('hero-team').textContent = top.constructor || '';
  document.getElementById('hero-pts').textContent = top.points;
  document.getElementById('hero-wins').textContent = top.wins || '0';
  document.getElementById('hero-podiums').textContent = top.podiums || '0';
  document.getElementById('hero-poles').textContent = top.poles || '0';
  document.getElementById('hero-num-fallback').textContent = top.permanentNumber || top.code || '';

  const img = document.getElementById('hero-photo');
  if (top.photo) {
    img.src = top.photo;
    img.classList.remove('hidden');
    img.onerror = () => img.classList.add('hidden');
  } else {
    img.classList.add('hidden');
  }

  // ── List ──
  const list = document.getElementById('list');
  list.innerHTML = '';

  const podiumClass = ['top1', 'top2', 'top3'];
  const badgeClass  = ['gold', 'silver', 'bronze'];

  for (const entry of standings) {
    const pos      = Number(entry.position);
    const isPodium = pos <= 3;
    const isVerRow = entry.name.includes('Verstappen');

    const row = document.createElement('div');
    row.className = 'standing-row'
      + (isPodium ? ' ' + podiumClass[pos - 1] : '')
      + (isVerRow ? ' ver-highlight' : '');

    const badgeCls = isPodium ? badgeClass[pos - 1] : 'normal';

    row.innerHTML =
      `<span class="pos-badge ${badgeCls}">${pos}</span>` +
      `<div class="driver-info">` +
        `<span class="driver-name">${entry.name}</span>` +
        `<span class="constructor-name">${entry.constructor || ''}</span>` +
      `</div>` +
      `<div class="points-wrap">` +
        `<span class="points">${entry.points}</span>` +
        `<span class="pts-label">pts</span>` +
      `</div>`;

    list.appendChild(row);
  }
}

function onHomeyReady(Homey) {
  Homey.ready({ height: 400 });

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
