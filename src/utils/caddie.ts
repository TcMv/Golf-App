import { haversineMetres, bearing as calcBearing } from './distance';
import { windCarryAdjustment, elevationCarryAdjustment } from './wind';
import type { Club, Coordinate, Hazard, Lie } from '../types';

type LatLng = Coordinate;
type ActiveHazard = {
  hazard: Hazard;
  nearDistance: number;
  farDistance: number;
  side: HazardWarning['side'];
  crossesShotCorridor: boolean;
};
export type CaddieLie = Lie | 'trees';
export type CaddieZone = {
  zone_type: 'green' | 'fairway';
  coordinates: { lat: number; lng: number }[];
};

function polygonCentroid(coords: { lat: number; lng: number }[]): LatLng {
  return {
    latitude: coords.reduce((s, c) => s + c.lat, 0) / coords.length,
    longitude: coords.reduce((s, c) => s + c.lng, 0) / coords.length,
  };
}

export type HazardWarning = {
  type: Hazard['type'];
  distanceMetres: number;
  side: 'left' | 'right' | 'centre';
  label: string;
};

export type ClubOption = {
  club: Club;
  adjustedCarry: number;
  clearsHazards: boolean;
  warnings: HazardWarning[];
};

export type CaddieHistory = {
  count: number;
  avg: number;
  best: number;
  girPct: number;
  avgPutts: number;
};

export type CaddieAdvice = {
  distToPin: number;
  playingDistance: number;
  target: LatLng;
  targetDistance: number;
  remainingDistance: number;
  shotType: 'attack' | 'layup' | 'recovery' | 'putt';
  lie: CaddieLie;
  customTarget: boolean;
  aimInstruction: string;
  recommended: ClubOption;
  alternatives: ClubOption[];
  windLabel: string;
  windAdjustment: number;
  elevDiff: number;
  strategy: string[];
  history: CaddieHistory | null;
  shortText: string;
  context: string;
};

export function buildPreRoundBriefing(params: {
  courseName: string;
  courseRating: number;
  slopeRating: number;
  windLabel: string;
  windSpeed: number;
  handicapIndex: number | null;
  recentCourseScores: number[];
}): string {
  const {
    courseName,
    courseRating,
    slopeRating,
    windLabel,
    windSpeed,
    handicapIndex,
    recentCourseScores,
  } = params;
  const tips: string[] = [];

  if (windSpeed >= 20) {
    tips.push(`In ${windLabel}, swing within yourself and use one extra club into the wind.`);
  } else if (windSpeed >= 8) {
    tips.push(`With ${windLabel}, confirm wind direction on exposed tees before selecting a club.`);
  } else {
    tips.push(`Conditions are ${windLabel.toLowerCase()}; commit to normal carry numbers.`);
  }

  if (slopeRating >= 130) {
    tips.push(`${courseName} plays demanding at slope ${slopeRating}; favour fairways and centre green.`);
  } else if (courseRating >= 72) {
    tips.push(`The ${courseRating.toFixed(1)} rating rewards avoiding penalties more than chasing flags.`);
  } else {
    tips.push(`Use the manageable ${slopeRating} slope to play assertively from good lies.`);
  }

  if (recentCourseScores.length > 0) {
    const average = recentCourseScores.reduce((sum, score) => sum + score, 0) / recentCourseScores.length;
    tips.push(`Your recent average here is ${average.toFixed(1)}; set a target of ${Math.max(1, Math.floor(average - 1))} or better.`);
  } else if (handicapIndex != null) {
    tips.push(`Off ${handicapIndex.toFixed(1)}, protect your score on stroke-index holes and take chances elsewhere.`);
  } else {
    tips.push('Set a conservative target for the opening three holes, then adjust once your strike is clear.');
  }

  return tips.map((tip, index) => `${index + 1}. ${tip}`).join('\n');
}

