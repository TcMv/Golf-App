-- Phase 5 canonical gamification tables.

CREATE TABLE IF NOT EXISTS user_streaks (
  user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  current_streak integer NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  longest_streak integer NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  last_activity_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own streak" ON user_streaks;
CREATE POLICY "Users manage own streak" ON user_streaks
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS practice_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  activity_date date NOT NULL,
  practice_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE practice_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own practice" ON practice_logs;
CREATE POLICY "Users manage own practice" ON practice_logs
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS practice_logs_user_date_idx
  ON practice_logs(user_id, activity_date DESC);

CREATE TABLE IF NOT EXISTS user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  achievement_key text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_key)
);

ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own achievements" ON user_achievements;
CREATE POLICY "Users manage own achievements" ON user_achievements
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS user_weekly_challenges (
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  week_start date NOT NULL,
  challenge_key text NOT NULL,
  current_value integer NOT NULL DEFAULT 0,
  target_value integer NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  PRIMARY KEY (user_id, week_start)
);

ALTER TABLE user_weekly_challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own weekly challenge" ON user_weekly_challenges;
CREATE POLICY "Users manage own weekly challenge" ON user_weekly_challenges
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
