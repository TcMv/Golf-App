const assert = require('node:assert/strict');
const {
  buildCaddieAdvice,
  buildCaddiePrompt,
  buildPreRoundBriefing,
  detectCaddieLie,
} = require('/tmp/golf-caddie-test/utils/caddie.js');

const clubs = [
  {
    id: 'seven',
    name: '7 Iron',
    type: 'iron',
    loft: 34,
    custom_name: null,
    sort_order: 1,
    carry_metres: 110,
    carry_stddev_metres: 8,
  },
  {
    id: 'six',
    name: '6 Iron',
    type: 'iron',
    loft: 30,
    custom_name: null,
    sort_order: 2,
    carry_metres: 125,
    carry_stddev_metres: 9,
  },
  {
    id: 'putter',
    name: 'Putter',
    type: 'putter',
    loft: 3,
    custom_name: null,
    sort_order: 3,
    carry_metres: 100,
    carry_stddev_metres: 2,
  },
];

const history = {
  count: 4,
  avg: 4.8,
  best: 4,
  girPct: 25,
  avgPutts: 2.1,
};

const advice = buildCaddieAdvice({
  playerPos: { latitude: 0, longitude: 0 },
  greenMid: { latitude: 0.001, longitude: 0 },
  hazards: [],
  clubs,
  windSpeed: 0,
  windDir: 0,
  windLabel: 'Calm',
  playerElevation: 0,
  greenElevation: 0,
  holeNumber: 7,
  holePar: 4,
  holeIndex: 3,
  history,
});

assert.ok(advice, 'advice should be generated when club carries exist');
assert.equal(advice.recommended.club.id, 'seven');
assert.equal(advice.playingDistance, advice.distToPin);
assert.equal(advice.history, history);
assert.ok(advice.strategy.some(line => line.includes('stroke index 3')));
assert.ok(advice.strategy.some(line => line.includes('average is 4.8')));
assert.ok(!advice.alternatives.some(option => option.club.type === 'putter'));

const prompt = buildCaddiePrompt(advice, 'Test Links');
assert.match(prompt.system, /Test Links/);
assert.doesNotMatch(prompt.system, /Nambour Golf Club/);

const longHoleAdvice = buildCaddieAdvice({
  playerPos: { latitude: 0, longitude: 0 },
  greenMid: { latitude: 0.002275, longitude: 0 },
  hazards: [],
  clubs: [
    {
      ...clubs[0],
      id: 'driver',
      name: 'Driver',
      type: 'driver',
      carry_metres: 210,
      carry_stddev_metres: 12,
    },
    {
      ...clubs[0],
      id: 'wood',
      name: '3 Wood',
      type: 'wood',
      carry_metres: 190,
      carry_stddev_metres: 10,
    },
  ],
  windSpeed: 0,
  windDir: 0,
  windLabel: 'Calm',
  playerElevation: 0,
  greenElevation: 0,
  holeNumber: 1,
  holePar: 4,
});

assert.ok(longHoleAdvice);
assert.equal(longHoleAdvice.shotType, 'layup');
assert.equal(longHoleAdvice.recommended.club.id, 'driver');
assert.equal(longHoleAdvice.targetDistance, 210);
assert.ok(longHoleAdvice.remainingDistance >= 40 && longHoleAdvice.remainingDistance <= 45);
assert.match(longHoleAdvice.strategy[0], /landing area/);
assert.match(longHoleAdvice.shortText, /210m target/);

const rightHazardAdvice = buildCaddieAdvice({
  playerPos: { latitude: 0, longitude: 0 },
  greenMid: { latitude: 0.002275, longitude: 0 },
  hazards: [{
    id: 'water-right',
    course_id: 'course',
    hole_number: 1,
    hole_numbers: [1],
    type: 'water',
    label: null,
    coordinates: [
      { lat: 0.00185, lng: 0.00035 },
      { lat: 0.00195, lng: 0.00035 },
      { lat: 0.00195, lng: 0.00045 },
      { lat: 0.00185, lng: 0.00045 },
    ],
    created_at: '',
  }],
  clubs: [
    {
      ...clubs[0],
      id: 'driver',
      name: 'Driver',
      type: 'driver',
      carry_metres: 210,
      carry_stddev_metres: 12,
    },
    {
      ...clubs[0],
      id: 'wood',
      name: '3 Wood',
      type: 'wood',
      carry_metres: 190,
      carry_stddev_metres: 10,
    },
  ],
  windSpeed: 0,
  windDir: 0,
  windLabel: 'Calm',
  playerElevation: 0,
  greenElevation: 0,
});

assert.ok(rightHazardAdvice);
assert.equal(rightHazardAdvice.recommended.club.id, 'wood');
assert.match(rightHazardAdvice.aimInstruction, /centre of the fairway/);

const bunkerShortAdvice = buildCaddieAdvice({
  playerPos: { latitude: 0, longitude: 0 },
  greenMid: { latitude: 0.001285, longitude: 0 },
  hazards: [{
    id: 'bunker-short',
    course_id: 'course',
    hole_number: 1,
    hole_numbers: [1],
    type: 'bunker',
    label: null,
    coordinates: [
      { lat: 0.00105, lng: -0.00004 },
      { lat: 0.00115, lng: -0.00004 },
      { lat: 0.00115, lng: 0.00004 },
      { lat: 0.00105, lng: 0.00004 },
    ],
    created_at: '',
  }],
  clubs: [{
    ...clubs[0],
    id: 'five',
    name: '5 Iron',
    carry_metres: 155,
    carry_stddev_metres: 10,
  }],
  windSpeed: 0,
  windDir: 0,
  windLabel: 'Calm',
  playerElevation: 0,
  greenElevation: 0,
});

