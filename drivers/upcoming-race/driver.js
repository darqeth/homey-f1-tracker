'use strict';

const Homey = require('homey');

class UpcomingRaceDriver extends Homey.Driver {
  async onPairListDevices() {
    return [{
      name: this.homey.__('devices.upcoming_race'),
      data: { id: 'upcoming-race' },
    }];
  }
}

module.exports = UpcomingRaceDriver;
