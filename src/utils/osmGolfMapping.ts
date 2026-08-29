import {
  MAPPING_SUGGESTION_BATCH_SCHEMA_V1,
  type MappingSuggestionBatchV1,
} from './courseMappingSuggestionBatch';
import type { MappingSuggestionFeature, MappingSuggestionGeometry, SuggestionCoordinate } from './courseMappingSuggestions';

export const OSM_DATA_LICENSE = 'ODbL 1.0 — © OpenStreetMap contributors';
export const OSM_PUBLIC_OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

export type OsmElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
};

export type OverpassResponse = {
  version?: number;
  generator?: string;
  osm3s?: { timestamp_osm_base?: string; copyright?: string };
  elements: OsmElement[];
};

export type OsmConversionIssue = {
  severity: 'warning' | 'info';
  message: string;
};

export type OsmConversionResult = {
  batch: MappingSuggestionBatchV1;
  issues: OsmConversionIssue[];
  skipped: number;
  directlyAssigned: number;
  inferredAssignments: number;
};

type HolePath = { hole: number; coordinates: SuggestionCoordinate[] };
type PendingFeature = {
  element: OsmElement;
  feature: MappingSuggestionFeature;
  geometry: MappingSuggestionGeometry;
  coordinates: SuggestionCoordinate[];
  hole: number | null;
  directHole: boolean;
};

const polygonFeatureMap: Record<string, MappingSuggestionFeature | undefined> = {
  fairway: 'fairway',
  green: 'green',
  tee: 'tee_box',
  bunker: 'bunker',
  water_hazard: 'water',
  lateral_water_hazard: 'red_zone',
  out_of_bounds: 'ob',
};

export function buildOverpassGolfQuery(lat: number, lng: number, radiusMetres = 1600): string {
  const radius = Math.max(250, Math.min(5000, Math.round(radiusMetres)));
  return `[out:json][timeout:25];\n(\n  nwr(around:${radius},${lat.toFixed(7)},${lng.toFixed(7)})["golf"];\n);\nout tags geom center;`;
}

export function convertOverpassGolfToMappingBatch(args: {
  courseId: string;
  courseHoles: number;
  response: OverpassResponse;
  sourceReference?: string | null;
}): OsmConversionResult {
  const { courseId, courseHoles, response } = args;
  const issues: OsmConversionIssue[] = [];
  const holePaths: HolePath[] = [];
  const pending: PendingFeature[] = [];
  let skipped = 0;
  let directlyAssigned = 0;
  let inferredAssignments = 0;

  for (const element of response.elements ?? []) {
    const tags = element.tags ?? {};
    const golf = tags.golf;
    if (!golf) continue;
    const explicitHole = parseHoleNumber(tags, courseHoles);

    if (golf === 'hole') {
      const coords = lineCoordinates(element);
      if (explicitHole && coords.length >= 2) {
        holePaths.push({ hole: explicitHole, coordinates: coords });
        pending.push({ element, feature: 'fairway_centreline', geometry: 'line', coordinates: coords, hole: explicitHole, directHole: true });
        directlyAssigned += 1;
      } else {
        skipped += 1;
        issues.push({ severity: 'info', message: `OSM ${element.type}/${element.id} golf=hole skipped because it has no usable hole ref or line geometry.` });
      }
      continue;
    }

    if (golf === 'pin') {
      const point = pointCoordinate(element);
      if (!point) { skipped += 1; continue; }
      pending.push({ element, feature: 'green_centre', geometry: 'point', coordinates: [point], hole: explicitHole, directHole: explicitHole != null });
      if (explicitHole) directlyAssigned += 1;
      continue;
    }

    const feature = polygonFeatureMap[golf];
    if (!feature) continue;
    const coords = polygonCoordinates(element);
    if (coords.length < 3) {
      skipped += 1;
      issues.push({ severity: 'info', message: `OSM ${element.type}/${element.id} golf=${golf} skipped because it is not a usable polygon.` });
      continue;
    }
    pending.push({ element, feature, geometry: 'polygon', coordinates: coords, hole: explicitHole, directHole: explicitHole != null });
    if (explicitHole) directlyAssigned += 1;

    // Polygon greens and tees are also useful as point suggestions when OSM has no explicit pin/tee point.
    if (feature === 'green' || feature === 'tee_box') {
      const centre = polygonCentroid(coords);
      if (centre) {
        pending.push({
          element,
          feature: feature === 'green' ? 'green_centre' : 'tee',
          geometry: 'point',
          coordinates: [centre],
          hole: explicitHole,
          directHole: explicitHole != null,
        });
        if (explicitHole) directlyAssigned += 1;
      }
    }
  }

  // Associate unnumbered golf features to the nearest numbered golf=hole line.
  for (const item of pending) {
    if (item.hole != null) continue;
    const centre = item.geometry === 'point' ? item.coordinates[0] : polygonCentroid(item.coordinates) ?? item.coordinates[0];
    const nearest = nearestHolePath(centre, holePaths);
    if (nearest && nearest.distanceMetres <= 140) {
      item.hole = nearest.hole;
      inferredAssignments += 1;
    } else {
      skipped += 1;
      issues.push({ severity: 'warning', message: `OSM ${item.element.type}/${item.element.id} ${item.feature} could not be assigned to a hole and was skipped.` });
    }
  }

  const suggestions = pending
    .filter(item => item.hole != null)
    .map(item => ({
      hole_number: item.hole as number,
      feature_type: item.feature,
      geometry_type: item.geometry,
      coordinates: item.coordinates,
      confidence: item.directHole ? 0.94 : 0.78,
      metadata: {
        osm_type: item.element.type,
        osm_id: item.element.id,
        assignment: item.directHole ? 'osm_ref' : 'nearest_numbered_hole_path',
        osm_tags: item.element.tags ?? {},
      },
    }));

  if (holePaths.length === 0) {
    issues.push({ severity: 'warning', message: 'No numbered golf=hole paths were found. Unnumbered OSM features cannot be safely associated to holes.' });
  }

  return {
    batch: {
      schema: MAPPING_SUGGESTION_BATCH_SCHEMA_V1,
      course_id: courseId,
      source: {
        provider: 'OpenStreetMap',
        reference: args.sourceReference ?? response.osm3s?.timestamp_osm_base ?? null,
        license: OSM_DATA_LICENSE,
      },
      suggestions,
    },
    issues,
    skipped,
    directlyAssigned,
    inferredAssignments,
  };
}

