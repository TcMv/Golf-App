const assert = require('node:assert/strict');
const { buildSourceDecisionEvidence } = require('/tmp/golf-source-decision-test/sourceDecisionEvidence.js');

const coverage = Array.from({ length: 5 }, (_, index) => ({
  course_id: `c${index + 1}`,
  source_provider: 'OpenStreetMap / Overpass',
  scanned_at: '2026-08-30T00:00:00Z',
  source_score: 82,
}));
coverage.push({ course_id: 'c1', source_provider: 'OpenStreetMap / Overpass', scanned_at: '2026-08-29T00:00:00Z', source_score: 20 });

const quality = Array.from({ length: 20 }, (_, index) => ({
  source_provider: 'OpenStreetMap',
  review_status: index < 17 ? 'accepted' : 'rejected',
  manually_edited: index < 4,
}));

const [osm] = buildSourceDecisionEvidence(coverage, quality);
assert.equal(osm.providerKey, 'openstreetmap');
assert.equal(osm.courseCount, 5);
assert.equal(osm.averageCoverage, 82);
assert.equal(osm.reviewed, 20);
assert.equal(osm.acceptanceRate, 85);
assert.equal(osm.editRate, 20);
assert.equal(osm.state, 'promising');

const insufficient = buildSourceDecisionEvidence(coverage.slice(0, 2), quality.slice(0, 5))[0];
assert.equal(insufficient.state, 'insufficient');
assert.ok(insufficient.notes.length >= 1);

console.log('source decision evidence tests passed');
