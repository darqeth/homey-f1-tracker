'use strict';

module.exports = {
  async countdown({ homey }) {
    const app = homey.app;
    const races = await app.f1Api.getSeasonRaces();
    const now = Date.now();

    const upcoming = races
      .map(r => ({ race: r, dt: app.time.parseRaceDateTime(r) }))
      .filter(x => x.dt && x.dt.getTime() > now)
      .sort((a, b) => a.dt.getTime() - b.dt.getTime());

    if (!upcoming.length) return null;

    const { race, dt } = upcoming[0];
    return {
      raceName: race.raceName,
      round: Number(race.round),
      country: race.Circuit?.Location?.country || '',
      date: dt.toISOString(),
      secondsUntil: Math.max(0, Math.floor((dt.getTime() - now) / 1000)),
    };
  },
};
