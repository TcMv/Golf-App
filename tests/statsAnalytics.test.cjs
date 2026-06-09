const assert = require('node:assert/strict');
const {
  calculateClubDistanceStats,
  calculatePerformanceAnalytics,
} = require('/tmp/golf-stats-test/statsAnalytics.js');

const rounds = [
  { id: 'a', courseName: 'Alpha', holes: [{ number: 1, par: 4 }, { number: 2, par: 3 }] },
  { id: 'b', courseName: 'Beta', holes: [{ number: 1, par: 5 }] },
];
const scores = [
  { round_id: 'a', hole_number: 1, gross_score: 4, fairway_hit: 'hit', gir: true, putts: 2 },
  { round_id: 'a', hole_number: 2, gross_score: 4, fairway_hit: 'na', gir: false, putts: 2 },
  { round_id: 'b', hole_number: 1, gross_score: 6, fairway_hit: 'left', gir: false, putts: 3 },
];

const analytics = calculatePerformanceAnalytics(rounds, scores);
assert.equal(analytics.firPct, 50);
assert.equal(analytics.girPct, 33);
assert.equal(analytics.avgPutts, 3.5);
assert.equal(analytics.parAverages.find(item => item.label === 'Par 5 Avg').value, 6);
assert.equal(analytics.bestHoles[0].courseName, 'Alpha');
assert.equal(analytics.worstHoles[0].courseName, 'Beta');

const club = calculateClubDistanceStats([150, 152, 148, 0, 900]);
assert.deepEqual(club, { average: 150, stddev: 2, samples: 3 });

console.log('stats analytics tests passed');
