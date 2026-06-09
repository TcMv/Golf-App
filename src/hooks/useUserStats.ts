import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { ACHIEVEMENTS, visibleStreak, xpProgress } from '../utils/gamification';

export type UserStatsData = {
  xp: number;
  level: number;
  streak_days: number;
  last_round_date: string | null;
  total_rounds: number;
  total_birdies: number;
  total_eagles: number;
  longest_streak?: number;
};

export type EarnedBadge = {
  badge_key: string;
  earned_at: string;
  name: string;
  description: string;
  icon: string;
};

export { xpProgress };

export function useUserStats() {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStatsData | null>(null);
  const [badges, setBadges] = useState<EarnedBadge[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    const [{ data: s }, { data: streak }, { data: achievements }] = await Promise.all([
      supabase
        .from('user_stats')
        .select('xp, level, streak_days, last_round_date, total_rounds, total_birdies, total_eagles')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('user_streaks')
        .select('current_streak, longest_streak, last_activity_date')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('user_achievements')
        .select('achievement_key, earned_at')
        .eq('user_id', user.id)
        .order('earned_at', { ascending: false }),
    ]);
    const persistedStreak = streak?.current_streak ?? s?.streak_days ?? 0;
    const lastActivityDate = streak?.last_activity_date ?? s?.last_round_date ?? null;
    const activeStreak = visibleStreak(persistedStreak, lastActivityDate);
    if (streak && activeStreak === 0 && persistedStreak > 0) {
      await supabase.from('user_streaks').update({
        current_streak: 0,
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id);
    }
    setStats({
      xp: s?.xp ?? 0,
      level: s?.level ?? 1,
      streak_days: activeStreak,
      last_round_date: lastActivityDate,
      total_rounds: s?.total_rounds ?? 0,
      total_birdies: s?.total_birdies ?? 0,
      total_eagles: s?.total_eagles ?? 0,
      longest_streak: streak?.longest_streak ?? persistedStreak,
    });
    setBadges(
      (achievements ?? []).map((row: any) => {
        const definition = ACHIEVEMENTS[row.achievement_key as keyof typeof ACHIEVEMENTS];
        return {
        badge_key: row.achievement_key as string,
        earned_at: row.earned_at as string,
        name: definition?.[0] ?? '',
        icon: definition?.[1] ?? '🏅',
        description: definition?.[2] ?? '',
      }}),
    );
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  return { stats, badges, loading, refresh };
}
