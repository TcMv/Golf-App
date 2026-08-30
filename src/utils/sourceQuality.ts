export type MappingQualityStatus = 'pending' | 'accepted' | 'rejected';

export type MappingQualitySuggestion = {
  id: string;
  source_provider: string | null;
  feature_type: string;
  confidence: number | null;
  review_status: MappingQualityStatus;
  manually_edited: boolean;
  edit_count: number;
  metadata: Record<string, unknown> | null;
};

export type QualityBucket = {
  key: string;
  label: string;
  total: number;
  reviewed: number;
  accepted: number;
  rejected: number;
  pending: number;
  edited: number;
  acceptanceRate: number;
  editRate: number;
};

export type SourceQualitySummary = {
  total: number;
  reviewed: number;
  accepted: number;
  rejected: number;
  pending: number;
  acceptanceRate: number;
  editRate: number;
  providers: QualityBucket[];
  features: QualityBucket[];
  confidenceBands: QualityBucket[];
  assignments: QualityBucket[];
};

type BucketGetter = (suggestion: MappingQualitySuggestion) => { key: string; label: string };

function percentage(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
}

function confidenceBucket(confidence: number | null) {
  if (confidence == null) return { key: 'unknown', label: 'Unknown confidence' };
  if (confidence >= 0.9) return { key: 'high', label: 'High · 90–100%' };
  if (confidence >= 0.8) return { key: 'medium', label: 'Medium · 80–89%' };
  return { key: 'low', label: 'Low · under 80%' };
}

function assignmentBucket(suggestion: MappingQualitySuggestion) {
  const assignment = suggestion.metadata?.assignment;
  if (assignment === 'osm_ref') return { key: 'osm_ref', label: 'OSM direct hole ref' };
  if (assignment === 'nearest_numbered_hole_path') return { key: 'nearest_numbered_hole_path', label: 'OSM inferred hole' };
  return { key: 'other', label: 'Other / unclassified' };
}

function buildBuckets(suggestions: MappingQualitySuggestion[], getter: BucketGetter): QualityBucket[] {
  const groups = new Map<string, { label: string; rows: MappingQualitySuggestion[] }>();
  for (const suggestion of suggestions) {
    const { key, label } = getter(suggestion);
    const group = groups.get(key) ?? { label, rows: [] };
    group.rows.push(suggestion);
    groups.set(key, group);
  }

  return [...groups.entries()].map(([key, group]) => {
    const reviewedRows = group.rows.filter(row => row.review_status !== 'pending');
    const accepted = reviewedRows.filter(row => row.review_status === 'accepted').length;
    const rejected = reviewedRows.filter(row => row.review_status === 'rejected').length;
    const edited = reviewedRows.filter(row => row.manually_edited).length;
    return {
      key,
      label: group.label,
      total: group.rows.length,
      reviewed: reviewedRows.length,
      accepted,
      rejected,
      pending: group.rows.length - reviewedRows.length,
      edited,
      acceptanceRate: percentage(accepted, reviewedRows.length),
      editRate: percentage(edited, reviewedRows.length),
    };
  }).sort((a, b) => b.reviewed - a.reviewed || b.total - a.total || a.label.localeCompare(b.label));
}

export function summarizeSourceQuality(suggestions: MappingQualitySuggestion[]): SourceQualitySummary {
  const reviewedRows = suggestions.filter(row => row.review_status !== 'pending');
  const accepted = reviewedRows.filter(row => row.review_status === 'accepted').length;
  const rejected = reviewedRows.filter(row => row.review_status === 'rejected').length;
  const edited = reviewedRows.filter(row => row.manually_edited).length;

  return {
    total: suggestions.length,
    reviewed: reviewedRows.length,
    accepted,
    rejected,
    pending: suggestions.length - reviewedRows.length,
    acceptanceRate: percentage(accepted, reviewedRows.length),
    editRate: percentage(edited, reviewedRows.length),
    providers: buildBuckets(suggestions, row => ({
      key: row.source_provider?.trim().toLowerCase() || 'unknown',
      label: row.source_provider?.trim() || 'Unknown provider',
    })),
    features: buildBuckets(suggestions, row => ({ key: row.feature_type, label: row.feature_type.replaceAll('_', ' ') })),
    confidenceBands: buildBuckets(suggestions, row => confidenceBucket(row.confidence)),
    assignments: buildBuckets(suggestions, assignmentBucket),
  };
}