export function buildCaddieAdvice(params: {
  playerPos: LatLng;
  greenMid: LatLng;
  hazards: Hazard[];
  clubs: Club[];
  windSpeed: number;
  windDir: number;
  windLabel: string;
  playerElevation: number;
  greenElevation: number;
  holeNumber?: number;
  holePar?: number;
  holeIndex?: number;
  history?: CaddieHistory | null;
  lie?: CaddieLie;
  customTarget?: LatLng | null;
  clubMisses?: Record<string, 'left' | 'right' | 'short' | 'long'>;
}): CaddieAdvice | null {
  const {
    playerPos,
    greenMid,
    hazards,
    clubs,
    windSpeed,
    windDir,
    windLabel,
    playerElevation,
    greenElevation,
    holeNumber,
    holePar,
    holeIndex,
    history = null,
    lie = 'rough',
    customTarget = null,
    clubMisses = {},
  } = params;
  const elevDiff = Math.round(greenElevation - playerElevation);

  const distToPin = haversineMetres(playerPos, greenMid);
  const shotObjective = customTarget ?? greenMid;
  const distToObjective = haversineMetres(playerPos, shotObjective);
  const bToGreen = calcBearing(playerPos, shotObjective);

  if (lie === 'green') {
    const putter = clubs.find(club => club.type === 'putter');
    if (!putter) return null;
    const option: ClubOption = {
      club: putter,
      adjustedCarry: distToPin,
      clearsHazards: true,
      warnings: [],
    };
    return {
      distToPin,
      playingDistance: distToPin,
      target: greenMid,
      targetDistance: distToPin,
      remainingDistance: 0,
      shotType: 'putt',
      lie,
      customTarget: false,
      aimInstruction: 'Read the break and start the putt on your chosen line.',
      recommended: option,
      alternatives: [],
      windLabel,
      windAdjustment: 0,
      elevDiff,
      strategy: [
        `Putt ${distToPin}m toward the hole.`,
        'Prioritise pace and leave the next putt below the hole where possible.',
      ],
      history,
      shortText: `${distToPin}m putt. Read the break and commit to pace.`,
      context: `On the green, ${distToPin}m from the hole. Recommend putter and pace control.`,
    };
  }

  // Only clubs with carry set, not putters, sorted longest first
  const usable = clubs
    .filter(c => {
      if (c.carry_metres == null || c.type === 'putter') return false;
      if (lie === 'bunker') return c.type === 'wedge' || c.type === 'iron';
      if (lie === 'trees' || lie === 'recovery') {
        return c.type === 'wedge' || c.type === 'iron' || c.type === 'hybrid';
      }
      return true;
    })
    .sort((a, b) => (b.carry_metres ?? 0) - (a.carry_metres ?? 0));

  if (usable.length === 0) return null;

  // Inspect only the finite shot corridor. Polygon projection bounds can
  // invent crossings for large or concave hazards well beyond the shot.
  const activeHazards = hazards
    .map(h => {
      if (h.coordinates.length < 3) return null;
      const geometry = hazardAlongShot(
        playerPos,
        bToGreen,
        distToObjective + 35,
        h.coordinates,
      );
      if (!geometry || geometry.farDistance < 5) return null;
      return {
        hazard: h,
        nearDistance: geometry.nearDistance,
        farDistance: geometry.farDistance,
        side: geometry.side,
        crossesShotCorridor: geometry.crossesShotCorridor,
      };
    })
    .filter(Boolean) as ActiveHazard[];

  // Score each club
  function evaluateClub(club: Club): ClubOption {
    const stddev = club.carry_stddev_metres ?? 12;
    const windAdj = windCarryAdjustment(club.carry_metres!, windSpeed, windDir, bToGreen);
    const lieFactor = lie === 'bunker' ? 0.8 : lie === 'trees' || lie === 'recovery' ? 0.7 : 1;
    const adjusted = Math.round(
      elevationCarryAdjustment(windAdj, playerElevation, greenElevation) * lieFactor,
    );
    const warnings: HazardWarning[] = [];

    for (const {
      hazard,
      nearDistance,
      farDistance,
      side,
      crossesShotCorridor,
    } of activeHazards) {
      const landMin = adjusted - stddev;
      const landMax = adjusted + stddev * 0.5;
      const landingOverlap = crossesShotCorridor
        && farDistance >= landMin
        && nearDistance <= landMax;
      const reliableCarry = adjusted - stddev;
      const requiresCarry = crossesShotCorridor
        && (hazard.type === 'water' || hazard.type === 'red_zone' || hazard.type === 'ob')
        && nearDistance <= landMax
        && reliableCarry < farDistance + 5;
      const blocksFlight = crossesShotCorridor
        && hazard.type === 'trees'
        && nearDistance <= landMax;

      if (landingOverlap || requiresCarry || blocksFlight) {
        const distance = Math.max(1, Math.round(
          requiresCarry || blocksFlight ? farDistance : (nearDistance + farDistance) / 2,
        ));
        warnings.push({
          type: hazard.type,
          distanceMetres: distance,
          side,
          label: `${hazard.type} ${distance}m ${side}`,
        });
      }
    }

    return {
      club,
      adjustedCarry: adjusted,
      clearsHazards: warnings.length === 0,
      warnings,
    };
  }

  const options = usable.map(evaluateClub);

  const safeOptions = options.filter(option => option.clearsHazards);
  const reachableOptions = safeOptions.filter(option => {
    const allowance = Math.max(8, option.club.carry_stddev_metres ?? 12);
    return option.adjustedCarry >= distToObjective - allowance
      && option.adjustedCarry <= distToObjective + 20;
  });
  const shotType: CaddieAdvice['shotType'] = customTarget || lie === 'trees' || lie === 'recovery'
    ? 'recovery'
    : reachableOptions.length > 0 ? 'attack' : 'layup';

  const recommended =
    shotType === 'attack'
      ? reachableOptions.reduce((best, option) =>
            Math.abs(option.adjustedCarry - distToObjective) < Math.abs(best.adjustedCarry - distToObjective)
              ? option
              : best
          )
      : safeOptions.length > 0
        ? safeOptions
            .filter(option => option.adjustedCarry <= distToObjective + 5)
            .reduce<ClubOption | null>((best, option) =>
              !best || option.adjustedCarry > best.adjustedCarry ? option : best
            , null)
          ?? safeOptions.reduce((best, option) =>
            Math.abs(option.adjustedCarry - distToObjective) < Math.abs(best.adjustedCarry - distToObjective)
              ? option
              : best
          )
        : options.reduce((best, option) =>
            option.warnings.length < best.warnings.length
              ? option
              : option.warnings.length === best.warnings.length
                && Math.abs(option.adjustedCarry - distToObjective) < Math.abs(best.adjustedCarry - distToObjective)
                ? option
                : best
          );

  const baseCarry = recommended.club.carry_metres!;
  const windAdjustedCarry = windCarryAdjustment(baseCarry, windSpeed, windDir, bToGreen);
  const windAdj = windAdjustedCarry - baseCarry;
  const totalAdjustment = recommended.adjustedCarry - baseCarry;
  const playingDistance = Math.max(1, Math.round(distToObjective - totalAdjustment));
  const alternatives = options
    .filter(o => o.club.id !== recommended.club.id && o.adjustedCarry <= distToObjective + 30)
    .sort((a, b) =>
      Math.abs(a.adjustedCarry - distToObjective) - Math.abs(b.adjustedCarry - distToObjective)
    )
    .slice(0, 2);

  const clubLabel = recommended.club.custom_name ?? recommended.club.name;
  const selectedMiss = clubMisses[clubLabel.toLowerCase()] ?? null;
  const primaryHazard = recommended.warnings[0] ?? null;
  const targetDistance = customTarget
    ? Math.max(1, distToObjective)
    : Math.min(recommended.adjustedCarry, Math.max(1, distToObjective));
  const targetPlan = customTarget
    ? { coordinate: customTarget, offsetDegrees: 0, hazardType: null }
    : chooseTarget({
        playerPos,
        greenMid,
        targetDistance,
        bearingToGreen: bToGreen,
        hazards,
        shotType,
        missDirection: selectedMiss,
      });
  const target = targetPlan.coordinate;
  const remainingDistance = haversineMetres(target, greenMid);
  const targetBearing = calcBearing(playerPos, target);
  const plannedHazards = hazards
    .map(hazard => {
      if (hazard.coordinates.length < 3) return null;
      const geometry = hazardAlongShot(
        playerPos,
        targetBearing,
        targetDistance + 35,
        hazard.coordinates,
      );
      if (!geometry || geometry.farDistance < 5) return null;
      return {
        hazard,
        nearDistance: geometry.nearDistance,
        farDistance: geometry.farDistance,
        side: geometry.side,
        crossesShotCorridor: true,
      };
    })
    .filter(Boolean) as ActiveHazard[];
  const visibleHazard = plannedHazards
    .sort((left, right) => left.nearDistance - right.nearDistance)[0] ?? null;
  const aimInstruction = !customTarget && (lie === 'trees' || lie === 'recovery')
    ? 'Select a clear recovery target on the map before choosing the shot.'
    : customTarget
    ? `Play to the selected recovery target, ${targetDistance}m away.`
    : targetPlan.offsetDegrees !== 0
    ? `Aim ${targetPlan.offsetDegrees < 0 ? 'left' : 'right'} of the direct line${targetPlan.hazardType ? `, away from ${targetPlan.hazardType}` : ''}.`
    : shotType === 'layup'
      ? `Aim at the centre of the fairway and leave about ${remainingDistance}m.`
      : 'Aim at the centre of the green.';
  const missLine = primaryHazard
    ? `Miss ${primaryHazard.side === 'centre' ? 'away from' : primaryHazard.side === 'left' ? 'right of' : 'left of'} ${primaryHazard.type}.`
    : 'Commit to the centre of the green.';
  const shortText = shotType === 'recovery'
    ? customTarget
      ? `${windLabel}. Recovery with ${clubLabel} to the selected ${targetDistance}m target.`
      : 'Recovery required. Select the safest visible gap on the map.'
    : shotType === 'layup'
    ? `${windLabel}. Hit ${clubLabel} to the ${targetDistance}m target. ${aimInstruction}`
    : `${windLabel}. Play ${playingDistance}m. ${clubLabel}. ${missLine}`;

  const strategy: string[] = [
    shotType === 'recovery'
      ? customTarget
        ? `Recovery shot: hit ${clubLabel} to the selected target, about ${targetDistance}m away.`
        : 'Recovery required: select the safest visible gap before choosing club and distance.'
      : shotType === 'layup'
      ? `Hit ${clubLabel} toward the marked landing area, carrying about ${targetDistance}m and leaving ${remainingDistance}m.`
      : `Play this as ${playingDistance}m with ${clubLabel}; expected carry is ${recommended.adjustedCarry}m.`,
    aimInstruction,
  ];
  if (primaryHazard) {
    strategy.push(
      `${primaryHazard.type} is in play at ${primaryHazard.distanceMetres}m ${primaryHazard.side}; favour the opposite side.`,
    );
  } else if (visibleHazard) {
    const reliableCarry = recommended.adjustedCarry
      - (recommended.club.carry_stddev_metres ?? 12);
    if (targetDistance < visibleHazard.nearDistance) {
      strategy.push(
        `The ${targetDistance}m landing target finishes about ${Math.round(visibleHazard.nearDistance - targetDistance)}m short of ${visibleHazard.hazard.type}.`,
      );
    } else {
      strategy.push(
        `${visibleHazard.hazard.type} crosses the shot line from ${Math.round(visibleHazard.nearDistance)}m to ${Math.round(visibleHazard.farDistance)}m; reliable carry clears it by ${Math.max(0, Math.round(reliableCarry - visibleHazard.farDistance))}m.`,
      );
    }
  } else {
    strategy.push('No mapped hazard blocks the direct line to the green.');
  }
  if (holeIndex != null) {
    strategy.push(
      holeIndex <= 5
        ? `This is stroke index ${holeIndex}; prioritise position and accept the safe miss.`
        : `Stroke index ${holeIndex}; a committed centre-green shot is the percentage play.`,
    );
  }
  if (history) {
    const target = holePar != null && history.avg > holePar
      ? `Your average is ${history.avg.toFixed(1)}; avoiding a big miss is the clearest gain.`
      : `You average ${history.avg.toFixed(1)} here with ${history.girPct}% GIR.`;
    strategy.push(target);
  }

  // Context string for Claude
  const hazardLines = plannedHazards
    .map(({ hazard, nearDistance, farDistance, side }) =>
      `  - ${hazard.type} ${Math.round(nearDistance)}-${Math.round(farDistance)}m ${side}`
    )
    .join('\n');
  const elevLine = elevDiff !== 0
    ? `Elevation: ${elevDiff > 0 ? '+' : ''}${elevDiff}m (${elevDiff > 0 ? 'uphill' : 'downhill'}).\n`
    : '';
  const context =
    `Hole ${holeNumber ?? ''}: ${distToPin}m to pin. Lie: ${lie}. Wind: ${windLabel}. ${elevLine}` +
    `Shot plan: ${shotType}; target ${targetDistance}m away, leaving ${remainingDistance}m. ${aimInstruction}\n` +
    `Recommended: ${clubLabel} (carries ${recommended.club.carry_metres}m, adjusted ${recommended.adjustedCarry}m).\n` +
    (plannedHazards.length > 0 ? `Hazards on planned line:\n${hazardLines}\n` : 'No hazards on planned line.\n') +
    (recommended.warnings.length > 0
      ? `Warning: ${clubLabel} may land in ${recommended.warnings.map(w => w.label).join(', ')}.\n`
      : '') +
    `Other options: ${alternatives.map(o => `${o.club.custom_name ?? o.club.name} (${o.adjustedCarry}m)`).join(', ') || 'none'}.`;

  return {
    distToPin,
    playingDistance,
    target,
    targetDistance,
    remainingDistance,
    shotType,
    lie,
    customTarget: customTarget != null,
    aimInstruction,
    recommended,
    alternatives,
    windLabel,
    windAdjustment: windAdj,
    elevDiff,
    strategy,
    history,
    shortText,
    context,
  };
}

