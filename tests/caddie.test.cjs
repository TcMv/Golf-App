const assert = require('node:assert/strict');
const {
  buildCaddieAdvice,
  buildCaddiePrompt,
  buildPreRoundBriefing,
  authoritativeShotLine,
  detectCaddieLie,
  validatedCaddieFactor,
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

const missBiasedAdvice = buildCaddieAdvice({
  playerPos: { latitude: 0, longitude: 0 },
  greenMid: { latitude: 0.001, longitude: 0 },
  hazards: [],
  clubs,
  windSpeed: 0,
  windDir: 0,
  windLabel: 'Calm',
  playerElevation: 0,
  greenElevation: 0,
  clubMisses: { '7 iron': 'left' },
});
assert.ok(missBiasedAdvice);
assert.match(missBiasedAdvice.aimInstruction, /Aim right/);
assert.ok(missBiasedAdvice.target.longitude > 0);

const shortMissAdvice = buildCaddieAdvice({
  playerPos: { latitude: 0, longitude: 0 },
  greenMid: { latitude: 0.001285, longitude: 0 },
  hazards: [],
  clubs: [
    {
      ...clubs[0],
      id: 'short-miss-seven',
      name: '7 Iron',
      carry_metres: 135,
      carry_stddev_metres: 8,
    },
    {
      ...clubs[0],
      id: 'steady-six',
      name: '6 Iron',
      carry_metres: 145,
      carry_stddev_metres: 8,
    },
  ],
  windSpeed: 0,
  windDir: 0,
  windLabel: 'Calm',
  playerElevation: 0,
  greenElevation: 0,
  clubMisses: { '7 iron': 'short' },
});
assert.ok(shortMissAdvice);
assert.equal(shortMissAdvice.recommended.club.id, 'steady-six');

const prompt = buildCaddiePrompt(advice, 'Test Links');
assert.match(prompt.system, /Test Links/);
assert.doesNotMatch(prompt.system, /Nambour Golf Club/);
assert.match(prompt.system, /Do not name or suggest a club/);
assert.match(prompt.userMessage, /AUTHORITATIVE_SHOT_PLAN_JSON/);
assert.match(prompt.userMessage, /"club": "7 Iron"/);
assert.equal(validatedCaddieFactor('Hit 3H 210m toward the green.'), null);
assert.equal(validatedCaddieFactor('Use Driver and favour the left side.'), null);
assert.equal(validatedCaddieFactor('Aim right and avoid the trouble.', advice), null);
assert.equal(validatedCaddieFactor('Keep it below the wind.', advice), null);
assert.equal(validatedCaddieFactor('Avoid the water on the left.', advice), null);
assert.equal(
  validatedCaddieFactor('Commit fully to the marked line.', advice),
  'Commit fully to the marked line.',
);

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
assert.equal(
  authoritativeShotLine(longHoleAdvice),
  'Hit Driver toward the marked landing area, carrying about 210m and leaving 43m.',
);

const doglegAdvice = buildCaddieAdvice({
  playerPos: { latitude: 0, longitude: 0 },
  greenMid: { latitude: 0.002, longitude: -0.001 },
  hazards: [{
    id: 'dogleg-trees',
    course_id: 'course',
    hole_number: 1,
    hole_numbers: [1],
    type: 'trees',
    label: null,
    coordinates: [
      { lat: 0.00075, lng: -0.00048 },
      { lat: 0.00095, lng: -0.00048 },
      { lat: 0.00095, lng: -0.00032 },
      { lat: 0.00075, lng: -0.00032 },
    ],
    created_at: '',
  }],
  clubs: [{
    ...clubs[0],
    id: 'dogleg-driver',
    name: 'Driver',
    type: 'driver',
    carry_metres: 170,
    carry_stddev_metres: 12,
  }],
  windSpeed: 0,
  windDir: 0,
  windLabel: 'Calm',
  playerElevation: 0,
  greenElevation: 0,
  fairwayCentreline: [
    { lat: 0, lng: 0 },
    { lat: 0.0015, lng: 0 },
    { lat: 0.002, lng: -0.001 },
  ],
});
assert.ok(doglegAdvice);
assert.equal(doglegAdvice.shotType, 'layup');
assert.ok(doglegAdvice.target.latitude > 0.0014);
assert.ok(Math.abs(doglegAdvice.target.longitude) < 0.00015);
assert.match(doglegAdvice.aimInstruction, /fairway path/);
assert.equal(doglegAdvice.recommended.clearsHazards, true);
assert.doesNotMatch(doglegAdvice.strategy.join(' '), /trees/);

const cornerCutAdvice = buildCaddieAdvice({
  playerPos: { latitude: 0, longitude: 0 },
  greenMid: { latitude: 0.0025, longitude: -0.0015 },
  hazards: [{
    id: 'corner-bunker',
    course_id: 'course',
    hole_number: 1,
    hole_numbers: [1],
    type: 'bunker',
    label: null,
    coordinates: [
      { lat: 0.00072, lng: -0.00063 },
      { lat: 0.0009, lng: -0.00063 },
      { lat: 0.0009, lng: -0.00048 },
      { lat: 0.00072, lng: -0.00048 },
    ],
    created_at: '',
  }],
  clubs: [
    {
      ...clubs[0],
      id: 'corner-driver',
      name: 'Driver',
      type: 'driver',
      carry_metres: 250,
      carry_stddev_metres: 12,
    },
    {
      ...clubs[0],
      id: 'corner-wood',
      name: '5 Wood',
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
  fairwayCentreline: [
    { lat: 0, lng: 0 },
    { lat: 0.0018, lng: 0 },
    { lat: 0.0018, lng: -0.0015 },
    { lat: 0.0025, lng: -0.0015 },
  ],
});
assert.ok(cornerCutAdvice);
assert.equal(cornerCutAdvice.recommended.club.id, 'corner-driver');
assert.equal(cornerCutAdvice.recommended.clearsHazards, true);
assert.ok(cornerCutAdvice.target.longitude < -0.0008);
assert.ok(cornerCutAdvice.remainingDistance < 150);

const pathLandingHazardAdvice = buildCaddieAdvice({
  playerPos: { latitude: 0, longitude: 0 },
  greenMid: { latitude: 0.003, longitude: 0 },
  hazards: [{
    id: 'driver-landing-bunker',
    course_id: 'course',
    hole_number: 1,
    hole_numbers: [1],
    type: 'bunker',
    label: null,
    coordinates: [
      { lat: 0.0018, lng: -0.00007 },
      { lat: 0.00198, lng: -0.00007 },
      { lat: 0.00198, lng: 0.00007 },
      { lat: 0.0018, lng: 0.00007 },
    ],
    created_at: '',
  }],
  clubs: [
    {
      ...clubs[0],
      id: 'landing-driver',
      name: 'Driver',
      type: 'driver',
      carry_metres: 210,
      carry_stddev_metres: 12,
    },
    {
      ...clubs[0],
      id: 'landing-hybrid',
      name: '3 Hybrid',
      type: 'hybrid',
      carry_metres: 170,
      carry_stddev_metres: 10,
    },
  ],
  windSpeed: 0,
  windDir: 0,
  windLabel: 'Calm',
  playerElevation: 0,
  greenElevation: 0,
  fairwayCentreline: [
    { lat: 0, lng: 0 },
    { lat: 0.003, lng: 0 },
  ],
});
assert.ok(pathLandingHazardAdvice);
assert.equal(pathLandingHazardAdvice.recommended.club.id, 'landing-hybrid');
assert.equal(pathLandingHazardAdvice.recommended.clearsHazards, true);
assert.ok(pathLandingHazardAdvice.remainingDistance > 150);

const shortClubAdvice = buildCaddieAdvice({
  playerPos: { latitude: 0, longitude: 0 },
  greenMid: { latitude: 0.00162, longitude: 0 },
  hazards: [],
  clubs: [{
    ...clubs[0],
    id: 'tracked-seven',
    name: '7 Iron',
    carry_metres: 135,
    carry_stddev_metres: 8,
  }],
  windSpeed: 0,
  windDir: 0,
  windLabel: 'Calm',
  playerElevation: 0,
  greenElevation: 0,
});

assert.ok(shortClubAdvice);
assert.equal(shortClubAdvice.distToPin, 180);
assert.equal(shortClubAdvice.shotType, 'layup');
assert.equal(shortClubAdvice.recommended.club.id, 'tracked-seven');
assert.equal(shortClubAdvice.targetDistance, 135);
assert.ok(shortClubAdvice.remainingDistance >= 44 && shortClubAdvice.remainingDistance <= 46);
assert.match(shortClubAdvice.shortText, /135m target/);
assert.doesNotMatch(shortClubAdvice.shortText, /Play 180m/);

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
      { lat: 0.00185, lng: -0.00004 },
      { lat: 0.00195, lng: -0.00004 },
      { lat: 0.00195, lng: 0.00004 },
      { lat: 0.00185, lng: 0.00004 },
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
assert.match(rightHazardAdvice.aimInstruction, /Aim left/);
assert.ok(rightHazardAdvice.target.longitude < 0);

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

const forcedWaterLayupAdvice = buildCaddieAdvice({
  playerPos: { latitude: 0, longitude: 0 },
  greenMid: { latitude: 0.00162, longitude: 0 },
  hazards: [{
    id: 'forced-water',
    course_id: 'course',
    hole_number: 1,
    hole_numbers: [1],
    type: 'water',
    label: null,
    coordinates: [
      { lat: 0.00139, lng: -0.00008 },
      { lat: 0.00158, lng: -0.00008 },
      { lat: 0.00158, lng: 0.00008 },
      { lat: 0.00139, lng: 0.00008 },
    ],
    created_at: '',
  }],
  clubs: [
    {
      ...clubs[0],
      id: 'long-iron',
      name: 'Long Iron',
      carry_metres: 180,
      carry_stddev_metres: 12,
    },
    {
      ...clubs[0],
      id: 'tracked-seven',
      name: '7 Iron',
      carry_metres: 135,
      carry_stddev_metres: 8,
    },
  ],
  windSpeed: 0,
  windDir: 0,
  windLabel: 'Calm',
  playerElevation: 0,
  greenElevation: 0,
});

assert.ok(forcedWaterLayupAdvice);
assert.equal(forcedWaterLayupAdvice.shotType, 'layup');
assert.equal(forcedWaterLayupAdvice.recommended.club.id, 'tracked-seven');
assert.equal(forcedWaterLayupAdvice.targetDistance, 135);
assert.ok(forcedWaterLayupAdvice.strategy.some(line => line.includes('short of water')));
assert.ok(forcedWaterLayupAdvice.hazards.some(hazard =>
  hazard.type === 'water' && hazard.status === 'clear'
));
assert.match(
  buildCaddiePrompt(forcedWaterLayupAdvice, 'Test Links').userMessage,
  /"type": "water"/,
);

const offCentreWaterAdvice = buildCaddieAdvice({
  playerPos: { latitude: 0, longitude: 0 },
  greenMid: { latitude: 0.0018, longitude: 0 },
  hazards: [{
    id: 'wide-water',
    course_id: 'course',
    hole_number: 1,
    hole_numbers: [1],
    type: 'water',
    label: null,
    coordinates: [
      { lat: 0.00095, lng: -0.00005 },
      { lat: 0.00105, lng: -0.00005 },
      { lat: 0.00105, lng: 0.003 },
      { lat: 0.00095, lng: 0.003 },
    ],
    created_at: '',
  }],
  clubs: [{
    ...clubs[0],
    id: 'seven-crossing',
    name: '7 Iron',
    carry_metres: 115,
    carry_stddev_metres: 8,
  }],
  windSpeed: 0,
  windDir: 0,
  windLabel: 'Calm',
  playerElevation: 0,
  greenElevation: 0,
});

assert.ok(offCentreWaterAdvice);
assert.equal(offCentreWaterAdvice.recommended.clearsHazards, false);
assert.equal(offCentreWaterAdvice.recommended.warnings[0].type, 'water');

const beyondShotWaterAdvice = buildCaddieAdvice({
  playerPos: { latitude: 0, longitude: 0 },
  greenMid: { latitude: 0.00263, longitude: 0 },
  hazards: [{
    id: 'water-crosses-extended-bearing',
    course_id: 'course',
    hole_number: 1,
    hole_numbers: [1],
    type: 'water',
    label: null,
    coordinates: [
      { lat: 0.0009, lng: 0.001 },
      { lat: 0.0011, lng: 0.001 },
      { lat: 0.0082, lng: -0.001 },
      { lat: 0.008, lng: -0.001 },
    ],
    created_at: '',
  }],
  clubs: [{
    ...clubs[0],
    id: 'driver-clean-line',
    name: 'Driver',
    type: 'driver',
    carry_metres: 210,
    carry_stddev_metres: 12,
  }],
  windSpeed: 0,
  windDir: 0,
  windLabel: 'Calm',
  playerElevation: 0,
  greenElevation: 0,
});

assert.ok(beyondShotWaterAdvice);
assert.equal(beyondShotWaterAdvice.recommended.clearsHazards, true);
assert.ok(beyondShotWaterAdvice.strategy.includes('No mapped hazard blocks the selected shot line.'));
assert.match(beyondShotWaterAdvice.context, /No hazards on planned line/);
assert.doesNotMatch(beyondShotWaterAdvice.context, /876m|water \d{3}-\d{3}m/);

const square = (lat, lng, size = 0.0001) => [
  { lat: lat - size, lng: lng - size },
  { lat: lat + size, lng: lng - size },
  { lat: lat + size, lng: lng + size },
  { lat: lat - size, lng: lng + size },
];

const boundaryObAdvice = buildCaddieAdvice({
  playerPos: { latitude: 0, longitude: 0 },
  greenMid: { latitude: 0.001, longitude: 0 },
  hazards: [{
    id: 'course-boundary',
    course_id: 'course',
    hole_number: null,
    hole_numbers: null,
    type: 'ob',
    label: 'Course boundary',
    coordinates: square(0.0005, 0, 0.001),
    created_at: '',
  }],
  clubs,
  windSpeed: 0,
  windDir: 0,
  windLabel: 'Calm',
  playerElevation: 0,
  greenElevation: 0,
});
assert.ok(boundaryObAdvice);
assert.equal(boundaryObAdvice.recommended.clearsHazards, true);
assert.match(boundaryObAdvice.context, /No hazards on planned line/);

const conventionalObAdvice = buildCaddieAdvice({
  playerPos: { latitude: 0, longitude: 0 },
  greenMid: { latitude: 0.001, longitude: 0 },
  hazards: [{
    id: 'ob-patch',
    course_id: 'course',
    hole_number: 1,
    hole_numbers: [1],
    type: 'ob',
    label: null,
    coordinates: square(0.00098, 0, 0.00008),
    created_at: '',
  }],
  clubs,
  windSpeed: 0,
  windDir: 0,
  windLabel: 'Calm',
  playerElevation: 0,
  greenElevation: 0,
});
assert.ok(conventionalObAdvice);
assert.equal(conventionalObAdvice.recommended.clearsHazards, false);
assert.equal(conventionalObAdvice.recommended.warnings[0].type, 'ob');

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
