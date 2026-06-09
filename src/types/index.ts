export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type Course = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  holes: number;
  created_at: string;
};

export type TeeSet = {
  id: string;
  course_id: string;
  name: string;
  colour: string;
  total_metres: number;
  course_rating: number;
  slope_rating: number;
};

export type Hole = {
  id: string;
  course_id: string;
  number: number;
  par: number;
  stroke_index: number;
  white_metres: number | null;
  green_front_metres: number | null;
  green_back_metres: number | null;
  tee_lat: number | null;
  tee_lng: number | null;
  green_front_lat: number | null;
  green_front_lng: number | null;
  green_mid_lat: number | null;
  green_mid_lng: number | null;
  green_back_lat: number | null;
  green_back_lng: number | null;
  notes: string | null;
};

export type FairwayResult = 'left' | 'hit' | 'right' | 'na';
export type GIRMissDirection = 'left' | 'right' | 'short' | 'long' | 'na';
export type Lie = 'tee' | 'fairway' | 'rough' | 'bunker' | 'recovery' | 'green';
export type ShotTarget = 'fairway' | 'green' | 'layup' | 'recovery';
export type ShotOutcome = 'hit' | 'miss' | 'no_chance';
export type ShotMissDirection = 'left' | 'right' | 'short' | 'long';
export type StrikeQuality = 'pure' | 'fat' | 'thin' | 'hosel' | 'toe';
export type ClubType = 'driver' | 'wood' | 'hybrid' | 'iron' | 'wedge' | 'putter';
export type RoundType = '18' | 'front9' | 'back9';
export type ScoringMode = 'classic';

export type Round = {
  id: string;
  course_id: string;
  tee_set_id: string;
  date: string;
  holes_played: number;
  scoring_mode: ScoringMode;
  exclude_from_handicap: boolean;
  gross_total: number | null;
  net_total: number | null;
  handicap_differential: number | null;
  completed: boolean;
  starting_hole?: number;
};

export type HoleScore = {
  id: string;
  round_id: string;
  hole_id: string;
  hole_number: number;
  gross_score: number | null;
  net_score: number | null;
  fairway_hit: FairwayResult;
  gir: boolean | null;
  gir_miss_direction: GIRMissDirection;
  putts: number;
  chips: number;
  sand_shots: number;
  penalties: number;
};

export type Shot = {
  id: string;
  round_id: string;
  hole_id: string;
  shot_number: number;
  start_lat: number;
  start_lng: number;
  end_lat: number | null;
  end_lng: number | null;
  distance_metres: number | null;
  club_id: string | null;
  club_name: string | null;
  lie: Lie;
  end_lie: Exclude<Lie, 'tee'> | null;
  target_type: ShotTarget | null;
  outcome: ShotOutcome | null;
  miss_direction: ShotMissDirection | null;
  strike_quality: StrikeQuality | null;
  created_at: string;
};

export type Club = {
  id: string;
  name: string;
  type: ClubType;
  loft: number | null;
  custom_name: string | null;
  sort_order: number;
  carry_metres: number | null;
  carry_stddev_metres: number | null;
};

export type HandicapHistory = {
  id: string;
  date: string;
  round_id: string | null;
  differential: number;
  handicap_index: number;
  slope_used: number;
  rating_used: number;
};

export type ActiveRound = {
  round: Round;
  course: Course;
  teeSet: TeeSet;
  holes: Hole[];
  scores: Record<number, Partial<HoleScore>>;
  shots: Record<number, Shot[]>;
  currentHoleNumber: number;
};

export type ShotTrackingStatus =
  | { status: 'idle' }
  | { status: 'tracking'; startLat: number; startLng: number }
  | {
      status: 'selecting_club';
      startLat: number;
      startLng: number;
      endLat: number;
      endLng: number;
      distance: number;
    };

export type HazardType = 'bunker' | 'water' | 'trees' | 'ob' | 'red_zone';

export type Hazard = {
  id: string;
  course_id: string;
  hole_number: number | null;
  hole_numbers: number[] | null;
  type: HazardType;
  label: string | null;
  coordinates: { lat: number; lng: number }[];
  created_at: string;
};

export type Profile = {
  id: string;
  display_name: string;
  ghin_number: string | null;
  home_course_id: string | null;
  units_preference: 'metres' | 'yards';
  handicap_index: number | null;
  avatar_url: string | null;
  notify_round_reminders: boolean;
  notify_streak_alerts: boolean;
  notify_achievement_unlocks: boolean;
  created_at: string;
};

export type RoundStats = {
  totalScore: number;
  toPar: number;
  fir: number;
  firTotal: number;
  gir: number;
  girTotal: number;
  totalPutts: number;
  totalPenalties: number;
  birdie: number;
  par: number;
  bogey: number;
  doublePlus: number;
};
