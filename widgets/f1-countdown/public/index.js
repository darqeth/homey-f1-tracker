'use strict';

// ─── Flip digit ─────────────────────────────────────────────────────────────

class FlipDigit {
  constructor(el) {
    el.innerHTML =
      '<div class="s-top"><span></span></div>' +
      '<div class="s-bot"><span></span></div>' +
      '<div class="a-top"><span></span></div>' +
      '<div class="a-bot"><span></span></div>';

    this._sTop     = el.querySelector('.s-top span');
    this._sBot     = el.querySelector('.s-bot span');
    this._aTop     = el.querySelector('.a-top');
    this._aTopSpan = this._aTop.querySelector('span');
    this._aBot     = el.querySelector('.a-bot');
    this._aBotSpan = this._aBot.querySelector('span');
    this._cur      = null;
  }

  update(val) {
    const v = String(val);
    if (v === this._cur) return;
    const prev = this._cur;
    this._cur = v;

    if (prev === null) {
      // First render — no animation
      this._sTop.textContent = v;
      this._sBot.textContent = v;
      this._aTopSpan.textContent = v;
      this._aBotSpan.textContent = v;
      return;
    }

    // s-top shows new value immediately (a-top covers it with old value while flipping away)
    // s-bot keeps old value until a-bot finishes flipping in
    this._sTop.textContent = v;
    this._aTopSpan.textContent = prev; // a-top covers s-top, shows OLD, flips away
    this._sBot.textContent = prev;     // s-bot still shows OLD
    this._aBotSpan.textContent = v;    // a-bot shows NEW and flips in

    // Reset, then trigger
    this._aTop.style.animation = 'none';
    this._aBot.style.animation = 'none';
    void this._aTop.offsetWidth; // reflow

    this._aTop.style.animation = 'flipTop 0.15s linear forwards';
    this._aBot.style.animation = 'flipBot 0.15s linear 0.15s both';

    // After a-bot finishes, sync static bottom
    setTimeout(() => { this._sBot.textContent = v; }, 600);
  }
}

// ─── State ───────────────────────────────────────────────────────────────────

let targetMs  = null;
let digits    = {};
let tickTimer = null;

// ─── Init ────────────────────────────────────────────────────────────────────

function initDigits() {
  ['d0','d1','h0','h1','m0','m1','s0','s1'].forEach(id => {
    digits[id] = new FlipDigit(document.getElementById(id));
    digits[id].update('0');
  });
}

// ─── Tick ────────────────────────────────────────────────────────────────────

function tick() {
  const clock = document.getElementById('clock');
  if (!targetMs) return;

  const now = Date.now();
  let sec = Math.max(0, Math.floor((targetMs - now) / 1000));

  const isLive = sec === 0;
  clock.classList.toggle('live', isLive);

  const d = Math.floor(sec / 86400); sec %= 86400;
  const h = Math.floor(sec / 3600);  sec %= 3600;
  const m = Math.floor(sec / 60);    sec %= 60;
  const s = sec;

  const lbl = document.getElementById('lbl-d');
  const userLang = (navigator.language || 'en').toLowerCase();
  if (lbl) lbl.textContent = userLang.startsWith('nl') ? 'DAGEN' : 'DAYS';

  const pad = n => String(n).padStart(2, '0');
  const dd = pad(d), hh = pad(h), mm = pad(m), ss = pad(s);

  digits.d0.update(dd[0]); digits.d1.update(dd[1]);
  digits.h0.update(hh[0]); digits.h1.update(hh[1]);
  digits.m0.update(mm[0]); digits.m1.update(mm[1]);
  digits.s0.update(ss[0]); digits.s1.update(ss[1]);
}

// ─── Load data ───────────────────────────────────────────────────────────────

function onHomeyReady(Homey) {
  let readyCalled = false;

  initDigits();
  tickTimer = setInterval(tick, 1000);

  function load() {
    Homey.api('GET', '/countdown', {})
      .then(data => {
        if (!data) {
          document.getElementById('race-name').textContent =
            navigator.language.startsWith('nl') ? 'Geen race meer dit seizoen' : 'No upcoming race';
          document.getElementById('race-date').textContent = '';
          targetMs = null;
        } else {
          const userLang = (navigator.language || 'en').toLowerCase();
          const locale   = userLang.startsWith('nl') ? 'nl-NL' : 'en-GB';

          const gpName = data.raceName
            .replace(' Grand Prix', ' GP')
            .replace('Grand Prix', 'GP');
          document.getElementById('race-name').textContent = gpName;

          const dt = new Date(data.date);
          document.getElementById('race-date').textContent =
            dt.toLocaleDateString(locale, { day: 'numeric', month: 'long' });

          const badge = document.getElementById('round-badge');
          badge.textContent = 'Race - ' + data.round;
          badge.classList.add('visible');

          targetMs = dt.getTime();
          tick(); // immediate update
        }

        const height = document.body.scrollHeight;
        if (!readyCalled) {
          Homey.ready({ height });
          readyCalled = true;
        } else {
          Homey.setHeight(height);
        }
      })
      .catch(() => {
        document.getElementById('race-name').textContent = 'Check app connection';
        if (!readyCalled) {
          Homey.ready({ height: 120 });
          readyCalled = true;
        }
      });
  }

  load();
  setInterval(load, 5 * 60 * 1000);
}
