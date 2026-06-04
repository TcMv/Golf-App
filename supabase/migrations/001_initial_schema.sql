-- ============================================================
-- Golf Caddie App — Initial Schema
-- ============================================================

-- Courses
CREATE TABLE IF NOT EXISTS courses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  holes       INTEGER NOT NULL DEFAULT 18,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tee sets per course
CREATE TABLE IF NOT EXISTS tee_sets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id      UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  colour         TEXT NOT NULL,
  total_metres   INTEGER NOT NULL,
  course_rating  NUMERIC(4,1) NOT NULL,
  slope_rating   INTEGER NOT NULL
);

-- Holes
CREATE TABLE IF NOT EXISTS holes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id         UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  number            INTEGER NOT NULL,
  par               INTEGER NOT NULL,
  stroke_index      INTEGER NOT NULL,
  white_metres      INTEGER,
  green_front_metres INTEGER,
  green_back_metres  INTEGER,
  tee_lat           DOUBLE PRECISION,
  tee_lng           DOUBLE PRECISION,
  green_front_lat   DOUBLE PRECISION,
  green_front_lng   DOUBLE PRECISION,
  green_mid_lat     DOUBLE PRECISION,
  green_mid_lng     DOUBLE PRECISION,
  green_back_lat    DOUBLE PRECISION,
  green_back_lng    DOUBLE PRECISION,
  notes             TEXT,
  UNIQUE (course_id, number)
);

-- Clubs (user's bag)
CREATE TABLE IF NOT EXISTS clubs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('driver','wood','hybrid','iron','wedge','putter')),
  loft        NUMERIC(4,1),
  custom_name TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Rounds
