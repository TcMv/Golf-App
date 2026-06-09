const assert = require('assert').strict;
const {
  calcDifferential,
  calcHandicapIndex,
} = require('/tmp/golf-handicap-test/handicap.js');

assert.equal(calcDifferential(82, 72, 113), 10);
assert.equal(calcDifferential(82, 70, 120).toFixed(1), '11.3');

// Inputs are newest first. An older low differential outside the latest 20
// must not affect the current index.
const newestTwenty = [
  12, 13, 14, 15, 16,
  17, 18, 19, 20, 21,
  22, 23, 24, 25, 26,
  27, 28, 29, 30, 31,
];
assert.equal(calcHandicapIndex([...newestTwenty, -5]), 15.5);

// The obsolete 0.96 multiplier is not applied.
assert.equal(calcHandicapIndex([10, 11, 12]), 10);

assert.equal(calcHandicapIndex([]), null);
assert.equal(calcHandicapIndex([10, 11]), null);

console.log('handicap tests passed');
