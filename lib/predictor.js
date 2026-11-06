'use strict';

const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];
const SIMULATIONS = 10000;
const FORM_DECAY = 0.6;     // weight multiplier per older round
const TRACK_WEIGHT = 0.25;   // share of circuit history in a driver's expected score
const TRACK_SEASONS = 3;     // seasons of circuit history to consider
const SHARPNESS = 1.2;       // >1 favours stronger drivers in the finishing-order sampling
const FORM_SWING = 0.35;     // per-simulation lognormal noise on strength, models form changes
const CACHE_MS = 3600 * 1000;

/**
 * Monte Carlo championship predictor.
 * Strength per driver = decayed season form, blended with their points history at each
 * remaining circuit. Each remaining race/sprint is simulated with a Plackett-Luce draw.
 */
class ChampionshipPredictor {
  constructor(f1Api, time) {
    this.f1Api = f1Api;
    this.time = time;
    this.cache = null;
  }

  async predict() {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.data;

    const races = await this.f1Api.getSeasonRaces();
    const season = races[0]?.season;
    if (!season) return null;

    const [standings, raceResults, sprintResults] = await Promise.all([
      this.f1Api.getDriverStandings(),
      this.f1Api.getAllResults(season, 'results'),
      this.f1Api.getAllResults(season, 'sprint'),
    ]);
    if (!standings.length) return null;

    const done = new Set(raceResults.map(r => r.round));
    const remaining = races.filter(r => r.round != null && !done.has(String(r.round)) && this.time.parseRaceDateTime(r));
    const remainingSprints = remaining.filter(r => r.Sprint).length;

    const drivers = standings.map(s => ({
      id: s.driverId,
      name: s.name,
      code: s.code,
      constructor: s.constructor,
      constructorId: s.constructorId,
      points: Number(s.points),
    }));

    const raceForm = this._form(raceResults, drivers);
    const sprintForm = this._form(sprintResults, drivers);
    const history = await this._circuitHistory(remaining, Number(season));

    const raceStrengths = remaining.map(race => drivers.map(d => {
      const form = raceForm.get(d.id) || 0;
      const track = history.get(race.Circuit?.circuitId)?.get(d.id);
      return track == null ? form : (1 - TRACK_WEIGHT) * form + TRACK_WEIGHT * track;
    }));
    const sprintStrength = drivers.map(d => sprintForm.get(d.id) || 0);

    const data = this._simulate(drivers, remaining, raceStrengths, sprintStrength);
    data.season = season;
    data.racesRemaining = remaining.length;
    data.sprintsRemaining = remainingSprints;
    data.pointsRemaining = remaining.length * RACE_POINTS[0] + remainingSprints * SPRINT_POINTS[0];

    this.cache = { at: Date.now(), data };
    return data;
  }

  clearCache() {
    this.cache = null;
  }

  // Exponentially decayed average points per round, most recent round weighted highest.
  _form(results, drivers) {
    const rounds = [...new Set(results.map(r => Number(r.round)))].sort((a, b) => b - a);
    const byRound = new Map(results.map(r => [Number(r.round), r.Results || []]));
    const form = new Map();
    for (const d of drivers) {
      let sum = 0;
      let weight = 0;
      rounds.forEach((round, i) => {
        const entry = byRound.get(round).find(x => x.Driver?.driverId === d.id);
        if (!entry) return;
        const w = FORM_DECAY ** i;
        sum += w * Number(entry.points || 0);
        weight += w;
      });
      form.set(d.id, weight ? sum / weight : 0);
    }
    return form;
  }

  // Map<circuitId, Map<driverId, avgPoints>> over the previous seasons.
  async _circuitHistory(remaining, season) {
    const history = new Map();
    for (const race of remaining) {
      const circuitId = race.Circuit?.circuitId;
      if (!circuitId || history.has(circuitId)) continue;
      const totals = new Map();
      for (let year = season - TRACK_SEASONS; year < season; year++) {
        const results = await this.f1Api.getCircuitResults(year, circuitId);
        for (const r of results) {
          const t = totals.get(r.Driver.driverId) || { sum: 0, n: 0 };
          t.sum += Number(r.points || 0);
          t.n += 1;
          totals.set(r.Driver.driverId, t);
        }
      }
      history.set(circuitId, new Map([...totals].map(([id, t]) => [id, t.sum / t.n])));
    }
    return history;
  }

