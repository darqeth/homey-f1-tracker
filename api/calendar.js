'use strict';

/**
 * GET /api/app/com.darqeth.f1tracker/calendar
 * Returns the full season race list with winner info for past races.
 * Called by the f1-calendar dashboard widget.
 */
module.exports = {
  async get({ homey }) {
    const app = homey.app;

    const [races, winners] = await Promise.all([
      app.f1Api.getSeasonRaces(),
      app.f1Api.getSeasonWinners(),
    ]);

    const now = Date.now();
    let nextFound = false;

    return races.map(race => {
      const raceDt = app.time.parseRaceDateTime(race);
      const raceMs = raceDt ? raceDt.getTime() : null;
      const isPast = raceMs !== null && raceMs < now;
      const isNext = !isPast && !nextFound && raceMs !== null;
      if (isNext) nextFound = true;

      const w = isPast ? (winners.get(String(race.round)) || null) : null;

      return {
        round: Number(race.round),
        raceName: race.raceName,
        country: race.Circuit?.Location?.country || '',
        city: race.Circuit?.Location?.locality || '',
        date: raceDt ? raceDt.toISOString() : null,
        isPast,
        isNext,
        // Show 3-letter driver code (e.g. "VER") or fallback to last name
        winner: w ? (w.code || w.name.split(' ').pop()) : null,
      };
    });
  },
};
