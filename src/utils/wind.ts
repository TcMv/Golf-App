export type WindData = {
  speed_kmh: number;
  direction_deg: number;
  label: string; // e.g. "12km/h NE"
};

const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

function compassPoint(deg: number): string {
  return COMPASS[Math.round(deg / 22.5) % 16];
}

export async function fetchWind(lat: number, lng: number): Promise<WindData | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
      `&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const speed: number = json.current?.wind_speed_10m ?? 0;
    const dir: number = json.current?.wind_direction_10m ?? 0;
    const label = speed < 3 ? 'Calm' : `${Math.round(speed)}km/h ${compassPoint(dir)}`;
    return { speed_kmh: Math.round(speed), direction_deg: dir, label };
  } catch {
    return null;
  }
}

// How much wind affects carry: headwind reduces, tailwind adds.
// bearingToTarget: degrees 0-360
// windDir: where wind is coming FROM (meteorological convention)
export function windCarryAdjustment(
  carry: number,
  windSpeed: number,
  windDir: number,
  bearingToTarget: number,
): number {
  // Convert wind FROM direction to wind TO direction
  const windTo = (windDir + 180) % 360;
  const diff = ((windTo - bearingToTarget + 180 + 360) % 360) - 180;
  // diff > 0 means tailwind component, diff < 0 means headwind component
  const component = Math.cos((diff * Math.PI) / 180) * windSpeed;
  // ~0.5m per km/h headwind, ~0.3m per km/h tailwind
  const adj = component > 0 ? component * 0.3 : component * 0.5;
  return Math.round(carry + adj);
}
