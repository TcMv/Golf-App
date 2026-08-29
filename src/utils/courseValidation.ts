export type CourseValidationHole = {
  number: number;
  par: number | null;
  stroke_index: number | null;
  white_metres: number | null;
  tee_lat: number | null;
  tee_lng: number | null;
  green_front_lat: number | null;
  green_front_lng: number | null;
  green_mid_lat: number | null;
  green_mid_lng: number | null;
  green_back_lat: number | null;
  green_back_lng: number | null;
};

export type CourseValidationZone = {
  hole_number: number;
  zone_type: 'green' | 'fairway' | 'tee_box' | 'fairway_centreline';
  coordinates: { lat: number; lng: number }[];
};

export type CourseValidationIssue = {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  holeNumber?: number;
};

export type CourseValidationResult = {
  completeness: number;
  basicCompleteness: number;
  geometryCompleteness: number;
  errors: number;
  warnings: number;
  publishable: boolean;
  issues: CourseValidationIssue[];
  counts: {
    expectedHoles: number;
    loadedHoles: number;
    teeSets: number;
    teesMapped: number;
    greensMapped: number;
    greenPolygons: number;
    fairwayPolygons: number;
    centrelines: number;
  };
};

export type CourseValidationInput = {
  expectedHoles: number;
  teeSetCount: number;
  holes: CourseValidationHole[];
  zones: CourseValidationZone[];
};

const hasPair = (lat: number | null, lng: number | null) => lat != null && lng != null;

