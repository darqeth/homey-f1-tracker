/* global Homey */

const LABELS_NL = {
  gpName: 'Grand Prix',
  raceTime: 'Race',
  country: 'Land',
  city: 'Stad',
  circuit: 'Circuit',
  fp1: 'VT1',
  fp2orSQ: 'VT2 of SQ',
  fp3orSprint: 'VT3 of Sprint',
  quali: 'Kwalificatie',
  winner: 'Winnaar'
};

const LABELS_EN = {
  gpName: 'Grand Prix',
  raceTime: 'Race',
  country: 'Country',
  city: 'City',
  circuit: 'Circuit',
  fp1: 'FP1',
  fp2orSQ: 'FP2 or SQ',
  fp3orSprint: 'FP3 or Sprint',
  quali: 'Qualifying',
  winner: 'Winner'
};

function t(lang, key) {
  const dict = (lang || '').startsWith('nl') ? LABELS_NL : LABELS_EN;
  return dict[key] || key;
}

function makeRow(k, v) {
  const row = document.createElement('div');
  row.className = 'row';
  const kk = document.createElement('div');
  kk.className = 'k';
  kk.textContent = k;
  const vv = document.createElement('div');
  vv.className = 'v';
  vv.textContent = v || '';
  row.appendChild(kk);
  row.appendChild(vv);
  return row;
}

let racesCache = null;
let selectedRound = null;

async function loadRaces(defaultRound) {
  try {
    racesCache = await Homey.api('GET', '/races_list');
  } catch (e) {
    racesCache = [];
  }

  const sel = document.getElementById('raceSelect');
  sel.innerHTML = '';

  for (const r of (racesCache || [])) {
    const opt = document.createElement('option');
    opt.value = String(r.round);
    // Example: "R1 Bahrain GP" or "R1 • Bahrain GP"
    opt.textContent = `R${r.round} • ${r.gpName}`;
    sel.appendChild(opt);
  }

  const exists = (racesCache || []).some(r => String(r.round) === String(defaultRound));
  selectedRound = exists ? String(defaultRound) : (racesCache?.[0]?.round ? String(racesCache[0].round) : String(defaultRound));

  sel.value = selectedRound;
  sel.onchange = async () => {
    selectedRound = String(sel.value);
    await loadOverview();
  };
}

async function loadOverview() {
  const settings = await Homey.getSettings();
  const fields = settings.fields || [];
  const lang = Homey.getLanguage ? Homey.getLanguage() : 'nl';

  const round = selectedRound || String(settings.defaultRound || 1);

  const res = await Homey.api('GET', `/race_overview?round=${encodeURIComponent(round)}&fields=${encodeURIComponent(fields.join(','))}`);

  const root = document.getElementById('root');
  const title = document.getElementById('title');
  const status = document.getElementById('status');
  const content = document.getElementById('content');

  content.innerHTML = '';
  title.textContent = `R${round} ${res.gpName || 'F1'}`;

  if (res.finished) {
    root.classList.add('finished');
    if (res.winner) status.textContent = `Race afgelopen • ${res.winner}`;
    else status.textContent = 'Race afgelopen • Uitslag nog niet beschikbaar';
  } else {
    root.classList.remove('finished');
    status.textContent = res.countdown || '';
  }

  for (const key of fields) {
    if (!(key in res)) continue;
    content.appendChild(makeRow(t(lang, key), String(res[key] ?? '')));
  }
}

let timer = null;

Homey.on('settings', async () => {
  const settings = await Homey.getSettings();
  if (!selectedRound) selectedRound = String(settings.defaultRound || 1);
  await loadOverview();
});

Homey.ready(async () => {
  const settings = await Homey.getSettings();
  await loadRaces(settings.defaultRound || 1);
  await loadOverview();

  const refresh = Math.max(10, Number(settings.autoRefreshSeconds || 60));
  timer = setInterval(loadOverview, refresh * 1000);
});
