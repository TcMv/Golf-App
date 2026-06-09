-- Phase 9 profile and settings preferences.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS notify_round_reminders boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_streak_alerts boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_achievement_unlocks boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  DELETE FROM public.user_challenge_progress WHERE user_id = auth.uid();
  DELETE FROM public.user_weekly_challenges WHERE user_id = auth.uid();
  DELETE FROM public.user_achievements WHERE user_id = auth.uid();
  DELETE FROM public.user_badges WHERE user_id = auth.uid();
  DELETE FROM public.practice_logs WHERE user_id = auth.uid();
  DELETE FROM public.user_streaks WHERE user_id = auth.uid();
  DELETE FROM public.user_stats WHERE user_id = auth.uid();
  DELETE FROM public.user_clubs WHERE user_id = auth.uid();
  DELETE FROM public.handicap_history WHERE user_id = auth.uid();
  DELETE FROM public.rounds WHERE user_id = auth.uid();
  DELETE FROM public.profiles WHERE id = auth.uid();
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION delete_own_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_own_account() TO authenticated;
