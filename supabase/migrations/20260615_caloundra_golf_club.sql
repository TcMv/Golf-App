-- ============================================================
-- Caloundra Golf Club
-- 1 Charles Woodward Drive, Caloundra QLD 4551
-- Designer: Ross Watson  |  Est. 1951 (18 holes from 1966)
-- 18 holes, Par 71
--
-- Distances: Black tee in metres where confirmed; Blue tee used
--   for H7, H8, H9, H14 where Black tee distance not published.
--   Verify and update from the club's physical scorecard.
-- Stroke indices: fully confirmed from official club hole pages.
-- GPS: clubhouse only; per-hole coords needed (see format below).
--
-- Per-hole GPS format to add later:
--   tee_lat/tee_lng          — centre of tee box
--   green_front_lat/lng      — front edge of green
--   green_mid_lat/lng        — centre of green
--   green_back_lat/lng       — back edge of green
-- ============================================================

-- Course
INSERT INTO courses (id, name, lat, lng, holes, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'Caloundra Golf Club',
  -26.78954609, 153.1234453, 18, NOW()
) ON CONFLICT (id) DO NOTHING;

-- Tee sets
INSERT INTO tee_sets (id, course_id, name, colour, total_metres, course_rating, slope_rating)
VALUES
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000003', 'Black', 'black',  5987, 71.7, 126),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000003', 'Blue',  'blue',   5754, 70.3, 124),
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000003', 'White', 'white',  5620, 68.8, 120),
  ('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000003', 'Green', 'green',  5200, 66.0, 104)
ON CONFLICT (id) DO NOTHING;

-- Holes (white_metres = Black tee; * = Blue tee used, Black not published)
INSERT INTO holes (
  id, course_id, number, par, stroke_index, white_metres, notes
) VALUES
--  Front 9 ────────────────────────────────────────────────────────────────
('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003', 1, 4, 11, 341,
  'Dogleg left — aim tee shot at the mound right to open up the approach'),

('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003', 2, 3, 15, 156,
  'Dam left of tee (irrigation). Bunker front of green'),

('30000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003', 3, 4,  1, 385,
  'SI 1. Dogleg left — Swamp Creek runs entire left side. Aim tee shot at 150m post right of centre'),

('30000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000003', 4, 5, 13, 515,
  'Burn crosses fairway ~110m from green — lay up short of it'),

('30000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000003', 5, 5,  5, 546,
  'Two small dams left (~240m carry to clear). Lay up 80–100m short-right of green'),

('30000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000003', 6, 3, 17, 145,
  'Tee shot over water. Bunkers left and right. Small landing area'),

('30000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000003', 7, 4,  7, 384,
  'Long thin green — check pin, avoid two front bunkers. *Blue tee distance'),

('30000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000003', 8, 4,  3, 394,
  'Dogleg left — right side of fairway opens up the green. *Blue tee distance'),

('30000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000003', 9, 3,  9, 182,
  'Dam left, burn in front of green. *Blue tee distance'),

--  Back 9 ─────────────────────────────────────────────────────────────────
('30000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000003',10, 5, 18, 449,
  'Burn snakes across fairway ~230m from tee. Green reachable in 2 for long hitters'),

('30000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000003',11, 3, 16, 148,
  'Uphill, plays into breeze — club up. Two bunkers left of green'),

('30000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000003',12, 4,  6, 368,
  'Tee through chute of trees. Semi-hidden bunker in tree line right. Long thin green'),

('30000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000003',13, 4, 14, 277,
  'Shortest par 4. Dogleg right — burn across direct line to green'),

('30000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000003',14, 5, 10, 493,
  'Dams left — avoid going left off tee (~240m carry to clear). *Blue tee distance'),

('30000000-0000-0000-0000-000000000015','00000000-0000-0000-0000-000000000003',15, 3, 12, 158,
  'Trouble behind green — do not overclub'),

('30000000-0000-0000-0000-000000000016','00000000-0000-0000-0000-000000000003',16, 4,  8, 352,
  'Drive over/left of fairway bunker right (~220m). Large bunker left of green'),

('30000000-0000-0000-0000-000000000017','00000000-0000-0000-0000-000000000003',17, 4,  4, 369,
  'Dogleg left — trees narrow the approach. Par is a good score'),

('30000000-0000-0000-0000-000000000018','00000000-0000-0000-0000-000000000003',18, 4,  2, 394,
  'SI 2. Dogleg left — bunker left ~200m, second shot plays longer than it looks, 4 bunkers protecting green')

ON CONFLICT (course_id, number) DO NOTHING;
