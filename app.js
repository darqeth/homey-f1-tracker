'use strict';

const Homey = require('homey');
const F1Api = require('./lib/f1-api');
const TimeUtil = require('./lib/time');
const F1Scheduler = require('./lib/f1-scheduler');
const LogicSync = require('./lib/logic-sync');
const ChampionshipPredictor = require('./lib/predictor');

class F1TrackerApp extends Homey.App {
  async onInit() {
    this.log('F1TrackerApp init');

    this.time = new TimeUtil(this.homey);
    this.f1Api = new F1Api(this.homey, this.time);
    this.scheduler = new F1Scheduler(this.homey, this.f1Api, this.time);
    this.logicSync = new LogicSync(this.homey, this.f1Api, this.time);
    this.predictor = new ChampionshipPredictor(this.f1Api, this.time);

    this.roundDevices = new Set();

    await this.initFlowCards();
    this.scheduler.start();

    this.homey.settings.on('set', async (key) => {
      if (['season', 'schedule_cache_hours', 'poll_seconds', 'fast_poll_before_minutes'].includes(key)) {
        this.log('Settings changed, refreshing');
        await this.f1Api.forceRefresh().catch(() => {});
        await this.refreshAllRoundDevices().catch(() => {});
      }
    });

    await this.refreshAllRoundDevices().catch(() => {});
  }

  registerRoundDevice(device) { this.roundDevices.add(device); }
  unregisterRoundDevice(device) { this.roundDevices.delete(device); }

  async refreshAllRoundDevices() {
    for (const d of this.roundDevices) {
      await d.refreshFromApi().catch(() => {});
    }
    if (this.logicSync) {
      await this.logicSync.syncAll().catch(err => this.error('LogicSync error', err));
    }
  }

  // Helper: register a "starts_in" trigger card with the required run listener.
  // In Homey SDK v3, triggers with args MUST have a run listener that returns true/false
  // to decide whether a specific flow should fire, based on user-configured args.
  _registerStartsInCard(id) {
    const card = this.homey.flow.getTriggerCard(id);
    card.registerRunListener(async (args, state) =>
      Number(args.x) === state.x && args.unit === state.unit
    );
    return card;
  }

  async initFlowCards() {
    this.flowCards = {
      // --- "starts_in" triggers (run listener validates user args vs current state) ---
      next_session_starts_in:   this._registerStartsInCard('next_session_starts_in'),
      quali_starts_in:          this._registerStartsInCard('quali_starts_in'),
      race_starts_in:           this._registerStartsInCard('race_starts_in'),
      sprint_starts_in:         this._registerStartsInCard('sprint_starts_in'),
      sprint_quali_starts_in:   this._registerStartsInCard('sprint_quali_starts_in'),
      fp1_starts_in:            this._registerStartsInCard('fp1_starts_in'),
      fp2_starts_in:            this._registerStartsInCard('fp2_starts_in'),
      fp3_starts_in:            this._registerStartsInCard('fp3_starts_in'),

      // --- "starts_now" triggers (no args, fire unconditionally at zero crossing) ---
      session_starts_now:       this.homey.flow.getTriggerCard('session_starts_now'),
      race_starts_now:          this.homey.flow.getTriggerCard('race_starts_now'),
      quali_starts_now:         this.homey.flow.getTriggerCard('quali_starts_now'),
      sprint_starts_now:        this.homey.flow.getTriggerCard('sprint_starts_now'),
      sprint_quali_starts_now:  this.homey.flow.getTriggerCard('sprint_quali_starts_now'),
      fp1_starts_now:           this.homey.flow.getTriggerCard('fp1_starts_now'),
      fp2_starts_now:           this.homey.flow.getTriggerCard('fp2_starts_now'),
      fp3_starts_now:           this.homey.flow.getTriggerCard('fp3_starts_now'),

      // --- race finished ---
      race_finished:            this.homey.flow.getTriggerCard('race_finished'),

      // --- session ended (any session type, time-based or API-confirmed) ---
      session_ended: (() => { try { return this.homey.flow.getTriggerCard('session_ended'); } catch (_) { return null; } })(),
    };

    // ---- CONDITIONS ----

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

    const hasSessionToday = this.homey.flow.getConditionCard('has_session_today');
    hasSessionToday.registerRunListener(async () => {
      const races = await this.f1Api.getSeasonRaces();
      const allSessions = this.f1Api.getAllSessionsForRaces(races);
      const now = new Date();
      return allSessions.some(s => {
        const d = s.date;
        return d.getFullYear() === now.getFullYear()
          && d.getMonth() === now.getMonth()
          && d.getDate() === now.getDate();
      });
    });

    const isRaceWeekend = this.homey.flow.getConditionCard('is_race_weekend');
    isRaceWeekend.registerRunListener(async () => {
      const races = await this.f1Api.getSeasonRaces();
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);
      return races.some(r => {
        const raceDt = this.time.parseRaceDateTime(r);
        return raceDt && raceDt >= startOfWeek && raceDt < endOfWeek;
      });
    });

