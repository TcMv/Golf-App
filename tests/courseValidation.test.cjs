const assert = require('node:assert/strict');
const { validateCourseReadiness } = require('/tmp/golf-course-validation-test/courseValidation.js');

function completeHole(number, par = 4) {
  return {
    number,
    par,
    stroke_index: number,
    white_metres: par === 3 ? 150 : par === 5 ? 480 : 350,
    tee_lat: -26.6 - number * 0.001,
    tee_lng: 153.0,
    green_front_lat: -26.602 - number * 0.001,
    green_front_lng: 153.0,
    green_mid_lat: -26.6021 - number * 0.001,
    green_mid_lng: 153.0,
    green_back_lat: -26.6022 - number * 0.001,
    green_back_lng: 153.0,
  };
}

function zonesForHole(hole) {
  const baseLat = -26.602 - hole.number * 0.001;
  const zones = [
    {
      hole_number: hole.number,
      zone_type: 'green',
      coordinates: [
        { lat: baseLat, lng: 153.0 },
        { lat: baseLat + 0.0001, lng: 153.0001 },
        { lat: baseLat - 0.0001, lng: 153.0001 },
      ],
    },
  ];
  if (hole.par >= 4) {
    zones.push(
      {
        hole_number: hole.number,
        zone_type: 'fairway',
        coordinates: [
          { lat: baseLat + 0.0015, lng: 153.0 },
          { lat: baseLat + 0.0005, lng: 153.0002 },
          { lat: baseLat + 0.0005, lng: 152.9998 },
        ],
      },
      {
        hole_number: hole.number,
        zone_type: 'fairway_centreline',
        coordinates: [
          { lat: baseLat + 0.0017, lng: 153.0 },
          { lat: baseLat + 0.0003, lng: 153.0 },
        ],
      },
    );
  }
  return zones;
}

{
  const holes = Array.from({ length: 9 }, (_, index) => completeHole(index + 1, index === 1 ? 3 : 4));
  const zones = holes.flatMap(zonesForHole);
  const result = validateCourseReadiness({ expectedHoles: 9, teeSetCount: 1, holes, zones });
  assert.equal(result.errors, 0);
  assert.equal(result.basicCompleteness, 100);
  assert.equal(result.geometryCompleteness, 100);
  assert.equal(result.completeness, 100);
  assert.equal(result.publishable, true);
}

{
  const holes = Array.from({ length: 9 }, (_, index) => completeHole(index + 1));
  holes[0].tee_lat = null;
  holes[1].green_mid_lat = null;
  holes[2].stroke_index = 2;
  const result = validateCourseReadiness({ expectedHoles: 9, teeSetCount: 0, holes, zones: [] });
  assert.equal(result.publishable, false);
  assert.ok(result.errors >= 4);
  assert.ok(result.issues.some(issue => issue.code === 'no_tee_sets'));
  assert.ok(result.issues.some(issue => issue.code === 'missing_tee_gps' && issue.holeNumber === 1));
  assert.ok(result.issues.some(issue => issue.code === 'missing_green_mid' && issue.holeNumber === 2));
  assert.ok(result.issues.some(issue => issue.code === 'duplicate_stroke_index'));
  assert.ok(result.geometryCompleteness < 100);
}

{
  const hole = completeHole(1, 3);
  const result = validateCourseReadiness({
    expectedHoles: 1,
    teeSetCount: 1,
    holes: [hole],
    zones: zonesForHole(hole),
  });
  assert.equal(result.geometryCompleteness, 100, 'par 3 should not require fairway or centreline');
}

console.log('courseValidation tests passed');
