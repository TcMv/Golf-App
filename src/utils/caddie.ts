import { haversineMetres, bearing as calcBearing } from './distance';
import { windCarryAdjustment, elevationCarryAdjustment } from './wind';
import type { Club, Coordinate, Hazard } from '../types';

type LatLng = Coordinate;

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
  shotType: 'attack' | 'layup';
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
  } = params;
  const elevDiff = Math.round(greenElevation - playerElevation);

  const distToPin = haversineMetres(playerPos, greenMid);
  const bToGreen = calcBearing(playerPos, greenMid);

  // Only clubs with carry set, not putters, sorted longest first
  const usable = clubs
    .filter(c => c.carry_metres != null && c.type !== 'putter')
    .sort((a, b) => (b.carry_metres ?? 0) - (a.carry_metres ?? 0));

  if (usable.length === 0) return null;

  // Identify hazards that are in the corridor toward the green
  const activeHazards = hazards
    .map(h => {
      if (h.coordinates.length < 2) return null;
      const centroid = polygonCentroid(h.coordinates);
      const dist = haversineMetres(playerPos, centroid);
      if (dist < 15 || dist > distToPin * 1.15) return null;
      const bToHazard = calcBearing(playerPos, centroid);
      const angleDiff = ((bToHazard - bToGreen + 180 + 360) % 360) - 180;
      if (Math.abs(angleDiff) > 50) return null;
      const side: 'left' | 'right' | 'centre' =
        angleDiff < -10 ? 'left' : angleDiff > 10 ? 'right' : 'centre';
      return { hazard: h, dist, side };
    })
    .filter(Boolean) as { hazard: Hazard; dist: number; side: 'left' | 'right' | 'centre' }[];

  // Score each club
  function evaluateClub(club: Club): ClubOption {
    const stddev = club.carry_stddev_metres ?? 12;
    const windAdj = windCarryAdjustment(club.carry_metres!, windSpeed, windDir, bToGreen);
    const adjusted = elevationCarryAdjustment(windAdj, playerElevation, greenElevation);
    const warnings: HazardWarning[] = [];

    for (const { hazard, dist, side } of activeHazards) {
      const landMin = adjusted - stddev;
      const landMax = adjusted + stddev * 0.5;
      if (dist >= landMin && dist <= landMax) {
        warnings.push({
          type: hazard.type,
          distanceMetres: dist,
          side,
          label: `${hazard.type} ${dist}m ${side}`,
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

  const longestAdjustedCarry = Math.max(...options.map(option => option.adjustedCarry));
  const shotType: CaddieAdvice['shotType'] =
    distToPin > longestAdjustedCarry + 20 ? 'layup' : 'attack';

  // Attack with the closest safe club. When the green is out of range, advance
  // the ball as far as safely possible and plan the next shot.
  const safeOptions = options.filter(o => o.clearsHazards && o.adjustedCarry <= distToPin + 30);
  const recommended =
    safeOptions.length > 0
      ? shotType === 'layup'
        ? safeOptions.reduce((best, option) =>
            option.adjustedCarry > best.adjustedCarry ? option : best
          )
        : safeOptions.reduce((best, option) =>
            Math.abs(option.adjustedCarry - distToPin) < Math.abs(best.adjustedCarry - distToPin)
              ? option
              : best
          )
      : options.reduce((best, o) =>
          Math.abs(o.adjustedCarry - distToPin) < Math.abs(best.adjustedCarry - distToPin)
            ? o
            : best
        );

  const baseCarry = recommended.club.carry_metres!;
  const windAdjustedCarry = windCarryAdjustment(baseCarry, windSpeed, windDir, bToGreen);
  const windAdj = windAdjustedCarry - baseCarry;
  const totalAdjustment = recommended.adjustedCarry - baseCarry;
  const playingDistance = Math.max(1, Math.round(distToPin - totalAdjustment));
  const alternatives = options
    .filter(o => o.club.id !== recommended.club.id && o.adjustedCarry <= distToPin + 30)
    .sort((a, b) =>
      Math.abs(a.adjustedCarry - distToPin) - Math.abs(b.adjustedCarry - distToPin)
    )
    .slice(0, 2);

  const clubLabel = recommended.club.custom_name ?? recommended.club.name;
  const primaryHazard = recommended.warnings[0] ?? (
    activeHazards.length > 0
      ? {
          type: activeHazards[0].hazard.type,
          distanceMetres: activeHazards[0].dist,
          side: activeHazards[0].side,
          label: '',
        }
      : null
  );
  const aimOffset = primaryHazard
    ? primaryHazard.side === 'left' ? 8 : primaryHazard.side === 'right' ? -8 : 10
    : 0;
  const targetDistance = Math.min(recommended.adjustedCarry, Math.max(1, distToPin));
  const target = destinationPoint(playerPos, bToGreen + aimOffset, targetDistance);
  const remainingDistance = haversineMetres(target, greenMid);
  const aimInstruction = primaryHazard
    ? `Aim ${primaryHazard.side === 'left' ? 'right' : 'left'} of the direct line, away from ${primaryHazard.type}.`
    : shotType === 'layup'
      ? `Aim at the centre of the fairway and leave about ${remainingDistance}m.`
      : 'Aim at the centre of the green.';
  const missLine = primaryHazard
    ? `Miss ${primaryHazard.side === 'centre' ? 'away from' : primaryHazard.side === 'left' ? 'right of' : 'left of'} ${primaryHazard.type}.`
    : 'Commit to the centre of the green.';
  const shortText = shotType === 'layup'
    ? `${windLabel}. Hit ${clubLabel} to the ${targetDistance}m target. ${aimInstruction}`
    : `${windLabel}. Play ${playingDistance}m. ${clubLabel}. ${missLine}`;

  const strategy: string[] = [
    shotType === 'layup'
      ? `Hit ${clubLabel} toward the marked landing area, carrying about ${targetDistance}m and leaving ${remainingDistance}m.`
      : `Play this as ${playingDistance}m with ${clubLabel}; expected carry is ${recommended.adjustedCarry}m.`,
    aimInstruction,
  ];
  if (primaryHazard) {
    strategy.push(
      `${primaryHazard.type} is in play at ${primaryHazard.distanceMetres}m ${primaryHazard.side}; favour the opposite side.`,
    );
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
  const hazardLines = activeHazards
    .map(({ hazard, dist, side }) => `  - ${hazard.type} ${dist}m ${side}`)
    .join('\n');
  const elevLine = elevDiff !== 0
    ? `Elevation: ${elevDiff > 0 ? '+' : ''}${elevDiff}m (${elevDiff > 0 ? 'uphill' : 'downhill'}).\n`
    : '';
  const context =
    `Hole ${holeNumber ?? ''}: ${distToPin}m to pin. Wind: ${windLabel}. ${elevLine}` +
    `Shot plan: ${shotType}; target ${targetDistance}m away, leaving ${remainingDistance}m. ${aimInstruction}\n` +
    `Recommended: ${clubLabel} (carries ${recommended.club.carry_metres}m, adjusted ${recommended.adjustedCarry}m).\n` +
    (activeHazards.length > 0 ? `Hazards in play:\n${hazardLines}\n` : 'No hazards in play.\n') +
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

export function buildCaddiePrompt(
  advice: CaddieAdvice,
  courseName = 'the course',
): { system: string; userMessage: string } {
  return {
    system: `You are an experienced golf caddie at ${courseName}. Give pre-shot advice in exactly 2 short sentences. First sentence: the specific shot — club, target distance, and where to aim or land it. Second sentence: the one critical factor — the hazard to avoid, the wind effect, or the player's personal miss tendency if their data shows one. Be direct, confident, and specific. No filler phrases. Sound like a real caddie who knows the player's game.`,
    userMessage: advice.context,
  };
}
