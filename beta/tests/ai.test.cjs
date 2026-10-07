const { test } = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const physics = require('../physics.js');
const AI = require('../ai.js');

function kickoff() {
  const formation = [[130, 300], [270, 240], [270, 360], [423, 180], [423, 420]];
  const pieces = [];
  for (let team = 0; team < 2; team++) formation.forEach(([x, y], index) => pieces.push({
    x: team ? 1080 - x : x, y, vx: 0, vy: 0, r: 27, mass: 3, team, number: index + 1, angle: 0
  }));
  return { pieces, ball: { x: 540, y: 300, vx: 0, vy: 0, r: 11, mass: 1.4, team: -1, angle: 0 } };
}
function play(board, team, shot) {
  const piece = board.pieces.find(p => p.team === team && p.number === shot.number);
  assert(piece, 'shot selects an own-team piece');
  assert(Number.isFinite(shot.angle));
  assert(shot.power >= .065 && shot.power <= 1);
  assert(physics.launch(piece, shot.angle, shot.power));
  let settle = 0;
  const bodies = [...board.pieces, board.ball];
  for (let i = 0; i < 1800; i++) {
    const result = physics.step(bodies, 1 / 180);
    if (result.goal !== null) return result.goal;
    settle = result.maxSpeed < 5 ? settle + 1 / 180 : 0;
    if (settle > .32) return null;
  }
  assert.fail('shot must settle within ten simulated seconds');
}
function plan(board, team, difficulty, random = () => .5) {
  const planner = AI.createPlanner(board.pieces, board.ball, team, difficulty, random);
  let result = null, calls = 0, longestStep = 0;
  const started = performance.now();
  while (result === null && calls < 101) {
    const before = performance.now();
    result = planner.step();
    longestStep = Math.max(longestStep, performance.now() - before);
    calls++;
  }
  assert(result, 'planner completes within 100 candidates');
  assert.equal(planner.evaluated, calls, 'each step evaluates exactly one candidate');
  assert.deepEqual(planner.step(), result, 'completed planner returns the same shot');
  assert.equal(planner.evaluated, calls, 'finished planner does no further work');
  return { result, planner, calls, longestStep, elapsed: performance.now() - started };
}
function scoringPosition() {
  const board = kickoff(), piece = board.pieces.find(p => p.team === 0 && p.number === 4);
  const angle = Math.atan2(board.ball.y - piece.y, board.ball.x - piece.x);
  assert.equal(play(board, 0, { number: 4, angle, power: .6 }), null);
  return board;
}
function mirror(board) {
  const result = structuredClone(board);
  for (const body of [...result.pieces, result.ball]) {
    body.x = 1080 - body.x; body.vx = -body.vx;
    if (body.team !== -1) body.team = 1 - body.team;
  }
  return result;
}

test('shared physics keeps launch limits, friction, and strict full-ball goal checks', () => {
  const body = kickoff().ball;
  physics.launch(body, Math.PI / 2, .5);
  assert(Math.abs(Math.hypot(body.vx, body.vy) - 640 * Math.pow(.5, 1.25)) < 1e-10);
  const y = body.y, vy = body.vy;
  physics.step([body], 1 / 180);
  assert(Math.abs(body.y - y - vy / 180) < 1e-10);
  assert(Math.abs(body.vy - vy + 210 / 180) < 1e-10);
  Object.assign(body, { x: 1027, y: 300, vx: 0, vy: 0 });
  assert.equal(physics.step([body], 1 / 180).goal, null, 'whole ball must cross, not only touch');
  body.x = 1027.001;
  assert.equal(physics.step([body], 1 / 180).goal, 0);
  Object.assign(body, { x: 1028, y: 239, vx: 0, vy: 0 });
  assert.equal(physics.step([body], 1 / 180).goal, null, 'ball must fit strictly inside the opening');
  assert(body.x <= 1016 - body.r, 'post-edge shot returns to the field');
});

test('known legal second-turn scoring route survives the physics extraction', () => {
  const board = scoringPosition();
  assert(Math.abs(board.ball.x - 627.2747940522912) < 1e-6);
  assert(Math.abs(board.ball.y - 389.5126092844013) < 1e-6);
  const piece = board.pieces.find(p => p.team === 1 && p.number === 2);
  assert.equal(play(board, 1, { number: 2, angle: Math.atan2(board.ball.y - piece.y, board.ball.x - piece.x), power: 1 }), 1);
});

