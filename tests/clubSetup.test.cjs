const assert = require('node:assert/strict');
const {
  clubTypeFromBagName,
  clubSetupExitAction,
  isValidClubCarry,
  SETUP_CLUBS,
} = require('/tmp/golf-club-setup-test/clubSetup.js');

assert.equal(SETUP_CLUBS.length, 30);
assert.deepEqual(SETUP_CLUBS.slice(0, 6).map(club => club.name), ['Driver', '3W', '4W', '5W', '7W', '9W']);
assert.deepEqual(SETUP_CLUBS.slice(-5).map(club => club.name), ['56°', '58°', '60°', '62°', '64°']);
assert.deepEqual(
  SETUP_CLUBS.filter(club => club.defaultSelected).map(club => club.name),
  ['Driver', '5W', '3H', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', '52°', '56°'],
);

const driver = SETUP_CLUBS[0];
assert.equal(isValidClubCarry(driver, 210), true);
assert.equal(isValidClubCarry(driver, 10), false);
assert.equal(SETUP_CLUBS.some(club => club.type === 'putter'), false);
assert.equal(SETUP_CLUBS.every(club => isValidClubCarry(club, club.defaultCarry)), true);
assert.equal(clubTypeFromBagName('5W'), 'wood');
assert.equal(clubTypeFromBagName('3H'), 'hybrid');
assert.equal(clubTypeFromBagName('4i'), 'iron');
assert.equal(clubTypeFromBagName('PW'), 'wedge');
assert.equal(clubTypeFromBagName('52°'), 'wedge');
assert.equal(clubSetupExitAction('StartRound', true), 'back');
assert.equal(clubSetupExitAction('StartRound', false), 'main');
assert.equal(clubSetupExitAction('Main', true), 'main');
assert.equal(clubSetupExitAction(undefined, false), 'main');

console.log('club setup tests passed');
