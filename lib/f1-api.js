'use strict';

const https = require('https');

class F1Api {
  constructor(homey, time) {
    this.homey = homey;
    this.time = time;

    this.base = 'https://api.jolpi.ca/ergast/f1/';
    this.cache = { races: null, fetchedAt: 0 };

    // Winner cache: { "<season>:<round>": { data: {name, constructor}, fetchedAt: ms } }
    this.winnerCache = {};

    // Standings cache (1h TTL)
    this.standingsCache = { drivers: null, constructors: null, fetchedAt: 0 };

    // All season winners cache (6h TTL) — Map<round, { name, code, constructor }>
    this.winnersAllCache = null;

    // All season sprint winners cache (6h TTL) — Map<round, { name, code, constructor }>
    this.sprintWinnersAllCache = null;

    // Top 3 finishers cache (6h TTL) — Map<round, [{name, code, constructor}, ...]>
    this.topFinishersAllCache = null;

    // Per-season override caches (for widget season selector) — Map<season, {data, fetchedAt}>
    this.racesOverrideCache = new Map();
    this.winnersOverrideCache = new Map();
    this.sprintWinnersOverrideCache = new Map();
    this.topFinishersOverrideCache = new Map();
  }

  getSeasonSetting() {
    return this.homey.settings.get('season') || 'current';
  }

  getCacheHours() {
    return Number(this.homey.settings.get('schedule_cache_hours') || 6);
  }

