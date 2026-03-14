'use strict';

const UNIT_SECONDS = { seconds: 1, minutes: 60, hours: 3600, days: 86400, weeks: 604800 };
const UNITS = Object.keys(UNIT_SECONDS);

class F1Scheduler {
  constructor(homey, f1Api, time) {
    this.homey = homey;
    this.f1Api = f1Api;
    this.time = time;

    this.timer = null;
    this.lastNowFired = new Map();
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
    this.tick().catch(err => this.homey.error(err));
  }

  stop() {
    if (this.timer) {
      this.homey.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  remainingCeil(diffSeconds, unit) {
    const u = UNIT_SECONDS[unit];
    return Math.max(0, Math.ceil(diffSeconds / u));
  }

  buildTokens(session) {
    const startLocal = this.time.formatLocal(session.date);
    const startUtc = session.date.toISOString();
    const secondsUntil = Math.max(0, Math.ceil((session.date.getTime() - Date.now()) / 1000));

    return {
      session_type: session.type,
      round: String(session.round),
      gp_name: session.raceName || '',
      start_local: startLocal,
      start_utc: startUtc,
      seconds_until: secondsUntil
    };
  }

  async fireStartsInTriggers(nextByType, nextOverall) {
    const now = Date.now();

    const fireFor = async (cardId, session) => {
      if (!session) return;
      const diffSec = Math.ceil((session.date.getTime() - now) / 1000);
      if (diffSec < 0) return;

      const tokens = this.buildTokens(session);

      for (const unit of UNITS) {
        const x = this.remainingCeil(diffSec, unit);
        const state = { x, unit };
        await this.homey.app.flowCards[cardId].trigger(tokens, state).catch(() => {});
      }
    };

    await fireFor('quali_starts_in', nextByType.Qualifying);
    await fireFor('race_starts_in', nextByType.Race);
    await fireFor('sprint_starts_in', nextByType.Sprint);
    await fireFor('sprint_quali_starts_in', nextByType.SprintQualifying);

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
      await this.homey.app.flowCards[cardId].trigger(tokens, {}).catch(() => {});
    };

    await fireNow('quali_starts_now', nextByType.Qualifying, 'quali_now');
    await fireNow('race_starts_now', nextByType.Race, 'race_now');
    await fireNow('sprint_starts_now', nextByType.Sprint, 'sprint_now');
    await fireNow('sprint_quali_starts_now', nextByType.SprintQualifying, 'sprint_quali_now');
    if (nextOverall) await fireNow('session_starts_now', nextOverall, 'any_now');
  }

  async tick() {
    try {
      const races = await this.f1Api.getSeasonRaces();
      const upcomingSessions = this.f1Api.getSessionsForUpcoming(races);

      const nextSessionOverall = upcomingSessions[0] || null;
      const nextByType = {
        Qualifying: upcomingSessions.find(s => s.type === 'Qualifying') || null,
        Race: upcomingSessions.find(s => s.type === 'Race') || null,
        Sprint: upcomingSessions.find(s => s.type === 'Sprint') || null,
        SprintQualifying: upcomingSessions.find(s => s.type === 'SprintQualifying') || null
      };

      await this.fireStartsInTriggers(nextByType, nextSessionOverall);
      await this.fireStartsNowTriggers(nextByType, nextSessionOverall);

      const basePoll = Number(this.homey.settings.get('poll_seconds') || 30);
      const nextDate = nextSessionOverall?.date || null;
      const nextPoll = this.getPollSeconds(basePoll, nextDate);

      this.timer = this.homey.setTimeout(() => {
        this.timer = null;
        this.tick().catch(err => this.homey.error(err));
      }, nextPoll * 1000);
    } catch (e) {
      this.homey.error('Scheduler tick error', e);
      const basePoll = Number(this.homey.settings.get('poll_seconds') || 30);
      this.timer = this.homey.setTimeout(() => {
        this.timer = null;
        this.tick().catch(err => this.homey.error(err));
      }, basePoll * 1000);
    }
  }
}

module.exports = F1Scheduler;
