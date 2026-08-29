const assert = require('node:assert/strict');
const {
  buildSuggestionApprovalAction,
  expectedSuggestionGeometry,
  validateMappingSuggestion,
} = require('/tmp/golf-course-mapping-suggestion-test/courseMappingSuggestions.js');

function base(feature_type, geometry_type, coordinates) {
  return {
    course_id: 'course-1',
    hole_number: 3,
    feature_type,
    geometry_type,
    coordinates,
    confidence: 0.93,
    source_provider: 'licensed-imagery',
    source_reference: 'img-3',
    source_license: 'commercial',
  };
}

{
  assert.equal(expectedSuggestionGeometry('tee'), 'point');
  assert.equal(expectedSuggestionGeometry('fairway_centreline'), 'line');
  assert.equal(expectedSuggestionGeometry('bunker'), 'polygon');
}

{
  const suggestion = base('green_centre', 'point', [{ lat: -26.65, lng: 153.08 }]);
  const result = validateMappingSuggestion(suggestion);
  assert.equal(result.valid, true);
  const action = buildSuggestionApprovalAction(suggestion);
  assert.equal(action.kind, 'hole_point');
  assert.equal(action.fields.green_mid_lat, -26.65);
}

{
  const suggestion = base('fairway_centreline', 'line', [
    { lat: -26.65, lng: 153.08 },
    { lat: -26.64, lng: 153.09 },
  ]);
  const action = buildSuggestionApprovalAction(suggestion);
  assert.equal(action.kind, 'hole_zone');
  assert.equal(action.zone_type, 'fairway_centreline');
}

{
  const suggestion = base('bunker', 'polygon', [
    { lat: -26.65, lng: 153.08 },
    { lat: -26.649, lng: 153.081 },
    { lat: -26.648, lng: 153.08 },
  ]);
  const action = buildSuggestionApprovalAction(suggestion);
  assert.equal(action.kind, 'hazard');
  assert.equal(action.hazard_type, 'bunker');
}

{
  const bad = base('green', 'point', [{ lat: -26.65, lng: 153.08 }]);
  const result = validateMappingSuggestion(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(message => message.includes('requires polygon geometry')));
}

{
  const lowConfidence = base('tee', 'point', [{ lat: -26.65, lng: 153.08 }]);
  lowConfidence.confidence = 0.62;
  lowConfidence.source_license = null;
  const result = validateMappingSuggestion(lowConfidence);
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some(message => message.includes('below 70%')));
  assert.ok(result.warnings.some(message => message.includes('license')));
}

console.log('course mapping suggestion tests passed');
