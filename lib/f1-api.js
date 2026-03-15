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

  // Official F1 driver headshot paths (verified 2026 grid via OpenF1)
  static driverPhotoUrl(driverId) {
    const PATHS = {
      russell:         'G/GEORUS01_George_Russell/georus01',
      max_verstappen:  'M/MAXVER01_Max_Verstappen/maxver01',
      hamilton:        'L/LEWHAM01_Lewis_Hamilton/lewham01',
      leclerc:         'C/CHALEC01_Charles_Leclerc/chalec01',
      norris:          'L/LANNOR01_Lando_Norris/lannor01',
      piastri:         'O/OSCPIA01_Oscar_Piastri/oscpia01',
      sainz:           'C/CARSAI01_Carlos_Sainz/carsai01',
      alonso:          'F/FERALO01_Fernando_Alonso/feralo01',
      stroll:          'L/LANSTR01_Lance_Stroll/lanstr01',
      gasly:           'P/PIEGAS01_Pierre_Gasly/piegas01',
      ocon:            'E/ESTOCO01_Esteban_Ocon/estoco01',
      albon:           'A/ALEALB01_Alexander_Albon/alealb01',
      hulkenberg:      'N/NICHUL01_Nico_Hulkenberg/nichul01',
      bottas:          'V/VALBOT01_Valtteri_Bottas/valbot01',
      lawson:          'L/LIALAW01_Liam_Lawson/lialaw01',
      colapinto:       'F/FRACOL01_Franco_Colapinto/fracol01',
      antonelli:       'K/ANDANT01_Kimi_Antonelli/andant01',
      bortoleto:       'G/GABBOR01_Gabriel_Bortoleto/gabbor01',
      hadjar:          'I/ISAHAD01_Isack_Hadjar/isahad01',
      bearman:         'O/OLIBEA01_Oliver_Bearman/olibea01',
      tsunoda:         'Y/YUKTSU01_Yuki_Tsunoda/yuktsu01',
      perez:           'S/SERPER01_Sergio_Perez/serper01',
      lindblad:        'A/ARVLIN01_Arvid_Lindblad/arvlin01',
    };
    const path = PATHS[driverId];
    if (!path) return null;
    return `https://www.formula1.com/content/dam/fom-website/drivers/${path}.png.transform/2col/image.png`;
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
    this.clearResultCaches();
    return this.getSeasonRaces();
  }

  // Clears only result/standings caches (not the race schedule).
  // Called automatically after race_finished fires so widgets pick up fresh podium data.
  clearResultCaches() {
    this.standingsCache = { drivers: null, constructors: null, fetchedAt: 0 };
    this.winnersAllCache = null;
    this.sprintWinnersAllCache = null;
    this.topFinishersAllCache = null;
    this.winnerCache = {};
    this.winnersOverrideCache.clear();
    this.sprintWinnersOverrideCache.clear();
    this.topFinishersOverrideCache.clear();
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
      // Only cache when a winner is known — an empty name means results aren't published
      // yet. Not caching lets the next poll retry until the data is available.
      if (name) this.winnerCache[key] = { data, fetchedAt: Date.now() };
      return data;
    } catch (e) {
      // Don't cache errors so the next poll retries automatically.
      return { name: '', constructor: '' };
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
        firstName: s.Driver?.givenName || '',
        lastName: s.Driver?.familyName || '',
        code: s.Driver?.code || s.Driver?.familyName?.substring(0, 3).toUpperCase() || '',
        driverId: s.Driver?.driverId || '',
        permanentNumber: s.Driver?.permanentNumber || '',
        wikiUrl: s.Driver?.url || '',
        points: s.points || '0',
        wins: s.wins || '0',
        constructor: s.Constructors?.[0]?.name || '',
        constructorId: s.Constructors?.[0]?.constructorId || '',
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
        constructorId: s.Constructor?.constructorId || '',
        points: s.points || '0',
        wins: s.wins || '0',
      }));
      this.standingsCache.constructors = standings;
      this.standingsCache.fetchedAt = Date.now();
      return standings;
    } catch (e) {
      return [];
    }
  }

  // Returns Map<driverId, count> for poles (qualifying P1) this season
  async getSeasonPoles() {
    if (this._polesCache && (Date.now() - this._polesCacheAt) < 3600 * 1000) return this._polesCache;
    try {
      const json = await this.fetchJson(`${this.base}current/qualifying.json?limit=500`);
      const races = json?.MRData?.RaceTable?.Races || [];
      const map = new Map();
      for (const race of races) {
        const p1 = (race.QualifyingResults || []).find(r => r.position === '1');
        if (p1) map.set(p1.Driver.driverId, (map.get(p1.Driver.driverId) || 0) + 1);
      }
      this._polesCache = map;
      this._polesCacheAt = Date.now();
      return map;
    } catch { return new Map(); }
  }

  // Returns Map<driverId, count> for podiums (race top-3) this season
  async getSeasonPodiums() {
    if (this._podiumsCache && (Date.now() - this._podiumsCacheAt) < 3600 * 1000) return this._podiumsCache;
    try {
      const json = await this.fetchJson(`${this.base}current/results.json?limit=500`);
      const races = json?.MRData?.RaceTable?.Races || [];
      const map = new Map();
      for (const race of races) {
        for (const r of (race.Results || [])) {
          if (Number(r.position) <= 3) map.set(r.Driver.driverId, (map.get(r.Driver.driverId) || 0) + 1);
        }
      }
      this._podiumsCache = map;
      this._podiumsCacheAt = Date.now();
      return map;
    } catch { return new Map(); }
  }

  // Returns Map<constructorId, count> for constructor poles this season
  async getSeasonConstructorPoles() {
    const poles = await this.getSeasonPoles();
    const standings = await this.getDriverStandings();
    const map = new Map();
    for (const [driverId, count] of poles) {
      const driver = standings.find(s => s.driverId === driverId);
      if (driver?.constructorId) map.set(driver.constructorId, (map.get(driver.constructorId) || 0) + count);
    }
    return map;
  }

  // Returns Map<constructorId, count> for constructor podiums this season
  async getSeasonConstructorPodiums() {
    const podiums = await this.getSeasonPodiums();
    const standings = await this.getDriverStandings();
    const map = new Map();
    for (const [driverId, count] of podiums) {
      const driver = standings.find(s => s.driverId === driverId);
      if (driver?.constructorId) map.set(driver.constructorId, (map.get(driver.constructorId) || 0) + count);
    }
    return map;
  }

  // Returns a Map<round, { name, code, constructor }> for all race winners this season.
  // Uses a single API call instead of one per round — much faster for the widget.
  async getSeasonWinners(overrideSeason) {
    const ttlMs = 6 * 3600 * 1000;
    const emptyTtlMs = 5 * 60 * 1000; // retry after 5 min when no results yet
    if (overrideSeason) {
      const cached = this.winnersOverrideCache.get(overrideSeason);
      if (cached && (Date.now() - cached.fetchedAt) < (cached.data.size > 0 ? ttlMs : emptyTtlMs)) return cached.data;
    } else if (this.winnersAllCache && (Date.now() - this.winnersAllCache.fetchedAt) < (this.winnersAllCache.data.size > 0 ? ttlMs : emptyTtlMs)) {
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
    const emptyTtlMs = 5 * 60 * 1000; // retry after 5 min when no results yet
    if (overrideSeason) {
      const cached = this.topFinishersOverrideCache.get(overrideSeason);
      if (cached && (Date.now() - cached.fetchedAt) < (cached.data.size > 0 ? ttlMs : emptyTtlMs)) return cached.data;
    } else if (this.topFinishersAllCache && (Date.now() - this.topFinishersAllCache.fetchedAt) < (this.topFinishersAllCache.data.size > 0 ? ttlMs : emptyTtlMs)) {
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
    const emptyTtlMs = 5 * 60 * 1000; // retry after 5 min when no results yet
    if (overrideSeason) {
      const cached = this.sprintWinnersOverrideCache.get(overrideSeason);
      if (cached && (Date.now() - cached.fetchedAt) < (cached.data.size > 0 ? ttlMs : emptyTtlMs)) return cached.data;
    } else if (this.sprintWinnersAllCache && (Date.now() - this.sprintWinnersAllCache.fetchedAt) < (this.sprintWinnersAllCache.data.size > 0 ? ttlMs : emptyTtlMs)) {
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

  // Returns upcoming sessions, including sessions that started within the last 90 seconds.
  // The 90s window ensures "starts now" triggers can still fire even if the scheduler
  // tick happens a few seconds after the session start time.
  getSessionsForUpcoming(races) {
    const cutoff = Date.now() - 90000;
    const out = [];

    for (const race of races) {
      const add = (type, dt) => {
        if (!dt || dt.getTime() < cutoff) return;
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
