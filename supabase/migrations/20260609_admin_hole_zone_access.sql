-- Restrict hole-zone changes to the approved administrator accounts.
-- Zone reads remain public because the mobile app consumes these polygons.

DROP POLICY IF EXISTS "Authenticated write hole_zones" ON hole_zones;
DROP POLICY IF EXISTS "Admin insert hole_zones" ON hole_zones;
DROP POLICY IF EXISTS "Admin update hole_zones" ON hole_zones;
DROP POLICY IF EXISTS "Admin delete hole_zones" ON hole_zones;

CREATE POLICY "Admin insert hole_zones"
  ON hole_zones FOR INSERT
  TO authenticated
  WITH CHECK (
    lower(coalesce(auth.jwt() ->> 'email', '')) IN (
      'tarancroxton@gmail.com',
      'tarancroxton@outlook.com'
    )
  );

CREATE POLICY "Admin update hole_zones"
  ON hole_zones FOR UPDATE
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

CREATE POLICY "Admin delete hole_zones"
  ON hole_zones FOR DELETE
  TO authenticated
  USING (
    lower(coalesce(auth.jwt() ->> 'email', '')) IN (
      'tarancroxton@gmail.com',
      'tarancroxton@outlook.com'
    )
  );
