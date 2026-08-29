const assert = require('node:assert/strict');
const {
  MAPPING_SUGGESTION_BATCH_SCHEMA_V1,
  parseMappingSuggestionBatchJson,
  validateMappingSuggestionBatch,
} = require('/tmp/golf-course-mapping-batch-test/courseMappingSuggestionBatch.js');

function validBatch() {
  return {
    schema: MAPPING_SUGGESTION_BATCH_SCHEMA_V1,
    course_id: 'course-123',
    source: {
      provider: 'test-provider',
      reference: 'imagery-42',
      license: 'commercial-test-license',
    },
    suggestions: [
      {
        hole_number: 1,
        feature_type: 'tee',
        geometry_type: 'point',
        coordinates: [{ lat: -26.65, lng: 153.08 }],
        confidence: 0.95,
        metadata: {},
      },
      {
        hole_number: 1,
        feature_type: 'fairway',
        geometry_type: 'polygon',
        coordinates: [
          { lat: -26.65, lng: 153.08 },
          { lat: -26.649, lng: 153.081 },
          { lat: -26.648, lng: 153.08 },
        ],
        confidence: 0.88,
        metadata: {},
      },
    ],
  };
}

{
  const result = validateMappingSuggestionBatch(validBatch());
  assert.equal(result.errors, 0);
  assert.ok(result.data);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].source_provider, 'test-provider');
  assert.equal(result.rows[0].source_license, 'commercial-test-license');
}

{
  const input = validBatch();
  input.suggestions[0].geometry_type = 'polygon';
  const result = validateMappingSuggestionBatch(input);
  assert.equal(result.data, null);
  assert.ok(result.issues.some(issue => issue.message.includes('requires point geometry')));
}

{
  const input = validBatch();
  input.source.license = null;
  const result = validateMappingSuggestionBatch(input);
  assert.equal(result.errors, 0);
  assert.ok(result.data);
  assert.ok(result.warnings >= 1);
  assert.equal(result.rows[0].source_license, null);
}

{
  const input = validBatch();
  input.suggestions[1].coordinates[1].lat = 120;
  const result = validateMappingSuggestionBatch(input);
  assert.equal(result.data, null);
  assert.ok(result.issues.some(issue => issue.message.includes('invalid coordinate')));
}

{
  const result = parseMappingSuggestionBatchJson('{bad json');
  assert.equal(result.data, null);
  assert.equal(result.errors, 1);
}

console.log('course mapping suggestion batch tests passed');
