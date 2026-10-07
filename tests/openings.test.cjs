const { test } = require('node:test');
const assert = require('node:assert/strict');
const physics = require('../physics.js');

function openingShot(team, number, offset, power) {
  const positions = [[130, 300], [270, 240], [270, 360], [423, 180], [423, 420]];
  const pieces = [];
  for (let side = 0; side < 2; side++) positions.forEach(([x, y], index) => pieces.push({
    x: side ? 1080 - x : x, y, vx: 0, vy: 0, r: 27, mass: 3, team: side, number: index + 1, angle: 0
  }));
  const ball = { x: 540, y: 300, vx: 0, vy: 0, r: 11, mass: 1.4, team: -1, angle: 0 };
  const piece = pieces.find(piece => piece.team === team && piece.number === number);
  physics.launch(piece, Math.atan2(ball.y - piece.y, ball.x - piece.x) + offset * Math.PI / 180, power);
  const bodies = [...pieces, ball]; let settle = 0;
  for (let frame = 0; frame < 2160; frame++) {
    const result = physics.step(bodies, physics.constants.DT);
    if (result.goal !== null) return result.goal;
    settle = result.maxSpeed < physics.constants.STOP_SPEED ? settle + physics.constants.DT : 0;
    if (settle > physics.constants.SETTLE_TIME) return null;
  }
  assert.fail('Opening shot must settle within twelve simulated seconds');
}

test('rounded-corner standard formation resists 1470 sampled opening shots with open goals', { timeout: 20000 }, t => {
  let count = 0;
  for (const team of [0, 1]) for (let number = 1; number <= 5; number++) {
    for (let offset = -24; offset <= 24; offset++) for (const power of [.6, .8, 1]) {
      assert.equal(openingShot(team, number, offset, power), null, `team ${team}, disc ${number}, offset ${offset}, power ${power}`);
      count++;
    }
  }
  assert.equal(count, 1470);
  t.diagnostic(`${count} deterministic samples; a finite regression sweep, not an exhaustive proof`);
});
