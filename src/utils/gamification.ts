import { supabase } from '../lib/supabase';
import {
  aestDateString,
  aestWeekStart,
  nextStreak,
  weeklyChallengeForDate,
} from './gamificationCore';
export {
  aestDateString,
  aestWeekStart,
  daysBetweenDates,
  nextStreak,
  visibleStreak,
  WEEKLY_CHALLENGES,
  weeklyChallengeForDate,
} from './gamificationCore';

export function levelFromXp(xp: number): number {
  return Math.floor(Math.sqrt(xp / 200)) + 1;
}

export function xpForNextLevel(level: number): number {
  return level * level * 200;
}

export function xpProgress(xp: number) {
  const level = levelFromXp(xp);
  const floor = (level - 1) * (level - 1) * 200;
  const ceiling = xpForNextLevel(level);
  return {
    level,
    currentXp: xp - floor,
    neededXp: ceiling - floor,
    pct: Math.min(1, (xp - floor) / (ceiling - floor)),
  };
}

export function calcXpForRound(opts: {
  holesPlayed: number;
  birdies: number;
  eagles: number;
  pars: number;
  girPct: number;
  totalPutts: number;
}): number {
  let xp = opts.holesPlayed >= 18 ? 50 : 30;
  xp += opts.eagles * 50 + opts.birdies * 20 + opts.pars * 5;
  if (opts.girPct >= 50) xp += 25;
  if (opts.holesPlayed >= 18 && opts.totalPutts > 0 && opts.totalPutts <= 30) xp += 25;
  return xp;
}

export const ACHIEVEMENTS = {
  first_round: ['First Round', '⛳', 'Complete your first scored round'],
  under_par: ['Under Par', '−', 'Finish a round under par'],
  eagle_eye: ['Eagle Eye', '★', 'Record an eagle'],
  hole_in_one: ['Hole in One', '1', 'Record a hole in one'],
  consistent: ['Consistent', '≈', 'Finish 5 rounds within 3 shots of handicap'],
  century_club: ['Century Club', '100', 'Log 100 completed rounds'],
  streak_7: ['Streak 7', '7', 'Record activity on 7 consecutive days'],
  streak_30: ['Streak 30', '30', 'Record activity on 30 consecutive days'],
  club_pro: ['Club Pro', '14', 'Enter carry distances for 14 clubs'],
  course_explorer: ['Course Explorer', '10', 'Play 10 different courses'],
  single_figures: ['Single Figures', '<10', 'Reach a handicap below 10'],
  scratch: ['Scratch', '0', 'Reach a handicap of 0 or better'],
} as const;

export type AchievementKey = keyof typeof ACHIEVEMENTS;
export type NewBadge = { key: AchievementKey; name: string; icon: string; description: string };

export type RoundResult = {
  birdies: number;
  eagles: number;
  pars: number;
  bogeys: number;
  doublePlus: number;
  girPct: number;
  totalPutts: number;
  holesPlayed: number;
  totalScore: number;
  toPar: number;
  holeInOnes: number;
  courseId: string;
  handicapIndex: number | null;
};

export type ProcessResult = { xpGained: number; newBadges: NewBadge[] };

export async function loadWeeklyChallenge(userId: string) {
  const challenge = weeklyChallengeForDate();
  const weekStart = aestWeekStart();
  const weekEnd = new Date(Date.parse(`${weekStart}T00:00:00Z`) + 7 * 86_400_000)
    .toISOString().slice(0, 10);
  const { data: rounds } = await supabase
    .from('rounds')
    .select('id, date, gross_total, holes_played')
    .eq('user_id', userId)
    .eq('completed', true)
    .gte('date', weekStart)
    .lt('date', weekEnd)
    .order('date', { ascending: true });

  let currentValue = 0;
  if (challenge.key === 'full_round') {
    currentValue = (rounds ?? []).some(round => round.holes_played === 18) ? 1 : 0;
  } else if (challenge.key === 'two_rounds') {
    currentValue = Math.min(challenge.target, (rounds ?? []).length);
  } else if (challenge.key === 'beat_last_score') {
    const { data: previous } = await supabase
      .from('rounds')
      .select('gross_total')
      .eq('user_id', userId)
      .eq('completed', true)
      .lt('date', weekStart)
      .not('gross_total', 'is', null)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    currentValue = previous?.gross_total != null && (rounds ?? []).some(
      round => round.gross_total != null && round.gross_total < previous.gross_total,
    ) ? 1 : 0;
  } else if ((rounds ?? []).length > 0) {
    const ids = (rounds ?? []).map(round => round.id);
    const { data: scores } = await supabase
      .from('hole_scores')
      .select('gross_score, holes!inner(par, stroke_index)')
      .in('round_id', ids);
    currentValue = Math.min(challenge.target, (scores ?? []).filter(row => {
      const hole = row.holes as unknown as { par: number; stroke_index: number };
      return hole?.stroke_index <= 5 && row.gross_score === hole.par;
    }).length);
  }

  const completed = currentValue >= challenge.target;
  await supabase.from('user_weekly_challenges').upsert({
    user_id: userId,
    week_start: weekStart,
    challenge_key: challenge.key,
    current_value: currentValue,
    target_value: challenge.target,
    completed,
    completed_at: completed ? new Date().toISOString() : null,
  });
  return { challenge, currentValue, completed };
}

