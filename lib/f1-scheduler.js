'use strict';

const UNIT_SECONDS = { minutes: 60, hours: 3600, days: 86400, weeks: 604800 };
const UNITS = Object.keys(UNIT_SECONDS);

class F1Scheduler {
  constructor(homey, f1Api, time) {
    this.homey = homey;
    this.f1Api = f1Api;
    this.time = time;

    this.timer = null;
    this.lastNowFired = new Map();      // "starts_now" dedup: 60s window, restart risk negligible

    // "starts_in" dedup — persisted so app restarts don't re-fire "X before" triggers
    const storedThresholds = this.homey.settings.get('fired_thresholds') || [];
    this.firedThresholds = new Map(storedThresholds);

    // "race_finished" dedup — persisted so app restarts don't re-fire old races
    const storedFinished = this.homey.settings.get('fired_race_finished') || [];
    this.firedRaceFinished = new Set(storedFinished);

    // "session_ended" dedup — persisted, Map<key, timestampFired>
    const storedEnded = this.homey.settings.get('fired_session_ended') || [];
    this.firedSessionEnded = new Map(storedEnded);
  }

  getPollSeconds(baseSeconds, nextStartDate) {
    const fastBeforeMin = Number(this.homey.settings.get('fast_poll_before_minutes') || 10);
    if (!nextStartDate) return baseSeconds;

    const diffSec = Math.ceil((nextStartDate.getTime() - Date.now()) / 1000);
    if (diffSec <= 0) return baseSeconds;

    if (fastBeforeMin > 0 && diffSec <= fastBeforeMin * 60) return 5;
    return baseSeconds;
  }

  start() {
    if (this.timer) return;
    this.homey.log('Scheduler start');
    this.tick().catch(err => this.homey.error('Scheduler start error', err));
  }

