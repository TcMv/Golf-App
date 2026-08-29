const assert = require('node:assert/strict');
const {
  buildCourseImportFromDatabase,
  courseImportToGeoJson,
  courseImportToJson,
  parseCourseImportCsv,
  parseCourseImportGeoJson,
} = require('/tmp/golf-course-import-converters-test/courseImportConverters.js');

const scorecardRows = Array.from({ length: 9 }, (_, index) => ({
  number: index + 1,
  par: index % 3 === 0 ? 3 : index % 3 === 1 ? 4 : 5,
  stroke_index: index + 1,
  white_metres: 120 + index * 20,
  tee_lat: index === 0 ? -26.65 : null,
  tee_lng: index === 0 ? 153.08 : null,
  green_front_lat: index === 0 ? -26.649 : null,
  green_front_lng: index === 0 ? 153.081 : null,
  green_mid_lat: index === 0 ? -26.6489 : null,
  green_mid_lng: index === 0 ? 153.0811 : null,
  green_back_lat: index === 0 ? -26.6488 : null,
  green_back_lng: index === 0 ? 153.0812 : null,
}));

const databaseExport = buildCourseImportFromDatabase({
  course: {
    name: 'Converter Course', lat: -26.65, lng: 153.08, holes: 9,
    source_provider: 'club', source_id: 'abc', source_license: 'licensed',
  },
  holes: scorecardRows,
  teeSets: [{ name: 'White', colour: 'white', total_metres: 1800, course_rating: 34.2, slope_rating: 120 }],
  zones: [{
    hole_number: 1,
    zone_type: 'fairway_centreline',
    coordinates: [{ lat: -26.65, lng: 153.08 }, { lat: -26.6489, lng: 153.0811 }],
  }],
  hazards: [{
    hole_number: 1,
    hole_numbers: [1],
    type: 'bunker',
    label: 'Right bunker',
    coordinates: [
      { lat: -26.6493, lng: 153.0808 },
      { lat: -26.6492, lng: 153.0809 },
      { lat: -26.6491, lng: 153.0808 },
    ],
  }],
});

{
  assert.equal(databaseExport.schema, 'golfcaddie.course.v1');
  assert.equal(databaseExport.source.provider, 'club');
  assert.equal(databaseExport.scorecard.length, 9);
  assert.equal(databaseExport.hole_locations.length, 1);
  assert.equal(JSON.parse(courseImportToJson(databaseExport)).course.name, 'Converter Course');
}

{
  const geoJson = courseImportToGeoJson(databaseExport);
  const result = parseCourseImportGeoJson(geoJson);
  assert.equal(result.errors, 0);
  assert.ok(result.data);
  assert.equal(result.data.course.name, 'Converter Course');
  assert.equal(result.data.zones.length, 1);
  assert.equal(result.data.hazards.length, 1);
  assert.equal(result.data.hole_locations[0].green_centre.lat, -26.6489);
}

{
  const header = 'course_name,latitude,longitude,holes,tee_name,tee_colour,course_rating,slope_rating,hole,par,stroke_index,metres,source_provider';
  const rows = Array.from({ length: 9 }, (_, index) => [
    'CSV Course', '-26.65', '153.08', '9', 'White', 'white', '34.2', '121',
    String(index + 1), String(index % 3 === 0 ? 3 : 4), String(index + 1), String(120 + index * 20), 'club_csv',
  ].join(','));
  const result = parseCourseImportCsv([header, ...rows].join('\n'));
  assert.equal(result.errors, 0);
  assert.ok(result.data);
  assert.equal(result.data.course.name, 'CSV Course');
  assert.equal(result.data.scorecard.length, 9);
  assert.equal(result.data.tee_sets[0].total_metres, rows.reduce((sum, _, index) => sum + 120 + index * 20, 0));
  assert.equal(result.data.source.provider, 'club_csv');
}

{
  const result = parseCourseImportCsv('course_name,hole\nBad,1');
  assert.equal(result.data, null);
  assert.equal(result.errors, 1);
  assert.ok(result.issues[0].message.includes('Missing CSV headers'));
}

{
  const result = parseCourseImportGeoJson('{bad');
  assert.equal(result.data, null);
  assert.equal(result.errors, 1);
}

console.log('course import converter tests passed');
