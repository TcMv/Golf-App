// GA / World Handicap System differential and index calculation

export function calcDifferential(
  adjustedGross: number,
  courseRating: number,
  slopeRating: number,
  pcc = 0,
): number {
  return (113 / slopeRating) * (adjustedGross - courseRating - pcc);
}

export function calcHandicapIndex(differentials: number[]): number | null {
  if (differentials.length === 0) return null;
  const sorted = [...differentials].sort((a, b) => a - b);
  const recent20 = sorted.slice(0, 20);
  const count = recent20.length;

  let useCount: number;
  if (count < 3) return null;
  else if (count <= 6) useCount = 1;
  else if (count <= 8) useCount = 2;
  else if (count <= 11) useCount = 3;
  else if (count <= 14) useCount = 4;
  else if (count <= 16) useCount = 5;
  else if (count <= 18) useCount = 6;
  else if (count === 19) useCount = 7;
  else useCount = 8;

  const best = recent20.slice(0, useCount);
  const avg = best.reduce((s, d) => s + d, 0) / useCount;
  return Math.floor(avg * 0.96 * 10) / 10;
}

export function courseHandicap(
  handicapIndex: number,
  slopeRating: number,
  courseRating: number,
  par: number,
): number {
  return Math.round((handicapIndex * (slopeRating / 113)) + (courseRating - par));
}

// Adjusted gross score under WHS (max per hole = net double bogey)
export function adjustedScore(
  grossScore: number,
  par: number,
  strokeIndex: number,
  courseHandicapValue: number,
): number {
  const strokes = strokeIndex <= courseHandicapValue ? 1 : 0;
  const maxScore = par + 2 + strokes;
  return Math.min(grossScore, maxScore);
}
