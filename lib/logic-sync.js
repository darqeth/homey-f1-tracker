'use strict';

/**
 * Sync Homey Logic variables so users can use them in Dashboards as Logic tiles.
 *
 * Per-round variables include a Winner field that populates once the race result
 * is available from the API. Homey firmware/SDK variations are handled gracefully.
 */
class LogicSync {
  constructor(homey, f1Api, time) {
    this.homey = homey;
    this.f1Api = f1Api;
    this.time = time;
  }

  _logic() {
    return this.homey && this.homey.logic ? this.homey.logic : null;
  }

  async _getVariables() {
    const logic = this._logic();
    if (!logic) return null;
    if (typeof logic.getVariables === 'function') return await logic.getVariables();
    if (typeof logic.getAllVariables === 'function') return await logic.getAllVariables();
    return null;
  }

  _findByName(varsObj, name) {
    if (!varsObj) return null;
    for (const id of Object.keys(varsObj)) {
      const v = varsObj[id];
      if (v && v.name === name) return v;
    }
    return null;
  }

  async _createVariable({ name, type, value }) {
    const logic = this._logic();
    if (!logic) return null;
    if (typeof logic.createVariable === 'function') return await logic.createVariable({ name, type, value });
    if (typeof logic.create === 'function') return await logic.create({ name, type, value });
    return null;
  }

  async _setValue(variable, value) {
    const logic = this._logic();
    if (!logic || !variable) return null;
    if (variable.value === value) return variable;

    if (typeof logic.updateVariable === 'function') {
      return await logic.updateVariable({ id: variable.id, variable: { value } });
    }
    if (typeof logic.update === 'function') {
      return await logic.update(variable.id, { value });
    }
    return null;
  }

  async ensureAndSet(name, type, value) {
    try {
      const varsObj = await this._getVariables();
      if (!varsObj) return false;

      let v = this._findByName(varsObj, name);
      if (!v) v = await this._createVariable({ name, type, value });
      else await this._setValue(v, value);

      return !!v;
    } catch (e) {
      this.homey.error('LogicSync error', e);
      return false;
    }
  }

  _prefix(round) {
    return `F1 R${round}`;
  }

  // Quickly update just the winner for a single round (called after race_finished fires).
  async syncWinner(round, winnerName) {
    const prefix = this._prefix(String(round));
    await this.ensureAndSet(`${prefix} Winner`, 'string', winnerName);
  }

  async syncAll() {
    const varsObj = await this._getVariables();
    if (!varsObj) {
      this.homey.log('LogicSync: Homey Logic not available; skipping dashboard variables.');
      return;
    }

    const races = await this.f1Api.getSeasonRaces();

    // Global: next session
    const sessions = this.f1Api.getSessionsForUpcoming(races);
    const next = sessions[0] || null;

    if (next) {
      const startLocal = this.time.formatLocal(next.date);
      const startUtc = next.date.toISOString();
      const secondsUntil = Math.max(0, Math.ceil((next.date.getTime() - Date.now()) / 1000));

      await this.ensureAndSet('F1 Next Session Type', 'string', next.type);
      await this.ensureAndSet('F1 Next Session Round', 'string', String(next.round));
      await this.ensureAndSet('F1 Next GP Name', 'string', next.raceName || '');
      await this.ensureAndSet('F1 Next Session Start (Local)', 'string', startLocal);
      await this.ensureAndSet('F1 Next Session Start (UTC)', 'string', startUtc);
      await this.ensureAndSet('F1 Seconds Until Next Session', 'number', secondsUntil);
    } else {
      await this.ensureAndSet('F1 Next Session Type', 'string', '');
      await this.ensureAndSet('F1 Next Session Round', 'string', '');
      await this.ensureAndSet('F1 Next GP Name', 'string', '');
      await this.ensureAndSet('F1 Next Session Start (Local)', 'string', '');
      await this.ensureAndSet('F1 Next Session Start (UTC)', 'string', '');
      await this.ensureAndSet('F1 Seconds Until Next Session', 'number', 0);
    }

    // Per round variables
    const fmt = (dt) => dt ? this.time.formatLocal(dt) : '';
    const now = Date.now();

    for (const race of races) {
      const round = String(race.round);
      const prefix = this._prefix(round);

      const country = race.Circuit?.Location?.country || '';
      const locality = race.Circuit?.Location?.locality || '';
      const circuit = race.Circuit?.circuitName || '';
      const gpName = race.raceName || '';

      const fp1 = this.time.parseSessionDateTime(race.FirstPractice);
      const fp2 = this.time.parseSessionDateTime(race.SecondPractice);
      const fp3 = this.time.parseSessionDateTime(race.ThirdPractice);
      const quali = this.time.parseSessionDateTime(race.Qualifying);
      const sprint = this.time.parseSessionDateTime(race.Sprint);
      const sprintQuali = this.time.parseSessionDateTime(race.SprintQualifying);
      const raceDt = this.time.parseRaceDateTime(race);

      await this.ensureAndSet(`${prefix} GP Name`, 'string', gpName);
      await this.ensureAndSet(`${prefix} Country`, 'string', country);
      await this.ensureAndSet(`${prefix} City`, 'string', locality);
      await this.ensureAndSet(`${prefix} Circuit`, 'string', circuit);

      await this.ensureAndSet(`${prefix} FP1 (Local)`, 'string', fmt(fp1));
      await this.ensureAndSet(`${prefix} FP2 or Sprint Qualifying (Local)`, 'string', fmt(sprintQuali) || fmt(fp2));
      await this.ensureAndSet(`${prefix} FP3 or Sprint (Local)`, 'string', fmt(sprint) || fmt(fp3));
      await this.ensureAndSet(`${prefix} Qualifying (Local)`, 'string', fmt(quali));
      await this.ensureAndSet(`${prefix} Race (Local)`, 'string', fmt(raceDt));

      // Winner: fetch from API for completed races (race time in the past)
      if (raceDt && raceDt.getTime() < now) {
        const winnerInfo = await this.f1Api.getWinnerForRound(round).catch(() => null);
        await this.ensureAndSet(`${prefix} Winner`, 'string', winnerInfo?.name || '');
      } else {
        await this.ensureAndSet(`${prefix} Winner`, 'string', '');
      }
    }

    this.homey.log('LogicSync: dashboard variables synced.');
  }
}

module.exports = LogicSync;
