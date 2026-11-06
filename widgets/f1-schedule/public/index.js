'use strict';

const SESSION_DURATION = {
  fp1:          60 * 60 * 1000,
  fp2:          60 * 60 * 1000,
  fp3:          60 * 60 * 1000,
  sprint_quali: 60 * 60 * 1000,
  sprint:       60 * 60 * 1000,
  qualifying:   60 * 60 * 1000,
  race:          3 * 60 * 60 * 1000,
};

// Country name → ISO 3166-1 alpha-2 for flag emoji
const COUNTRY_FLAG = {
  'Australia': 'AU', 'Bahrain': 'BH', 'Saudi Arabia': 'SA', 'Japan': 'JP',
  'China': 'CN', 'United States': 'US', 'Italy': 'IT', 'Monaco': 'MC',
  'Canada': 'CA', 'United Kingdom': 'GB', 'Spain': 'ES', 'Hungary': 'HU',
  'Belgium': 'BE', 'Netherlands': 'NL', 'Azerbaijan': 'AZ', 'Singapore': 'SG',
  'Mexico': 'MX', 'Brazil': 'BR', 'Qatar': 'QA', 'UAE': 'AE',
  'Abu Dhabi': 'AE', 'Austria': 'AT', 'France': 'FR', 'Germany': 'DE',
  'Portugal': 'PT', 'Turkey': 'TR', 'Russia': 'RU',
};

// Short display names for countries
const COUNTRY_SHORT = {
  'United States': 'USA', 'United Kingdom': 'UK', 'Saudi Arabia': 'Saudi Arabia',
  'UAE': 'Abu Dhabi',
};

function flagEmoji(country) {
  const code = COUNTRY_FLAG[country];
  if (!code) return '';
  return [...code].map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))).join('');
}

function renderCircuit(circuitId, isDutch) {
  const container = document.getElementById('circuit-container');
  const circuit = CIRCUITS[circuitId];
  if (!container || !circuit) return;

  const color = isDutch ? '#ff8700' : '#e10600';
  container.innerHTML =
    `<svg id="circuit-svg" viewBox="0 0 ${circuit.w} ${circuit.h}">` +
    `<path d="${circuit.d}" fill="none" stroke="${color}" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function renderSchedule(data) {
  const userLang = (navigator.language || 'en').toLowerCase();
  const isNl  = userLang.startsWith('nl');

  if (!data) {
    document.getElementById('sessions-grid').innerHTML =
      `<div class="error-msg" style="grid-column:1/-1">${isNl ? 'Geen aankomende race gevonden.' : 'No upcoming race found.'}</div>`;
    return;
  }
  const locale = isNl ? 'nl-NL' : 'en-GB';
  const now    = Date.now();

  // Flag + country
  document.getElementById('flag').textContent = flagEmoji(data.country);
  document.getElementById('round-label').textContent = (isNl ? 'Ronde ' : 'Round ') + data.round;
  document.getElementById('round-label').classList.toggle('dutch', !!data.isDutch);
  document.getElementById('country-name').textContent =
    COUNTRY_SHORT[data.country] || data.country;
  document.getElementById('race-name').textContent = data.raceName;
  document.getElementById('circuit-name').textContent = data.circuitName;

  // Date range: first session → race
  if (data.sessions.length) {
    const first = new Date(data.sessions[0].isoDate);
    const last  = new Date(data.sessions[data.sessions.length - 1].isoDate);
    const fmtDay = d => d.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
    document.getElementById('race-dates').textContent =
      first.toLocaleDateString(locale, { day: '2-digit' }) + ' - ' + fmtDay(last);
  }

  renderCircuit(data.circuitId, data.isDutch);

  // Sessions grid
  const grid = document.getElementById('sessions-grid');
  grid.innerHTML = '';

  // Find next session
  let nextIdx = -1;
  for (let i = 0; i < data.sessions.length; i++) {
    const end = new Date(data.sessions[i].isoDate).getTime() + (SESSION_DURATION[data.sessions[i].type] || 3600000);
    if (now < end) { nextIdx = i; break; }
  }

  for (let i = 0; i < data.sessions.length; i++) {
    const s       = data.sessions[i];
    const startMs = new Date(s.isoDate).getTime();
    const endMs   = startMs + (SESSION_DURATION[s.type] || 3600000);

    const isPast  = now >= endMs;
    const isLive  = now >= startMs && now < endMs;
    const isNext  = !isPast && !isLive && i === nextIdx;

    const item = document.createElement('div');
    item.className = 'session-item' +
      (isPast ? ' past' : isLive ? ' live' : isNext ? ' next' : '');

    const startDt = new Date(s.isoDate);
    const endDt   = new Date(endMs);
    const dayNum  = startDt.toLocaleDateString(locale, { day: '2-digit' });
    const dayAbbr = startDt.toLocaleDateString(locale, { weekday: 'short' }).toUpperCase().slice(0, 3);
    const tStart  = startDt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const tEnd    = endDt.toLocaleTimeString(locale,   { hour: '2-digit', minute: '2-digit' });

    item.innerHTML =
      `<span class="session-day-num">${dayNum}</span>` +
      `<span class="session-label${s.type === 'race' ? ' type-race' : ''}">${s.label}</span>` +
      `<span class="session-time-row">${dayAbbr} ${tStart} - ${tEnd}</span>`;

    grid.appendChild(item);
  }
}

function onHomeyReady(Homey) {
  // Call ready immediately so Homey never shows a permanent blank widget
  // while waiting for the API (which may need to fetch live F1 data first).
  Homey.ready({ height: 200 });

  function load() {
    Homey.api('GET', '/schedule', {})
      .then(data => {
        renderSchedule(data);
        setTimeout(() => {
          const height = document.body.scrollHeight;
          if (height > 0) Homey.setHeight(height);
        }, 300);
      })
      .catch(() => {
        const isNl = (navigator.language || 'en').toLowerCase().startsWith('nl');
        document.getElementById('sessions-grid').innerHTML =
          `<div class="error-msg" style="grid-column:1/-1">${isNl ? 'Schema kon niet geladen worden.' : 'Could not load schedule.'}</div>`;
      });
  }

  load();
  setInterval(load, 60 * 1000);
}
