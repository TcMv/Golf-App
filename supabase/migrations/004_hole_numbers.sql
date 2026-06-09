-- ============================================================
-- 004: Add hole_numbers array to hazards for multi-hole assignment
-- ============================================================

ALTER TABLE hazards ADD COLUMN IF NOT EXISTS hole_numbers INTEGER[];

CREATE INDEX IF NOT EXISTS idx_hazards_hole_numbers ON hazards USING GIN (hole_numbers);
