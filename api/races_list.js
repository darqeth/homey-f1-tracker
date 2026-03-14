'use strict';

/**
 * GET /races_list
 * Query:
 *   includeWinner=0|1
 */
module.exports = async ({ homey, query } = {}) => {
  const app = homey?.app;
  if (!app?.f1Api || !app?.time) return [];

  const includeWinner = String(query?.includeWinner || '0') === '1';

  const races = await app.f1Api.getSeasonRaces();
  const now = Date.now();

  const out = [];
  for (const race of races) {
    const raceDt = app.time.parseRaceDateTime(race);
    const raceStartMs = raceDt ? raceDt.getTime() : 0;
    const finished = !!(raceStartMs && raceStartMs < now);

    let winner = '';
    if (includeWinner && finished) {
      winner = await app.f1Api.getWinnerForRound(String(race.round));
    }

    out.push({
      round: String(race.round),
      gpName: race.raceName || '',
      raceTime: raceDt ? app.time.formatLocal(raceDt) : '',
      country: race.Circuit?.Location?.country || '',
      city: race.Circuit?.Location?.locality || '',
      circuit: race.Circuit?.circuitName || '',
      finished,
      raceStartMs,
      winner
    });
  }

  return out;
};
