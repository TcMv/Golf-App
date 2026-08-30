export type CoverageEvidenceScan = {
  course_id: string;
  source_provider: string;
  scanned_at: string;
  source_score: number;
};

export type QualityEvidenceSuggestion = {
  source_provider: string | null;
  review_status: 'pending' | 'accepted' | 'rejected';
  manually_edited: boolean;
};

export type SourceEvidenceState = 'insufficient' | 'coverage-gap' | 'quality-concern' | 'promising' | 'mixed';

export type SourceDecisionEvidence = {
  providerKey: string;
  providerLabel: string;
  courseCount: number;
  averageCoverage: number;
  reviewed: number;
  accepted: number;
  acceptanceRate: number;
  editRate: number;
  state: SourceEvidenceState;
  notes: string[];
};

function providerIdentity(value: string | null | undefined) {
  const raw = value?.trim() || 'Unknown';
  const lower = raw.toLowerCase();
  if (lower.includes('openstreetmap')) return { key: 'openstreetmap', label: 'OpenStreetMap' };
  return { key: lower.replace(/\s+/g, '-'), label: raw };
}

function pct(n: number, d: number) {
  return d === 0 ? 0 : Math.round((n / d) * 100);
}

function average(values: number[]) {
  return values.length === 0 ? 0 : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function buildSourceDecisionEvidence(
  coverageScans: CoverageEvidenceScan[],
  qualityRows: QualityEvidenceSuggestion[],
): SourceDecisionEvidence[] {
  const coverageByProvider = new Map<string, { label: string; latestByCourse: Map<string, CoverageEvidenceScan> }>();
  for (const scan of coverageScans) {
    const provider = providerIdentity(scan.source_provider);
    const group = coverageByProvider.get(provider.key) ?? { label: provider.label, latestByCourse: new Map() };
    const current = group.latestByCourse.get(scan.course_id);
    if (!current || new Date(scan.scanned_at).getTime() > new Date(current.scanned_at).getTime()) group.latestByCourse.set(scan.course_id, scan);
    coverageByProvider.set(provider.key, group);
  }

  const qualityByProvider = new Map<string, { label: string; rows: QualityEvidenceSuggestion[] }>();
  for (const row of qualityRows) {
    const provider = providerIdentity(row.source_provider);
    const group = qualityByProvider.get(provider.key) ?? { label: provider.label, rows: [] };
    group.rows.push(row);
    qualityByProvider.set(provider.key, group);
  }

  const keys = new Set([...coverageByProvider.keys(), ...qualityByProvider.keys()]);
  const result: SourceDecisionEvidence[] = [];

  for (const key of keys) {
    const coverage = coverageByProvider.get(key);
    const quality = qualityByProvider.get(key);
    const latestScans = [...(coverage?.latestByCourse.values() ?? [])];
    const reviewedRows = (quality?.rows ?? []).filter(row => row.review_status !== 'pending');
    const accepted = reviewedRows.filter(row => row.review_status === 'accepted').length;
    const edited = reviewedRows.filter(row => row.manually_edited).length;
    const courseCount = latestScans.length;
    const averageCoverage = average(latestScans.map(scan => scan.source_score));
    const acceptanceRate = pct(accepted, reviewedRows.length);
    const editRate = pct(edited, reviewedRows.length);
    const notes: string[] = [];
    let state: SourceEvidenceState = 'mixed';

    if (courseCount < 5 || reviewedRows.length < 20) {
      state = 'insufficient';
      if (courseCount < 5) notes.push(`Coverage sample is ${courseCount}/5 courses.`);
      if (reviewedRows.length < 20) notes.push(`Quality sample is ${reviewedRows.length}/20 reviewed suggestions.`);
    } else if (acceptanceRate < 70 || editRate > 40) {
      state = 'quality-concern';
      if (acceptanceRate < 70) notes.push(`Acceptance is ${acceptanceRate}%.`);
      if (editRate > 40) notes.push(`${editRate}% of reviewed suggestions required correction.`);
    } else if (averageCoverage < 60) {
      state = 'coverage-gap';
      notes.push(`Average structural coverage is ${averageCoverage}%.`);
    } else if (averageCoverage >= 75 && acceptanceRate >= 80 && editRate <= 25) {
      state = 'promising';
      notes.push('Coverage and review outcomes are both strong enough to keep testing this source first.');
    } else {
      notes.push('Evidence is mixed; inspect feature-level coverage and quality before changing source strategy.');
    }

    result.push({
      providerKey: key,
      providerLabel: coverage?.label ?? quality?.label ?? 'Unknown',
      courseCount,
      averageCoverage,
      reviewed: reviewedRows.length,
      accepted,
      acceptanceRate,
      editRate,
      state,
      notes,
    });
  }

  return result.sort((a, b) => b.courseCount - a.courseCount || b.reviewed - a.reviewed || a.providerLabel.localeCompare(b.providerLabel));
}
