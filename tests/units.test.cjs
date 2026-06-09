const assert = require('node:assert/strict');
const { convertDistance, distanceUnitLabel } = require('/tmp/golf-units-test/units.js');

assert.equal(convertDistance(100, 'metres'), 100);
assert.equal(convertDistance(100, 'yards'), 109);
assert.equal(distanceUnitLabel('yards'), 'yards');
assert.equal(distanceUnitLabel('metres', true), 'm');

console.log('units tests passed');