const haversineMetres = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const radius = 6371000;
  const toRad = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function validateCourseReadiness(input: CourseValidationInput): CourseValidationResult {
  const expected = Math.max(1, input.expectedHoles);
  const issues: CourseValidationIssue[] = [];
  const holesByNumber = new Map(input.holes.map(hole => [hole.number, hole]));
  const zonesByHole = new Map<number, CourseValidationZone[]>();
  input.zones.forEach(zone => {
    const current = zonesByHole.get(zone.hole_number) ?? [];
    current.push(zone);
    zonesByHole.set(zone.hole_number, current);
  });

  if (input.teeSetCount === 0) {
    issues.push({ severity: 'error', code: 'no_tee_sets', message: 'Add at least one tee set.' });
  }
  if (input.holes.length !== expected) {
    issues.push({
      severity: 'error',
      code: 'hole_count',
      message: `Expected ${expected} holes but found ${input.holes.length}.`,
    });
  }

  const strokeIndexes = new Map<number, number[]>();
  let scorecardFields = 0;
  let teeGps = 0;
  let greenGps = 0;
  let greenPolygons = 0;
  let fairwayPolygons = 0;
  let centrelines = 0;
  let geometryTargets = 0;
  let geometryCompleted = 0;

  for (let holeNumber = 1; holeNumber <= expected; holeNumber += 1) {
    const hole = holesByNumber.get(holeNumber);
    if (!hole) {
      issues.push({ severity: 'error', code: 'missing_hole', holeNumber, message: `Hole ${holeNumber} is missing.` });
      geometryTargets += 3;
      continue;
    }

    const parValid = hole.par != null && hole.par >= 3 && hole.par <= 6;
    const siValid = hole.stroke_index != null
      && Number.isInteger(hole.stroke_index)
      && hole.stroke_index >= 1
      && hole.stroke_index <= expected;
    const distanceValid = hole.white_metres != null && hole.white_metres >= 40 && hole.white_metres <= 750;
    scorecardFields += Number(parValid) + Number(siValid) + Number(distanceValid);

    if (!parValid) issues.push({ severity: 'error', code: 'invalid_par', holeNumber, message: `Hole ${holeNumber}: enter a valid par.` });
    if (!siValid) issues.push({ severity: 'error', code: 'invalid_stroke_index', holeNumber, message: `Hole ${holeNumber}: enter a valid stroke index.` });
    if (!distanceValid) issues.push({ severity: 'error', code: 'invalid_distance', holeNumber, message: `Hole ${holeNumber}: enter a plausible tee distance.` });

    if (siValid && hole.stroke_index != null) {
      const usedBy = strokeIndexes.get(hole.stroke_index) ?? [];
      usedBy.push(holeNumber);
      strokeIndexes.set(hole.stroke_index, usedBy);
    }

    const teeMapped = hasPair(hole.tee_lat, hole.tee_lng);
    const midMapped = hasPair(hole.green_mid_lat, hole.green_mid_lng);
    const frontMapped = hasPair(hole.green_front_lat, hole.green_front_lng);
    const backMapped = hasPair(hole.green_back_lat, hole.green_back_lng);
    if (teeMapped) teeGps += 1;
    if (midMapped && frontMapped && backMapped) greenGps += 1;

    if (!teeMapped) issues.push({ severity: 'error', code: 'missing_tee_gps', holeNumber, message: `Hole ${holeNumber}: tee GPS is missing.` });
    if (!midMapped) issues.push({ severity: 'error', code: 'missing_green_mid', holeNumber, message: `Hole ${holeNumber}: green centre GPS is missing.` });
    if (!frontMapped || !backMapped) {
      issues.push({ severity: 'warning', code: 'incomplete_green_gps', holeNumber, message: `Hole ${holeNumber}: map green front and back for full GPS distances.` });
    }

    if (teeMapped && midMapped) {
      const distance = haversineMetres(hole.tee_lat!, hole.tee_lng!, hole.green_mid_lat!, hole.green_mid_lng!);
      if (distance < 35 || distance > 900) {
        issues.push({
          severity: 'error',
          code: 'tee_green_distance',
          holeNumber,
          message: `Hole ${holeNumber}: tee-to-green GPS distance (${Math.round(distance)} m) looks incorrect.`,
        });
      }
    }

    const holeZones = zonesByHole.get(holeNumber) ?? [];
    const green = holeZones.find(zone => zone.zone_type === 'green');
    const fairway = holeZones.find(zone => zone.zone_type === 'fairway');
    const centreline = holeZones.find(zone => zone.zone_type === 'fairway_centreline');

    geometryTargets += 1;
    if (green && green.coordinates.length >= 3) {
      geometryCompleted += 1;
      greenPolygons += 1;
    } else {
      issues.push({ severity: 'warning', code: 'missing_green_polygon', holeNumber, message: `Hole ${holeNumber}: green polygon is not mapped.` });
    }

    // Par 3s do not need a fairway/centreline to be considered geometrically complete.
    if (hole.par != null && hole.par >= 4) {
      geometryTargets += 2;
      if (fairway && fairway.coordinates.length >= 3) {
        geometryCompleted += 1;
        fairwayPolygons += 1;
      } else {
        issues.push({ severity: 'warning', code: 'missing_fairway', holeNumber, message: `Hole ${holeNumber}: fairway polygon is not mapped.` });
      }
      if (centreline && centreline.coordinates.length >= 2) {
        geometryCompleted += 1;
        centrelines += 1;
      } else {
        issues.push({ severity: 'warning', code: 'missing_centreline', holeNumber, message: `Hole ${holeNumber}: fairway centreline is not mapped.` });
      }
    }

    holeZones.forEach(zone => {
      const minimum = zone.zone_type === 'fairway_centreline' ? 2 : 3;
      if (zone.coordinates.length < minimum) {
        issues.push({
          severity: 'error',
          code: 'invalid_zone',
          holeNumber,
          message: `Hole ${holeNumber}: ${zone.zone_type.replaceAll('_', ' ')} geometry has too few points.`,
        });
      }
    });
  }

  strokeIndexes.forEach((holeNumbers, strokeIndex) => {
    if (holeNumbers.length > 1) {
      issues.push({
        severity: 'error',
        code: 'duplicate_stroke_index',
        message: `Stroke index ${strokeIndex} is used on holes ${holeNumbers.join(', ')}.`,
      });
    }
  });

  const teeSetScore = input.teeSetCount > 0 ? 1 : 0;
  const scorecardScore = scorecardFields / (expected * 3);
  const teeGpsScore = teeGps / expected;
  const greenGpsScore = greenGps / expected;
  const basicCompleteness = clampPercent((teeSetScore * 0.1 + scorecardScore * 0.35 + teeGpsScore * 0.25 + greenGpsScore * 0.3) * 100);
  const geometryCompleteness = geometryTargets > 0 ? clampPercent((geometryCompleted / geometryTargets) * 100) : 0;
  const completeness = clampPercent(basicCompleteness * 0.7 + geometryCompleteness * 0.3);
  const errors = issues.filter(issue => issue.severity === 'error').length;
  const warnings = issues.length - errors;

  return {
    completeness,
    basicCompleteness,
    geometryCompleteness,
    errors,
    warnings,
    publishable: errors === 0 && basicCompleteness === 100,
    issues,
    counts: {
      expectedHoles: expected,
      loadedHoles: input.holes.length,
      teeSets: input.teeSetCount,
      teesMapped: teeGps,
      greensMapped: greenGps,
      greenPolygons,
      fairwayPolygons,
      centrelines,
    },
  };
}
