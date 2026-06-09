-- ============================================================
-- 006: Add carry distance tracking to clubs
-- ============================================================

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS carry_metres INTEGER;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS carry_stddev_metres INTEGER;