  async fetchJson(url) {
    return new Promise((resolve, reject) => {
      https.get(url, { headers: { 'User-Agent': 'Homey-F1-Tracker-Pro' } }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(e); }
        });
      }).on('error', reject);
    });
  }

  async getSeasonRaces(overrideSeason) {
    if (overrideSeason) {
      const cached = this.racesOverrideCache.get(overrideSeason);
      if (cached && (Date.now() - cached.fetchedAt) < 3600 * 1000) return cached.races;
      const json = await this.fetchJson(`${this.base}${overrideSeason}/races.json`);
      const races = json?.MRData?.RaceTable?.Races || [];
      this.racesOverrideCache.set(overrideSeason, { races, fetchedAt: Date.now() });
      return races;
    }

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
    this.standingsCache = { drivers: null, constructors: null, fetchedAt: 0 };
    this.winnersAllCache = null;
    this.sprintWinnersAllCache = null;
    this.topFinishersAllCache = null;
    this.winnersOverrideCache.clear();
    this.sprintWinnersOverrideCache.clear();
    this.topFinishersOverrideCache.clear();
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

  // Returns { name: string, constructor: string } for the race winner.
  async getWinnerForRound(round) {
    const season = this.getSeasonSetting();
    const key = `${season}:${round}`;
    const ttlMs = 6 * 3600 * 1000;

    const cached = this.winnerCache[key];
    if (cached && (Date.now() - cached.fetchedAt) < ttlMs) return cached.data;

    const url = `${this.base}${season}/${round}/results/1.json`;

    try {
      const json = await this.fetchJson(url);
      const race = json?.MRData?.RaceTable?.Races?.[0];
      const result = race?.Results?.[0];
      const driver = result?.Driver;
      const constructor = result?.Constructor;
      const name = driver ? `${driver.givenName || ''} ${driver.familyName || ''}`.trim() : '';
      const constructorName = constructor?.name || '';
      const data = { name, constructor: constructorName };
      this.winnerCache[key] = { data, fetchedAt: Date.now() };
      return data;
    } catch (e) {
      const data = { name: '', constructor: '' };
      this.winnerCache[key] = { data, fetchedAt: Date.now() };
      return data;
    }
  }

  async getDriverStandings() {
    const ttlMs = 3600 * 1000;
    if (this.standingsCache.drivers && (Date.now() - this.standingsCache.fetchedAt) < ttlMs) {
      return this.standingsCache.drivers;
    }

    const url = `${this.base}current/driverStandings.json`;
    try {
      const json = await this.fetchJson(url);
      const list = json?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || [];
      const standings = list.map(s => ({
        position: s.position,
        name: `${s.Driver?.givenName || ''} ${s.Driver?.familyName || ''}`.trim(),
        code: s.Driver?.code || s.Driver?.familyName?.substring(0, 3).toUpperCase() || '',
        points: s.points || '0',
        constructor: s.Constructors?.[0]?.name || '',
      }));
      this.standingsCache.drivers = standings;
      this.standingsCache.fetchedAt = Date.now();
      return standings;
    } catch (e) {
      return [];
    }
  }

  async getConstructorStandings() {
    const ttlMs = 3600 * 1000;
    if (this.standingsCache.constructors && (Date.now() - this.standingsCache.fetchedAt) < ttlMs) {
      return this.standingsCache.constructors;
    }

    const url = `${this.base}current/constructorStandings.json`;
    try {
      const json = await this.fetchJson(url);
      const list = json?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings || [];
      const standings = list.map(s => ({
        position: s.position,
        name: s.Constructor?.name || '',
        points: s.points || '0',
      }));
      this.standingsCache.constructors = standings;
      this.standingsCache.fetchedAt = Date.now();
      return standings;
    } catch (e) {
      return [];
    }
  }

  // Returns a Map<round, { name, code, constructor }> for all race winners this season.
  // Uses a single API call instead of one per round — much faster for the widget.
  async getSeasonWinners(overrideSeason) {
    const ttlMs = 6 * 3600 * 1000;
    if (overrideSeason) {
      const cached = this.winnersOverrideCache.get(overrideSeason);
      if (cached && (Date.now() - cached.fetchedAt) < ttlMs) return cached.data;
    } else if (this.winnersAllCache && (Date.now() - this.winnersAllCache.fetchedAt) < ttlMs) {
      return this.winnersAllCache.data;
    }

    const season = overrideSeason || this.getSeasonSetting();
    const url = `${this.base}${season}/results/1.json?limit=30`;
    try {
      const json = await this.fetchJson(url);
      const races = json?.MRData?.RaceTable?.Races || [];
      const winners = new Map();
      for (const race of races) {
        const result = race.Results?.[0];
        const driver = result?.Driver;
        if (driver) {
          winners.set(String(race.round), {
            name: `${driver.givenName || ''} ${driver.familyName || ''}`.trim(),
            code: driver.code || driver.familyName?.substring(0, 3).toUpperCase() || '',
            constructor: result.Constructor?.name || '',
          });
        }
      }
      if (overrideSeason) {
        this.winnersOverrideCache.set(overrideSeason, { data: winners, fetchedAt: Date.now() });
      } else {
        this.winnersAllCache = { data: winners, fetchedAt: Date.now() };
      }
      return winners;
    } catch (e) {
      return new Map();
    }
  }

  // Returns a Map<round, [{name,code,constructor}, ...]> for top 3 finishers per race (positions 1–3).
  async getSeasonTopFinishers(overrideSeason) {
    const ttlMs = 6 * 3600 * 1000;
    if (overrideSeason) {
      const cached = this.topFinishersOverrideCache.get(overrideSeason);
      if (cached && (Date.now() - cached.fetchedAt) < ttlMs) return cached.data;
    } else if (this.topFinishersAllCache && (Date.now() - this.topFinishersAllCache.fetchedAt) < ttlMs) {
      return this.topFinishersAllCache.data;
    }

    const season = overrideSeason || this.getSeasonSetting();
    try {
      const [r1, r2, r3] = await Promise.all([
        this.fetchJson(`${this.base}${season}/results/1.json?limit=30`),
        this.fetchJson(`${this.base}${season}/results/2.json?limit=30`),
        this.fetchJson(`${this.base}${season}/results/3.json?limit=30`),
      ]);

      const map = new Map();
      const extract = (json, pos) => {
        const races = json?.MRData?.RaceTable?.Races || [];
        for (const race of races) {
          const result = race.Results?.[0];
          const driver = result?.Driver;
          if (driver) {
            const round = String(race.round);
            if (!map.has(round)) map.set(round, [null, null, null]);
            map.get(round)[pos - 1] = {
              name: `${driver.givenName || ''} ${driver.familyName || ''}`.trim(),
              code: driver.code || driver.familyName?.substring(0, 3).toUpperCase() || '',
              constructor: result.Constructor?.name || '',
            };
          }
        }
      };
      extract(r1, 1);
      extract(r2, 2);
      extract(r3, 3);

      if (overrideSeason) {
        this.topFinishersOverrideCache.set(overrideSeason, { data: map, fetchedAt: Date.now() });
      } else {
        this.topFinishersAllCache = { data: map, fetchedAt: Date.now() };
      }
      return map;
    } catch (e) {
      return new Map();
    }
  }

  // Returns a Map<round, { name, code, constructor }> for all sprint winners this season.
  async getSeasonSprintWinners(overrideSeason) {
    const ttlMs = 6 * 3600 * 1000;
    if (overrideSeason) {
      const cached = this.sprintWinnersOverrideCache.get(overrideSeason);
      if (cached && (Date.now() - cached.fetchedAt) < ttlMs) return cached.data;
    } else if (this.sprintWinnersAllCache && (Date.now() - this.sprintWinnersAllCache.fetchedAt) < ttlMs) {
      return this.sprintWinnersAllCache.data;
    }

    const season = overrideSeason || this.getSeasonSetting();
    const url = `${this.base}${season}/sprint.json?limit=30`;
    try {
      const json = await this.fetchJson(url);
      const races = json?.MRData?.RaceTable?.Races || [];
      const winners = new Map();
      for (const race of races) {
        const result = race.SprintResults?.[0];
        const driver = result?.Driver;
        if (driver) {
          winners.set(String(race.round), {
            name: `${driver.givenName || ''} ${driver.familyName || ''}`.trim(),
            code: driver.code || driver.familyName?.substring(0, 3).toUpperCase() || '',
            constructor: result.Constructor?.name || '',
          });
        }
      }
      if (overrideSeason) {
        this.sprintWinnersOverrideCache.set(overrideSeason, { data: winners, fetchedAt: Date.now() });
      } else {
        this.sprintWinnersAllCache = { data: winners, fetchedAt: Date.now() };
      }
      return winners;
    } catch (e) {
      return new Map();
    }
  }

  // Returns upcoming sessions (future only), including practice sessions.
  getSessionsForUpcoming(races) {
    const now = Date.now();
    const out = [];

    for (const race of races) {
      const add = (type, dt) => {
        if (!dt || dt.getTime() < now) return;
        out.push({ type, date: dt, round: race.round, raceName: race.raceName, race });
      };

      add('FirstPractice',   this.time.parseSessionDateTime(race.FirstPractice));
      add('SecondPractice',  this.time.parseSessionDateTime(race.SecondPractice));
      add('ThirdPractice',   this.time.parseSessionDateTime(race.ThirdPractice));
      add('Qualifying',      this.time.parseSessionDateTime(race.Qualifying));
      add('Sprint',          this.time.parseSessionDateTime(race.Sprint));
      add('SprintQualifying', this.time.parseSessionDateTime(race.SprintQualifying));
      add('Race',            this.time.parseRaceDateTime(race));
    }

    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  // Returns ALL sessions for all races (including past), used for has_session_today condition.
  getAllSessionsForRaces(races) {
    const out = [];

    for (const race of races) {
      const add = (type, dt) => {
        if (!dt) return;
        out.push({ type, date: dt, round: race.round, raceName: race.raceName, race });
      };

      add('FirstPractice',   this.time.parseSessionDateTime(race.FirstPractice));
      add('SecondPractice',  this.time.parseSessionDateTime(race.SecondPractice));
      add('ThirdPractice',   this.time.parseSessionDateTime(race.ThirdPractice));
      add('Qualifying',      this.time.parseSessionDateTime(race.Qualifying));
      add('Sprint',          this.time.parseSessionDateTime(race.Sprint));
      add('SprintQualifying', this.time.parseSessionDateTime(race.SprintQualifying));
      add('Race',            this.time.parseRaceDateTime(race));
    }

    return out;
  }
}

module.exports = F1Api;
