'use strict';

const https = require('https');

class F1Api {
  constructor(homey, time) {
    this.homey = homey;
    this.time = time;

    this.base = 'https://api.jolpi.ca/ergast/f1/';
    this.cache = { races: null, fetchedAt: 0 };

    // Winner cache: { "<season>:<round>": { winner: string, fetchedAt: ms } }
    this.winnerCache = {};
  }

  getSeasonSetting() {
    return this.homey.settings.get('season') || 'current';
  }

  getCacheHours() {
    return Number(this.homey.settings.get('schedule_cache_hours') || 6);
  }

  async fetchJson(url) {
    return new Promise((resolve, reject) => {
      https.get(url, { headers: { 'User-Agent': 'Homey-F1-Tracker' } }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(e); }
        });
      }).on('error', reject);
    });
  }

  async getSeasonRaces() {
    const maxAgeMs = this.getCacheHours() * 3600 * 1000;
    if (this.cache.races && (Date.now() - this.cache.fetchedAt) < maxAgeMs) return this.cache.races;

    const season = this.getSeasonSetting();
    const url = `${this.base}${season}/races.json`;

    const json = await this.fetchJson(url);
    const races = json?.MRData?.RaceTable?.Races || [];

    this.cache.races = races;
    this.cache.fetchedAt = Date.now();
    return races;
  }

  async forceRefresh() {
    this.cache.races = null;
    this.cache.fetchedAt = 0;
    return this.getSeasonRaces();
  }

  async getRaceByRound(round) {
    const races = await this.getSeasonRaces();
    return races.find(r => String(r.round) === String(round));
  }

  async getNextRace() {
    const races = await this.getSeasonRaces();
    const now = Date.now();
    const future = races
      .map(r => ({ race: r, dt: this.time.parseRaceDateTime(r) }))
      .filter(x => x.dt && x.dt.getTime() >= now)
      .sort((a, b) => a.dt.getTime() - b.dt.getTime());
    return future[0]?.race || null;
  }

  async getWinnerForRound(round) {
    const season = this.getSeasonSetting();
    const key = `${season}:${round}`;
    const ttlMs = 6 * 3600 * 1000;

    const cached = this.winnerCache[key];
    if (cached && (Date.now() - cached.fetchedAt) < ttlMs) return cached.winner;

    const url = `${this.base}${season}/${round}/results/1.json`;

    try {
      const json = await this.fetchJson(url);
      const race = json?.MRData?.RaceTable?.Races?.[0];
      const winner = race?.Results?.[0]?.Driver;
      const name = winner ? `${winner.givenName || ''} ${winner.familyName || ''}`.trim() : '';
      this.winnerCache[key] = { winner: name, fetchedAt: Date.now() };
      return name;
    } catch (e) {
      this.winnerCache[key] = { winner: '', fetchedAt: Date.now() };
      return '';
    }
  }

  getSessionsForUpcoming(races) {
    const now = Date.now();
    const out = [];

    for (const race of races) {
      const add = (type, dt) => {
        if (!dt) return;
        if (dt.getTime() < now) return;
        out.push({ type, date: dt, round: race.round, raceName: race.raceName, race });
      };

      add('Qualifying', this.time.parseSessionDateTime(race.Qualifying));
      add('Race', this.time.parseRaceDateTime(race));
      add('Sprint', this.time.parseSessionDateTime(race.Sprint));
      add('SprintQualifying', this.time.parseSessionDateTime(race.SprintQualifying));
    }

    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
  }
}

module.exports = F1Api;
