'use strict';

const F1Api = require('../../lib/f1-api');

module.exports = {
  async standings({ homey }) {
    const api = homey.app.f1Api;

    const [standings, poles, podiums] = await Promise.all([
      api.getDriverStandings(),
      api.getSeasonPoles(),
      api.getSeasonPodiums(),
    ]);

    if (!standings || standings.length === 0) return [];

    return standings.map((s, i) => ({
      ...s,
      poles:   String(poles.get(s.driverId) || 0),
      podiums: String(podiums.get(s.driverId) || 0),
      photo:   i === 0 ? F1Api.driverPhotoUrl(s.driverId) : null,
    }));
  },
};
