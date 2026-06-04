import type { Coordinate } from '../types';

const EARTH_RADIUS_M = 6_371_000;

export function haversineMetres(a: Coordinate, b: Coordinate): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const c =
    2 *
    Math.asin(
      Math.sqrt(
        sinDLat * sinDLat +
          Math.cos(toRad(a.latitude)) *
            Math.cos(toRad(b.latitude)) *
            sinDLng * sinDLng,
      ),
    );
  return Math.round(c * EARTH_RADIUS_M);
}

export function bearing(from: Coordinate, to: Coordinate): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const dLng = toRad(to.longitude - from.longitude);
  const y = Math.sin(dLng) * Math.cos(toRad(to.latitude));
  const x =
    Math.cos(toRad(from.latitude)) * Math.sin(toRad(to.latitude)) -
    Math.sin(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function toPar(score: number | null, par: number): string {
  if (score === null) return '-';
  const diff = score - par;
  if (diff === 0) return 'E';
  return diff > 0 ? `+${diff}` : `${diff}`;
}

export function cumulativeToPar(
  scores: Record<number, { gross_score: number | null }>,
  holes: { number: number; par: number }[],
): number {
  let diff = 0;
  for (const hole of holes) {
    const s = scores[hole.number];
    if (s?.gross_score != null) diff += s.gross_score - hole.par;
  }
  return diff;
}

export function formatToPar(diff: number): string {
  if (diff === 0) return 'E';
  return diff > 0 ? `+${diff}` : `${diff}`;
}
