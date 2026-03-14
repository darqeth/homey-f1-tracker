/* global Homey */

const LABELS_NL = {
  raceTime: 'Race',
  country: 'Land',
  city: 'Stad',
  circuit: 'Circuit',
  winner: 'Winnaar'
};

const LABELS_EN = {
  raceTime: 'Race',
  country: 'Country',
  city: 'City',
  circuit: 'Circuit',
  winner: 'Winner'
};

function t(lang, key) {
  const dict = (lang || '').startsWith('nl') ? LABELS_NL : LABELS_EN;
  return dict[key] || key;
}

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

function line(lang, k, v) {
  const row = el('div', 'line');
  row.appendChild(el('div', 'k', t(lang, k)));
  row.appendChild(el('div', 'v', v || ''));
  return row;
}

function filterRaces(all, settings) {
  const mode = settings.mode || 'all';
  if (mode === 'all') return all;

  if (mode === 'next') {
    const n = Math.max(1, Number(settings.nextCount || 8));
    const now = Date.now();
    const upcoming = all.filter(r => !r.finished && r.raceStartMs && r.raceStartMs >= now);
    return upcoming.slice(0, n);
  }

  if (mode === 'range') {
    const a = Number(settings.roundFrom || 1);
    const b = Number(settings.roundTo || 24);
    const lo = Math.min(a,b);
    const hi = Math.max(a,b);
    return all.filter(r => Number(r.round) >= lo && Number(r.round) <= hi);
  }

  return all;
}

async function load() {
  const settings = await Homey.getSettings();
  const fields = settings.showFields || [];
  const lang = Homey.getLanguage ? Homey.getLanguage() : 'nl';

  const all = await Homey.api('GET', '/races_list?includeWinner=1');
  const races = filterRaces(all || [], settings);

  const sub = document.getElementById('sub');
  sub.textContent = `${races.length} races`;

  const grid = document.getElementById('grid');
  grid.innerHTML = '';

  for (const r of races) {
    const item = el('div', 'item' + (r.finished ? ' finished' : ''));
    const top = el('div', 'top');
    top.appendChild(el('div', 'name', r.gpName || 'F1'));
    top.appendChild(el('div', 'round', `R${r.round}`));
    item.appendChild(top);

    for (const k of fields) {
      if (k === 'winner') {
        if (r.finished) {
          item.appendChild(line(lang, 'winner', r.winner || 'Uitslag nog niet beschikbaar'));
        }
        continue;
      }
      if (k in r) item.appendChild(line(lang, k, String(r[k] ?? '')));
    }

    grid.appendChild(item);
  }
}

let timer = null;

Homey.on('settings', load);

Homey.ready(async () => {
  await load();
  const settings = await Homey.getSettings();
  const refresh = Math.max(30, Number(settings.autoRefreshSeconds || 300));
  timer = setInterval(load, refresh * 1000);
});
