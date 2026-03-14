'use strict';

const Homey = require('homey');

class F1RoundDevice extends Homey.Device {
  async onInit() {
    this.round = this.getData().round;
    this.log('F1RoundDevice init round', this.round);

    await this.setCapabilityValue('f1_round', Number(this.round)).catch(() => {});
    this.homey.app.registerRoundDevice(this);

    await this.refreshFromApi();
  }

  async onDeleted() {
    this.homey.app.unregisterRoundDevice(this);
  }

  async refreshFromApi() {
    const app = this.homey.app;
    const race = await app.f1Api.getRaceByRound(this.round);
    if (!race) return;

    const fmt = (dt) => app.time.formatLocal(dt);

    await this.setCapabilityValue('f1_gp_name', race.raceName || '').catch(() => {});
    await this.setCapabilityValue('f1_country', race.Circuit?.Location?.country || '').catch(() => {});
    await this.setCapabilityValue('f1_locality', race.Circuit?.Location?.locality || '').catch(() => {});
    await this.setCapabilityValue('f1_circuit', race.Circuit?.circuitName || '').catch(() => {});

    const fp1 = app.time.parseSessionDateTime(race.FirstPractice);
    const fp2 = app.time.parseSessionDateTime(race.SecondPractice);
    const fp3 = app.time.parseSessionDateTime(race.ThirdPractice);
    const quali = app.time.parseSessionDateTime(race.Qualifying);
    const sprint = app.time.parseSessionDateTime(race.Sprint);
    const sprintQuali = app.time.parseSessionDateTime(race.SprintQualifying);
    const raceDt = app.time.parseRaceDateTime(race);

    await this.setCapabilityValue('f1_fp1', fp1 ? fmt(fp1) : '').catch(() => {});
    await this.setCapabilityValue('f1_fp2_or_sq', sprintQuali ? fmt(sprintQuali) : (fp2 ? fmt(fp2) : '')).catch(() => {});
    await this.setCapabilityValue('f1_fp3_or_sprint', sprint ? fmt(sprint) : (fp3 ? fmt(fp3) : '')).catch(() => {});
    await this.setCapabilityValue('f1_quali', quali ? fmt(quali) : '').catch(() => {});
    await this.setCapabilityValue('f1_race', raceDt ? fmt(raceDt) : '').catch(() => {});

    const next = app.f1Api.getNextSessionForRace(race);
    if (next?.date) {
      await this.setCapabilityValue('f1_next_session_name', next.name).catch(() => {});
      await this.setCapabilityValue('f1_next_session_local', fmt(next.date)).catch(() => {});
      await this.setCapabilityValue('f1_seconds_until_next', Math.max(0, Math.ceil((next.date.getTime() - Date.now()) / 1000))).catch(() => {});
    } else {
      await this.setCapabilityValue('f1_next_session_name', '').catch(() => {});
      await this.setCapabilityValue('f1_next_session_local', '').catch(() => {});
      await this.setCapabilityValue('f1_seconds_until_next', 0).catch(() => {});
    }
  }
}

module.exports = F1RoundDevice;
