/* global Homey */

const LABELS_NL = {
  gpName: 'Grand Prix',
  raceTime: 'Race',
  country: 'Land',
  city: 'Stad',
  circuit: 'Circuit',
  fp1: 'VT1',
  fp2orSQ: 'VT2 of Sprint kwalificatie',
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
  fp2orSQ: 'FP2 or Sprint Qualifying',
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

async function apiGet(path) {
  try { return await Homey.api('GET', path); }
  catch (e1) {
    const alt = path.startsWith('/') ? path.slice(1) : `/${path}`;
    return await Homey.api('GET', alt);
  }
}

function setError(msg) {
  const root = document.getElementById('root');
  const title = document.getElementById('title');
  const status = document.getElementById('status');
  const content = document.getElementById('content');

  root.classList.remove('finished');
  title.textContent = 'F1';
  status.textContent = 'Geen data';
  content.innerHTML = '';
  content.appendChild(makeRow('Error', msg));
}

function fieldsFromSettings(s) {
  const fields = [];
  if (s.show_gpName) fields.push('gpName');
  if (s.show_raceTime) fields.push('raceTime');
  if (s.show_country) fields.push('country');
  if (s.show_city) fields.push('city');
  if (s.show_circuit) fields.push('circuit');
  if (s.show_fp1) fields.push('fp1');
  if (s.show_fp2orSQ) fields.push('fp2orSQ');
  if (s.show_fp3orSprint) fields.push('fp3orSprint');
  if (s.show_quali) fields.push('quali');
  if (s.show_winner) fields.push('winner');
  return fields;
}

let selectedRound = null;

async function loadRaces(defaultRound) {
  const races = await apiGet('/races_list');

  const sel = document.getElementById('raceSelect');
  sel.innerHTML = '';

  for (const r of (races || [])) {
    const opt = document.createElement('option');
    opt.value = String(r.round);
    opt.textContent = `R${r.round} • ${r.gpName}`;
    sel.appendChild(opt);
  }

  const exists = (races || []).some(r => String(r.round) === String(defaultRound));
  selectedRound = exists ? String(defaultRound) : (races?.[0]?.round ? String(races[0].round) : String(defaultRound));

  sel.value = selectedRound;
  sel.onchange = async () => {
    selectedRound = String(sel.value);
    await loadOverview();
  };
}

async function loadOverview() {
  const settings = await Homey.getSettings();
  const lang = Homey.getLanguage ? Homey.getLanguage() : 'nl';

  const round = selectedRound || String(settings.defaultRound || 1);
  const fields = fieldsFromSettings(settings);

  const res = await apiGet(`/race_overview?round=${encodeURIComponent(round)}&fields=${encodeURIComponent(fields.join(','))}`);

  const root = document.getElementById('root');
  const title = document.getElementById('title');
  const status = document.getElementById('status');
  const content = document.getElementById('content');

  content.innerHTML = '';
  title.textContent = `R${round} ${res.gpName || 'F1'}`;

  if (res.finished) {
    root.classList.add('finished');
    status.textContent = res.winner ? `Race afgelopen • ${res.winner}` : 'Race afgelopen • Uitslag nog niet beschikbaar';
  } else {
    root.classList.remove('finished');
    status.textContent = res.countdown || '';
  }

  for (const key of fields) {
    if (!(key in res)) continue;
    if (key === 'winner' && !settings.show_winner) continue;
    content.appendChild(makeRow(t(lang, key), String(res[key] ?? '')));
  }
}

let timer = null;

Homey.on('settings', async () => {
  try { await loadOverview(); }
  catch (e) { setError(String(e && e.message ? e.message : e)); }
});

Homey.ready(async () => {
  try {
    const settings = await Homey.getSettings();
    await loadRaces(settings.defaultRound || 1);
    await loadOverview();

    const refresh = Math.max(10, Number(settings.autoRefreshSeconds || 60));
    timer = setInterval(async () => {
      try { await loadOverview(); } catch (e) { setError(String(e && e.message ? e.message : e)); }
    }, refresh * 1000);
  } catch (e) {
    setError(String(e && e.message ? e.message : e));
  }
});
