import type {
  Club,
  ShotMissDirection,
  ShotOutcome,
  ShotTarget,
  StrikeQuality,
} from '../types';

export type ShotLearningRow = {
  club_name: string | null;
  distance_metres: number | null;
  target_type: ShotTarget | null;
  outcome: ShotOutcome | null;
  miss_direction: ShotMissDirection | null;
  strike_quality: StrikeQuality | null;
};

export type ClubLearningSummary = {
  clubName: string;
  sampleCount: number;
  averageCarry: number;
  reliableCarry: number;
  commonMiss: ShotMissDirection | null;
  commonStrike: StrikeQuality | null;
  hitRate: number;
};

export type ClubLearningMap = Record<string, ClubLearningSummary>;

function mostCommon<T extends string>(values: T[]): T | null {
  if (values.length === 0) return null;
  const counts = new Map<T, number>();
  values.forEach(value => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function summarizeClubLearning(
  clubName: string,
  rows: ShotLearningRow[],
): ClubLearningSummary | null {
  const clubRows = rows.filter(row =>
    row.club_name?.toLowerCase() === clubName.toLowerCase()
    && row.distance_metres != null
    && row.distance_metres >= 20
    && row.distance_metres <= 400,
  );
  if (clubRows.length === 0) return null;

  const distances = clubRows.map(row => row.distance_metres as number).sort((a, b) => a - b);
  const averageCarry = Math.round(
    distances.reduce((sum, distance) => sum + distance, 0) / distances.length,
  );
  const reliableRows = clubRows.filter(row =>
    row.strike_quality === 'pure'
    || (row.strike_quality == null && row.outcome === 'hit'),
  );
  const reliableDistances = (reliableRows.length >= 3 ? reliableRows : clubRows)
    .map(row => row.distance_metres as number);
  const reliableCarry = Math.round(
    reliableDistances.reduce((sum, distance) => sum + distance, 0) / reliableDistances.length,
  );
  const decidedOutcomes = clubRows.filter(row => row.outcome === 'hit' || row.outcome === 'miss');

  return {
    clubName,
    sampleCount: clubRows.length,
    averageCarry,
    reliableCarry,
    commonMiss: mostCommon(
      clubRows
        .map(row => row.miss_direction)
        .filter((value): value is ShotMissDirection => value != null),
    ),
    commonStrike: mostCommon(
      clubRows
        .map(row => row.strike_quality)
        .filter((value): value is StrikeQuality => value != null),
    ),
    hitRate: decidedOutcomes.length === 0
      ? 0
      : Math.round(
          decidedOutcomes.filter(row => row.outcome === 'hit').length
          / decidedOutcomes.length
          * 100,
        ),
  };
}

export function buildClubLearningMap(rows: ShotLearningRow[]): ClubLearningMap {
  const names = [...new Set(
    rows
      .map(row => row.club_name?.trim())
      .filter((name): name is string => Boolean(name)),
  )];

  return Object.fromEntries(
    names
      .map(name => summarizeClubLearning(name, rows))
      .filter((summary): summary is ClubLearningSummary => summary != null)
      .map(summary => [summary.clubName.toLowerCase(), summary]),
  );
}

export function applyLearnedCarries(
  clubs: Club[],
  learning: ClubLearningMap,
  minimumSamples = 3,
): Club[] {
  return clubs.map(club => {
    const label = (club.custom_name ?? club.name).toLowerCase();
    const summary = learning[label];
    if (!summary || summary.sampleCount < minimumSamples) return club;

    if (club.carry_metres == null) {
      return { ...club, carry_metres: summary.reliableCarry };
    }

    // GPS tracks total shot distance, not pure carry. Keep learning useful
    // without allowing rollout, slopes, or bad data to rewrite the user's bag.
    const maximumChange = Math.max(8, Math.round(club.carry_metres * 0.1));
    const boundedCarry = Math.max(
      club.carry_metres - maximumChange,
      Math.min(club.carry_metres + maximumChange, summary.reliableCarry),
    );

    return {
      ...club,
      carry_metres: Math.round((club.carry_metres * 2 + boundedCarry) / 3),
    };
  });
}

export function learningNote(
  clubName: string,
  learning: ClubLearningMap,
): string | null {
  const summary = learning[clubName.toLowerCase()];
  if (!summary || summary.sampleCount < 3) return null;

  const parts = [`learned from ${summary.sampleCount} shots`];
  if (summary.commonMiss) parts.push(`usual miss ${summary.commonMiss}`);
  if (summary.commonStrike && summary.commonStrike !== 'pure') {
    parts.push(`common strike ${summary.commonStrike}`);
  }
  return parts.join(', ');
}
