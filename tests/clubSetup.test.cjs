const assert = require('node:assert/strict');
const {
  isValidClubCarry,
  SETUP_CLUBS,
} = require('/tmp/golf-club-setup-test/clubSetup.js');

assert.equal(SETUP_CLUBS.length, 14);
assert.deepEqual(SETUP_CLUBS.slice(0, 4).map(club => club.name), ['Driver', '3W', '3H', '4H']);
assert.deepEqual(SETUP_CLUBS.slice(-5).map(club => club.name), ['PW', 'GW (52°)', 'SW (56°)', 'LW (60°)', 'Putter']);

const driver = SETUP_CLUBS[0];
const putter = SETUP_CLUBS.at(-1);
assert.equal(isValidClubCarry(driver, 210), true);
assert.equal(isValidClubCarry(driver, 10), false);
assert.equal(isValidClubCarry(putter, 15), true);
assert.equal(isValidClubCarry(putter, 0), false);

console.log('club setup tests passed');
