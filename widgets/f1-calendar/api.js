'use strict';

module.exports = {
  async calendar({ homey }) {
    const app = homey.app;
    const season = String(new Date().getFullYear());

    const [races, topFinishers, sprintWinners] = await Promise.all([
      app.f1Api.getSeasonRaces(season),
      app.f1Api.getSeasonTopFinishers(season),
      app.f1Api.getSeasonSprintWinners(season),
    ]);

    if (!races || races.length === 0) {
      return [];
    }

    const now = Date.now();
    const selectedYear = season ? Number(season) : new Date().getFullYear();
    const isFutureSeason = selectedYear > new Date().getFullYear();
    let nextFound = false;

    // Sort by date so cancelled races (round = null) stay in their original slot
    const sorted = [...races].sort((a, b) => {
      const dtA = app.time.parseRaceDateTime(a);
      const dtB = app.time.parseRaceDateTime(b);
      if (!dtA && !dtB) return 0;
      if (!dtA) return 1;
      if (!dtB) return -1;
      return dtA.getTime() - dtB.getTime();
    });

    return sorted.map(race => {
      const raceDt = app.time.parseRaceDateTime(race);
      const raceMs = raceDt ? raceDt.getTime() : null;
      const isPast = !isFutureSeason && raceMs !== null && raceMs < now;
      const isNext = !isFutureSeason && !isPast && !nextFound && raceMs !== null;
      if (isNext) nextFound = true;

      const isSprint = !!(race.Sprint);
      const sprintDt = isSprint ? app.time.parseSessionDateTime(race.Sprint) : null;
      const isSprintPast = !isFutureSeason && sprintDt !== null && sprintDt.getTime() < now;

      const finishers = isPast ? (topFinishers.get(String(race.round)) || []) : [];
      const sw = isSprintPast ? (sprintWinners.get(String(race.round)) || null) : null;

      const isCancelled = race.round == null;

      return {
        round: isCancelled ? null : Number(race.round),
        raceName: race.raceName,
        isCancelled,
        country: race.Circuit?.Location?.country || '',
        city: race.Circuit?.Location?.locality || '',
        date: raceDt ? raceDt.toISOString() : null,
        isPast,
        isNext,
        isSprint,
        isSprintPast,
        top3: finishers.map(f => f ? (f.code || f.name.split(' ').pop()) : null),
        sprintWinner: sw ? (sw.code || sw.name.split(' ').pop()) : null,
      };
    });
  },
};