CREATE TABLE IF NOT EXISTS rounds (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id               UUID NOT NULL REFERENCES courses(id),
  tee_set_id              UUID NOT NULL REFERENCES tee_sets(id),
  date                    DATE NOT NULL DEFAULT CURRENT_DATE,
  holes_played            INTEGER NOT NULL DEFAULT 18,
  scoring_mode            TEXT NOT NULL DEFAULT 'classic',
  starting_hole           INTEGER NOT NULL DEFAULT 1,
  exclude_from_handicap   BOOLEAN NOT NULL DEFAULT FALSE,
  gross_total             INTEGER,
  net_total               INTEGER,
  handicap_differential   NUMERIC(5,2),
  completed               BOOLEAN NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hole scores
CREATE TABLE IF NOT EXISTS hole_scores (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id            UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  hole_id             UUID NOT NULL REFERENCES holes(id),
  hole_number         INTEGER NOT NULL,
  gross_score         INTEGER,
  net_score           INTEGER,
  fairway_hit         TEXT NOT NULL DEFAULT 'na' CHECK (fairway_hit IN ('left','hit','right','na')),
  gir                 BOOLEAN,
  gir_miss_direction  TEXT NOT NULL DEFAULT 'na' CHECK (gir_miss_direction IN ('left','right','short','long','na')),
  putts               INTEGER NOT NULL DEFAULT 2,
  chips               INTEGER NOT NULL DEFAULT 0,
  sand_shots          INTEGER NOT NULL DEFAULT 0,
  penalties           INTEGER NOT NULL DEFAULT 0
);

-- Shots
CREATE TABLE IF NOT EXISTS shots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id         UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  hole_id          UUID NOT NULL REFERENCES holes(id),
  shot_number      INTEGER NOT NULL,
  start_lat        DOUBLE PRECISION NOT NULL,
  start_lng        DOUBLE PRECISION NOT NULL,
  end_lat          DOUBLE PRECISION,
  end_lng          DOUBLE PRECISION,
  distance_metres  INTEGER,
  club_id          UUID REFERENCES clubs(id),
  lie              TEXT NOT NULL DEFAULT 'fairway' CHECK (lie IN ('tee','fairway','rough','bunker','recovery','green')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Handicap history
CREATE TABLE IF NOT EXISTS handicap_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  round_id        UUID REFERENCES rounds(id),
  differential    NUMERIC(5,2) NOT NULL,
  handicap_index  NUMERIC(4,1) NOT NULL,
  slope_used      INTEGER NOT NULL,
  rating_used     NUMERIC(4,1) NOT NULL
);

-- App settings (key/value store for user prefs)
CREATE TABLE IF NOT EXISTS app_settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_holes_course     ON holes(course_id);
CREATE INDEX IF NOT EXISTS idx_hole_scores_round ON hole_scores(round_id);
CREATE INDEX IF NOT EXISTS idx_shots_round       ON shots(round_id);
CREATE INDEX IF NOT EXISTS idx_rounds_date       ON rounds(date DESC);
CREATE INDEX IF NOT EXISTS idx_handicap_date     ON handicap_history(date DESC);

-- ============================================================
-- Seed data — Nambour Golf Club
-- ============================================================

INSERT INTO courses (id, name, lat, lng, holes, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Nambour Golf Club',
  -26.6317, 152.9587, 18, NOW()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO tee_sets (id, course_id, name, colour, total_metres, course_rating, slope_rating)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'White', 'white', 4910, 66.0, 113
) ON CONFLICT (id) DO NOTHING;

INSERT INTO holes (
  id, course_id, number, par, stroke_index,
  white_metres, green_front_metres, green_back_metres,
  tee_lat, tee_lng, green_front_lat, green_front_lng,
  green_mid_lat, green_mid_lng, green_back_lat, green_back_lng, notes
) VALUES
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',1,4,15,277,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Straight hole. Bunkers mid-left and mid-right of fairway.'),
('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',2,3,11,138,129,149,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Short par 3. Front 129m, Back 149m.'),
('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001',3,4,5,348,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Straight par 4. Water hazard right side.'),
('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001',4,4,3,366,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Water hazard left mid-fairway. Bunker right of green.'),
('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001',5,4,1,406,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Hardest hole on course. Water hazards both sides of fairway mid-hole.'),
('10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000001',6,3,17,85,74,88,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Short par 3. Front 74m, Back 88m.'),
('10000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000001',7,5,7,412,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Par 5. Water hazard right side.'),
('10000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000001',8,3,13,125,95,116,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Par 3. Front 95m, Back 116m. Bunker right of green.'),
('10000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000001',9,4,9,270,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Short par 4. Bunkers right of fairway.'),
('10000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001',10,3,16,145,133,150,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Par 3. Front 133m, Back 150m. Bunker right of green.'),
('10000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001',11,5,18,424,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Easiest hole on course. Par 5. Water hazards both sides.'),
('10000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000001',12,4,2,388,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2nd hardest hole. Long straight par 4.'),
('10000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000001',13,4,10,294,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Water hazard mid-right of fairway.'),
('10000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000001',14,3,6,175,155,175,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Par 3. Front 155m, Back 175m.'),
('10000000-0000-0000-0000-000000000015','00000000-0000-0000-0000-000000000001',15,4,12,295,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Water hazard right side mid-hole.'),
('10000000-0000-0000-0000-000000000016','00000000-0000-0000-0000-000000000001',16,4,4,342,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Water hazard left mid-fairway. Bunkers right side.'),
('10000000-0000-0000-0000-000000000017','00000000-0000-0000-0000-000000000001',17,3,14,140,128,147,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Par 3. Front 128m, Back 147m. Water left side.'),
('10000000-0000-0000-0000-000000000018','00000000-0000-0000-0000-000000000001',18,4,8,280,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Finishing hole. Road OB right side.')
ON CONFLICT (course_id, number) DO NOTHING;

-- Default club bag
INSERT INTO clubs (id, name, type, sort_order) VALUES
('c0000000-0000-0000-0000-000000000001', 'Driver',  'driver', 1),
('c0000000-0000-0000-0000-000000000002', '3W',       'wood',   2),
('c0000000-0000-0000-0000-000000000003', '5W',       'wood',   3),
('c0000000-0000-0000-0000-000000000004', '4i',       'iron',   4),
('c0000000-0000-0000-0000-000000000005', '5i',       'iron',   5),
('c0000000-0000-0000-0000-000000000006', '6i',       'iron',   6),
('c0000000-0000-0000-0000-000000000007', '7i',       'iron',   7),
('c0000000-0000-0000-0000-000000000008', '8i',       'iron',   8),
('c0000000-0000-0000-0000-000000000009', '9i',       'iron',   9),
('c0000000-0000-0000-0000-000000000010', 'PW',       'wedge',  10),
('c0000000-0000-0000-0000-000000000011', '52°',      'wedge',  11),
('c0000000-0000-0000-0000-000000000012', '56°',      'wedge',  12),
('c0000000-0000-0000-0000-000000000013', '60°',      'wedge',  13),
('c0000000-0000-0000-0000-000000000014', 'Putter',   'putter', 14)
ON CONFLICT (id) DO NOTHING;
