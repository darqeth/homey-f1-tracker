'use strict';

// Session definitions in chronological order for each weekend type
const SESSION_KEYS = [
  { key: 'FirstPractice',     type: 'fp1',          label: 'Practice 1' },
  { key: 'SecondPractice',    type: 'fp2',          label: 'Practice 2' },
  { key: 'SprintQualifying',  type: 'sprint_quali', label: 'Sprint Qualifying' },
  { key: 'ThirdPractice',     type: 'fp3',          label: 'Practice 3' },
  { key: 'Sprint',            type: 'sprint',       label: 'Sprint' },
  { key: 'Qualifying',        type: 'qualifying',   label: 'Qualifying' },
];

module.exports = {
  async schedule({ homey }) {
    const app = homey.app;
    const races = await app.f1Api.getSeasonRaces();
    if (!races || races.length === 0) return null;

    const now = Date.now();

    // Find the current or next race weekend:
    // "current" = FP1 has started but race hasn't ended yet (race + 4h buffer)
    // "next"    = first race with race date in the future
    let target = null;

    for (const race of races) {
      if (race.round == null) continue; // cancelled

      const raceDt = app.time.parseRaceDateTime(race);
      if (!raceDt) continue;

      const raceEnd = raceDt.getTime() + 4 * 3600 * 1000; // race + 4h

      // Get earliest session start (FP1 or first available session)
      const fp1 = race.FirstPractice
        ? app.time.parseSessionDateTime(race.FirstPractice)
        : null;
      const weekendStart = fp1 ? fp1.getTime() : raceDt.getTime() - 3 * 86400 * 1000;

      if (now >= weekendStart && now <= raceEnd) {
        // We're inside this weekend
        target = race;
        break;
      }

      if (raceDt.getTime() > now && !target) {
        // First future race
        target = race;
      }
    }

    if (!target) return null;

    const raceDt = app.time.parseRaceDateTime(target);

    // Build session list
    const sessions = [];

    for (const { key, type, label } of SESSION_KEYS) {
      if (!target[key]) continue;
      const dt = app.time.parseSessionDateTime(target[key]);
      if (!dt) continue;
      sessions.push({ type, label, isoDate: dt.toISOString() });
    }

    // Add the race itself
    sessions.push({
      type: 'race',
      label: 'Race',
      isoDate: raceDt.toISOString(),
    });

    // Sort chronologically
    sessions.sort((a, b) => new Date(a.isoDate) - new Date(b.isoDate));

    return {
      round: Number(target.round),
      raceName: target.raceName,
      country: target.Circuit?.Location?.country || '',
      city: target.Circuit?.Location?.locality || '',
      circuitName: target.Circuit?.circuitName || '',
      circuitId: target.Circuit?.circuitId || '',
      isDutch: target.Circuit?.Location?.country === 'Netherlands',
      sessions,
    };
  },
};
