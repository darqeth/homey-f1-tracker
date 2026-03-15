'use strict';

module.exports = {
  async standings({ homey }) {
    return homey.app.f1Api.getDriverStandings();
  },
};
