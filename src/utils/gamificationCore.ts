const AEST_OFFSET_MS = 10 * 60 * 60 * 1000;

export function aestDateString(date = new Date()): string {
  return new Date(date.getTime() + AEST_OFFSET_MS).toISOString().slice(0, 10);
}

export function daysBetweenDates(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  return Math.round((toMs - fromMs) / 86_400_000);
}

export function nextStreak(current: number, lastActivityDate: string | null, activityDate: string): number {
  if (!lastActivityDate) return 1;
  const difference = daysBetweenDates(lastActivityDate, activityDate);
  if (difference <= 0) return Math.max(1, current);
  return difference === 1 ? current + 1 : 1;
}

export function visibleStreak(
  current: number,
  lastActivityDate: string | null,
  today = aestDateString(),
): number {
  if (!lastActivityDate) return 0;
  return daysBetweenDates(lastActivityDate, today) <= 1 ? current : 0;
}

export const WEEKLY_CHALLENGES = [
  { key: 'hard_hole_pars', title: 'Pressure Pars', description: 'Make 3 pars on holes rated index 1-5 this week', target: 3 },
  { key: 'full_round', title: 'Full Card', description: 'Complete a full 18-hole round', target: 1 },
  { key: 'beat_last_score', title: 'Beat Your Last', description: "Beat your last round's score", target: 1 },
  { key: 'two_rounds', title: 'Double Header', description: 'Play 2 rounds this week', target: 2 },
] as const;

export type WeeklyChallenge = typeof WEEKLY_CHALLENGES[number];

export function aestWeekStart(date = new Date()): string {
  const local = new Date(date.getTime() + AEST_OFFSET_MS);
  const day = local.getUTCDay();
  local.setUTCDate(local.getUTCDate() - ((day + 6) % 7));
  return local.toISOString().slice(0, 10);
}

export function weeklyChallengeForDate(date = new Date()): WeeklyChallenge {
  const weekStart = Date.parse(`${aestWeekStart(date)}T00:00:00Z`);
  const weekNumber = Math.floor(weekStart / (7 * 86_400_000));
  const index = ((weekNumber % WEEKLY_CHALLENGES.length) + WEEKLY_CHALLENGES.length)
    % WEEKLY_CHALLENGES.length;
  return WEEKLY_CHALLENGES[index];
}
