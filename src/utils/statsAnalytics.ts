export type AnalyticsHole = { number: number; par: number };
export type AnalyticsRound = {
  id: string;
  courseName: string;
  holes: AnalyticsHole[];
};
export type AnalyticsScore = {
  round_id: string;
  hole_number: number;
  gross_score: number | null;
  fairway_hit: string;
  gir: boolean | null;
  putts: number;
};

export type HoleAverage = {
  key: string;
  courseName: string;
  holeNumber: number;
  par: number;
  average: number;
  diff: number;
  rounds: number;
};

export function calculatePerformanceAnalytics(
  newestFirstRounds: AnalyticsRound[],
  scores: AnalyticsScore[],
  limit = 20,
) {
  const rounds = newestFirstRounds.slice(0, limit);
  const roundMap = new Map(rounds.map(round => [round.id, round]));
  let fairwayAttempts = 0;
  let fairwaysHit = 0;
  let greensHit = 0;
  let scoredHoles = 0;
  let totalPutts = 0;
  const parTotals = new Map<number, { total: number; count: number }>();
  const holeTotals = new Map<string, {
    courseName: string;
    holeNumber: number;
    par: number;
    total: number;
    count: number;
  }>();

  for (const score of scores) {
    const round = roundMap.get(score.round_id);
    if (!round) continue;
    const hole = round.holes.find(item => item.number === score.hole_number);
    if (!hole || score.gross_score == null) continue;

    scoredHoles++;
    totalPutts += score.putts ?? 0;
    if (score.gir === true) greensHit++;
    if (hole.par >= 4) {
      fairwayAttempts++;
      if (score.fairway_hit === 'hit') fairwaysHit++;
    }

    const parEntry = parTotals.get(hole.par) ?? { total: 0, count: 0 };
    parEntry.total += score.gross_score;
    parEntry.count++;
    parTotals.set(hole.par, parEntry);

    const key = `${round.courseName}:${hole.number}`;
    const holeEntry = holeTotals.get(key) ?? {
      courseName: round.courseName,
      holeNumber: hole.number,
      par: hole.par,
      total: 0,
      count: 0,
    };
    holeEntry.total += score.gross_score;
    holeEntry.count++;
    holeTotals.set(key, holeEntry);
  }

  const holeAverages: HoleAverage[] = [...holeTotals.entries()].map(([key, value]) => {
    const average = value.total / value.count;
    return {
      key,
      courseName: value.courseName,
      holeNumber: value.holeNumber,
      par: value.par,
      average,
      diff: average - value.par,
      rounds: value.count,
    };
  });
  const sorted = holeAverages.sort((a, b) => a.diff - b.diff);

  return {
    firPct: fairwayAttempts > 0 ? Math.round((fairwaysHit / fairwayAttempts) * 100) : 0,
    girPct: scoredHoles > 0 ? Math.round((greensHit / scoredHoles) * 100) : 0,
    avgPutts: rounds.length > 0 ? totalPutts / rounds.length : null,
    parAverages: [3, 4, 5].map(par => {
      const entry = parTotals.get(par);
      return {
        label: `Par ${par} Avg`,
        value: entry ? entry.total / entry.count : 0,
      };
    }),
    bestHoles: sorted.slice(0, 3),
    worstHoles: [...sorted].reverse().slice(0, 3),
  };
}

export function calculateClubDistanceStats(distances: number[]) {
  const valid = distances.filter(distance => Number.isFinite(distance) && distance >= 20 && distance <= 400);
  if (valid.length === 0) return null;
  const average = valid.reduce((sum, distance) => sum + distance, 0) / valid.length;
  const variance = valid.reduce((sum, distance) => sum + (distance - average) ** 2, 0) / valid.length;
  return {
    average: Math.round(average),
    stddev: Math.round(Math.sqrt(variance)),
    samples: valid.length,
  };
}
