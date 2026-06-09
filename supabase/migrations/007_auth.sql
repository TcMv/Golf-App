-- ============================================================
-- Phase 2: Auth — profiles, user_id columns, RLS
-- Run in Supabase SQL editor
-- ============================================================

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id                uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name      text NOT NULL DEFAULT '',
  ghin_number       text,
  home_course_id    uuid REFERENCES courses(id),
  units_preference  text NOT NULL DEFAULT 'metres' CHECK (units_preference IN ('metres','yards')),
  handicap_index    numeric(4,1),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Add user_id to rounds (nullable = backward compatible with existing data)
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users;

-- Add user_id to handicap_history
ALTER TABLE handicap_history ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rounds_user        ON rounds(user_id);
CREATE INDEX IF NOT EXISTS idx_handicap_user      ON handicap_history(user_id);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds            ENABLE ROW LEVEL SECURITY;
ALTER TABLE hole_scores       ENABLE ROW LEVEL SECURITY;
ALTER TABLE handicap_history  ENABLE ROW LEVEL SECURITY;

-- profiles: own row only
CREATE POLICY "profiles_own" ON profiles
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- rounds: own rows + legacy rows (user_id IS NULL) for backward compat
CREATE POLICY "rounds_select" ON rounds FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "rounds_insert" ON rounds FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rounds_update" ON rounds FOR UPDATE
  USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "rounds_delete" ON rounds FOR DELETE
  USING (auth.uid() = user_id);

-- hole_scores: via parent round ownership
CREATE POLICY "hole_scores_all" ON hole_scores
  USING (
    round_id IN (
      SELECT id FROM rounds WHERE user_id = auth.uid() OR user_id IS NULL
    )
  );

-- handicap_history: own + legacy
CREATE POLICY "handicap_all" ON handicap_history
  USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "handicap_insert" ON handicap_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Public read tables (no RLS needed)
-- courses, tee_sets, holes, hazards, clubs, app_settings
-- ============================================================