async function updateActivityStreak(userId: string, activityDate: string) {
  const { data } = await supabase
    .from('user_streaks')
    .select('current_streak, longest_streak, last_activity_date')
    .eq('user_id', userId)
    .maybeSingle();
  const currentStreak = nextStreak(data?.current_streak ?? 0, data?.last_activity_date ?? null, activityDate);
  const longestStreak = Math.max(data?.longest_streak ?? 0, currentStreak);
  await supabase.from('user_streaks').upsert({
    user_id: userId,
    current_streak: currentStreak,
    longest_streak: longestStreak,
    last_activity_date: activityDate,
    updated_at: new Date().toISOString(),
  });
  return { currentStreak, longestStreak };
}

async function awardAchievements(userId: string, keys: AchievementKey[]): Promise<NewBadge[]> {
  if (keys.length === 0) return [];
  const { data: existing } = await supabase
    .from('user_achievements')
    .select('achievement_key')
    .eq('user_id', userId)
    .in('achievement_key', keys);
  const earned = new Set((existing ?? []).map(row => row.achievement_key as AchievementKey));
  const newKeys = keys.filter(key => !earned.has(key));
  if (newKeys.length === 0) return [];
  await supabase.from('user_achievements').insert(
    newKeys.map(achievement_key => ({ user_id: userId, achievement_key })),
  );
  return newKeys.map(key => {
    const [name, icon, description] = ACHIEVEMENTS[key];
    return { key, name, icon, description };
  });
}

export async function processPracticeActivity(userId: string, practiceType: string) {
  const activityDate = aestDateString();
  await supabase.from('practice_logs').insert({
    user_id: userId,
    activity_date: activityDate,
    practice_type: practiceType,
  });
  const streak = await updateActivityStreak(userId, activityDate);
  const { data: stats } = await supabase.from('user_stats').select('xp').eq('user_id', userId).maybeSingle();
  const xp = (stats?.xp ?? 0) + 15;
  await supabase.from('user_stats').upsert({
    user_id: userId,
    xp,
    level: levelFromXp(xp),
    streak_days: streak.currentStreak,
    last_round_date: activityDate,
    updated_at: new Date().toISOString(),
  });
  const keys: AchievementKey[] = [];
  if (streak.currentStreak >= 7) keys.push('streak_7');
  if (streak.currentStreak >= 30) keys.push('streak_30');
  return { streak: streak.currentStreak, xpGained: 15, newBadges: await awardAchievements(userId, keys) };
}

export async function processRoundFinish(
  userId: string,
  roundDate: string,
  result: RoundResult,
): Promise<ProcessResult> {
  const activityDate = roundDate || aestDateString();
  const streak = await updateActivityStreak(userId, activityDate);
  const [{ data: current }, { count: roundCount }, { data: courses }, { count: clubCount }, { data: recentRounds }] =
    await Promise.all([
      supabase
        .from('user_stats')
        .select('xp, level, streak_days, last_round_date, total_rounds, total_birdies, total_eagles')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase.from('rounds').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('completed', true),
      supabase.from('rounds').select('course_id').eq('user_id', userId).eq('completed', true),
      supabase.from('user_clubs').select('id', { count: 'exact', head: true }).eq('user_id', userId).not('carry_distance_metres', 'is', null),
      supabase.from('rounds').select('gross_total, handicap_differential').eq('user_id', userId).eq('completed', true).not('gross_total', 'is', null).order('date', { ascending: false }).limit(5),
    ]);

  const xpGained = calcXpForRound(result);
  const newXp = (current?.xp ?? 0) + xpGained;
  const totalRounds = roundCount ?? Math.max(1, (current?.total_rounds ?? 0) + 1);
  await supabase.from('user_stats').upsert({
    user_id: userId,
    xp: newXp,
    level: levelFromXp(newXp),
    streak_days: streak.currentStreak,
    last_round_date: activityDate,
    total_rounds: totalRounds,
    total_birdies: (current?.total_birdies ?? 0) + result.birdies,
    total_eagles: (current?.total_eagles ?? 0) + result.eagles,
    updated_at: new Date().toISOString(),
  });

  const consistent = (recentRounds ?? []).length >= 5 && (recentRounds ?? []).every(round => {
    if (round.handicap_differential == null || result.handicapIndex == null) return false;
    return Math.abs(round.handicap_differential - result.handicapIndex) <= 3;
  });
  const uniqueCourses = new Set((courses ?? []).map(row => row.course_id)).size;
  const keys: AchievementKey[] = ['first_round'];
  if (result.toPar < 0) keys.push('under_par');
  if (result.eagles > 0) keys.push('eagle_eye');
  if (result.holeInOnes > 0) keys.push('hole_in_one');
  if (consistent) keys.push('consistent');
  if (totalRounds >= 100) keys.push('century_club');
  if (streak.currentStreak >= 7) keys.push('streak_7');
  if (streak.currentStreak >= 30) keys.push('streak_30');
  if ((clubCount ?? 0) >= 14) keys.push('club_pro');
  if (uniqueCourses >= 10) keys.push('course_explorer');
  if (result.handicapIndex != null && result.handicapIndex < 10) keys.push('single_figures');
  if (result.handicapIndex != null && result.handicapIndex <= 0) keys.push('scratch');

  return { xpGained, newBadges: await awardAchievements(userId, keys) };
}
