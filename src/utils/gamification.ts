import { supabase } from '../lib/supabase';

export function levelFromXp(xp: number): number {
  return Math.floor(Math.sqrt(xp / 200)) + 1;
}

export function xpForNextLevel(level: number): number {
  return level * level * 200;
}

export function xpProgress(xp: number): {
  level: number;
  currentXp: number;
  neededXp: number;
  pct: number;
} {
  const level = levelFromXp(xp);
  const thisLevelFloor = (level - 1) * (level - 1) * 200;
  const nextLevelCeil = xpForNextLevel(level);
  const currentXp = xp - thisLevelFloor;
  const neededXp = nextLevelCeil - thisLevelFloor;
  return { level, currentXp, neededXp, pct: Math.min(1, currentXp / neededXp) };
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
  xp += opts.eagles * 50;
  xp += opts.birdies * 20;
  xp += opts.pars * 5;
  if (opts.girPct >= 50) xp += 25;
  if (opts.holesPlayed >= 18 && opts.totalPutts > 0 && opts.totalPutts <= 30) xp += 25;
  return xp;
}

export type RoundResult = {
  birdies: number;
  eagles: number;
  pars: number;
  bogeys: number;
  doublePlus: number;
  girPct: number;
  totalPutts: number;
  holesPlayed: number;
};

export type NewBadge = {
  key: string;
  name: string;
  icon: string;
  description: string;
};

export type ProcessResult = {
  xpGained: number;
  newBadges: NewBadge[];
};

export async function processRoundFinish(
  userId: string,
  roundDate: string,
  result: RoundResult,
): Promise<ProcessResult> {
  const { data: current } = await supabase
    .from('user_stats')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  // Streak: consecutive calendar days
  let newStreak = 1;
  if (current?.last_round_date) {
    const diffDays = Math.round(
      (new Date(roundDate).getTime() - new Date(current.last_round_date).getTime()) / 86400000,
    );
    if (diffDays === 0) newStreak = current.streak_days ?? 1;
    else if (diffDays === 1) newStreak = (current.streak_days ?? 0) + 1;
  }

  const prevBirdies = current?.total_birdies ?? 0;
  const prevEagles = current?.total_eagles ?? 0;
  const newTotalRounds = (current?.total_rounds ?? 0) + 1;
  const newTotalBirdies = prevBirdies + result.birdies;
  const newTotalEagles = prevEagles + result.eagles;

  const xpGained = calcXpForRound({
    holesPlayed: result.holesPlayed,
    birdies: result.birdies,
    eagles: result.eagles,
    pars: result.pars,
    girPct: result.girPct,
    totalPutts: result.totalPutts,
  });
  const newXp = (current?.xp ?? 0) + xpGained;

  await supabase.from('user_stats').upsert({
    user_id: userId,
    xp: newXp,
    level: levelFromXp(newXp),
    streak_days: newStreak,
    last_round_date: roundDate,
    total_rounds: newTotalRounds,
    total_birdies: newTotalBirdies,
    total_eagles: newTotalEagles,
    updated_at: new Date().toISOString(),
  });

  // Badge checking
  const { data: existingRows } = await supabase
    .from('user_badges')
    .select('badge_key')
    .eq('user_id', userId);
  const earned = new Set((existingRows ?? []).map((b: any) => b.badge_key as string));

  const toAward: string[] = [];
  const check = (key: string, cond: boolean) => { if (cond && !earned.has(key)) toAward.push(key); };

  check('first_round',  newTotalRounds === 1);
  check('rounds_5',     newTotalRounds >= 5);
  check('rounds_10',    newTotalRounds >= 10);
  check('rounds_25',    newTotalRounds >= 25);
  check('rounds_50',    newTotalRounds >= 50);
  check('first_birdie', result.birdies > 0 && prevBirdies === 0);
  check('first_eagle',  result.eagles > 0 && prevEagles === 0);
  check('streak_3',     newStreak >= 3);
  check('streak_7',     newStreak >= 7);
  check('low_putts',    result.holesPlayed >= 18 && result.totalPutts > 0 && result.totalPutts <= 30);
  check('bogey_free',   result.bogeys === 0 && result.doublePlus === 0 && result.holesPlayed >= 18);
  check('gir_50',       result.girPct >= 50);

  let newBadges: NewBadge[] = [];

  if (toAward.length > 0) {
    await supabase.from('user_badges').insert(
      toAward.map(key => ({ user_id: userId, badge_key: key })),
    );
    const { data: defs } = await supabase
      .from('badges')
      .select('key, name, icon, description, xp_reward')
      .in('key', toAward);
    if (defs) {
      newBadges = defs as NewBadge[];
      const bonusXp = (defs as any[]).reduce((s, b) => s + (b.xp_reward ?? 0), 0);
      if (bonusXp > 0) {
        const finalXp = newXp + bonusXp;
        await supabase.from('user_stats')
          .update({ xp: finalXp, level: levelFromXp(finalXp) })
          .eq('user_id', userId);
      }
    }
  }

  return { xpGained, newBadges };
}