export function detectCaddieLie(params: {
  playerPos: LatLng;
  hazards: Hazard[];
  zones: CaddieZone[];
  tee?: LatLng | null;
}): CaddieLie {
  const { playerPos, hazards, zones, tee } = params;
  if (zones.some(zone =>
    zone.zone_type === 'green' && pointInPolygon(playerPos, zone.coordinates)
  )) return 'green';
  if (hazards.some(hazard =>
    hazard.type === 'bunker' && pointInPolygon(playerPos, hazard.coordinates)
  )) return 'bunker';
  if (hazards.some(hazard =>
    hazard.type === 'trees' && pointInPolygon(playerPos, hazard.coordinates)
  )) return 'trees';
  if (tee && haversineMetres(playerPos, tee) <= 12) return 'tee';
  if (zones.some(zone =>
    zone.zone_type === 'fairway' && pointInPolygon(playerPos, zone.coordinates)
  )) return 'fairway';
  return 'rough';
}

function destinationPoint(from: LatLng, bearingDegrees: number, distanceMetres: number): LatLng {
  const radius = 6_371_000;
  const angularDistance = distanceMetres / radius;
  const bearingRadians = bearingDegrees * Math.PI / 180;
  const latitude = from.latitude * Math.PI / 180;
  const longitude = from.longitude * Math.PI / 180;
  const targetLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance)
    + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearingRadians),
  );
  const targetLongitude = longitude + Math.atan2(
    Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(latitude),
    Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(targetLatitude),
  );
  return {
    latitude: targetLatitude * 180 / Math.PI,
    longitude: targetLongitude * 180 / Math.PI,
  };
}

