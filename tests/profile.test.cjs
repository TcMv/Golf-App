const assert = require('node:assert/strict');
const { normalizeGhin, profileInitials } = require('/tmp/golf-profile-test/profile.js');

assert.equal(profileInitials('Taran Croxton'), 'TC');
assert.equal(profileInitials('Taran'), 'TA');
assert.equal(profileInitials('', 'golfer@example.com'), 'GO');
assert.equal(normalizeGhin(' 1234567 '), '1234567');
assert.equal(normalizeGhin('   '), null);

console.log('profile tests passed');
