'use strict';

const UNIT_SECONDS = { minutes: 60, hours: 3600, days: 86400, weeks: 604800 };
const UNITS = Object.keys(UNIT_SECONDS);

class F1Scheduler {
  constructor(homey, f1Api, time) {
    this.homey = homey;
    this.f1Api = f1Api;
    this.time = time;

    this.timer = null;
    this.lastNowFired = new Map();      // "starts_now" dedup: key -> true
    this.firedThresholds = new Map();  // "starts_in" dedup: key -> timestamp (ms when fired)
    this.firedRaceFinished = new Set(); // "race_finished" dedup: "round:isoDate"
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

  // Remove threshold entries older than 24 hours to prevent unbounded memory growth.
  _pruneThresholds() {
    const cutoff = Date.now() - 86400000;
    for (const [k, ts] of this.firedThresholds) {
      if (ts < cutoff) this.firedThresholds.delete(k);
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

      const tokens = {
        winner_name: winnerInfo.name,
        winner_constructor: winnerInfo.constructor || '',
        gp_name: race.raceName || '',
        round: String(race.round),
      };

      await card.trigger(tokens, {})
        .catch(err => this.homey.error('race_finished trigger error', err));

      // Immediately update dashboard winner variable
      if (this.homey.app.logicSync) {
        await this.homey.app.logicSync.syncWinner(race.round, winnerInfo.name)
          .catch(() => {});
      }
    }
  }

  async tick() {
    try {
      this._pruneThresholds();

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
