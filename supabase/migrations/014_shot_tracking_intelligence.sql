-- Rich shot tracking for learned club distances and miss tendencies.

ALTER TABLE shots
  ADD COLUMN IF NOT EXISTS club_name text,
  ADD COLUMN IF NOT EXISTS target_type text
    CHECK (target_type IN ('fairway', 'green', 'layup', 'recovery')),
  ADD COLUMN IF NOT EXISTS outcome text
    CHECK (outcome IN ('hit', 'miss', 'no_chance')),
  ADD COLUMN IF NOT EXISTS miss_direction text
    CHECK (miss_direction IN ('left', 'right', 'short', 'long')),
  ADD COLUMN IF NOT EXISTS strike_quality text
    CHECK (strike_quality IN ('pure', 'fat', 'thin', 'hosel', 'toe')),
  ADD COLUMN IF NOT EXISTS end_lie text
    CHECK (end_lie IN ('fairway', 'rough', 'bunker', 'recovery', 'green'));

CREATE INDEX IF NOT EXISTS shots_round_hole_number_idx
  ON shots(round_id, hole_id, shot_number);

CREATE INDEX IF NOT EXISTS shots_club_name_idx
  ON shots(club_name)
  WHERE club_name IS NOT NULL;
