export type SourceCoverageBenchmarkScan = {
  id: string;
  course_id: string;
  source_provider: string;
  scanned_at: string;
  source_score: number;
  approved_score: number;
  suggestions_count: number;
  directly_assigned: number;
  inferred_assignments: number;
  skipped_count: number;
  gap_count: number;
};

export type SourceCoverageBenchmarkCourse = {
  id: string;
  name: string;
};

export type SourceCoverageBenchmarkRow = {
  courseId: string;
  courseName: string;
  scans: number;
  latest: SourceCoverageBenchmarkScan;
  inferenceRate: number;
};

export type SourceCoverageBenchmarkSummary = {
  scanCount: number;
  courseCount: number;
  averageSourceScore: number;
  averageApprovedScore: number;
  averageInferenceRate: number;
  latestByCourse: SourceCoverageBenchmarkRow[];
};

const roundedAverage = (values: number[]) => values.length === 0
  ? 0
  : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

export function summarizeCoverageBenchmarks(
  courses: SourceCoverageBenchmarkCourse[],
  scans: SourceCoverageBenchmarkScan[],
): SourceCoverageBenchmarkSummary {
  const courseNames = new Map(courses.map(course => [course.id, course.name]));
  const grouped = new Map<string, SourceCoverageBenchmarkScan[]>();

  for (const scan of scans) {
    const current = grouped.get(scan.course_id) ?? [];
    current.push(scan);
    grouped.set(scan.course_id, current);
  }

  const latestByCourse: SourceCoverageBenchmarkRow[] = [];
  for (const [courseId, courseScans] of grouped) {
    const sorted = [...courseScans].sort((a, b) => new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime());
    const latest = sorted[0];
    const assigned = latest.directly_assigned + latest.inferred_assignments;
    latestByCourse.push({
      courseId,
      courseName: courseNames.get(courseId) ?? 'Unknown course',
      scans: courseScans.length,
      latest,
      inferenceRate: assigned === 0 ? 0 : Math.round((latest.inferred_assignments / assigned) * 100),
    });
  }

  latestByCourse.sort((a, b) => a.latest.source_score - b.latest.source_score || a.courseName.localeCompare(b.courseName));

  return {
    scanCount: scans.length,
    courseCount: latestByCourse.length,
    averageSourceScore: roundedAverage(latestByCourse.map(row => row.latest.source_score)),
    averageApprovedScore: roundedAverage(latestByCourse.map(row => row.latest.approved_score)),
    averageInferenceRate: roundedAverage(latestByCourse.map(row => row.inferenceRate)),
    latestByCourse,
  };
}
