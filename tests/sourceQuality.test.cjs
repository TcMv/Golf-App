const assert = require('node:assert/strict');
const { summarizeSourceQuality } = require('/tmp/golf-source-quality-test/sourceQuality.js');

const rows = [
  { id: '1', source_provider: 'OpenStreetMap', feature_type: 'green', confidence: 0.94, review_status: 'accepted', manually_edited: false, edit_count: 0, metadata: { assignment: 'osm_ref' } },
  { id: '2', source_provider: 'OpenStreetMap', feature_type: 'fairway', confidence: 0.78, review_status: 'rejected', manually_edited: false, edit_count: 0, metadata: { assignment: 'nearest_numbered_hole_path' } },
  { id: '3', source_provider: 'OpenStreetMap', feature_type: 'fairway', confidence: 0.78, review_status: 'accepted', manually_edited: true, edit_count: 2, metadata: { assignment: 'nearest_numbered_hole_path' } },
  { id: '4', source_provider: 'OpenStreetMap', feature_type: 'bunker', confidence: 0.94, review_status: 'pending', manually_edited: false, edit_count: 0, metadata: { assignment: 'osm_ref' } },
  { id: '5', source_provider: 'Other', feature_type: 'green', confidence: 0.85, review_status: 'accepted', manually_edited: true, edit_count: 1, metadata: {} },
];

const summary = summarizeSourceQuality(rows);
assert.equal(summary.total, 5);
assert.equal(summary.reviewed, 4);
assert.equal(summary.accepted, 3);
assert.equal(summary.rejected, 1);
assert.equal(summary.pending, 1);
assert.equal(summary.acceptanceRate, 75);
assert.equal(summary.editRate, 50);

const osm = summary.providers.find(row => row.key === 'openstreetmap');
assert.equal(osm.reviewed, 3);
assert.equal(osm.acceptanceRate, 67);

const inferred = summary.assignments.find(row => row.key === 'nearest_numbered_hole_path');
assert.equal(inferred.reviewed, 2);
assert.equal(inferred.acceptanceRate, 50);
assert.equal(inferred.editRate, 50);

const high = summary.confidenceBands.find(row => row.key === 'high');
assert.equal(high.acceptanceRate, 100);
assert.equal(high.pending, 1);

console.log('source quality tests passed');
