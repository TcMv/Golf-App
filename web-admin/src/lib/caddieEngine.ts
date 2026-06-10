export type Coordinate = {
  latitude: number;
  longitude: number;
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

export type Club = {
  id: string;
  name: string;
  type: 'driver' | 'wood' | 'hybrid' | 'iron' | 'wedge' | 'putter';
  loft: number | null;
  custom_name: string | null;
  sort_order: number;
  carry_metres: number | null;
  carry_stddev_metres: number | null;
};

type HazardWarning = {
  type: HazardType;
  distanceMetres: number;
  side: 'left' | 'right' | 'centre';
  label: string;
};

type ClubOption = {
  club: Club;
  adjustedCarry: number;
  clearsHazards: boolean;
  warnings: HazardWarning[];
};

export type CaddieAdvice = {
  distToPin: number;
  playingDistance: number;
  recommended: ClubOption;
  alternatives: ClubOption[];
  windLabel: string;
  windAdjustment: number;
  elevDiff: number;
  strategy: string[];
  shortText: string;
  context: string;
};

const EARTH_RADIUS_METRES = 6_371_000;

function haversineMetres(from: Coordinate, to: Coordinate) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitude = radians(to.latitude - from.latitude);
  const longitude = radians(to.longitude - from.longitude);
  const sinLatitude = Math.sin(latitude / 2);
  const sinLongitude = Math.sin(longitude / 2);
  const arc = 2 * Math.asin(Math.sqrt(
    sinLatitude * sinLatitude
    + Math.cos(radians(from.latitude))
      * Math.cos(radians(to.latitude))
      * sinLongitude
      * sinLongitude,
  ));
  return Math.round(arc * EARTH_RADIUS_METRES);
}

function bearing(from: Coordinate, to: Coordinate) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const degrees = (value: number) => value * 180 / Math.PI;
  const longitude = radians(to.longitude - from.longitude);
  const y = Math.sin(longitude) * Math.cos(radians(to.latitude));
  const x = Math.cos(radians(from.latitude)) * Math.sin(radians(to.latitude))
    - Math.sin(radians(from.latitude))
      * Math.cos(radians(to.latitude))
      * Math.cos(longitude);
  return (degrees(Math.atan2(y, x)) + 360) % 360;
}

function windCarryAdjustment(
  carry: number,
  windSpeed: number,
  windDirection: number,
  bearingToTarget: number,
) {
  const windTo = (windDirection + 180) % 360;
  const difference = ((windTo - bearingToTarget + 540) % 360) - 180;
  const component = Math.cos(difference * Math.PI / 180) * windSpeed;
  return Math.round(carry + (component > 0 ? component * 0.3 : component * 0.5));
}

function elevationCarryAdjustment(carry: number, playerElevation: number, greenElevation: number) {
  return Math.round(carry + (greenElevation - playerElevation) * 0.5);
}

function polygonCentroid(coordinates: Hazard['coordinates']): Coordinate {
  return {
    latitude: coordinates.reduce((total, coordinate) => total + coordinate.lat, 0)
      / coordinates.length,
    longitude: coordinates.reduce((total, coordinate) => total + coordinate.lng, 0)
      / coordinates.length,
  };
}

