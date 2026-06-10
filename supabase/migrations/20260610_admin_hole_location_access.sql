-- Hole coordinates are publicly readable by the mobile app, but only approved
-- administrator accounts may update tee and green reference locations.

ALTER TABLE holes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read holes" ON holes;
DROP POLICY IF EXISTS "Admin update hole locations" ON holes;

CREATE POLICY "Public read holes"
  ON holes FOR SELECT
  USING (true);

CREATE POLICY "Admin update hole locations"
  ON holes FOR UPDATE
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
