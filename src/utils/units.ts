export type DistanceUnits = 'metres' | 'yards';

export function convertDistance(metres: number, units: DistanceUnits): number {
  return units === 'yards' ? Math.round(metres * 1.0936133) : Math.round(metres);
}

export function distanceUnitLabel(units: DistanceUnits, short = false): string {
  if (units === 'yards') return short ? 'yd' : 'yards';
  return short ? 'm' : 'metres';
}