export function buildCaddieAdvice(params: {
  playerPos: Coordinate;
  greenMid: Coordinate;
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
    holeIndex,
  } = params;
  const elevDiff = Math.round(greenElevation - playerElevation);
  const distToPin = haversineMetres(playerPos, greenMid);
  const bearingToGreen = bearing(playerPos, greenMid);
  const usableClubs = clubs
    .filter(club => club.carry_metres != null && club.type !== 'putter')
    .sort((left, right) => (right.carry_metres ?? 0) - (left.carry_metres ?? 0));

  if (usableClubs.length === 0) return null;

  const activeHazards = hazards
    .map(hazard => {
      if (hazard.coordinates.length < 2) return null;
      const centroid = polygonCentroid(hazard.coordinates);
      const distance = haversineMetres(playerPos, centroid);
      if (distance < 15 || distance > distToPin * 1.15) return null;
      const angleDifference = ((bearing(playerPos, centroid) - bearingToGreen + 540) % 360) - 180;
      if (Math.abs(angleDifference) > 50) return null;
      const side: HazardWarning['side'] = angleDifference < -10
        ? 'left'
        : angleDifference > 10 ? 'right' : 'centre';
      return { hazard, distance, side };
    })
    .filter(Boolean) as {
      hazard: Hazard;
      distance: number;
      side: HazardWarning['side'];
    }[];

  const options = usableClubs.map(club => {
    const deviation = club.carry_stddev_metres ?? 12;
    const windAdjusted = windCarryAdjustment(
      club.carry_metres!,
      windSpeed,
      windDir,
      bearingToGreen,
    );
    const adjustedCarry = elevationCarryAdjustment(
      windAdjusted,
      playerElevation,
      greenElevation,
    );
    const warnings = activeHazards
      .filter(({ distance }) =>
        distance >= adjustedCarry - deviation
        && distance <= adjustedCarry + deviation * 0.5
      )
      .map(({ hazard, distance, side }) => ({
        type: hazard.type,
        distanceMetres: distance,
        side,
        label: `${hazard.type} ${distance}m ${side}`,
      }));
    return {
      club,
      adjustedCarry,
      clearsHazards: warnings.length === 0,
      warnings,
    };
  });

  const safeOptions = options.filter(option =>
    option.clearsHazards && option.adjustedCarry <= distToPin + 30
  );
  const candidates = safeOptions.length > 0 ? safeOptions : options;
  const recommended = candidates.reduce((best, option) =>
    Math.abs(option.adjustedCarry - distToPin) < Math.abs(best.adjustedCarry - distToPin)
      ? option
      : best
  );
  const baseCarry = recommended.club.carry_metres!;
  const windAdjustedCarry = windCarryAdjustment(baseCarry, windSpeed, windDir, bearingToGreen);
  const windAdjustment = windAdjustedCarry - baseCarry;
  const totalAdjustment = recommended.adjustedCarry - baseCarry;
  const playingDistance = Math.max(1, Math.round(distToPin - totalAdjustment));
  const alternatives = options
    .filter(option =>
      option.club.id !== recommended.club.id
      && option.adjustedCarry <= distToPin + 30
    )
    .sort((left, right) =>
      Math.abs(left.adjustedCarry - distToPin) - Math.abs(right.adjustedCarry - distToPin)
    )
    .slice(0, 2);

  const clubLabel = recommended.club.custom_name ?? recommended.club.name;
  const primaryHazard = recommended.warnings[0] ?? (
    activeHazards.length > 0
      ? {
          type: activeHazards[0].hazard.type,
          distanceMetres: activeHazards[0].distance,
          side: activeHazards[0].side,
          label: '',
        }
      : null
  );
  const missLine = primaryHazard
    ? `Miss ${primaryHazard.side === 'centre'
      ? 'away from'
      : primaryHazard.side === 'left' ? 'right of' : 'left of'} ${primaryHazard.type}.`
    : 'Commit to the centre of the green.';
  const strategy = [
    `Play this as ${playingDistance}m with ${clubLabel}; expected carry is ${recommended.adjustedCarry}m.`,
    primaryHazard
      ? `${primaryHazard.type} is in play at ${primaryHazard.distanceMetres}m ${primaryHazard.side}; favour the opposite side.`
      : 'No mapped hazard blocks the direct line to the green.',
  ];
  if (holeIndex != null) {
    strategy.push(
      holeIndex <= 5
        ? `This is stroke index ${holeIndex}; prioritise position and accept the safe miss.`
        : `Stroke index ${holeIndex}; a committed centre-green shot is the percentage play.`,
    );
  }

  const hazardLines = activeHazards
    .map(({ hazard, distance, side }) => `  - ${hazard.type} ${distance}m ${side}`)
    .join('\n');
  const elevationLine = elevDiff === 0
    ? ''
    : `Elevation: ${elevDiff > 0 ? '+' : ''}${elevDiff}m (${elevDiff > 0 ? 'uphill' : 'downhill'}).\n`;
  const context =
    `Hole ${holeNumber ?? ''}: ${distToPin}m to pin. Wind: ${windLabel}. ${elevationLine}`
    + `Recommended: ${clubLabel} (carries ${baseCarry}m, adjusted ${recommended.adjustedCarry}m).\n`
    + (activeHazards.length > 0 ? `Hazards in play:\n${hazardLines}\n` : 'No hazards in play.\n')
    + (recommended.warnings.length > 0
      ? `Warning: ${clubLabel} may land in ${recommended.warnings.map(warning => warning.label).join(', ')}.\n`
      : '')
    + `Other options: ${alternatives.map(option =>
      `${option.club.custom_name ?? option.club.name} (${option.adjustedCarry}m)`
    ).join(', ') || 'none'}.`;

  return {
    distToPin,
    playingDistance,
    recommended,
    alternatives,
    windLabel,
    windAdjustment,
    elevDiff,
    strategy,
    shortText: `${windLabel}. Play ${playingDistance}m. ${clubLabel}. ${missLine}`,
    context,
  };
}

export function buildCaddiePrompt(advice: CaddieAdvice, courseName: string) {
  return {
    system: `You are an experienced golf caddie at ${courseName}. Give pre-shot advice in exactly 2 short sentences. First sentence: the specific shot — club, target distance, and where to aim or land it. Second sentence: the one critical factor — the hazard to avoid, the wind effect, or the player's personal miss tendency if their data shows one. Be direct, confident, and specific. No filler phrases. Sound like a real caddie who knows the player's game.`,
    userMessage: advice.context,
  };
}