function chooseTarget(params: {
  playerPos: LatLng;
  greenMid: LatLng;
  targetDistance: number;
  bearingToGreen: number;
  hazards: Hazard[];
  shotType: CaddieAdvice['shotType'];
  missDirection?: 'left' | 'right' | 'short' | 'long' | null;
}): { coordinate: LatLng; offsetDegrees: number; hazardType: Hazard['type'] | null } {
  const offsets = [0, -2, 2, -4, 4, -6, 6, -8, 8];
  const directTarget = destinationPoint(
    params.playerPos,
    params.bearingToGreen,
    params.targetDistance,
  );
  const directThreat = params.hazards
    .filter(hazard => hazard.coordinates.length >= 3)
    .map(hazard => ({
      hazard,
      distance: distanceToPolygonMetres(directTarget, hazard.coordinates),
    }))
    .filter(item => item.distance < 15)
    .sort((left, right) => left.distance - right.distance)[0]?.hazard.type ?? null;
  const candidates = offsets.map(offsetDegrees => {
    const coordinate = destinationPoint(
      params.playerPos,
      params.bearingToGreen + offsetDegrees,
      params.targetDistance,
    );
    let hazardPenalty = 0;
    let nearestHazard: Hazard | null = null;
    let nearestHazardDistance = Number.POSITIVE_INFINITY;

    for (const hazard of params.hazards) {
      if (hazard.coordinates.length < 3) continue;
      const distance = distanceToPolygonMetres(coordinate, hazard.coordinates);
      if (distance < nearestHazardDistance) {
        nearestHazardDistance = distance;
        nearestHazard = hazard;
      }
      if (distance === 0) hazardPenalty += 100_000;
      else if (distance < 8) hazardPenalty += (8 - distance) * 2_000;
      else if (distance < 15) hazardPenalty += (15 - distance) * 200;
    }

    const greenDistance = haversineMetres(coordinate, params.greenMid);
    const preferredOffset = params.missDirection === 'left'
      ? 4
      : params.missDirection === 'right' ? -4 : 0;
    const linePenalty = Math.abs(offsetDegrees - preferredOffset)
      * (preferredOffset !== 0 ? 300 : params.shotType === 'attack' ? 120 : 15);
    const greenPenalty = greenDistance * (params.shotType === 'attack' ? 80 : 2);
    return {
      coordinate,
      offsetDegrees,
      hazardType: nearestHazardDistance < 15
        ? nearestHazard?.type ?? directThreat
        : directThreat,
      score: hazardPenalty + linePenalty + greenPenalty,
    };
  });

  return candidates.reduce((best, candidate) =>
    candidate.score < best.score ? candidate : best
  );
}

