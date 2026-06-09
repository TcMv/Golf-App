const assert = require('node:assert/strict');
const {
  calculateRoundPar,
  monthStartString,
  roundHoleSequence,
} = require('/tmp/golf-home-test/homeDashboard.js');

assert.deepEqual(roundHoleSequence(10, 9), [10, 11, 12, 13, 14, 15, 16, 17, 18]);
assert.deepEqual(roundHoleSequence(15, 9), [15, 16, 17, 18, 1, 2, 3, 4, 5]);

const holes = Array.from({ length: 18 }, (_, index) => ({
  number: index + 1,
  par: index < 9 ? 4 : 5,
}));
assert.equal(calculateRoundPar(holes, 10, 9), 45);
assert.equal(calculateRoundPar(holes, 15, 9), 40);
assert.equal(monthStartString(new Date(2026, 5, 9)), '2026-06-01');

console.log('home dashboard tests passed');
