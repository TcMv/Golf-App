-- ============================================================
-- Phase 2: strict user ownership and location-data protection
-- ============================================================

-- Remove legacy policies that exposed rows with user_id IS NULL to every
-- authenticated user. Existing data is preserved; ownership must be assigned
-- explicitly before those legacy rows become visible in the app.
DROP POLICY IF EXISTS "rounds_select" ON rounds;
DROP POLICY IF EXISTS "rounds_insert" ON rounds;
DROP POLICY IF EXISTS "rounds_update" ON rounds;
DROP POLICY IF EXISTS "rounds_delete" ON rounds;

CREATE POLICY "rounds_select_own" ON rounds FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "rounds_insert_own" ON rounds FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rounds_update_own" ON rounds FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rounds_delete_own" ON rounds FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "hole_scores_all" ON hole_scores;

CREATE POLICY "hole_scores_select_own" ON hole_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rounds
      WHERE rounds.id = hole_scores.round_id
        AND rounds.user_id = auth.uid()
    )
  );
CREATE POLICY "hole_scores_insert_own" ON hole_scores FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rounds
      WHERE rounds.id = hole_scores.round_id
        AND rounds.user_id = auth.uid()
    )
  );
CREATE POLICY "hole_scores_update_own" ON hole_scores FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM rounds
      WHERE rounds.id = hole_scores.round_id
        AND rounds.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rounds
      WHERE rounds.id = hole_scores.round_id
        AND rounds.user_id = auth.uid()
    )
  );
CREATE POLICY "hole_scores_delete_own" ON hole_scores FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM rounds
      WHERE rounds.id = hole_scores.round_id
        AND rounds.user_id = auth.uid()
    )
  );

-- Shot rows contain precise location history and require the same parent-round
-- ownership checks as hole scores.
ALTER TABLE shots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shots_select_own" ON shots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rounds
      WHERE rounds.id = shots.round_id
        AND rounds.user_id = auth.uid()
    )
  );
CREATE POLICY "shots_insert_own" ON shots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rounds
      WHERE rounds.id = shots.round_id
        AND rounds.user_id = auth.uid()
    )
  );
CREATE POLICY "shots_update_own" ON shots FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM rounds
      WHERE rounds.id = shots.round_id
        AND rounds.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rounds
      WHERE rounds.id = shots.round_id
        AND rounds.user_id = auth.uid()
    )
  );
CREATE POLICY "shots_delete_own" ON shots FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM rounds
      WHERE rounds.id = shots.round_id
        AND rounds.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "handicap_all" ON handicap_history;
DROP POLICY IF EXISTS "handicap_insert" ON handicap_history;

CREATE POLICY "handicap_select_own" ON handicap_history FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "handicap_insert_own" ON handicap_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "handicap_update_own" ON handicap_history FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "handicap_delete_own" ON handicap_history FOR DELETE
  USING (auth.uid() = user_id);
