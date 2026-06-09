-- ============================================================
-- Phase 4: user_clubs (personal club bag with distances)
-- + hole_scores unique constraint (enables safe upsert)
-- Run in Supabase SQL editor
-- ============================================================

CREATE TABLE IF NOT EXISTS user_clubs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES auth.users NOT NULL,
  club_name             text NOT NULL,
  carry_distance_metres integer,
  total_distance_metres integer,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_clubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_clubs_own" ON user_clubs
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_clubs_user ON user_clubs(user_id);

-- Unique constraint on hole_scores so auto-save and finish-round can both upsert safely
ALTER TABLE hole_scores
  ADD CONSTRAINT IF NOT EXISTS hole_scores_round_hole_unique
  UNIQUE (round_id, hole_number);
