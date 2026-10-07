const { test } = require('node:test');
const assert = require('node:assert/strict');
const physics = require('../physics.js');
const C = physics.constants;
const corners = [
  { x: C.L + C.CORNER_RADIUS, y: C.T + C.CORNER_RADIUS, sx: -1, sy: -1 },
  { x: C.R - C.CORNER_RADIUS, y: C.T + C.CORNER_RADIUS, sx: 1, sy: -1 },
  { x: C.L + C.CORNER_RADIUS, y: C.B - C.CORNER_RADIUS, sx: -1, sy: 1 },
  { x: C.R - C.CORNER_RADIUS, y: C.B - C.CORNER_RADIUS, sx: 1, sy: 1 }
];
function body(r, values = {}) {
  return { x: 540, y: 300, vx: 0, vy: 0, angle: 0, r, mass: r === 11 ? 1.4 : 3, team: r === 11 ? -1 : 0, ...values };
}
function assertContained(piece) {
  for (const key of ['x', 'y', 'vx', 'vy']) assert(Number.isFinite(piece[key]), key + ' remains finite');
  assert(piece.x >= C.L + piece.r - 1e-7 && piece.x <= C.R - piece.r + 1e-7, 'inside vertical walls');
  assert(piece.y >= C.T + piece.r - 1e-7 && piece.y <= C.B - piece.r + 1e-7, 'inside horizontal walls');
  for (const corner of corners) {
    if ((piece.x - corner.x) * corner.sx > 0 && (piece.y - corner.y) * corner.sy > 0) {
      assert(Math.hypot(piece.x - corner.x, piece.y - corner.y) <= C.CORNER_RADIUS - piece.r + 1e-7, 'inside rounded arc');
    }
  }
}

test('all four corner arcs reflect only outward normal velocity for ball and both puck sizes', () => {
  for (const corner of corners) for (const r of [11, 27, 32.4]) for (const angle of [.1, Math.PI / 4, Math.PI / 2 - .1]) for (const tangent of [-160, 0, 160]) {
    const nx = corner.sx * Math.cos(angle), ny = corner.sy * Math.sin(angle);
    const tx = -ny, ty = nx, outward = 400, allowed = C.CORNER_RADIUS - r;
    const piece = body(r, { x: corner.x + nx * (allowed + 2), y: corner.y + ny * (allowed + 2), vx: nx * outward + tx * tangent, vy: ny * outward + ty * tangent });
    const before = Math.hypot(piece.vx, piece.vy);
    assert.equal(physics.step([piece], 0).goal, null);
    assertContained(piece);
    assert(Math.abs(piece.vx * nx + piece.vy * ny + outward * C.WALL_RESTITUTION) < 1e-8, 'normal rebounds once');
    assert(Math.abs(piece.vx * tx + piece.vy * ty - tangent) < 1e-8, 'tangent is preserved');
    assert(Math.hypot(piece.vx, piece.vy) <= before, 'reflection adds no energy');
  }
});

test('projecting an overlapping corner body does not turn an escaping velocity back into the wall', () => {
  for (const corner of corners) for (const r of [11, 27, 32.4]) {
    const piece = body(r, { x: corner.x + corner.sx * 40, y: corner.y + corner.sy * 40, vx: -corner.sx * 200, vy: -corner.sy * 130 });
    const velocity = [piece.vx, piece.vy];
    physics.step([piece], 0);
    assertContained(piece);
    assert.deepEqual([piece.vx, piece.vy], velocity);
    const location = [piece.x, piece.y];
    for (let i = 0; i < 40; i++) physics.step([piece], 0);
    assert.deepEqual([piece.x, piece.y], location, 'repeated correction does not jitter');
  }
});

test('fixed-step high speed corner approaches remain finite, lose energy, and settle', () => {
  for (const corner of corners) for (const r of [11, 27, 32.4]) for (const angle of [.1, Math.PI / 4, Math.PI / 2 - .1]) for (const speed of [100, 640, 1100]) {
    const nx = corner.sx * Math.cos(angle), ny = corner.sy * Math.sin(angle);
    const piece = body(r, { x: corner.x + nx * (C.CORNER_RADIUS - r - 3), y: corner.y + ny * (C.CORNER_RADIUS - r - 3), vx: nx * speed, vy: ny * speed });
    let previous = speed;
    for (let frame = 0; frame < 1200; frame++) {
      const result = physics.step([piece], C.DT);
      assert.equal(result.goal, null, 'a corner rebound is not a goal');
      assertContained(piece);
      const current = Math.hypot(piece.vx, piece.vy);
      assert(current <= previous + 1e-8, 'no repeated-contact energy gain');
      previous = current;
      if (!current) break;
    }
    assert.equal(Math.hypot(piece.vx, piece.vy), 0, 'friction stops every shot');
  }
});

test('a ball or puck resting against any corner stays still and can be shot back out', () => {
  for (const corner of corners) for (const r of [11, 27, 32.4]) {
    const piece = body(r, { x: corner.sx < 0 ? C.L + r : C.R - r, y: corner.sy < 0 ? C.T + r : C.B - r });
    physics.step([piece], C.DT);
    assertContained(piece);
    const start = { x: piece.x, y: piece.y };
    for (let i = 0; i < 180; i++) physics.step([piece], C.DT);
    assert.deepEqual([piece.x, piece.y, piece.vx, piece.vy], [start.x, start.y, 0, 0]);
    physics.launch(piece, Math.atan2(300 - piece.y, 540 - piece.x), .5);
    for (let i = 0; i < 120; i++) { assert.equal(physics.step([piece], C.DT).goal, null); assertContained(piece); }
    assert(Math.hypot(piece.x - start.x, piece.y - start.y) > 65, 'body leaves the corner freely');
  }
});

test('an overlapping puck and ball at the corner separate without pumping kinetic energy', () => {
  for (const corner of corners) {
    const puck = body(32.4, { x: corner.x + corner.sx * 6, y: corner.y + corner.sy * 6, vx: corner.sx * 80, vy: corner.sy * 50 });
    const ball = body(11, { x: corner.x + corner.sx * 11, y: corner.y + corner.sy * 11 });
    let energy = Infinity;
    for (let frame = 0; frame < 1000; frame++) {
      assert.equal(physics.step([puck, ball], C.DT).goal, null);
      assertContained(puck); assertContained(ball);
      const current = [puck, ball].reduce((sum, p) => sum + p.mass * (p.vx * p.vx + p.vy * p.vy), 0);
      assert(current <= energy + 1e-7, 'contact solver does not add energy');
      energy = current;
    }
    assert.equal(energy, 0);
    assert(Math.hypot(puck.x - ball.x, puck.y - ball.y) >= puck.r + ball.r - .1, 'overlap resolves');
  }
});

test('goal mouths remain open while shots beside either post and at corners stay in play', () => {
  for (const side of [-1, 1]) {
    const opening = body(11, { x: side < 0 ? C.L - 12 : C.R + 12, y: 300, vx: side * 80 });
    assert.equal(physics.step([opening], C.DT).goal, side < 0 ? 1 : 0);
    for (const y of [C.GT + 11, C.GB - 11, C.T + 11, C.B - 11]) {
      const blocked = body(11, { x: side < 0 ? C.L - 12 : C.R + 12, y, vx: side * 80 });
      assert.equal(physics.step([blocked], 0).goal, null);
      assertContained(blocked);
    }
  }
});
