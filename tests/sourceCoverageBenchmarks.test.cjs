const assert = require('node:assert/strict');
const { summarizeCoverageBenchmarks } = require('../tmp-source-coverage-benchmarks/sourceCoverageBenchmarks.js');

const courses = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }];
const scans = [
  { id: '1', course_id: 'a', source_provider: 'OSM', scanned_at: '2026-08-30T00:00:00Z', source_score: 50, approved_score: 80, suggestions_count: 20, directly_assigned: 8, inferred_assignments: 2, skipped_count: 1, gap_count: 9 },
  { id: '2', course_id: 'a', source_provider: 'OSM', scanned_at: '2026-08-30T01:00:00Z', source_score: 70, approved_score: 80, suggestions_count: 24, directly_assigned: 9, inferred_assignments: 1, skipped_count: 0, gap_count: 5 },
  { id: '3', course_id: 'b', source_provider: 'OSM', scanned_at: '2026-08-30T01:00:00Z', source_score: 30, approved_score: 40, suggestions_count: 10, directly_assigned: 2, inferred_assignments: 2, skipped_count: 2, gap_count: 12 },
];
const summary = summarizeCoverageBenchmarks(courses, scans);
assert.equal(summary.scanCount, 3);
assert.equal(summary.courseCount, 2);
assert.equal(summary.averageSourceScore, 50);
assert.equal(summary.averageApprovedScore, 60);
assert.equal(summary.latestByCourse[0].courseName, 'Beta');
assert.equal(summary.latestByCourse[1].latest.source_score, 70);
assert.equal(summary.latestByCourse[1].scans, 2);
console.log('source coverage benchmark tests passed');
