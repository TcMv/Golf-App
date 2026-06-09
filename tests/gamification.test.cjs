const assert = require('node:assert/strict');
const {
  aestDateString,
  aestWeekStart,
  daysBetweenDates,
  nextStreak,
  visibleStreak,
  weeklyChallengeForDate,
} = require('/tmp/golf-gamification-test/gamificationCore.js');

assert.equal(aestDateString(new Date('2026-06-08T16:00:00Z')), '2026-06-09');
assert.equal(daysBetweenDates('2026-06-08', '2026-06-09'), 1);
assert.equal(nextStreak(6, '2026-06-08', '2026-06-09'), 7);
assert.equal(nextStreak(6, '2026-06-09', '2026-06-09'), 6);
assert.equal(nextStreak(6, '2026-06-07', '2026-06-09'), 1);
assert.equal(visibleStreak(8, '2026-06-08', '2026-06-09'), 8);
assert.equal(visibleStreak(8, '2026-06-07', '2026-06-09'), 0);
assert.equal(aestWeekStart(new Date('2026-06-09T00:00:00Z')), '2026-06-08');

const first = weeklyChallengeForDate(new Date('2026-06-08T00:00:00Z'));
const second = weeklyChallengeForDate(new Date('2026-06-15T00:00:00Z'));
assert.notEqual(first.key, second.key);

console.log('gamification tests passed');
