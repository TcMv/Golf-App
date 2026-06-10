-- Hazard geometry is public-read for the mobile caddie, but only approved
-- administrator accounts may create, edit, or delete polygons.

ALTER TABLE hazards
  ADD COLUMN IF NOT EXISTS hole_numbers integer[];

CREATE INDEX IF NOT EXISTS idx_hazards_hole_numbers
  ON hazards USING GIN (hole_numbers);

ALTER TABLE hazards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read hazards" ON hazards;
DROP POLICY IF EXISTS "Admin insert hazards" ON hazards;
DROP POLICY IF EXISTS "Admin update hazards" ON hazards;
DROP POLICY IF EXISTS "Admin delete hazards" ON hazards;

CREATE POLICY "Public read hazards"
  ON hazards FOR SELECT
  USING (true);

CREATE POLICY "Admin insert hazards"
  ON hazards FOR INSERT
  TO authenticated
  WITH CHECK (
    lower(coalesce(auth.jwt() ->> 'email', '')) IN (
      'tarancroxton@gmail.com',
      'tarancroxton@outlook.com'
    )
  );

CREATE POLICY "Admin update hazards"
  ON hazards FOR UPDATE
  TO authenticated
  USING (
    lower(coalesce(auth.jwt() ->> 'email', '')) IN (
      'tarancroxton@gmail.com',
      'tarancroxton@outlook.com'
    )
  )
  WITH CHECK (
    lower(coalesce(auth.jwt() ->> 'email', '')) IN (
      'tarancroxton@gmail.com',
      'tarancroxton@outlook.com'
    )
  );

CREATE POLICY "Admin delete hazards"
  ON hazards FOR DELETE
  TO authenticated
  USING (
    lower(coalesce(auth.jwt() ->> 'email', '')) IN (
      'tarancroxton@gmail.com',
      'tarancroxton@outlook.com'
    )
  );