  stop() {
    if (this.timer) {
      this.homey.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // Remove threshold entries older than 24 hours to prevent unbounded growth.
  _pruneThresholds() {
    const cutoff = Date.now() - 86400000;
    let changed = false;
    for (const [k, ts] of this.firedThresholds) {
      if (ts < cutoff) { this.firedThresholds.delete(k); changed = true; }
    }
    if (changed) {
      this.homey.settings.set('fired_thresholds', Array.from(this.firedThresholds));
    }
  }

  // Remove session_ended entries fired more than 7 days ago.
  _pruneFiredSessionEnded() {
    const cutoff = Date.now() - 7 * 86400000;
    let changed = false;
    for (const [key, ts] of this.firedSessionEnded) {
      if (ts < cutoff) { this.firedSessionEnded.delete(key); changed = true; }
    }
    if (changed) {
      this.homey.settings.set('fired_session_ended', Array.from(this.firedSessionEnded));
    }
  }

  // Remove fired_race_finished entries older than 7 days from the persisted set.
  _pruneFiredRaceFinished() {
    const cutoff = Date.now() - 7 * 86400000;
    let changed = false;
    for (const key of this.firedRaceFinished) {
      // key format: "round:isoDate" — extract the ISO date part
      const iso = key.slice(key.indexOf(':') + 1);
      if (iso && new Date(iso).getTime() < cutoff) {
        this.firedRaceFinished.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.homey.settings.set('fired_race_finished', Array.from(this.firedRaceFinished));
    }
  }

  remainingCeil(diffSeconds, unit) {
    const u = UNIT_SECONDS[unit];
    return Math.max(0, Math.ceil(diffSeconds / u));
  }

  buildTokens(session) {
    const secondsUntil = Math.max(0, Math.ceil((session.date.getTime() - Date.now()) / 1000));
    return {
      session_type: session.type,
      round: String(session.round),
      gp_name: session.raceName || '',
      start_time: this.time.formatLocal(session.date),
      seconds_until: secondsUntil,
    };
  }

  async fireStartsInTriggers(nextByType, nextOverall) {
    const now = Date.now();

    const fireFor = async (cardId, session) => {
      if (!session) return;
      const diffSec = Math.ceil((session.date.getTime() - now) / 1000);
      if (diffSec < 0) return;

      const tokens = this.buildTokens(session);
      const sessionIso = session.date.toISOString();
      const card = this.homey.app.flowCards[cardId];
      if (!card) return;

      for (const unit of UNITS) {
        const x = this.remainingCeil(diffSec, unit);
        // Deduplicate: only fire once per (cardId, session, x, unit) combination.
        // This prevents re-firing on every poll when the x value hasn't changed yet.
        const thresholdKey = `${cardId}:${sessionIso}:${x}:${unit}`;
        if (this.firedThresholds.has(thresholdKey)) continue;

        this.firedThresholds.set(thresholdKey, Date.now());
        this.homey.settings.set('fired_thresholds', Array.from(this.firedThresholds));
        await card.trigger(tokens, { x, unit })
          .catch(err => this.homey.error(`${cardId} trigger error`, err));
      }
    };

    await fireFor('quali_starts_in', nextByType.Qualifying);
    await fireFor('race_starts_in', nextByType.Race);
    await fireFor('sprint_starts_in', nextByType.Sprint);
    await fireFor('sprint_quali_starts_in', nextByType.SprintQualifying);
    await fireFor('fp1_starts_in', nextByType.FirstPractice);
    await fireFor('fp2_starts_in', nextByType.SecondPractice);
    await fireFor('fp3_starts_in', nextByType.ThirdPractice);
    if (nextOverall) await fireFor('next_session_starts_in', nextOverall);
  }

  async fireStartsNowTriggers(nextByType, nextOverall) {
    const graceSec = 60;
    const now = Date.now();

    const fireNow = async (cardId, session, keySuffix) => {
      if (!session) return;
      const diffSec = Math.floor((session.date.getTime() - now) / 1000);

      if (diffSec > 0) return;
      if (diffSec < -graceSec) return;

      const key = `${keySuffix}:${session.round}:${session.type}:${session.date.toISOString()}`;
      if (this.lastNowFired.get(key)) return;
      this.lastNowFired.set(key, true);

      const tokens = this.buildTokens(session);
      const card = this.homey.app.flowCards[cardId];
      if (card) await card.trigger(tokens, {})
        .catch(err => this.homey.error(`${cardId} trigger error`, err));
    };

    await fireNow('quali_starts_now', nextByType.Qualifying, 'quali_now');
    await fireNow('race_starts_now', nextByType.Race, 'race_now');
    await fireNow('sprint_starts_now', nextByType.Sprint, 'sprint_now');
    await fireNow('sprint_quali_starts_now', nextByType.SprintQualifying, 'sprint_quali_now');
    await fireNow('fp1_starts_now', nextByType.FirstPractice, 'fp1_now');
    await fireNow('fp2_starts_now', nextByType.SecondPractice, 'fp2_now');
    await fireNow('fp3_starts_now', nextByType.ThirdPractice, 'fp3_now');
    if (nextOverall) await fireNow('session_starts_now', nextOverall, 'any_now');
  }

  async fireRaceFinished(races) {
    const now = Date.now();
    const card = this.homey.app.flowCards?.race_finished;
    if (!card) return;

    for (const race of races) {
      const raceDt = this.time.parseRaceDateTime(race);
      if (!raceDt) continue;

      const diffSec = (raceDt.getTime() - now) / 1000; // negative = past
      if (diffSec > -7200) continue;  // Not yet 2 hours after race start time
      if (diffSec < -86400) continue; // More than 24 hours ago, skip

      const raceKey = `${race.round}:${raceDt.toISOString()}`;
      if (this.firedRaceFinished.has(raceKey)) continue;

      const winnerInfo = await this.f1Api.getWinnerForRound(race.round)
        .catch(() => null);
      if (!winnerInfo || !winnerInfo.name) continue;

      this.firedRaceFinished.add(raceKey);
      this.homey.settings.set('fired_race_finished', Array.from(this.firedRaceFinished));

      const tokens = {
        winner_name: winnerInfo.name,
        winner_constructor: winnerInfo.constructor || '',
        gp_name: race.raceName || '',
        round: String(race.round),
      };

      await card.trigger(tokens, {})
        .catch(err => this.homey.error('race_finished trigger error', err));

      // Clear result caches so widgets (calendar, standings) immediately show fresh podium data.
      this.f1Api.clearResultCaches();

      // Immediately update dashboard winner variable
      if (this.homey.app.logicSync) {
        await this.homey.app.logicSync.syncWinner(race.round, winnerInfo.name)
          .catch(() => {});
      }
    }
  }

  async fireSessionEnded(races) {
    const now = Date.now();
    const card = this.homey.app.flowCards?.session_ended;
    if (!card) return;

    // Minimum seconds after session start before we check "ended".
    // For API-driven sessions (Qualifying, Sprint, Race) this is just the earliest we'll
    // hit the API; for time-based sessions this doubles as the end estimate.
    const MIN_WAIT = {
      FirstPractice:    65 * 60,
      SecondPractice:   65 * 60,
      ThirdPractice:    65 * 60,
      SprintQualifying: 30 * 60,
      Qualifying:       45 * 60,
      Sprint:           20 * 60,
      Race:            120 * 60,
    };
    const MAX_AGE_SEC = 86400; // ignore sessions older than 24h

    for (const race of races) {
      const sessions = [
        { type: 'FirstPractice',    dt: this.time.parseSessionDateTime(race.FirstPractice) },
        { type: 'SecondPractice',   dt: this.time.parseSessionDateTime(race.SecondPractice) },
        { type: 'ThirdPractice',    dt: this.time.parseSessionDateTime(race.ThirdPractice) },
        { type: 'SprintQualifying', dt: this.time.parseSessionDateTime(race.SprintQualifying) },
        { type: 'Qualifying',       dt: this.time.parseSessionDateTime(race.Qualifying) },
        { type: 'Sprint',           dt: this.time.parseSessionDateTime(race.Sprint) },
        { type: 'Race',             dt: this.time.parseRaceDateTime(race) },
      ].filter(s => s.dt);

      for (const { type, dt } of sessions) {
        const diffSec = (dt.getTime() - now) / 1000; // negative = past
        if (diffSec > -(MIN_WAIT[type] || 3600)) continue; // too soon
        if (diffSec < -MAX_AGE_SEC) continue;              // too old

        const key = `session_ended:${type}:${race.round}:${dt.toISOString()}`;
        if (this.firedSessionEnded.has(key)) continue;

        // For sessions that have result endpoints, confirm results are actually available.
        let ready = true;
        if (type === 'Qualifying') {
          ready = await this.f1Api.isQualifyingResultsAvailable(race.round).catch(() => false);
        } else if (type === 'Sprint') {
          ready = await this.f1Api.isSprintResultsAvailable(race.round).catch(() => false);
        } else if (type === 'Race') {
          const w = await this.f1Api.getWinnerForRound(race.round).catch(() => null);
          ready = !!(w && w.name);
        }
        if (!ready) continue;

        this.firedSessionEnded.set(key, Date.now());
        this.homey.settings.set('fired_session_ended', Array.from(this.firedSessionEnded));

        const tokens = {
          session_type: type,
          round: String(race.round),
          gp_name: race.raceName || '',
          start_time: this.time.formatLocal(dt),
        };

        await card.trigger(tokens, {})
          .catch(err => this.homey.error('session_ended trigger error', err));
      }
    }
  }

  async tick() {
    try {
      this._pruneThresholds();
      this._pruneFiredRaceFinished();
      this._pruneFiredSessionEnded();

      const races = await this.f1Api.getSeasonRaces();
      const upcomingSessions = this.f1Api.getSessionsForUpcoming(races);
      const nextSessionOverall = upcomingSessions[0] || null;
      const nextByType = {
        Qualifying:       upcomingSessions.find(s => s.type === 'Qualifying') || null,
        Race:             upcomingSessions.find(s => s.type === 'Race') || null,
        Sprint:           upcomingSessions.find(s => s.type === 'Sprint') || null,
        SprintQualifying: upcomingSessions.find(s => s.type === 'SprintQualifying') || null,
        FirstPractice:    upcomingSessions.find(s => s.type === 'FirstPractice') || null,
        SecondPractice:   upcomingSessions.find(s => s.type === 'SecondPractice') || null,
        ThirdPractice:    upcomingSessions.find(s => s.type === 'ThirdPractice') || null,
      };

      await this.fireStartsInTriggers(nextByType, nextSessionOverall);
      await this.fireStartsNowTriggers(nextByType, nextSessionOverall);
      await this.fireRaceFinished(races);
      await this.fireSessionEnded(races);

      const basePoll = Number(this.homey.settings.get('poll_seconds') || 30);
      const nextDate = nextSessionOverall?.date || null;
      const nextPoll = this.getPollSeconds(basePoll, nextDate);

      this.timer = this.homey.setTimeout(() => {
        this.timer = null;
        this.tick().catch(err => this.homey.error('Scheduler tick error', err));
      }, nextPoll * 1000);
    } catch (e) {
      this.homey.error('Scheduler tick error', e);
      const basePoll = Number(this.homey.settings.get('poll_seconds') || 30);
      this.timer = this.homey.setTimeout(() => {
        this.timer = null;
        this.tick().catch(err => this.homey.error('Scheduler retry error', err));
      }, basePoll * 1000);
    }
  }
}

module.exports = F1Scheduler;
