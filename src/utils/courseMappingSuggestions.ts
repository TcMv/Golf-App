export type MappingSuggestionFeature =
  | 'tee' | 'green_front' | 'green_centre' | 'green_back'
  | 'green' | 'fairway' | 'tee_box' | 'fairway_centreline'
  | 'bunker' | 'water' | 'trees' | 'ob' | 'red_zone';

export type MappingSuggestionGeometry = 'point' | 'line' | 'polygon';
export type SuggestionCoordinate = { lat: number; lng: number };

export type MappingSuggestion = {
  course_id: string;
  hole_number: number;
  feature_type: MappingSuggestionFeature;
  geometry_type: MappingSuggestionGeometry;
  coordinates: SuggestionCoordinate[];
  confidence: number | null;
  source_provider: string | null;
  source_reference: string | null;
  source_license: string | null;
  metadata?: Record<string, unknown>;
};

export type MappingSuggestionValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

const pointFeatures = new Set<MappingSuggestionFeature>(['tee', 'green_front', 'green_centre', 'green_back']);
const lineFeatures = new Set<MappingSuggestionFeature>(['fairway_centreline']);
const polygonFeatures = new Set<MappingSuggestionFeature>(['green', 'fairway', 'tee_box', 'bunker', 'water', 'trees', 'ob', 'red_zone']);
const zoneFeatures = new Set<MappingSuggestionFeature>(['green', 'fairway', 'tee_box', 'fairway_centreline']);
const hazardFeatures = new Set<MappingSuggestionFeature>(['bunker', 'water', 'trees', 'ob', 'red_zone']);

export function expectedSuggestionGeometry(feature: MappingSuggestionFeature): MappingSuggestionGeometry {
  if (pointFeatures.has(feature)) return 'point';
  if (lineFeatures.has(feature)) return 'line';
  return 'polygon';
}

export function validateMappingSuggestion(suggestion: MappingSuggestion): MappingSuggestionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!suggestion.course_id.trim()) errors.push('Course id is required.');
  if (!Number.isInteger(suggestion.hole_number) || suggestion.hole_number < 1 || suggestion.hole_number > 36) errors.push('Hole number must be between 1 and 36.');
  const expected = expectedSuggestionGeometry(suggestion.feature_type);
  if (suggestion.geometry_type !== expected) errors.push(`${suggestion.feature_type} requires ${expected} geometry.`);
  const minimum = expected === 'point' ? 1 : expected === 'line' ? 2 : 3;
  if (suggestion.coordinates.length < minimum) errors.push(`${expected} geometry requires at least ${minimum} coordinate${minimum === 1 ? '' : 's'}.`);
  if (expected === 'point' && suggestion.coordinates.length !== 1) errors.push('Point suggestions must contain exactly one coordinate.');
  for (const point of suggestion.coordinates) {
    if (!Number.isFinite(point.lat) || point.lat < -90 || point.lat > 90 || !Number.isFinite(point.lng) || point.lng < -180 || point.lng > 180) {
      errors.push('Suggestion contains an invalid coordinate.');
      break;
    }
  }
  if (suggestion.confidence != null && (!Number.isFinite(suggestion.confidence) || suggestion.confidence < 0 || suggestion.confidence > 1)) errors.push('Confidence must be between 0 and 1.');
  if (suggestion.confidence == null) warnings.push('Suggestion has no confidence score.');
  else if (suggestion.confidence < 0.7) warnings.push('Suggestion confidence is below 70%.');
  if (!suggestion.source_provider?.trim()) warnings.push('Source provider is missing.');
  if (!suggestion.source_license?.trim()) warnings.push('Source license is missing; confirm commercial-use rights before approval.');
  return { valid: errors.length === 0, errors, warnings };
}

export type SuggestionApprovalAction =
  | { kind: 'hole_point'; fields: Record<string, number> }
  | { kind: 'hole_zone'; zone_type: 'green' | 'fairway' | 'tee_box' | 'fairway_centreline'; coordinates: SuggestionCoordinate[] }
  | { kind: 'hazard'; hazard_type: 'bunker' | 'water' | 'trees' | 'ob' | 'red_zone'; coordinates: SuggestionCoordinate[] };

export function buildSuggestionApprovalAction(suggestion: MappingSuggestion): SuggestionApprovalAction {
  const validation = validateMappingSuggestion(suggestion);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  if (pointFeatures.has(suggestion.feature_type)) {
    const point = suggestion.coordinates[0];
    const fieldsByFeature: Record<string, [string, string]> = {
      tee: ['tee_lat', 'tee_lng'],
      green_front: ['green_front_lat', 'green_front_lng'],
      green_centre: ['green_mid_lat', 'green_mid_lng'],
      green_back: ['green_back_lat', 'green_back_lng'],
    };
    const [latField, lngField] = fieldsByFeature[suggestion.feature_type];
    return { kind: 'hole_point', fields: { [latField]: point.lat, [lngField]: point.lng } };
  }
  if (zoneFeatures.has(suggestion.feature_type)) {
    return { kind: 'hole_zone', zone_type: suggestion.feature_type as 'green' | 'fairway' | 'tee_box' | 'fairway_centreline', coordinates: suggestion.coordinates };
  }
  if (hazardFeatures.has(suggestion.feature_type)) {
    return { kind: 'hazard', hazard_type: suggestion.feature_type as 'bunker' | 'water' | 'trees' | 'ob' | 'red_zone', coordinates: suggestion.coordinates };
  }
  throw new Error('Unsupported suggestion feature.');
}
