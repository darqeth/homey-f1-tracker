'use strict';

const Homey = require('homey');
const F1Api = require('./lib/f1-api');
const TimeUtil = require('./lib/time');
const F1Scheduler = require('./lib/f1-scheduler');
const LogicSync = require('./lib/logic-sync');

class F1TrackerApp extends Homey.App {
  async onInit() {
    this.log('F1TrackerApp init');

    this.time = new TimeUtil(this.homey);
    this.f1Api = new F1Api(this.homey, this.time);
    this.scheduler = new F1Scheduler(this.homey, this.f1Api, this.time);
    this.logicSync = new LogicSync(this.homey, this.f1Api, this.time);

    this.roundDevices = new Set();

    await this.initFlowCards();

    // Start scheduler after flow cards are registered
    this.scheduler.start();

    this.homey.settings.on('set', async (key) => {
      if (['season','schedule_cache_hours','poll_seconds','fast_poll_before_minutes','use_local_time'].includes(key)) {
        this.log('Settings changed, refreshing');
        await this.f1Api.forceRefresh().catch(() => {});
        await this.refreshAllRoundDevices().catch(() => {});
      }
    });

    await this.refreshAllRoundDevices().catch(() => {});
  }

  registerRoundDevice(device) {
    this.roundDevices.add(device);
  }

  unregisterRoundDevice(device) {
    this.roundDevices.delete(device);
  }

  async refreshAllRoundDevices() {
    for (const d of this.roundDevices) {
      await d.refreshFromApi().catch(() => {});
    }

    // Sync dashboard Logic variables (per round + next session)
    if (this.logicSync) {
      await this.logicSync.syncAll().catch(() => {});
    }
  }

  async initFlowCards() {
    this.flowCards = {
      quali_starts_in: this.homey.flow.getTriggerCard('quali_starts_in'),
      race_starts_in: this.homey.flow.getTriggerCard('race_starts_in'),
      sprint_starts_in: this.homey.flow.getTriggerCard('sprint_starts_in'),
      sprint_quali_starts_in: this.homey.flow.getTriggerCard('sprint_quali_starts_in'),
      next_session_starts_in: this.homey.flow.getTriggerCard('next_session_starts_in'),

      session_starts_now: this.homey.flow.getTriggerCard('session_starts_now'),
      race_starts_now: this.homey.flow.getTriggerCard('race_starts_now'),
      quali_starts_now: this.homey.flow.getTriggerCard('quali_starts_now'),
      sprint_starts_now: this.homey.flow.getTriggerCard('sprint_starts_now'),
      sprint_quali_starts_now: this.homey.flow.getTriggerCard('sprint_quali_starts_now')
    };

    const raceToday = this.homey.flow.getConditionCard('race_today');
    raceToday.registerRunListener(async () => {
      const nextRace = await this.f1Api.getNextRace();
      if (!nextRace) return false;

      const raceDt = this.time.parseRaceDateTime(nextRace);
      if (!raceDt) return false;

      const now = new Date();
      return now.getFullYear() === raceDt.getFullYear()
        && now.getMonth() === raceDt.getMonth()
        && now.getDate() === raceDt.getDate();
    });

    const sprintWeekend = this.homey.flow.getConditionCard('sprint_weekend');
    sprintWeekend.registerRunListener(async () => {
      const nextRace = await this.f1Api.getNextRace();
      if (!nextRace) return false;
      return !!(nextRace.Sprint || nextRace.SprintQualifying);
    });

    const raceStartsInCond = this.homey.flow.getConditionCard('race_starts_in_condition');
    raceStartsInCond.registerRunListener(async (args) => {
      const nextRace = await this.f1Api.getNextRace();
      const raceDt = nextRace ? this.time.parseRaceDateTime(nextRace) : null;
      if (!raceDt) return false;

      const diffSec = Math.ceil((raceDt.getTime() - Date.now()) / 1000);
      const unitSec = { seconds: 1, minutes: 60, hours: 3600, days: 86400, weeks: 604800 }[args.unit];
      const x = Math.max(0, Math.ceil(diffSec / unitSec));
      return x === Number(args.x);
    });

    const sessionWithin = this.homey.flow.getConditionCard('session_within');
    sessionWithin.registerRunListener(async (args) => {
      const races = await this.f1Api.getSeasonRaces();
      const sessions = this.f1Api.getSessionsForUpcoming(races);
      const next = sessions[0];
      if (!next) return false;

      const diffSec = Math.ceil((next.date.getTime() - Date.now()) / 1000);
      const unitSec = { seconds: 1, minutes: 60, hours: 3600, days: 86400, weeks: 604800 }[args.unit];
      const x = Math.max(0, Math.ceil(diffSec / unitSec));
      return x <= Number(args.x);
    });

    const getNextSession = this.homey.flow.getActionCard('get_next_session');
    getNextSession.registerRunListener(async () => {
      const races = await this.f1Api.getSeasonRaces();
      const sessions = this.f1Api.getSessionsForUpcoming(races);
      const next = sessions[0];
      if (!next) return {};

      const startLocal = this.time.formatLocal(next.date);
      const startUtc = next.date.toISOString();
      const secondsUntil = Math.max(0, Math.ceil((next.date.getTime() - Date.now()) / 1000));

      return {
        session_type: next.type,
        round: String(next.round),
        gp_name: next.raceName || '',
        start_local: startLocal,
        start_utc: startUtc,
        seconds_until: secondsUntil
      };
    });

    const getNextRace = this.homey.flow.getActionCard('get_next_race');
    getNextRace.registerRunListener(async () => {
      const nextRace = await this.f1Api.getNextRace();
      if (!nextRace) return {};

      const raceDt = this.time.parseRaceDateTime(nextRace);
      if (!raceDt) return {};

      const startLocal = this.time.formatLocal(raceDt);
      const startUtc = raceDt.toISOString();
      const secondsUntil = Math.max(0, Math.ceil((raceDt.getTime() - Date.now()) / 1000));

      return {
        session_type: 'Race',
        round: String(nextRace.round),
        gp_name: nextRace.raceName || '',
        start_local: startLocal,
        start_utc: startUtc,
        seconds_until: secondsUntil
      };
    });

    const forceRefresh = this.homey.flow.getActionCard('force_refresh');
    forceRefresh.registerRunListener(async () => {
      await this.f1Api.forceRefresh();
      await this.refreshAllRoundDevices();
      return true;
    });
  }
}

module.exports = F1TrackerApp;
