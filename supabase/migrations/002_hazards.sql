-- ============================================================
-- 002: Hazards table + Blue/Red tee sets
-- ============================================================

CREATE TABLE IF NOT EXISTS hazards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  hole_number INTEGER,
  type        TEXT NOT NULL CHECK (type IN ('bunker','water','trees','ob','red_zone')),
  label       TEXT,
  coordinates JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hazards_course ON hazards(course_id);
ALTER TABLE hazards DISABLE ROW LEVEL SECURITY;

ALTER TABLE holes ADD COLUMN IF NOT EXISTS blue_metres INTEGER;
ALTER TABLE holes ADD COLUMN IF NOT EXISTS red_metres  INTEGER;

-- Blue and Red tee sets (placeholder ratings — update via Settings once you have scorecard)
INSERT INTO tee_sets (id, course_id, name, colour, total_metres, course_rating, slope_rating)
VALUES
  ('00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-000000000001',
   'Blue', 'blue', 5280, 67.5, 117),
  ('00000000-0000-0000-0000-000000000012',
   '00000000-0000-0000-0000-000000000001',
   'Red', 'red', 4100, 65.0, 109)
ON CONFLICT (id) DO NOTHING;
