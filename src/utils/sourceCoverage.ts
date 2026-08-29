export type CoverageSuggestion = {
  hole_number: number;
  feature_type: string;
  confidence?: number | null;
};

export type CoverageHole = {
  number: number;
  tee_lat?: number | null;
  tee_lng?: number | null;
  green_mid_lat?: number | null;
  green_mid_lng?: number | null;
};

export type CoverageZone = {
  hole_number: number;
  zone_type: string;
};

export type CoverageHazard = {
  hole_number?: number | null;
  hole_numbers?: number[] | null;
  type: string;
};

export type HoleCoverage = {
  hole: number;
  source: {
    tee: boolean;
    green: boolean;
    fairway: boolean;
    centreline: boolean;
    hazards: number;
  };
  approved: {
    tee: boolean;
    green: boolean;
    fairway: boolean;
    centreline: boolean;
    hazards: number;
  };
  sourceScore: number;
  approvedScore: number;
};

export type SourceCoverageReport = {
  expectedHoles: number;
  sourceScore: number;
  approvedScore: number;
  sourceFeatureCounts: Record<string, number>;
  sourceDirectCount: number;
  sourceInferredCount: number;
  approvedHazardCount: number;
  holes: HoleCoverage[];
  gaps: Array<{ hole: number; missing: string[] }>;
};

const STRUCTURAL_KEYS = ['tee', 'green', 'fairway', 'centreline'] as const;

export function analyzeSourceCoverage(args: {
  expectedHoles: number;
  suggestions: CoverageSuggestion[];
  holes: CoverageHole[];
  zones: CoverageZone[];
  hazards: CoverageHazard[];
}): SourceCoverageReport {
  const expectedHoles = Math.max(1, Math.round(args.expectedHoles));
  const sourceFeatureCounts: Record<string, number> = {};
  let sourceDirectCount = 0;
  let sourceInferredCount = 0;

  for (const suggestion of args.suggestions) {
    sourceFeatureCounts[suggestion.feature_type] = (sourceFeatureCounts[suggestion.feature_type] ?? 0) + 1;
    if ((suggestion.confidence ?? 0) >= 0.9) sourceDirectCount += 1;
    else sourceInferredCount += 1;
  }

  const holeRows = new Map(args.holes.map(hole => [hole.number, hole]));
  const zonesByHole = new Map<number, Set<string>>();
  for (const zone of args.zones) {
    const set = zonesByHole.get(zone.hole_number) ?? new Set<string>();
    set.add(zone.zone_type);
    zonesByHole.set(zone.hole_number, set);
  }

  const approvedHazardsByHole = new Map<number, number>();
  for (const hazard of args.hazards) {
    const numbers = hazard.hole_numbers?.length ? hazard.hole_numbers : hazard.hole_number ? [hazard.hole_number] : [];
    for (const hole of numbers) approvedHazardsByHole.set(hole, (approvedHazardsByHole.get(hole) ?? 0) + 1);
  }

  const sourceByHole = new Map<number, CoverageSuggestion[]>();
  for (const suggestion of args.suggestions) {
    if (suggestion.hole_number < 1 || suggestion.hole_number > expectedHoles) continue;
    const list = sourceByHole.get(suggestion.hole_number) ?? [];
    list.push(suggestion);
    sourceByHole.set(suggestion.hole_number, list);
  }

  const holes: HoleCoverage[] = [];
  const gaps: Array<{ hole: number; missing: string[] }> = [];
  for (let hole = 1; hole <= expectedHoles; hole += 1) {
    const suggestions = sourceByHole.get(hole) ?? [];
    const features = new Set(suggestions.map(item => item.feature_type));
    const approvedHole = holeRows.get(hole);
    const approvedZones = zonesByHole.get(hole) ?? new Set<string>();

    const source = {
      tee: features.has('tee') || features.has('tee_box'),
      green: features.has('green') || features.has('green_centre') || features.has('green_front') || features.has('green_back'),
      fairway: features.has('fairway'),
      centreline: features.has('fairway_centreline'),
      hazards: suggestions.filter(item => ['bunker', 'water', 'red_zone', 'ob', 'trees'].includes(item.feature_type)).length,
    };
    const approved = {
      tee: approvedHole?.tee_lat != null && approvedHole?.tee_lng != null,
      green: approvedHole?.green_mid_lat != null && approvedHole?.green_mid_lng != null,
      fairway: approvedZones.has('fairway'),
      centreline: approvedZones.has('fairway_centreline'),
      hazards: approvedHazardsByHole.get(hole) ?? 0,
    };

    const sourceScore = Math.round(STRUCTURAL_KEYS.filter(key => source[key]).length / STRUCTURAL_KEYS.length * 100);
    const approvedScore = Math.round(STRUCTURAL_KEYS.filter(key => approved[key]).length / STRUCTURAL_KEYS.length * 100);
    const missing = STRUCTURAL_KEYS.filter(key => !source[key]);
    if (missing.length) gaps.push({ hole, missing: [...missing] });
    holes.push({ hole, source, approved, sourceScore, approvedScore });
  }

  return {
    expectedHoles,
    sourceScore: Math.round(holes.reduce((sum, hole) => sum + hole.sourceScore, 0) / holes.length),
    approvedScore: Math.round(holes.reduce((sum, hole) => sum + hole.approvedScore, 0) / holes.length),
    sourceFeatureCounts,
    sourceDirectCount,
    sourceInferredCount,
    approvedHazardCount: args.hazards.length,
    holes,
    gaps,
  };
}
