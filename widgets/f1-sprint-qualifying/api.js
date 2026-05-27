'use strict';

const F1Api = require('../../lib/f1-api');

// 4 hours after race start = race weekend considered "over"
const RACE_END_BUFFER_MS = 4 * 3600 * 1000;

/**
 * Finds the currently active race weekend, OR the next upcoming one.
 * Returns { race, active: true }  — currently inside a race weekend
 *         { race, active: false } — between weekends (race = next upcoming)
 */
function findActiveOrNextRace(races, now, time) {
  let nextRace = null;

  for (const race of races) {
    if (race.round == null) continue;
    const raceDt = time.parseRaceDateTime(race);
    if (!raceDt) continue;

    const raceEnd = raceDt.getTime() + RACE_END_BUFFER_MS;

    // Weekend start = earliest of FP1 / SprintQualifying, fallback to race - 3 days
    const fp1Dt = race.FirstPractice    ? time.parseSessionDateTime(race.FirstPractice)    : null;
    const sqDt  = race.SprintQualifying ? time.parseSessionDateTime(race.SprintQualifying) : null;
    const firstSession = [fp1Dt, sqDt].filter(Boolean).sort((a, b) => a - b)[0];
    const weekendStart = firstSession ? firstSession.getTime() : raceDt.getTime() - 3 * 86400000;

    if (now >= weekendStart && now <= raceEnd) {
      return { race, active: true };
    }

    if (raceDt.getTime() > now && !nextRace) {
      nextRace = race;
    }
  }

  return { race: nextRace, active: false };
}

module.exports = {
  async sprint_qualifying({ homey }) {
    const api  = homey.app.f1Api;
    const time = homey.app.time;
    const races = await api.getSeasonRaces();
    const now   = Date.now();

    const { race: currentRace, active } = findActiveOrNextRace(races, now, time);

    const lang = homey.i18n.getLanguage() || 'en';

    // ── Between race weekends ─────────────────────────────────────────────────
    if (!active) {
      if (!currentRace) return { state: 'between_races', lang };

      // Is the next race a sprint weekend?
      if (!currentRace.SprintQualifying) {
        return {
          state:        'no_sprint',
          lang,
          nextRaceName: currentRace.raceName || '',
          nextRound:    String(currentRace.round),
        };
      }

      const sqDt = time.parseSessionDateTime(currentRace.SprintQualifying);
      return {
        state:         'between_races',
        lang,
        nextRaceName:  currentRace.raceName || '',
        nextRound:     String(currentRace.round),
        nextQualiTime: sqDt ? time.formatLocal(sqDt) : '',
      };
    }

    // ── Active race weekend ───────────────────────────────────────────────────

    // Does this weekend have sprint qualifying?
    if (!currentRace.SprintQualifying) {
      return {
        state:    'no_sprint',
        lang,
        raceName: currentRace.raceName || '',
        round:    String(currentRace.round),
      };
    }

    const sqDt = time.parseSessionDateTime(currentRace.SprintQualifying);

    // Sprint qualifying hasn't started yet
    if (!sqDt || sqDt.getTime() > now) {
      return {
        state:         'between_races',
        lang,
        nextRaceName:  currentRace.raceName || '',
        nextRound:     String(currentRace.round),
        nextQualiTime: sqDt ? time.formatLocal(sqDt) : '',
      };
    }

    // Sprint qualifying happened — fetch results
    const year = currentRace.season || new Date().getFullYear();
    const results = await api.getSprintQualifyingResults(year, currentRace.round, sqDt);
    if (!results || results.length === 0) return { state: 'no_results', lang };

    if (results[0]) results[0].photo = F1Api.driverPhotoUrl(F1Api.driverIdFromCode(results[0].code));

    return {
      state:    'results',
      lang,
      round:    String(currentRace.round),
      raceName: currentRace.raceName || '',
      results,
    };
  },
};
