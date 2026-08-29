export const COURSE_IMPORT_SCHEMA_V1 = 'golfcaddie.course.v1' as const;

export type ImportCoordinate = { lat: number; lng: number };
export type ImportZoneType = 'green' | 'fairway' | 'tee_box' | 'fairway_centreline';
export type ImportHazardType = 'bunker' | 'water' | 'trees' | 'ob' | 'red_zone';

export type CourseImportV1 = {
  schema: typeof COURSE_IMPORT_SCHEMA_V1;
  source: {
    provider: string;
    source_id: string | null;
    source_url: string | null;
    retrieved_at: string | null;
    license: string | null;
    notes: string | null;
  };
  course: {
    name: string;
    latitude: number;
    longitude: number;
    holes: 9 | 18;
  };
  scorecard: Array<{
    number: number;
    par: number;
    stroke_index: number;
    metres: number;
  }>;
  tee_sets: Array<{
    name: string;
    colour: string;
    total_metres: number;
    course_rating: number;
    slope_rating: number;
  }>;
  hole_locations: Array<{
    number: number;
    tee?: ImportCoordinate | null;
    green_front?: ImportCoordinate | null;
    green_centre?: ImportCoordinate | null;
    green_back?: ImportCoordinate | null;
  }>;
  zones: Array<{
    hole_number: number;
    type: ImportZoneType;
    coordinates: ImportCoordinate[];
  }>;
  hazards: Array<{
    hole_numbers: number[];
    type: ImportHazardType;
    label: string | null;
    coordinates: ImportCoordinate[];
  }>;
};

export type CourseImportIssue = {
  severity: 'error' | 'warning';
  path: string;
  message: string;
};

export type CourseImportParseResult = {
  data: CourseImportV1 | null;
  issues: CourseImportIssue[];
  errors: number;
  warnings: number;
};

const zoneTypes = new Set<ImportZoneType>(['green', 'fairway', 'tee_box', 'fairway_centreline']);
const hazardTypes = new Set<ImportHazardType>(['bunker', 'water', 'trees', 'ob', 'red_zone']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function coordinate(value: unknown, path: string, issues: CourseImportIssue[]): ImportCoordinate | null {
  if (!isRecord(value)) {
    issues.push({ severity: 'error', path, message: 'Expected a coordinate object.' });
    return null;
  }
  const lat = finiteNumber(value.lat);
  const lng = finiteNumber(value.lng);
  if (lat == null || lat < -90 || lat > 90) {
    issues.push({ severity: 'error', path: `${path}.lat`, message: 'Latitude must be between -90 and 90.' });
  }
  if (lng == null || lng < -180 || lng > 180) {
    issues.push({ severity: 'error', path: `${path}.lng`, message: 'Longitude must be between -180 and 180.' });
  }
  return lat != null && lat >= -90 && lat <= 90 && lng != null && lng >= -180 && lng <= 180
    ? { lat, lng }
    : null;
}

function issueCounts(issues: CourseImportIssue[]) {
  return {
    errors: issues.filter(issue => issue.severity === 'error').length,
    warnings: issues.filter(issue => issue.severity === 'warning').length,
  };
}

export function parseCourseImportJson(input: string): CourseImportParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    const issues: CourseImportIssue[] = [{ severity: 'error', path: '$', message: 'Invalid JSON.' }];
    return { data: null, issues, ...issueCounts(issues) };
  }
  return validateCourseImport(parsed);
}

