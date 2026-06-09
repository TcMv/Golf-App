-- ============================================================
-- Phase 5: Gamification — XP, levels, streaks, 12 badges
-- Run in Supabase SQL editor
-- ============================================================

-- user_stats: one row per user, upserted after every round
CREATE TABLE IF NOT EXISTS user_stats (
  user_id         uuid PRIMARY KEY REFERENCES auth.users,
  xp              integer NOT NULL DEFAULT 0,
  level           integer NOT NULL DEFAULT 1,
  streak_days     integer NOT NULL DEFAULT 0,
  last_round_date date,
  total_rounds    integer NOT NULL DEFAULT 0,
  total_birdies   integer NOT NULL DEFAULT 0,
  total_eagles    integer NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_stats_own" ON user_stats
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- badges: static reference data
CREATE TABLE IF NOT EXISTS badges (
  key        text PRIMARY KEY,
  name       text NOT NULL,
  description text NOT NULL,
  icon       text NOT NULL,
  xp_reward  integer NOT NULL DEFAULT 50
);

-- user_badges: earned badges per user
CREATE TABLE IF NOT EXISTS user_badges (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users NOT NULL,
  badge_key  text REFERENCES badges(key) NOT NULL,
  earned_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_key)
);

ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_badges_own" ON user_badges
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Allow all users to read badge definitions
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "badges_read_all" ON badges FOR SELECT USING (true);

-- Seed 12 badge definitions
INSERT INTO badges (key, name, description, icon, xp_reward) VALUES
  ('first_round',  'Off the Tee',    'Complete your first round',              '⛳', 100),
  ('rounds_5',     'Regular',         'Complete 5 rounds',                      '🏌️', 100),
  ('rounds_10',    'Committed',       'Complete 10 rounds',                     '🎯', 150),
  ('rounds_25',    'Veteran',         'Complete 25 rounds',                     '🏆', 200),
  ('rounds_50',    'Tour Pro',        'Complete 50 rounds',                     '👑', 500),
  ('first_birdie', 'First Birdie',    'Score your first birdie',                '🐦', 75),
  ('first_eagle',  'First Eagle',     'Score your first eagle',                 '🦅', 200),
  ('streak_3',     'Hat Trick',       'Play 3 days in a row',                   '🔥', 150),
  ('streak_7',     'Week Warrior',    'Play 7 days in a row',                   '💪', 300),
  ('low_putts',    'Silky Smooth',    'Finish 18 holes with 30 or fewer putts', '🎱', 100),
  ('bogey_free',   'Bogey Free',      'Complete 18 holes with no bogeys',       '✅', 200),
  ('gir_50',       'Green Machine',   'Hit GIR on 50% or more holes in a round','🌿', 100)
ON CONFLICT (key) DO NOTHING;
