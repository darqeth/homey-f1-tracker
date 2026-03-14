'use strict';

/**
 * GET /race_overview
 * Query:
 *   round=1..
 *   fields=comma,separated (optional, widget filters anyway)
 */
module.exports = async ({ homey, query } = {}) => {
  const app = homey?.app;
  if (!app?.f1Api || !app?.time) return { gpName: '', finished: false, countdown: '' };

  const round = String(query?.round || '1');
  const race = await app.f1Api.getRaceByRound(round);
  if (!race) return { gpName: '', finished: false, countdown: '' };

  const raceDt = app.time.parseRaceDateTime(race);
  const now = Date.now();

  const finished = raceDt ? raceDt.getTime() < now : false;
  const fmt = (dt) => dt ? app.time.formatLocal(dt) : '';

  const fp1 = app.time.parseSessionDateTime(race.FirstPractice);
  const fp2 = app.time.parseSessionDateTime(race.SecondPractice);
  const fp3 = app.time.parseSessionDateTime(race.ThirdPractice);
  const quali = app.time.parseSessionDateTime(race.Qualifying);
  const sprint = app.time.parseSessionDateTime(race.Sprint);
  const sprintQuali = app.time.parseSessionDateTime(race.SprintQualifying);

  let winner = '';
  if (finished) {
    winner = await app.f1Api.getWinnerForRound(round);
  }

  const diffSec = raceDt ? Math.max(0, Math.ceil((raceDt.getTime() - now) / 1000)) : 0;
  const countdown = finished ? '' : (diffSec ? `${Math.floor(diffSec / 3600)}u ${Math.floor((diffSec % 3600) / 60)}m` : '');

  return {
    gpName: race.raceName || '',
    raceTime: fmt(raceDt),
    country: race.Circuit?.Location?.country || '',
    city: race.Circuit?.Location?.locality || '',
    circuit: race.Circuit?.circuitName || '',
    fp1: fmt(fp1),
    fp2orSQ: fmt(sprintQuali) || fmt(fp2),
    fp3orSprint: fmt(sprint) || fmt(fp3),
    quali: fmt(quali),
    winner,
    finished,
    countdown
  };
};