function parseHoleNumber(tags: Record<string, string>, courseHoles: number): number | null {
  const raw = tags.ref ?? tags.hole ?? tags['golf:hole'] ?? '';
  const match = raw.match(/(?:^|\D)(\d{1,2})(?:\D|$)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value >= 1 && value <= courseHoles ? value : null;
}

function pointCoordinate(element: OsmElement): SuggestionCoordinate | null {
  if (Number.isFinite(element.lat) && Number.isFinite(element.lon)) return { lat: element.lat as number, lng: element.lon as number };
  if (element.center && Number.isFinite(element.center.lat) && Number.isFinite(element.center.lon)) return { lat: element.center.lat, lng: element.center.lon };
  const geometry = lineCoordinates(element);
  return geometry.length === 1 ? geometry[0] : null;
}

function lineCoordinates(element: OsmElement): SuggestionCoordinate[] {
  return (element.geometry ?? [])
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon))
    .map(point => ({ lat: point.lat, lng: point.lon }));
}

function polygonCoordinates(element: OsmElement): SuggestionCoordinate[] {
  const coords = lineCoordinates(element);
  if (coords.length > 1) {
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first.lat === last.lat && first.lng === last.lng) return coords.slice(0, -1);
  }
  return coords;
}

function polygonCentroid(coords: SuggestionCoordinate[]): SuggestionCoordinate | null {
  if (coords.length === 0) return null;
  const sum = coords.reduce((acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / coords.length, lng: sum.lng / coords.length };
}

function nearestHolePath(point: SuggestionCoordinate, paths: HolePath[]): { hole: number; distanceMetres: number } | null {
  let best: { hole: number; distanceMetres: number } | null = null;
  for (const path of paths) {
    for (const pathPoint of path.coordinates) {
      const distanceMetres = haversineMetres(point, pathPoint);
      if (!best || distanceMetres < best.distanceMetres) best = { hole: path.hole, distanceMetres };
    }
  }
  return best;
}

function haversineMetres(a: SuggestionCoordinate, b: SuggestionCoordinate): number {
  const r = 6371000;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}
