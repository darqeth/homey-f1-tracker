'use strict';

module.exports = {
  async standings({ homey }) {
    const api = homey.app.f1Api;

    const [standings, poles, podiums] = await Promise.all([
      api.getConstructorStandings(),
      api.getSeasonConstructorPoles(),
      api.getSeasonConstructorPodiums(),
    ]);

    if (!standings || standings.length === 0) return [];

    return standings.map(s => ({
      ...s,
      poles:   String(poles.get(s.constructorId) || 0),
      podiums: String(podiums.get(s.constructorId) || 0),
    }));
  },
};