    // ---- ACTIONS ----

    const getNextSession = this.homey.flow.getActionCard('get_next_session');
    getNextSession.registerRunListener(async () => {
      const races = await this.f1Api.getSeasonRaces();
      const sessions = this.f1Api.getSessionsForUpcoming(races);
      const next = sessions[0];
      if (!next) return {};
      const secondsUntil = Math.max(0, Math.ceil((next.date.getTime() - Date.now()) / 1000));
      return {
        next_session_type: next.type,
        next_round: String(next.round),
        next_gp_name: next.raceName || '',
        next_start_time: this.time.formatLocal(next.date),
        next_circuit: next.race?.Circuit?.circuitName || '',
        next_country: next.race?.Circuit?.Location?.country || '',
        next_city: next.race?.Circuit?.Location?.locality || '',
        next_countdown: this.time.formatCountdown(secondsUntil),
      };
    });

    const getNextRace = this.homey.flow.getActionCard('get_next_race');
    getNextRace.registerRunListener(async () => {
      const nextRace = await this.f1Api.getNextRace();
      if (!nextRace) return {};
      const raceDt = this.time.parseRaceDateTime(nextRace);
      if (!raceDt) return {};
      const secondsUntil = Math.max(0, Math.ceil((raceDt.getTime() - Date.now()) / 1000));
      return {
        race_round: String(nextRace.round),
        race_gp_name: nextRace.raceName || '',
        race_start_time: this.time.formatLocal(raceDt),
        race_circuit: nextRace.Circuit?.circuitName || '',
        race_country: nextRace.Circuit?.Location?.country || '',
        race_city: nextRace.Circuit?.Location?.locality || '',
        race_countdown: this.time.formatCountdown(secondsUntil),
      };
    });

    const forceRefresh = this.homey.flow.getActionCard('force_refresh');
    forceRefresh.registerRunListener(async () => {
      await this.f1Api.forceRefresh();
      await this.refreshAllRoundDevices();
      return true;
    });

    const getCountdown = this.homey.flow.getActionCard('get_countdown');
    getCountdown.registerRunListener(async () => {
      const races = await this.f1Api.getSeasonRaces();
      const sessions = this.f1Api.getSessionsForUpcoming(races);
      const next = sessions[0];
      if (!next) return { countdown_string: '' };
      const secondsUntil = Math.max(0, Math.ceil((next.date.getTime() - Date.now()) / 1000));
      return { countdown_string: this.time.formatCountdown(secondsUntil) };
    });

    const getDriverStandings = this.homey.flow.getActionCard('get_driver_standings');
    getDriverStandings.registerRunListener(async () => {
      const standings = await this.f1Api.getDriverStandings();
      if (!standings || standings.length === 0) return {};
      const first = standings[0] || {};
      const second = standings[1] || {};
      return {
        leader_name: first.name || '',
        leader_points: first.points || '',
        leader_constructor: first.constructor || '',
        second_name: second.name || '',
        second_points: second.points || '',
      };
    });

    const getConstructorStandings = this.homey.flow.getActionCard('get_constructor_standings');
    getConstructorStandings.registerRunListener(async () => {
      const standings = await this.f1Api.getConstructorStandings();
      if (!standings || standings.length === 0) return {};
      const first = standings[0] || {};
      const second = standings[1] || {};
      return {
        leader_name: first.name || '',
        leader_points: first.points || '',
        second_name: second.name || '',
        second_points: second.points || '',
      };
    });

    const getPrediction = this.homey.flow.getActionCard('get_championship_prediction');
    getPrediction.registerRunListener(async () => {
      const prediction = await this.predictor.predict();
      if (!prediction) return {};
      const [first = {}, second = {}] = prediction.drivers;
      return {
        favourite_name: first.name || '',
        favourite_probability: first.probability || 0,
        favourite_projected_points: first.projectedPoints || 0,
        second_name: second.name || '',
        second_probability: second.probability || 0,
        races_remaining: prediction.racesRemaining,
        points_remaining: prediction.pointsRemaining,
      };
    });
  }
}

module.exports = F1TrackerApp;
