const assert = require('node:assert/strict');
const {
  applyLearnedCarries,
  buildClubLearningMap,
  learningNote,
  summarizeClubLearning,
} = require('/tmp/golf-shot-tracking-test/utils/shotTracking.js');

const rows = [
  { club_name: '7i', distance_metres: 136, outcome: 'hit', miss_direction: null, strike_quality: 'pure' },
  { club_name: '7i', distance_metres: 132, outcome: 'hit', miss_direction: null, strike_quality: 'pure' },
  { club_name: '7i', distance_metres: 134, outcome: 'miss', miss_direction: 'left', strike_quality: 'pure' },
  { club_name: '7i', distance_metres: 112, outcome: 'miss', miss_direction: 'short', strike_quality: 'fat' },
  { club_name: '7i', distance_metres: 129, outcome: 'miss', miss_direction: 'left', strike_quality: 'toe' },
  { club_name: 'Driver', distance_metres: 220, outcome: 'hit', miss_direction: null, strike_quality: 'pure' },
];

assert.deepEqual(summarizeClubLearning('7I', rows), {
  clubName: '7I',
  sampleCount: 5,
  averageCarry: 129,
  reliableCarry: 134,
  commonMiss: 'left',
  commonStrike: 'pure',
  hitRate: 40,
});
assert.equal(summarizeClubLearning('PW', rows), null);

const learning = buildClubLearningMap(rows);
const clubs = applyLearnedCarries([
  {
    id: '1',
    name: '7i',
    type: 'iron',
    custom_name: null,
    loft: null,
    sort_order: 1,
    carry_metres: 140,
    carry_stddev_metres: null,
  },
], learning);
assert.equal(clubs[0].carry_metres, 138);
assert.equal(learningNote('7I', learning), 'learned from 5 shots, usual miss left');

const inflatedTracking = applyLearnedCarries([{
  id: '2',
  name: '7i',
  type: 'iron',
  custom_name: null,
  loft: null,
  sort_order: 1,
  carry_metres: 135,
  carry_stddev_metres: null,
}], {
  '7i': {
    clubName: '7i',
    sampleCount: 8,
    averageCarry: 175,
    reliableCarry: 180,
    commonMiss: null,
    commonStrike: 'pure',
    hitRate: 75,
  },
});
assert.equal(inflatedTracking[0].carry_metres, 140);

console.log('shot tracking tests passed');
