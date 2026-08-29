import {
  validateMappingSuggestion,
  type MappingSuggestion,
  type MappingSuggestionFeature,
  type MappingSuggestionGeometry,
  type SuggestionCoordinate,
} from './courseMappingSuggestions';

export const MAPPING_SUGGESTION_BATCH_SCHEMA_V1 = 'golfcaddie.mapping-suggestions.v1' as const;

export type MappingSuggestionBatchV1 = {
  schema: typeof MAPPING_SUGGESTION_BATCH_SCHEMA_V1;
  course_id: string;
  source: {
    provider: string;
    reference: string | null;
    license: string | null;
  };
  suggestions: Array<{
    hole_number: number;
    feature_type: MappingSuggestionFeature;
    geometry_type: MappingSuggestionGeometry;
    coordinates: SuggestionCoordinate[];
    confidence: number | null;
    metadata: Record<string, unknown>;
  }>;
};

export type MappingSuggestionBatchIssue = {
  severity: 'error' | 'warning';
  path: string;
  message: string;
};

export type MappingSuggestionBatchResult = {
  data: MappingSuggestionBatchV1 | null;
  rows: MappingSuggestion[];
  issues: MappingSuggestionBatchIssue[];
  errors: number;
  warnings: number;
};

const features = new Set<MappingSuggestionFeature>([
  'tee', 'green_front', 'green_centre', 'green_back',
  'green', 'fairway', 'tee_box', 'fairway_centreline',
  'bunker', 'water', 'trees', 'ob', 'red_zone',
]);
const geometries = new Set<MappingSuggestionGeometry>(['point', 'line', 'polygon']);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function counts(issues: MappingSuggestionBatchIssue[]) {
  return {
    errors: issues.filter(issue => issue.severity === 'error').length,
    warnings: issues.filter(issue => issue.severity === 'warning').length,
  };
}

export function parseMappingSuggestionBatchJson(input: string): MappingSuggestionBatchResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    const issues: MappingSuggestionBatchIssue[] = [{ severity: 'error', path: '$', message: 'Invalid JSON.' }];
    return { data: null, rows: [], issues, ...counts(issues) };
  }
  return validateMappingSuggestionBatch(parsed);
}

export function validateMappingSuggestionBatch(parsed: unknown): MappingSuggestionBatchResult {
  const issues: MappingSuggestionBatchIssue[] = [];
  const rows: MappingSuggestion[] = [];
  if (!record(parsed)) {
    issues.push({ severity: 'error', path: '$', message: 'Batch must be a JSON object.' });
    return { data: null, rows, issues, ...counts(issues) };
  }
  if (parsed.schema !== MAPPING_SUGGESTION_BATCH_SCHEMA_V1) {
    issues.push({ severity: 'error', path: 'schema', message: `Expected ${MAPPING_SUGGESTION_BATCH_SCHEMA_V1}.` });
  }

  const courseId = stringValue(parsed.course_id);
  if (!courseId) issues.push({ severity: 'error', path: 'course_id', message: 'Course id is required.' });

  const source = record(parsed.source) ? parsed.source : {};
  const provider = stringValue(source.provider);
  const reference = stringValue(source.reference);
  const license = stringValue(source.license);
  if (!provider) issues.push({ severity: 'error', path: 'source.provider', message: 'Source provider is required.' });
  if (!license) issues.push({ severity: 'warning', path: 'source.license', message: 'Source license is missing; these suggestions cannot be approved until licensing is recorded.' });

  const rawSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  if (!Array.isArray(parsed.suggestions)) issues.push({ severity: 'error', path: 'suggestions', message: 'Suggestions must be an array.' });
  if (rawSuggestions.length === 0) issues.push({ severity: 'error', path: 'suggestions', message: 'At least one suggestion is required.' });

  rawSuggestions.forEach((raw, index) => {
    const path = `suggestions[${index}]`;
    if (!record(raw)) {
      issues.push({ severity: 'error', path, message: 'Suggestion must be an object.' });
      return;
    }
    const holeNumber = numberValue(raw.hole_number);
    const feature = typeof raw.feature_type === 'string' && features.has(raw.feature_type as MappingSuggestionFeature)
      ? raw.feature_type as MappingSuggestionFeature : null;
    const geometry = typeof raw.geometry_type === 'string' && geometries.has(raw.geometry_type as MappingSuggestionGeometry)
      ? raw.geometry_type as MappingSuggestionGeometry : null;
    const confidence = raw.confidence == null ? null : numberValue(raw.confidence);
    const coordinates = Array.isArray(raw.coordinates)
      ? raw.coordinates.filter(record).map(item => ({ lat: numberValue(item.lat) ?? NaN, lng: numberValue(item.lng) ?? NaN }))
      : [];
    const metadata = record(raw.metadata) ? raw.metadata : {};

    if (holeNumber == null) issues.push({ severity: 'error', path: `${path}.hole_number`, message: 'Hole number is required.' });
    if (!feature) issues.push({ severity: 'error', path: `${path}.feature_type`, message: 'Unknown feature type.' });
    if (!geometry) issues.push({ severity: 'error', path: `${path}.geometry_type`, message: 'Unknown geometry type.' });
    if (!Array.isArray(raw.coordinates)) issues.push({ severity: 'error', path: `${path}.coordinates`, message: 'Coordinates must be an array.' });
    if (raw.confidence != null && confidence == null) issues.push({ severity: 'error', path: `${path}.confidence`, message: 'Confidence must be a number or null.' });

    if (courseId && provider && holeNumber != null && feature && geometry) {
      const suggestion: MappingSuggestion = {
        course_id: courseId,
        hole_number: holeNumber,
        feature_type: feature,
        geometry_type: geometry,
        coordinates,
        confidence,
        source_provider: provider,
        source_reference: reference,
        source_license: license,
        metadata,
      };
      const validation = validateMappingSuggestion(suggestion);
      validation.errors.forEach(message => issues.push({ severity: 'error', path, message }));
      validation.warnings.forEach(message => {
        if (!message.toLowerCase().includes('source license') || license) issues.push({ severity: 'warning', path, message });
      });
      rows.push(suggestion);
    }
  });

  const resultCounts = counts(issues);
  if (resultCounts.errors > 0 || !courseId || !provider) return { data: null, rows: [], issues, ...resultCounts };

  const data: MappingSuggestionBatchV1 = {
    schema: MAPPING_SUGGESTION_BATCH_SCHEMA_V1,
    course_id: courseId,
    source: { provider, reference, license },
    suggestions: rows.map(row => ({
      hole_number: row.hole_number,
      feature_type: row.feature_type,
      geometry_type: row.geometry_type,
      coordinates: row.coordinates,
      confidence: row.confidence,
      metadata: row.metadata ?? {},
    })),
  };
  return { data, rows, issues, ...resultCounts };
}