export function validateCourseImport(parsed: unknown): CourseImportParseResult {
  const issues: CourseImportIssue[] = [];
  if (!isRecord(parsed)) {
    issues.push({ severity: 'error', path: '$', message: 'Import must be a JSON object.' });
    return { data: null, issues, ...issueCounts(issues) };
  }

  if (parsed.schema !== COURSE_IMPORT_SCHEMA_V1) {
    issues.push({
      severity: 'error',
      path: 'schema',
      message: `Unsupported schema. Expected ${COURSE_IMPORT_SCHEMA_V1}.`,
    });
  }

  const sourceRaw = isRecord(parsed.source) ? parsed.source : {};
  const provider = nonEmptyString(sourceRaw.provider) ?? 'unknown';
  if (!nonEmptyString(sourceRaw.provider)) {
    issues.push({ severity: 'warning', path: 'source.provider', message: 'Source provider is missing; using unknown.' });
  }

  if (!isRecord(parsed.course)) {
    issues.push({ severity: 'error', path: 'course', message: 'Course details are required.' });
  }
  const courseRaw = isRecord(parsed.course) ? parsed.course : {};
  const name = nonEmptyString(courseRaw.name);
  const latitude = finiteNumber(courseRaw.latitude);
  const longitude = finiteNumber(courseRaw.longitude);
  const holes = finiteNumber(courseRaw.holes);
  if (!name) issues.push({ severity: 'error', path: 'course.name', message: 'Course name is required.' });
  if (latitude == null || latitude < -90 || latitude > 90) issues.push({ severity: 'error', path: 'course.latitude', message: 'Course latitude must be between -90 and 90.' });
  if (longitude == null || longitude < -180 || longitude > 180) issues.push({ severity: 'error', path: 'course.longitude', message: 'Course longitude must be between -180 and 180.' });
  if (holes !== 9 && holes !== 18) issues.push({ severity: 'error', path: 'course.holes', message: 'Course holes must be 9 or 18.' });
  const expectedHoles = holes === 9 || holes === 18 ? holes : 18;

  const scorecardRaw = Array.isArray(parsed.scorecard) ? parsed.scorecard : [];
  if (!Array.isArray(parsed.scorecard)) issues.push({ severity: 'error', path: 'scorecard', message: 'Scorecard must be an array.' });
  const scorecard: CourseImportV1['scorecard'] = [];
  const seenHoleNumbers = new Set<number>();
  const seenStrokeIndexes = new Set<number>();
  scorecardRaw.forEach((raw, index) => {
    const path = `scorecard[${index}]`;
    if (!isRecord(raw)) {
      issues.push({ severity: 'error', path, message: 'Scorecard row must be an object.' });
      return;
    }
    const number = finiteNumber(raw.number);
    const par = finiteNumber(raw.par);
    const strokeIndex = finiteNumber(raw.stroke_index);
    const metres = finiteNumber(raw.metres);
    if (number == null || !Number.isInteger(number) || number < 1 || number > expectedHoles) {
      issues.push({ severity: 'error', path: `${path}.number`, message: `Hole number must be 1-${expectedHoles}.` });
    } else if (seenHoleNumbers.has(number)) {
      issues.push({ severity: 'error', path: `${path}.number`, message: `Hole ${number} appears more than once.` });
    } else {
      seenHoleNumbers.add(number);
    }
    if (par == null || !Number.isInteger(par) || par < 3 || par > 6) issues.push({ severity: 'error', path: `${path}.par`, message: 'Par must be 3-6.' });
    if (strokeIndex == null || !Number.isInteger(strokeIndex) || strokeIndex < 1 || strokeIndex > expectedHoles) {
      issues.push({ severity: 'error', path: `${path}.stroke_index`, message: `Stroke index must be 1-${expectedHoles}.` });
    } else if (seenStrokeIndexes.has(strokeIndex)) {
      issues.push({ severity: 'error', path: `${path}.stroke_index`, message: `Stroke index ${strokeIndex} appears more than once.` });
    } else {
      seenStrokeIndexes.add(strokeIndex);
    }
    if (metres == null || metres < 40 || metres > 750) issues.push({ severity: 'error', path: `${path}.metres`, message: 'Hole distance must be 40-750 metres.' });
    if (number != null && par != null && strokeIndex != null && metres != null) {
      scorecard.push({ number, par, stroke_index: strokeIndex, metres });
    }
  });
  if (scorecardRaw.length !== expectedHoles) {
    issues.push({ severity: 'error', path: 'scorecard', message: `Expected ${expectedHoles} scorecard rows.` });
  }
  for (let number = 1; number <= expectedHoles; number += 1) {
    if (!seenHoleNumbers.has(number)) issues.push({ severity: 'error', path: 'scorecard', message: `Hole ${number} is missing.` });
  }

  const teeSetsRaw = Array.isArray(parsed.tee_sets) ? parsed.tee_sets : [];
  if (!Array.isArray(parsed.tee_sets) || teeSetsRaw.length === 0) {
    issues.push({ severity: 'error', path: 'tee_sets', message: 'At least one tee set is required.' });
  }
  const teeSets: CourseImportV1['tee_sets'] = [];
  const teeNames = new Set<string>();
  teeSetsRaw.forEach((raw, index) => {
    const path = `tee_sets[${index}]`;
    if (!isRecord(raw)) {
      issues.push({ severity: 'error', path, message: 'Tee set must be an object.' });
      return;
    }
    const teeName = nonEmptyString(raw.name);
    const colour = nonEmptyString(raw.colour);
    const totalMetres = finiteNumber(raw.total_metres);
    const courseRating = finiteNumber(raw.course_rating);
    const slopeRating = finiteNumber(raw.slope_rating);
    if (!teeName) issues.push({ severity: 'error', path: `${path}.name`, message: 'Tee-set name is required.' });
    else {
      const normalized = teeName.toLowerCase();
      if (teeNames.has(normalized)) issues.push({ severity: 'error', path: `${path}.name`, message: `Duplicate tee-set name: ${teeName}.` });
      teeNames.add(normalized);
    }
    if (!colour) issues.push({ severity: 'error', path: `${path}.colour`, message: 'Tee colour is required.' });
    if (totalMetres == null || totalMetres <= 0) issues.push({ severity: 'error', path: `${path}.total_metres`, message: 'Total metres must be positive.' });
    if (courseRating == null || courseRating <= 0) issues.push({ severity: 'error', path: `${path}.course_rating`, message: 'Course rating must be positive.' });
    if (slopeRating == null || slopeRating < 55 || slopeRating > 155) issues.push({ severity: 'error', path: `${path}.slope_rating`, message: 'Slope rating must be 55-155.' });
    if (teeName && colour && totalMetres != null && courseRating != null && slopeRating != null) {
      teeSets.push({ name: teeName, colour: colour.toLowerCase(), total_metres: totalMetres, course_rating: courseRating, slope_rating: slopeRating });
    }
  });

  const holeLocations: CourseImportV1['hole_locations'] = [];
  const locationNumbers = new Set<number>();
  if (parsed.hole_locations != null && !Array.isArray(parsed.hole_locations)) {
    issues.push({ severity: 'error', path: 'hole_locations', message: 'Hole locations must be an array.' });
  }
  (Array.isArray(parsed.hole_locations) ? parsed.hole_locations : []).forEach((raw, index) => {
    const path = `hole_locations[${index}]`;
    if (!isRecord(raw)) {
      issues.push({ severity: 'error', path, message: 'Hole location must be an object.' });
      return;
    }
    const number = finiteNumber(raw.number);
    if (number == null || !Number.isInteger(number) || number < 1 || number > expectedHoles) {
      issues.push({ severity: 'error', path: `${path}.number`, message: `Hole number must be 1-${expectedHoles}.` });
      return;
    }
    if (locationNumbers.has(number)) issues.push({ severity: 'error', path: `${path}.number`, message: `Duplicate hole-location row for hole ${number}.` });
    locationNumbers.add(number);
    const row: CourseImportV1['hole_locations'][number] = { number };
    for (const key of ['tee', 'green_front', 'green_centre', 'green_back'] as const) {
      if (raw[key] != null) row[key] = coordinate(raw[key], `${path}.${key}`, issues);
    }
    holeLocations.push(row);
  });

  const zones: CourseImportV1['zones'] = [];
  const zoneKeys = new Set<string>();
  if (parsed.zones != null && !Array.isArray(parsed.zones)) issues.push({ severity: 'error', path: 'zones', message: 'Zones must be an array.' });
  (Array.isArray(parsed.zones) ? parsed.zones : []).forEach((raw, index) => {
    const path = `zones[${index}]`;
    if (!isRecord(raw)) {
      issues.push({ severity: 'error', path, message: 'Zone must be an object.' });
      return;
    }
    const holeNumber = finiteNumber(raw.hole_number);
    const type = typeof raw.type === 'string' && zoneTypes.has(raw.type as ImportZoneType) ? raw.type as ImportZoneType : null;
    if (holeNumber == null || !Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > expectedHoles) issues.push({ severity: 'error', path: `${path}.hole_number`, message: `Hole number must be 1-${expectedHoles}.` });
    if (!type) issues.push({ severity: 'error', path: `${path}.type`, message: 'Unknown zone type.' });
    const key = `${holeNumber}:${type}`;
    if (type && zoneKeys.has(key)) issues.push({ severity: 'error', path, message: `Duplicate ${type} zone for hole ${holeNumber}.` });
    zoneKeys.add(key);
    const rawCoordinates = Array.isArray(raw.coordinates) ? raw.coordinates : [];
    if (!Array.isArray(raw.coordinates)) issues.push({ severity: 'error', path: `${path}.coordinates`, message: 'Coordinates must be an array.' });
    const coordinates = rawCoordinates.map((item, coordinateIndex) => coordinate(item, `${path}.coordinates[${coordinateIndex}]`, issues)).filter((item): item is ImportCoordinate => item != null);
    const minimum = type === 'fairway_centreline' ? 2 : 3;
    if (coordinates.length < minimum) issues.push({ severity: 'error', path: `${path}.coordinates`, message: `${type === 'fairway_centreline' ? 'Centreline' : 'Polygon'} requires at least ${minimum} valid coordinates.` });
    if (holeNumber != null && type) zones.push({ hole_number: holeNumber, type, coordinates });
  });

  const hazards: CourseImportV1['hazards'] = [];
  if (parsed.hazards != null && !Array.isArray(parsed.hazards)) issues.push({ severity: 'error', path: 'hazards', message: 'Hazards must be an array.' });
  (Array.isArray(parsed.hazards) ? parsed.hazards : []).forEach((raw, index) => {
    const path = `hazards[${index}]`;
    if (!isRecord(raw)) {
      issues.push({ severity: 'error', path, message: 'Hazard must be an object.' });
      return;
    }
    const type = typeof raw.type === 'string' && hazardTypes.has(raw.type as ImportHazardType) ? raw.type as ImportHazardType : null;
    if (!type) issues.push({ severity: 'error', path: `${path}.type`, message: 'Unknown hazard type.' });
    const holeNumbersRaw = Array.isArray(raw.hole_numbers) ? raw.hole_numbers : [];
    if (!Array.isArray(raw.hole_numbers)) issues.push({ severity: 'error', path: `${path}.hole_numbers`, message: 'hole_numbers must be an array.' });
    const holeNumbers = holeNumbersRaw.filter((value): value is number => typeof value === 'number' && Number.isInteger(value));
    if (holeNumbers.some(number => number < 1 || number > expectedHoles)) issues.push({ severity: 'error', path: `${path}.hole_numbers`, message: `Hazard hole numbers must be 1-${expectedHoles}.` });
    if (new Set(holeNumbers).size !== holeNumbers.length) issues.push({ severity: 'error', path: `${path}.hole_numbers`, message: 'Hazard hole numbers contain duplicates.' });
    if (holeNumbers.length === 0) issues.push({ severity: 'warning', path: `${path}.hole_numbers`, message: 'Empty hole_numbers makes this a course-wide hazard.' });
    const rawCoordinates = Array.isArray(raw.coordinates) ? raw.coordinates : [];
    const coordinates = rawCoordinates.map((item, coordinateIndex) => coordinate(item, `${path}.coordinates[${coordinateIndex}]`, issues)).filter((item): item is ImportCoordinate => item != null);
    if (coordinates.length < 3) issues.push({ severity: 'error', path: `${path}.coordinates`, message: 'Hazard polygon requires at least 3 valid coordinates.' });
    if (type) hazards.push({ hole_numbers: holeNumbers, type, label: nullableString(raw.label), coordinates });
  });

  if (holeLocations.length === 0) issues.push({ severity: 'warning', path: 'hole_locations', message: 'No hole GPS locations supplied; the course will require mapping before publication.' });
  if (zones.length === 0) issues.push({ severity: 'warning', path: 'zones', message: 'No rich hole geometry supplied.' });

  const counts = issueCounts(issues);
  if (counts.errors > 0 || !name || latitude == null || longitude == null || (holes !== 9 && holes !== 18)) {
    return { data: null, issues, ...counts };
  }

  const data: CourseImportV1 = {
    schema: COURSE_IMPORT_SCHEMA_V1,
    source: {
      provider,
      source_id: nullableString(sourceRaw.source_id),
      source_url: nullableString(sourceRaw.source_url),
      retrieved_at: nullableString(sourceRaw.retrieved_at),
      license: nullableString(sourceRaw.license),
      notes: nullableString(sourceRaw.notes),
    },
    course: { name, latitude, longitude, holes },
    scorecard: scorecard.sort((a, b) => a.number - b.number),
    tee_sets: teeSets,
    hole_locations: holeLocations.sort((a, b) => a.number - b.number),
    zones,
    hazards,
  };
  return { data, issues, ...counts };
}