test('planning is isolated, deterministic, bounded, and legal for both teams', t => {
  for (const team of [0, 1]) {
    const board = kickoff(), before = JSON.stringify(board);
    const first = plan(board, team, 'high');
    assert.equal(JSON.stringify(board), before, 'search must not mutate live bodies');
    assert(board.pieces.some(p => p.team === team && p.number === first.result.number));
    assert(Number.isFinite(first.result.angle));
    const second = plan(board, team, 'high');
    assert.deepEqual(second.result, first.result, 'same snapshot produces the same hard-mode choice');
    assert(first.planner.candidateCount <= 100);
    t.diagnostic(`team ${team}: ${first.calls} candidates, ${first.elapsed.toFixed(1)}ms total, ${first.longestStep.toFixed(1)}ms largest step`);
  }
});

test('medium and high AI find a real scoring shot on either attacking side', () => {
  const board = scoringPosition();
  for (const difficulty of ['medium', 'high']) for (const side of [1, 0]) {
    const fixture = side === 1 ? structuredClone(board) : mirror(board);
    const decision = plan(fixture, side, difficulty);
    assert.equal(play(fixture, side, decision.result), side, `${difficulty} scores for team ${side}`);
  }
});

test('high AI rejects an obvious own-goal shot and still moves the ball safely', () => {
  const board = kickoff();
  Object.assign(board.ball, { x: 110, y: 300 });
  Object.assign(board.pieces[0], { x: 170, y: 300 });
  Object.assign(board.pieces[1], { x: 100, y: 220 });
  assert.equal(play(structuredClone(board), 0, { number: 1, angle: Math.PI, power: 1 }), 1, 'fixture contains an immediate own goal');
  const decision = plan(board, 0, 'high');
  assert.notEqual(play(board, 0, decision.result), 1, 'computer avoids conceding');
  assert(Math.hypot(board.ball.x - 110, board.ball.y - 300) > 5, 'computer makes useful ball contact');
});

test('easy AI retreats safely when both imprecise attacking choices would concede', () => {
  const board = kickoff();
  Object.assign(board.ball, { x: 110, y: 300 });
  Object.assign(board.pieces[0], { x: 170, y: 300 });
  for (const power of [.75, .6]) {
    assert.equal(play(structuredClone(board), 0, { number: 1, angle: Math.PI, power }), 1);
  }
  const decision = plan(board, 0, 'low', () => .5);
  assert.notEqual(play(board, 0, decision.result), 1, 'a safe fallback beats knowingly scoring an own goal');
  assert(decision.calls <= 100);
});

test('difficulties change search and accuracy without changing physical abilities', t => {
  const board = kickoff(), low = plan(board, 0, 'low', () => .2);
  const medium = plan(board, 0, 'medium'), high = plan(board, 0, 'high');
  assert(low.calls < medium.calls && medium.calls < high.calls, 'difficulty increases search depth');
  assert(low.result.power < 1, 'easy play includes softer shots');
  const otherLow = plan(board, 0, 'low', () => .8);
  assert.notDeepEqual(otherLow.result, low.result, 'easy mode varies aim and power');
  for (const decision of [low, medium, high]) {
    const puck = { vx: 0, vy: 0 };
    physics.launch(puck, decision.result.angle, decision.result.power);
    assert(Math.hypot(puck.vx, puck.vy) <= 640 + 1e-9, 'same launch cap for every difficulty');
  }
  t.diagnostic(`low/medium/high candidates: ${low.calls}/${medium.calls}/${high.calls}; totals ${low.elapsed.toFixed(1)}/${medium.elapsed.toFixed(1)}/${high.elapsed.toFixed(1)}ms`);
});

test('coincident pieces still produce finite, legal fallback shots', () => {
  const board = kickoff();
  Object.assign(board.pieces[3], { x: 540, y: 300 });
  const decision = plan(board, 0, 'high');
  play(board, 0, decision.result);
  for (const body of [...board.pieces, board.ball]) for (const key of ['x', 'y', 'vx', 'vy']) assert(Number.isFinite(body[key]));
});