function distanceToPolygonMetres(point: LatLng, polygon: Hazard['coordinates']): number {
  if (pointInPolygon(point, polygon)) return 0;
  const latitudeScale = 111_320;
  const longitudeScale = latitudeScale * Math.cos(point.latitude * Math.PI / 180);
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const startX = (start.lng - point.longitude) * longitudeScale;
    const startY = (start.lat - point.latitude) * latitudeScale;
    const endX = (end.lng - point.longitude) * longitudeScale;
    const endY = (end.lat - point.latitude) * latitudeScale;
    minimum = Math.min(minimum, distanceToSegment(0, 0, startX, startY, endX, endY));
  }
  return minimum;
}

function hazardAlongShot(
  player: LatLng,
  shotBearing: number,
  shotDistance: number,
  polygon: Hazard['coordinates'],
): {
  nearDistance: number;
  farDistance: number;
  crossesShotCorridor: boolean;
  side: HazardWarning['side'];
} | null {
  const sampleStep = 3;
  const corridorRadius = 18;
  const hits: number[] = [];
  const lineHits: number[] = [];

  for (let distance = 0; distance <= shotDistance; distance += sampleStep) {
    const point = destinationPoint(player, shotBearing, distance);
    const polygonDistance = distanceToPolygonMetres(point, polygon);
    if (polygonDistance <= corridorRadius) hits.push(distance);
    if (polygonDistance <= 0.25) lineHits.push(distance);
  }

  if (hits.length === 0) return null;
  const distanceHits = lineHits.length > 0 ? lineHits : hits;
  return {
    nearDistance: Math.max(0, Math.min(...distanceHits) - sampleStep),
    farDistance: Math.min(shotDistance, Math.max(...distanceHits) + sampleStep),
    crossesShotCorridor: true,
    side: lineHits.length > 0 ? 'centre' : hazardSide(player, shotBearing, polygon),
  };
}