  _simulate(drivers, remaining, raceStrengths, sprintStrength) {
    const n = drivers.length;
    const raceWeights = raceStrengths.map(s => s.map(toWeight));
    const sprintWeights = sprintStrength.map(toWeight);
    const titles = new Array(n).fill(0);
    const totalPoints = new Array(n).fill(0);
    const constructorIds = [...new Set(drivers.map(d => d.constructorId))];
    const constructorTitles = new Map(constructorIds.map(id => [id, 0]));

    const points = new Array(n);
    const swing = new Array(n);
    for (let sim = 0; sim < SIMULATIONS; sim++) {
      for (let i = 0; i < n; i++) {
        points[i] = drivers[i].points;
        swing[i] = Math.exp(FORM_SWING * gaussian());
      }
      const scale = weights => weights.map((w, i) => w * swing[i]);
      remaining.forEach((race, r) => {
        if (race.Sprint) award(points, sampleOrder(scale(sprintWeights)), SPRINT_POINTS);
        award(points, sampleOrder(scale(raceWeights[r])), RACE_POINTS);
      });

      let best = 0;
      for (let i = 1; i < n; i++) if (points[i] > points[best]) best = i;
      titles[best]++;
      for (let i = 0; i < n; i++) totalPoints[i] += points[i];

      const teamPoints = new Map();
      drivers.forEach((d, i) => teamPoints.set(d.constructorId, (teamPoints.get(d.constructorId) || 0) + points[i]));
      const bestTeam = [...teamPoints].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      constructorTitles.set(bestTeam, constructorTitles.get(bestTeam) + 1);
    }

    const sprints = remaining.filter(r => r.Sprint).length;
    const maxGain = remaining.length * RACE_POINTS[0] + sprints * SPRINT_POINTS[0];
    const maxTeamGain = remaining.length * (RACE_POINTS[0] + RACE_POINTS[1]) + sprints * (SPRINT_POINTS[0] + SPRINT_POINTS[1]);
    const leaderPoints = Math.max(...drivers.map(d => d.points));
    const driverPrediction = drivers
      .map((d, i) => ({
        driverId: d.id,
        name: d.name,
        code: d.code,
        constructor: d.constructor,
        points: d.points,
        projectedPoints: Math.round(totalPoints[i] / SIMULATIONS),
        probability: round1(100 * titles[i] / SIMULATIONS),
        canWin: d.points + maxGain >= leaderPoints,
      }))
      .sort((a, b) => b.probability - a.probability || b.projectedPoints - a.projectedPoints);

    const teams = constructorIds.map(id => {
      const members = drivers.filter(d => d.constructorId === id);
      return { id, members, points: members.reduce((s, m) => s + m.points, 0) };
    });
    const leaderTeamPoints = Math.max(...teams.map(t => t.points));
    const constructorPrediction = teams
      .map(({ id, members, points }) => {
        const idx = members.map(m => drivers.indexOf(m));
        return {
          constructorId: id,
          name: members[0].constructor,
          points,
          canWin: points + maxTeamGain >= leaderTeamPoints,
          projectedPoints: Math.round(idx.reduce((s, i) => s + totalPoints[i], 0) / SIMULATIONS),
          probability: round1(100 * constructorTitles.get(id) / SIMULATIONS),
        };
      })
      .sort((a, b) => b.probability - a.probability || b.projectedPoints - a.projectedPoints);

    return { drivers: driverPrediction, constructors: constructorPrediction };
  }
}

function toWeight(expectedPoints) {
  return (expectedPoints + 0.3) ** SHARPNESS;
}

// Plackett-Luce: repeatedly pick the next finisher proportional to weight.
function sampleOrder(weights) {
  const pool = weights.map((w, i) => ({ i, w }));
  let total = pool.reduce((s, p) => s + p.w, 0);
  const order = [];
  while (pool.length) {
    let r = Math.random() * total;
    let k = 0;
    while (k < pool.length - 1 && (r -= pool[k].w) > 0) k++;
    total -= pool[k].w;
    order.push(pool.splice(k, 1)[0].i);
  }
  return order;
}

function gaussian() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

function award(points, order, table) {
  table.forEach((p, pos) => { if (order[pos] != null) points[order[pos]] += p; });
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

module.exports = ChampionshipPredictor;
