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

export type CaddieAdvice = {
  distToPin: number;
  recommended: ClubOption;
  alternatives: ClubOption[];
  windLabel: string;
  windAdjustment: number;
  elevDiff: number;
  shortText: string;
  context: string;
};

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
}): CaddieAdvice | null {
  const { playerPos, greenMid, hazards, clubs, windSpeed, windDir, windLabel, playerElevation, greenElevation } = params;
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

  // Pick best: closest carry to pin that clears hazards and doesn't overshoot by >30m
  const safeOptions = options.filter(o => o.clearsHazards && o.adjustedCarry <= distToPin + 30);
  const recommended =
    safeOptions.length > 0
      ? safeOptions.reduce((best, o) =>
          Math.abs(o.adjustedCarry - distToPin) < Math.abs(best.adjustedCarry - distToPin)
            ? o
            : best
        )
      : options.reduce((best, o) =>
          Math.abs(o.adjustedCarry - distToPin) < Math.abs(best.adjustedCarry - distToPin)
            ? o
            : best
        );

  const windAdj = recommended.adjustedCarry - recommended.club.carry_metres!;
  const alternatives = options
    .filter(o => o.club.id !== recommended.club.id && o.adjustedCarry <= distToPin + 30)
    .slice(0, 2);

  // Short text for pop-up
  const clubLabel = recommended.club.custom_name ?? recommended.club.name;
  const windStr = Math.abs(windAdj) >= 3 ? ` · ${windAdj > 0 ? '+' : ''}${windAdj}m wind` : '';
  const hazardStr = recommended.warnings.length > 0
    ? ` · ⚠ ${recommended.warnings[0].type} ${recommended.warnings[0].distanceMetres}m ${recommended.warnings[0].side}`
    : recommended.clearsHazards && activeHazards.length > 0
    ? ' · clears hazards'
    : '';
  const shortText = `${clubLabel} · ${recommended.adjustedCarry}m${windStr}${hazardStr}`;

  // Context string for Claude
  const hazardLines = activeHazards
    .map(({ hazard, dist, side }) => `  - ${hazard.type} ${dist}m ${side}`)
    .join('\n');
  const elevLine = elevDiff !== 0
    ? `Elevation: ${elevDiff > 0 ? '+' : ''}${elevDiff}m (${elevDiff > 0 ? 'uphill' : 'downhill'}).\n`
    : '';
  const context =
    `Hole: ${distToPin}m to pin. Wind: ${windLabel}. ${elevLine}` +
    `Recommended: ${clubLabel} (carries ${recommended.club.carry_metres}m, adjusted ${recommended.adjustedCarry}m).\n` +
    (activeHazards.length > 0 ? `Hazards in play:\n${hazardLines}\n` : 'No hazards in play.\n') +
    (recommended.warnings.length > 0
      ? `Warning: ${clubLabel} may land in ${recommended.warnings.map(w => w.label).join(', ')}.\n`
      : '') +
    `Other options: ${alternatives.map(o => `${o.club.custom_name ?? o.club.name} (${o.adjustedCarry}m)`).join(', ') || 'none'}.`;

  return { distToPin, recommended, alternatives, windLabel, windAdjustment: windAdj, elevDiff, shortText, context };
}
