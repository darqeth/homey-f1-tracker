'use strict';

const Homey = require('homey');

class F1RoundDriver extends Homey.Driver {
  async onInit() {
    this.log('F1RoundDriver init');
  }

  async onPair(session) {
    session.setHandler('list_devices', async () => {
      const app = this.homey.app;
      const races = await app.f1Api.getSeasonRaces();

      return races.map(race => ({
        name: `${race.raceName} (R${race.round})`,
        data: { round: String(race.round) },
        store: { round: String(race.round) }
      }));
    });
  }
}

module.exports = F1RoundDriver;