function hazardSide(
  player: LatLng,
  shotBearing: number,
  polygon: Hazard['coordinates'],
): HazardWarning['side'] {
  const centroid = polygonCentroid(polygon);
  const angle = ((calcBearing(player, centroid) - shotBearing + 540) % 360) - 180;
  return angle < -3 ? 'left' : angle > 3 ? 'right' : 'centre';
}

function pointInPolygon(point: LatLng, polygon: Hazard['coordinates']): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const currentPoint = polygon[current];
    const previousPoint = polygon[previous];
    const intersects = (currentPoint.lat > point.latitude) !== (previousPoint.lat > point.latitude)
      && point.longitude < (previousPoint.lng - currentPoint.lng)
        * (point.latitude - currentPoint.lat)
        / (previousPoint.lat - currentPoint.lat)
        + currentPoint.lng;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceToSegment(
  pointX: number,
  pointY: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): number {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  if (deltaX === 0 && deltaY === 0) return Math.hypot(pointX - startX, pointY - startY);
  const ratio = Math.max(0, Math.min(1,
    ((pointX - startX) * deltaX + (pointY - startY) * deltaY)
      / (deltaX * deltaX + deltaY * deltaY),
  ));
  return Math.hypot(
    pointX - (startX + ratio * deltaX),
    pointY - (startY + ratio * deltaY),
  );
}