assert.ok(bunkerShortAdvice);
assert.equal(bunkerShortAdvice.shotType, 'attack');
assert.ok(bunkerShortAdvice.remainingDistance <= 1);
assert.ok(Math.abs(bunkerShortAdvice.target.longitude) < 0.000001);
assert.equal(bunkerShortAdvice.aimInstruction, 'Aim at the centre of the green.');

const landingHazardAdvice = buildCaddieAdvice({
  playerPos: { latitude: 0, longitude: 0 },
  greenMid: { latitude: 0.001285, longitude: 0 },
  hazards: [{
    id: 'bunker-at-target',
    course_id: 'course',
    hole_number: 1,
    hole_numbers: [1],
    type: 'bunker',
    label: null,
    coordinates: [
      { lat: 0.00123, lng: -0.00003 },
      { lat: 0.00131, lng: -0.00003 },
      { lat: 0.00131, lng: 0.00005 },
      { lat: 0.00123, lng: 0.00005 },
    ],
    created_at: '',
  }],
  clubs: [{
    ...clubs[0],
    id: 'five',
    name: '5 Iron',
    carry_metres: 155,
    carry_stddev_metres: 10,
  }],
  windSpeed: 0,
  windDir: 0,
  windLabel: 'Calm',
  playerElevation: 0,
  greenElevation: 0,
});

assert.ok(landingHazardAdvice);
assert.notEqual(landingHazardAdvice.target.longitude, 0);
assert.match(landingHazardAdvice.aimInstruction, /away from bunker/);

const square = (lat, lng, size = 0.0001) => [
  { lat: lat - size, lng: lng - size },
  { lat: lat + size, lng: lng - size },
  { lat: lat + size, lng: lng + size },
  { lat: lat - size, lng: lng + size },
];

assert.equal(detectCaddieLie({
  playerPos: { latitude: 0, longitude: 0 },
  hazards: [],
  zones: [{ zone_type: 'fairway', coordinates: square(0, 0) }],
}), 'fairway');

assert.equal(detectCaddieLie({
  playerPos: { latitude: 0, longitude: 0 },
  hazards: [{
    id: 'trees',
    course_id: 'course',
    hole_number: 1,
    hole_numbers: [1],
    type: 'trees',
    label: null,
    coordinates: square(0, 0),
    created_at: '',
  }],
  zones: [],
}), 'trees');

const recoveryTarget = { latitude: 0, longitude: 0.0005 };
const recoveryAdvice = buildCaddieAdvice({
  playerPos: { latitude: 0, longitude: 0 },
  greenMid: { latitude: 0.002, longitude: 0 },
  hazards: [],
  clubs,
  windSpeed: 0,
  windDir: 0,
  windLabel: 'Calm',
  playerElevation: 0,
  greenElevation: 0,
  lie: 'trees',
  customTarget: recoveryTarget,
});

assert.ok(recoveryAdvice);
assert.equal(recoveryAdvice.shotType, 'recovery');
assert.equal(recoveryAdvice.customTarget, true);
assert.deepEqual(recoveryAdvice.target, recoveryTarget);
assert.ok(recoveryAdvice.targetDistance >= 55 && recoveryAdvice.targetDistance <= 57);
assert.ok(recoveryAdvice.recommended.adjustedCarry < recoveryAdvice.recommended.club.carry_metres);
assert.match(recoveryAdvice.strategy[0], /Recovery shot/);

const bunkerAdvice = buildCaddieAdvice({
  playerPos: { latitude: 0, longitude: 0 },
  greenMid: { latitude: 0.0009, longitude: 0 },
  hazards: [],
  clubs,
  windSpeed: 0,
  windDir: 0,
  windLabel: 'Calm',
  playerElevation: 0,
  greenElevation: 0,
  lie: 'bunker',
});

assert.ok(bunkerAdvice);
assert.ok(bunkerAdvice.recommended.adjustedCarry < bunkerAdvice.recommended.club.carry_metres);
assert.notEqual(bunkerAdvice.recommended.club.type, 'wood');

const puttingAdvice = buildCaddieAdvice({
  playerPos: { latitude: 0, longitude: 0 },
  greenMid: { latitude: 0.00005, longitude: 0 },
  hazards: [],
  clubs,
  windSpeed: 0,
  windDir: 0,
  windLabel: 'Calm',
  playerElevation: 0,
  greenElevation: 0,
  lie: 'green',
});

assert.ok(puttingAdvice);
assert.equal(puttingAdvice.shotType, 'putt');
assert.equal(puttingAdvice.recommended.club.type, 'putter');

const briefing = buildPreRoundBriefing({
  courseName: 'Test Links',
  courseRating: 73.2,
  slopeRating: 135,
  windLabel: '22km/h NE',
  windSpeed: 22,
  handicapIndex: 12.4,
  recentCourseScores: [88, 86, 90],
});

const briefingLines = briefing.split('\n');
assert.equal(briefingLines.length, 3);
assert.match(briefingLines[0], /^1\./);
assert.match(briefing, /one extra club/);
assert.match(briefing, /recent average here is 88\.0/);

console.log('caddie tests passed');
