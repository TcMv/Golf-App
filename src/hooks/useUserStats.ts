import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { xpProgress } from '../utils/gamification';

export type UserStatsData = {
  xp: number;
  level: number;
  streak_days: number;
  last_round_date: string | null;
  total_rounds: number;
  total_birdies: number;
  total_eagles: number;
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
    const [{ data: s }, { data: b }] = await Promise.all([
      supabase.from('user_stats').select('*').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('user_badges')
        .select('badge_key, earned_at, badges(name, description, icon)')
        .eq('user_id', user.id)
        .order('earned_at', { ascending: false })
        .limit(10),
    ]);
    setStats(s ?? null);
    setBadges(
      (b ?? []).map((row: any) => ({
        badge_key: row.badge_key as string,
        earned_at: row.earned_at as string,
        name: (row.badges as any)?.name ?? '',
        description: (row.badges as any)?.description ?? '',
        icon: (row.badges as any)?.icon ?? '🏅',
      })),
    );
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  return { stats, badges, loading, refresh };
}