export function buildCaddiePrompt(
  advice: CaddieAdvice,
  courseName = 'the course',
): { system: string; userMessage: string } {
  return {
    system: `You are an experienced golf caddie at ${courseName}. The app's shot engine has already chosen the club, distance, landing point, and aim line. Give exactly one short sentence describing only the single most important execution factor: mapped hazard, wind, lie, or tracked miss tendency. Do not name or suggest a club. Do not include any number or distance. Do not alter the shot plan. Be direct and specific.`,
    userMessage: `AUTHORITATIVE SHOT PLAN — DO NOT CHANGE:\n${advice.context}\n\nReturn only the execution-factor sentence.`,
  };
}

export function authoritativeShotLine(advice: CaddieAdvice): string {
  const clubLabel = advice.recommended.club.custom_name ?? advice.recommended.club.name;
  if (advice.shotType === 'recovery') {
    return advice.customTarget
      ? `Hit ${clubLabel} to the selected ${advice.targetDistance}m recovery target.`
      : 'Select the safest visible recovery target before choosing the shot.';
  }
  if (advice.shotType === 'layup') {
    return `Hit ${clubLabel} to the marked ${advice.targetDistance}m landing area, leaving ${advice.remainingDistance}m.`;
  }
  if (advice.shotType === 'putt') {
    return `Putt ${advice.targetDistance}m toward the hole.`;
  }
  return `Play ${clubLabel} to the marked target; it plays ${advice.playingDistance}m with ${advice.recommended.adjustedCarry}m expected carry.`;
}

export function validatedCaddieFactor(text: string | null | undefined): string | null {
  if (!text) return null;
  const sentence = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)[0]
    ?.trim();
  if (!sentence || sentence.length > 220) return null;
  if (/\d/.test(sentence)) return null;
  if (/\b(driver|putter|wood|hybrid|iron|wedge|[1-9]\s*[- ]?(?:wood|iron)|[1-9]\s*[hiw]|pw|gw|sw|lw)\b/i.test(sentence)) {
    return null;
  }
  return sentence;
}
