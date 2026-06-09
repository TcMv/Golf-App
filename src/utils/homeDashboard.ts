export type HomeRoundHole = { number: number; par: number };
export type CourseHole = HomeRoundHole & { course_id: string };

export function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function monthStartString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

export function roundHoleSequence(startingHole: number, holesPlayed: number): number[] {
  if (holesPlayed === 9) {
    return Array.from({ length: 9 }, (_, index) => ((startingHole - 1 + index) % 18) + 1);
  }
  return Array.from({ length: 18 }, (_, index) => ((startingHole - 1 + index) % 18) + 1);
}

export function calculateRoundPar(
  holes: HomeRoundHole[],
  startingHole: number,
  holesPlayed: number,
): number | null {
  const sequence = new Set(roundHoleSequence(startingHole, holesPlayed));
  const played = holes.filter(hole => sequence.has(hole.number));
  return played.length > 0 ? played.reduce((sum, hole) => sum + hole.par, 0) : null;
}

export function groupHolesByCourse(holes: CourseHole[]): Record<string, HomeRoundHole[]> {
  return holes.reduce<Record<string, HomeRoundHole[]>>((grouped, hole) => {
    grouped[hole.course_id] = [
      ...(grouped[hole.course_id] ?? []),
      { number: hole.number, par: hole.par },
    ];
    return grouped;
  }, {});
}
