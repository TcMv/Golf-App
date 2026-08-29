import {
  COURSE_IMPORT_SCHEMA_V1,
  validateCourseImport,
  type CourseImportParseResult,
  type CourseImportV1,
  type ImportCoordinate,
  type ImportHazardType,
  type ImportZoneType,
} from './courseImport';

export type CourseDatabaseExportInput = {
  course: {
    name: string;
    lat: number;
    lng: number;
    holes: number;
    source_provider?: string | null;
    source_id?: string | null;
    source_url?: string | null;
    source_retrieved_at?: string | null;
    source_license?: string | null;
    source_notes?: string | null;
  };
  holes: Array<{
    number: number;
    par: number;
    stroke_index: number;
    white_metres: number | null;
    tee_lat: number | null;
    tee_lng: number | null;
    green_front_lat: number | null;
    green_front_lng: number | null;
    green_mid_lat: number | null;
    green_mid_lng: number | null;
    green_back_lat: number | null;
    green_back_lng: number | null;
  }>;
  teeSets: Array<{
    name: string;
    colour: string;
    total_metres: number;
    course_rating: number;
    slope_rating: number;
  }>;
  zones: Array<{
    hole_number: number;
    zone_type: ImportZoneType;
    coordinates: ImportCoordinate[];
  }>;
  hazards: Array<{
    hole_number?: number | null;
    hole_numbers?: number[] | null;
    type: ImportHazardType;
    label?: string | null;
    coordinates: ImportCoordinate[];
  }>;
};

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function numberValue(value: string | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullable(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function courseImportToJson(data: CourseImportV1, pretty = true): string {
  return JSON.stringify(data, null, pretty ? 2 : 0);
}

export function buildCourseImportFromDatabase(input: CourseDatabaseExportInput): CourseImportV1 {
  const holeLocations: CourseImportV1['hole_locations'] = input.holes
    .map(hole => {
      const row: CourseImportV1['hole_locations'][number] = { number: hole.number };
      if (hole.tee_lat != null && hole.tee_lng != null) row.tee = { lat: hole.tee_lat, lng: hole.tee_lng };
      if (hole.green_front_lat != null && hole.green_front_lng != null) row.green_front = { lat: hole.green_front_lat, lng: hole.green_front_lng };
      if (hole.green_mid_lat != null && hole.green_mid_lng != null) row.green_centre = { lat: hole.green_mid_lat, lng: hole.green_mid_lng };
      if (hole.green_back_lat != null && hole.green_back_lng != null) row.green_back = { lat: hole.green_back_lat, lng: hole.green_back_lng };
      return row;
    })
    .filter(row => row.tee || row.green_front || row.green_centre || row.green_back);

  return {
    schema: COURSE_IMPORT_SCHEMA_V1,
    source: {
      provider: input.course.source_provider ?? 'golfcaddie',
      source_id: input.course.source_id ?? null,
      source_url: input.course.source_url ?? null,
      retrieved_at: input.course.source_retrieved_at ?? null,
      license: input.course.source_license ?? null,
      notes: input.course.source_notes ?? null,
    },
    course: {
      name: input.course.name,
      latitude: input.course.lat,
      longitude: input.course.lng,
      holes: input.course.holes as 9 | 18,
    },
    scorecard: input.holes.map(hole => ({
      number: hole.number,
      par: hole.par,
      stroke_index: hole.stroke_index,
      metres: hole.white_metres ?? 0,
    })),
    tee_sets: input.teeSets.map(tee => ({ ...tee })),
    hole_locations: holeLocations,
    zones: input.zones.map(zone => ({
      hole_number: zone.hole_number,
      type: zone.zone_type,
      coordinates: zone.coordinates,
    })),
    hazards: input.hazards.map(hazard => ({
      hole_numbers: hazard.hole_numbers?.length
        ? hazard.hole_numbers
        : hazard.hole_number != null
          ? [hazard.hole_number]
          : [],
      type: hazard.type,
      label: hazard.label ?? null,
      coordinates: hazard.coordinates,
    })),
  };
}

/**
 * Self-contained scorecard CSV. One row per hole.
 * Required headers:
 * course_name,latitude,longitude,holes,tee_name,tee_colour,course_rating,slope_rating,hole,par,stroke_index,metres
 * Optional provenance headers:
 * source_provider,source_id,source_url,source_retrieved_at,source_license,source_notes
 */
export function parseCourseImportCsv(input: string): CourseImportParseResult {
  const lines = input.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2) {
    return {
      data: null,
      issues: [{ severity: 'error', path: '$', message: 'CSV requires a header and at least one hole row.' }],
      errors: 1,
      warnings: 0,
    };
  }
  const headers = splitCsvLine(lines[0]).map(header => header.trim().toLowerCase());
  const required = ['course_name', 'latitude', 'longitude', 'holes', 'tee_name', 'tee_colour', 'course_rating', 'slope_rating', 'hole', 'par', 'stroke_index', 'metres'];
  const missing = required.filter(header => !headers.includes(header));
  if (missing.length > 0) {
    return {
      data: null,
      issues: [{ severity: 'error', path: 'header', message: `Missing CSV headers: ${missing.join(', ')}.` }],
      errors: 1,
      warnings: 0,
    };
  }

  const rows = lines.slice(1).map(line => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
  const first = rows[0];
  const scorecard = rows.map(row => ({
    number: numberValue(row.hole),
    par: numberValue(row.par),
    stroke_index: numberValue(row.stroke_index),
    metres: numberValue(row.metres),
  }));
  const totalMetres = scorecard.reduce((sum, row) => sum + (row.metres ?? 0), 0);

  return validateCourseImport({
    schema: COURSE_IMPORT_SCHEMA_V1,
    source: {
      provider: nullable(first.source_provider) ?? 'csv',
      source_id: nullable(first.source_id),
      source_url: nullable(first.source_url),
      retrieved_at: nullable(first.source_retrieved_at),
      license: nullable(first.source_license),
      notes: nullable(first.source_notes),
    },
    course: {
      name: first.course_name,
      latitude: numberValue(first.latitude),
      longitude: numberValue(first.longitude),
      holes: numberValue(first.holes),
    },
    scorecard,
    tee_sets: [{
      name: first.tee_name,
      colour: first.tee_colour,
      total_metres: totalMetres,
      course_rating: numberValue(first.course_rating),
      slope_rating: numberValue(first.slope_rating),
    }],
    hole_locations: [],
    zones: [],
    hazards: [],
  });
}

type GeoJsonFeature = {
  type: 'Feature';
  properties?: Record<string, unknown> | null;
  geometry?: {
    type: 'Point' | 'LineString' | 'Polygon';
    coordinates: unknown;
  } | null;
};

function geoCoordinate(value: unknown): ImportCoordinate | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function geoCoordinates(value: unknown): ImportCoordinate[] {
  if (!Array.isArray(value)) return [];
  return value.map(geoCoordinate).filter((item): item is ImportCoordinate => item != null);
}

export function parseCourseImportGeoJson(input: string): CourseImportParseResult {
  let parsed: any;
  try {
    parsed = JSON.parse(input);
  } catch {
    return { data: null, issues: [{ severity: 'error', path: '$', message: 'Invalid GeoJSON.' }], errors: 1, warnings: 0 };
  }
  if (!parsed || parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
    return { data: null, issues: [{ severity: 'error', path: '$', message: 'GeoJSON must be a FeatureCollection.' }], errors: 1, warnings: 0 };
  }
  const meta = parsed.properties ?? {};
  const holeLocations = new Map<number, any>();
  const zones: any[] = [];
  const hazards: any[] = [];

  for (const feature of parsed.features as GeoJsonFeature[]) {
    const properties = feature?.properties ?? {};
    const kind = properties.kind;
    const holeNumber = Number(properties.hole_number);
    if (kind === 'hole_location' && feature.geometry?.type === 'Point' && Number.isInteger(holeNumber)) {
      const point = geoCoordinate(feature.geometry.coordinates);
      if (!point) continue;
      const role = properties.role;
      if (!['tee', 'green_front', 'green_centre', 'green_back'].includes(String(role))) continue;
      const row = holeLocations.get(holeNumber) ?? { number: holeNumber };
      row[String(role)] = point;
      holeLocations.set(holeNumber, row);
    } else if (kind === 'zone' && Number.isInteger(holeNumber)) {
      const zoneType = properties.zone_type;
      let coordinates: ImportCoordinate[] = [];
      if (feature.geometry?.type === 'LineString') coordinates = geoCoordinates(feature.geometry.coordinates);
      if (feature.geometry?.type === 'Polygon' && Array.isArray(feature.geometry.coordinates)) coordinates = geoCoordinates(feature.geometry.coordinates[0]);
      zones.push({ hole_number: holeNumber, type: zoneType, coordinates });
    } else if (kind === 'hazard') {
      const polygon = feature.geometry?.type === 'Polygon' && Array.isArray(feature.geometry.coordinates)
        ? geoCoordinates(feature.geometry.coordinates[0])
        : [];
      hazards.push({
        hole_numbers: Array.isArray(properties.hole_numbers) ? properties.hole_numbers : Number.isInteger(holeNumber) ? [holeNumber] : [],
        type: properties.hazard_type,
        label: typeof properties.label === 'string' ? properties.label : null,
        coordinates: polygon,
      });
    }
  }

  return validateCourseImport({
    schema: COURSE_IMPORT_SCHEMA_V1,
    source: meta.source ?? { provider: 'geojson' },
    course: meta.course,
    scorecard: meta.scorecard,
    tee_sets: meta.tee_sets,
    hole_locations: Array.from(holeLocations.values()),
    zones,
    hazards,
  });
}

export function courseImportToGeoJson(data: CourseImportV1): string {
  const features: any[] = [];
  for (const location of data.hole_locations) {
    for (const role of ['tee', 'green_front', 'green_centre', 'green_back'] as const) {
      const point = location[role];
      if (!point) continue;
      features.push({
        type: 'Feature',
        properties: { kind: 'hole_location', hole_number: location.number, role },
        geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
      });
    }
  }
  for (const zone of data.zones) {
    const isLine = zone.type === 'fairway_centreline';
    features.push({
      type: 'Feature',
      properties: { kind: 'zone', hole_number: zone.hole_number, zone_type: zone.type },
      geometry: {
        type: isLine ? 'LineString' : 'Polygon',
        coordinates: isLine
          ? zone.coordinates.map(point => [point.lng, point.lat])
          : [[...zone.coordinates.map(point => [point.lng, point.lat]), [zone.coordinates[0].lng, zone.coordinates[0].lat]]],
      },
    });
  }
  for (const hazard of data.hazards) {
    features.push({
      type: 'Feature',
      properties: { kind: 'hazard', hole_numbers: hazard.hole_numbers, hazard_type: hazard.type, label: hazard.label },
      geometry: {
        type: 'Polygon',
        coordinates: [[...hazard.coordinates.map(point => [point.lng, point.lat]), [hazard.coordinates[0].lng, hazard.coordinates[0].lat]]],
      },
    });
  }
  return JSON.stringify({
    type: 'FeatureCollection',
    properties: {
      schema: COURSE_IMPORT_SCHEMA_V1,
      source: data.source,
      course: data.course,
      scorecard: data.scorecard,
      tee_sets: data.tee_sets,
    },
    features,
  }, null, 2);
}
