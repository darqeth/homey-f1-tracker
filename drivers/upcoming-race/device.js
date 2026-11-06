'use strict';

const Homey = require('homey');

const SESSIONS = [
  { key: 'FirstPractice',    cap: 'f1_fp1_start',          label: 'fp1' },
  { key: 'SecondPractice',   cap: 'f1_fp2_start',          label: 'fp2' },
  { key: 'ThirdPractice',    cap: 'f1_fp3_start',          label: 'fp3' },
  { key: 'SprintQualifying', cap: 'f1_sprint_quali_start', label: 'sprint_quali' },
  { key: 'Sprint',           cap: 'f1_sprint_start',       label: 'sprint' },
  { key: 'Qualifying',       cap: 'f1_quali_start',        label: 'qualifying' },
];

const UPDATE_INTERVAL_MS = 60 * 1000;

class UpcomingRaceDevice extends Homey.Device {
  async onInit() {
    this.homey.app.registerRoundDevice(this);
    await this.refreshFromApi().catch(err => this.error('Initial refresh failed', err));
    this.interval = this.homey.setInterval(
      () => this.refreshFromApi().catch(err => this.error('Refresh failed', err)),
      UPDATE_INTERVAL_MS,
    );
  }

  async onDeleted() {
    this.homey.clearInterval(this.interval);
    this.homey.app.unregisterRoundDevice(this);
  }

  async refreshFromApi() {
    const { f1Api, time } = this.homey.app;
    const race = await f1Api.getUpcomingWeekend();
    if (!race) {
      await this.setUnavailable(this.homey.__('devices.no_upcoming_race'));
      return;
    }
    await this.setAvailable();

    const raceDt = time.parseRaceDateTime(race);
    const sessions = SESSIONS
      .map(s => ({ ...s, date: time.parseSessionDateTime(race[s.key]) }))
      .concat({ cap: 'f1_race_start', label: 'race', date: raceDt })
      .filter(s => s.date);

    const location = [race.Circuit?.Location?.locality, race.Circuit?.Location?.country].filter(Boolean).join(', ');
    const now = Date.now();
    const next = sessions
      .filter(s => s.date.getTime() > now)
      .sort((a, b) => a.date - b.date)[0];

    const values = {
      f1_gp_name: race.raceName || '',
      f1_circuit: race.Circuit?.circuitName || '',
      f1_location: location,
      f1_round: Number(race.round),
      f1_weekend_dates: time.formatDateRange(sessions[0].date, raceDt),
      f1_sprint_weekend: !!(race.Sprint || race.SprintQualifying),
      f1_next_session: next ? this.homey.__(`sessions.${next.label}`) : '',
      f1_next_session_start: next ? time.formatLocal(next.date) : '',
      f1_countdown: next ? time.formatCountdown((next.date.getTime() - now) / 1000) : '',
    };
    for (const s of [...SESSIONS, { cap: 'f1_race_start' }]) {
      const session = sessions.find(x => x.cap === s.cap);
      values[s.cap] = session ? time.formatLocal(session.date) : '-';
    }

    for (const [cap, value] of Object.entries(values)) {
      if (this.getCapabilityValue(cap) !== value) await this.setCapabilityValue(cap, value);
    }
  }
}

module.exports = UpcomingRaceDevice;
