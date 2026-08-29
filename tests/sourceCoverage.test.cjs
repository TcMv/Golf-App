const assert = require('assert');
const { analyzeSourceCoverage } = require('/tmp/golf-source-coverage-test/sourceCoverage.js');

const report = analyzeSourceCoverage({
  expectedHoles: 2,
  suggestions: [
    { hole_number: 1, feature_type: 'tee', confidence: 0.94 },
    { hole_number: 1, feature_type: 'green', confidence: 0.94 },
    { hole_number: 1, feature_type: 'fairway', confidence: 0.78 },
    { hole_number: 1, feature_type: 'fairway_centreline', confidence: 0.94 },
    { hole_number: 1, feature_type: 'bunker', confidence: 0.78 },
    { hole_number: 2, feature_type: 'green_centre', confidence: 0.78 },
  ],
  holes: [
    { number: 1, tee_lat: -26, tee_lng: 153, green_mid_lat: -26.1, green_mid_lng: 153.1 },
    { number: 2, tee_lat: null, tee_lng: null, green_mid_lat: -26.2, green_mid_lng: 153.2 },
  ],
  zones: [
    { hole_number: 1, zone_type: 'fairway' },
    { hole_number: 1, zone_type: 'fairway_centreline' },
  ],
  hazards: [{ hole_number: 1, hole_numbers: [1], type: 'bunker' }],
});

assert.equal(report.sourceScore, 63);
assert.equal(report.approvedScore, 63);
assert.equal(report.holes[0].sourceScore, 100);
assert.equal(report.holes[1].sourceScore, 25);
assert.deepEqual(report.gaps[0], { hole: 2, missing: ['tee', 'fairway', 'centreline'] });
assert.equal(report.sourceFeatureCounts.green, 1);
assert.equal(report.sourceFeatureCounts.green_centre, 1);
assert.equal(report.sourceDirectCount, 3);
assert.equal(report.sourceInferredCount, 3);
assert.equal(report.holes[0].source.hazards, 1);
assert.equal(report.holes[0].approved.hazards, 1);

console.log('sourceCoverage tests passed');
