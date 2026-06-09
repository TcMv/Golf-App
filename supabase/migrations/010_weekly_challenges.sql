-- ============================================================
-- Phase 7: Weekly Challenges & Progress
-- Run in Supabase SQL editor
-- ============================================================

CREATE TABLE IF NOT EXISTS weekly_challenges (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start     date NOT NULL DEFAULT CURRENT_DATE,
  title          text NOT NULL,
  description    text NOT NULL,
  challenge_type text NOT NULL, -- 'rounds' | 'pars' | 'score'
  target_value   integer NOT NULL
);

CREATE TABLE IF NOT EXISTS user_challenge_progress (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users NOT NULL,
  challenge_id   uuid REFERENCES weekly_challenges NOT NULL,
  current_value  integer NOT NULL DEFAULT 0,
  completed      boolean NOT NULL DEFAULT false,
  completed_at   timestamptz,
  UNIQUE (user_id, challenge_id)
);

ALTER TABLE weekly_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_challenge_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_challenges_read_all" ON weekly_challenges
  FOR SELECT USING (true);

CREATE POLICY "user_challenge_progress_own" ON user_challenge_progress
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Seed a few weekly challenges starting from current week
INSERT INTO weekly_challenges (id, week_start, title, description, challenge_type, target_value) VALUES
  ('c0000000-0000-0000-0000-000000000001', CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::integer, 'Complete a full round', 'Log an 18-hole or 9-hole round this week', 'rounds', 1),
  ('c0000000-0000-0000-0000-000000000002', CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::integer + 7, 'Consistent Practice', 'Log at least 2 practice sessions or rounds this week', 'rounds', 2),
  ('c0000000-0000-0000-0000-000000000003', CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::integer + 14, 'Birdie Hunt', 'Record 2 or more birdies in your rounds this week', 'pars', 2)
ON CONFLICT (id) DO NOTHING;
