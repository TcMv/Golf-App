const assert = require('node:assert/strict');
const {
  COURSE_IMPORT_SCHEMA_V1,
  parseCourseImportJson,
  validateCourseImport,
} = require('/tmp/golf-course-import-test/courseImport.js');

function completeScorecard(count = 9) {
  return Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    par: index % 3 === 0 ? 3 : index % 3 === 1 ? 4 : 5,
    stroke_index: index + 1,
    metres: 120 + index * 25,
  }));
}

function validImport() {
  return {
    schema: COURSE_IMPORT_SCHEMA_V1,
    source: { provider: 'test' },
    course: { name: 'Test Course', latitude: -26.65, longitude: 153.08, holes: 9 },
    scorecard: completeScorecard(),
    tee_sets: [{ name: 'White', colour: 'white', total_metres: 2900, course_rating: 34.2, slope_rating: 121 }],
    hole_locations: [{
      number: 1,
      tee: { lat: -26.65, lng: 153.08 },
      green_front: { lat: -26.649, lng: 153.081 },
      green_centre: { lat: -26.6489, lng: 153.0811 },
      green_back: { lat: -26.6488, lng: 153.0812 },
    }],
    zones: [{
      hole_number: 1,
      type: 'fairway_centreline',
      coordinates: [{ lat: -26.65, lng: 153.08 }, { lat: -26.6489, lng: 153.0811 }],
    }],
    hazards: [{
      hole_numbers: [1],
      type: 'bunker',
      label: 'Front bunker',
      coordinates: [
        { lat: -26.649, lng: 153.081 },
        { lat: -26.6491, lng: 153.0811 },
        { lat: -26.6492, lng: 153.081 },
      ],
    }],
  };
}

{
  const result = validateCourseImport(validImport());
  assert.equal(result.errors, 0);
  assert.ok(result.data);
  assert.equal(result.data.course.name, 'Test Course');
  assert.equal(result.data.scorecard.length, 9);
}

{
  const input = validImport();
  input.schema = 'other.schema';
  const result = validateCourseImport(input);
  assert.equal(result.data, null);
  assert.ok(result.issues.some(issue => issue.path === 'schema'));
}

{
  const input = validImport();
  input.scorecard[1].stroke_index = 1;
  const result = validateCourseImport(input);
  assert.equal(result.data, null);
  assert.ok(result.issues.some(issue => issue.message.includes('appears more than once')));
}

{
  const input = validImport();
  input.scorecard.pop();
  const result = validateCourseImport(input);
  assert.equal(result.data, null);
  assert.ok(result.issues.some(issue => issue.message.includes('Expected 9 scorecard rows')));
  assert.ok(result.issues.some(issue => issue.message.includes('Hole 9 is missing')));
}

{
  const input = validImport();
  input.zones[0].coordinates = [{ lat: -26.65, lng: 153.08 }];
  const result = validateCourseImport(input);
  assert.equal(result.data, null);
  assert.ok(result.issues.some(issue => issue.message.includes('Centreline requires at least 2')));
}

{
  const input = validImport();
  input.hole_locations = [];
  input.zones = [];
  const result = validateCourseImport(input);
  assert.ok(result.data);
  assert.equal(result.errors, 0);
  assert.ok(result.warnings >= 2);
}

{
  const result = parseCourseImportJson('{not json');
  assert.equal(result.data, null);
  assert.equal(result.errors, 1);
  assert.equal(result.issues[0].message, 'Invalid JSON.');
}

console.log('course import tests passed');
