const assert = require('assert');
const { buildOverpassGolfQuery, convertOverpassGolfToMappingBatch, OSM_DATA_LICENSE } = require('/tmp/golf-osm-mapping-test/osmGolfMapping.js');

const response = {
  osm3s: { timestamp_osm_base: '2026-08-29T00:00:00Z' },
  elements: [
    { type: 'way', id: 100, tags: { golf: 'hole', ref: '1' }, geometry: [
      { lat: -26.6500, lon: 153.0500 }, { lat: -26.6490, lon: 153.0510 }, { lat: -26.6480, lon: 153.0520 },
    ] },
    { type: 'way', id: 101, tags: { golf: 'fairway' }, geometry: [
      { lat: -26.6498, lon: 153.0501 }, { lat: -26.6494, lon: 153.0508 }, { lat: -26.6489, lon: 153.0513 }, { lat: -26.6498, lon: 153.0501 },
    ] },
    { type: 'way', id: 102, tags: { golf: 'green', ref: '1' }, geometry: [
      { lat: -26.6482, lon: 153.0518 }, { lat: -26.6481, lon: 153.0521 }, { lat: -26.6479, lon: 153.0519 }, { lat: -26.6482, lon: 153.0518 },
    ] },
    { type: 'way', id: 103, tags: { golf: 'bunker', ref: '1' }, geometry: [
      { lat: -26.6484, lon: 153.0517 }, { lat: -26.6483, lon: 153.0518 }, { lat: -26.6482, lon: 153.0516 }, { lat: -26.6484, lon: 153.0517 },
    ] },
    { type: 'node', id: 104, lat: -26.6480, lon: 153.0520, tags: { golf: 'pin', ref: '1' } },
  ],
};

const result = convertOverpassGolfToMappingBatch({ courseId: 'course-1', courseHoles: 18, response });
assert.equal(result.batch.schema, 'golfcaddie.mapping-suggestions.v1');
assert.equal(result.batch.source.provider, 'OpenStreetMap');
assert.equal(result.batch.source.license, OSM_DATA_LICENSE);
assert(result.batch.suggestions.some(s => s.feature_type === 'fairway_centreline' && s.hole_number === 1));
assert(result.batch.suggestions.some(s => s.feature_type === 'fairway' && s.hole_number === 1 && s.confidence === 0.78));
assert(result.batch.suggestions.some(s => s.feature_type === 'green' && s.hole_number === 1));
assert(result.batch.suggestions.some(s => s.feature_type === 'green_centre' && s.hole_number === 1));
assert(result.batch.suggestions.some(s => s.feature_type === 'bunker' && s.hole_number === 1));
assert.equal(result.inferredAssignments, 1);

const query = buildOverpassGolfQuery(-26.65, 153.05, 1600);
assert(query.includes('nwr(around:1600,-26.6500000,153.0500000)["golf"]'));
assert(query.includes('out tags geom center'));

const unassignable = convertOverpassGolfToMappingBatch({
  courseId: 'course-2',
  courseHoles: 18,
  response: { elements: [{ type: 'way', id: 200, tags: { golf: 'bunker' }, geometry: [
    { lat: -30, lon: 150 }, { lat: -30.0001, lon: 150.0001 }, { lat: -30.0002, lon: 150 }, { lat: -30, lon: 150 },
  ] }] },
});
assert.equal(unassignable.batch.suggestions.length, 0);
assert(unassignable.issues.some(issue => issue.message.includes('No numbered golf=hole paths')));

console.log('osmGolfMapping tests passed');
