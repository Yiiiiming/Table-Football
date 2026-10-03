(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlickPhysics = api;
})(globalThis, function () {
  'use strict';

  const constants = Object.freeze({
    W: 1080, H: 600, L: 64, R: 1016, T: 48, B: 552,
    GT: 228, GB: 372, DT: 1 / 180, STOP_SPEED: 5, SETTLE_TIME: .32,
    MAX_LAUNCH: 640, PUCK_FRICTION: 180, BALL_FRICTION: 210,
    RESTITUTION: .78, WALL_RESTITUTION: .74, MAX_SPEED: 1100
  });
  const { L, R, T, B, GT, GB } = constants;

  function launch(piece, angle, power) {
    if (!piece || !Number.isFinite(angle) || !Number.isFinite(power)) return false;
    const speed = constants.MAX_LAUNCH * Math.pow(Math.max(0, Math.min(1, power)), 1.25);
    piece.vx = Math.cos(angle) * speed;
    piece.vy = Math.sin(angle) * speed;
    return true;
  }

  function collide(a, b, onImpact) {
    let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    const sum = a.r + b.r;
    if (d >= sum) return;
    if (d < .0001) { dx = 1; dy = 0; d = 1; }
    const nx = dx / d, ny = dy / d, ia = 1 / a.mass, ib = 1 / b.mass;
    const overlap = sum - d + .01;
    a.x -= nx * overlap * ia / (ia + ib);
    a.y -= ny * overlap * ia / (ia + ib);
    b.x += nx * overlap * ib / (ia + ib);
    b.y += ny * overlap * ib / (ia + ib);
    const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (vn >= 0) return;
    const impulse = -(1 + constants.RESTITUTION) * vn / (ia + ib);
    a.vx -= impulse * ia * nx; a.vy -= impulse * ia * ny;
    b.vx += impulse * ib * nx; b.vy += impulse * ib * ny;
    if (vn < -70 && onImpact) onImpact(-vn, a.team === -1 || b.team === -1);
  }

  function wall(body) {
    if (body.y - body.r < T) {
      body.y = T + body.r;
      if (body.vy < 0) body.vy *= -constants.WALL_RESTITUTION;
    }
    if (body.y + body.r > B) {
      body.y = B - body.r;
      if (body.vy > 0) body.vy *= -constants.WALL_RESTITUTION;
    }
    const opening = body.team === -1 && body.y > GT + body.r && body.y < GB - body.r;
    if (!opening) {
      if (body.x - body.r < L) {
        body.x = L + body.r;
        if (body.vx < 0) body.vx *= -constants.WALL_RESTITUTION;
      }
      if (body.x + body.r > R) {
        body.x = R - body.r;
        if (body.vx > 0) body.vx *= -constants.WALL_RESTITUTION;
      }
    }
  }

  // Mutates only the supplied bodies. Goal detection deliberately precedes the
  // collision passes, matching the live game's original order of operations.
  function step(bodies, dt, onImpact) {
    let ball;
    for (const body of bodies) {
      body.x += body.vx * dt; body.y += body.vy * dt;
      body.angle += body.vx * dt * .023;
      const speed = Math.hypot(body.vx, body.vy);
      const next = Math.max(0, speed - (body.team === -1 ? constants.BALL_FRICTION : constants.PUCK_FRICTION) * dt);
      const factor = speed > 0 ? next / speed : 0;
      body.vx *= factor; body.vy *= factor;
      if (body.team === -1) ball = body;
    }
    if (ball && ball.y > GT + ball.r && ball.y < GB - ball.r) {
      if (ball.x + ball.r < L) return { goal: 1, maxSpeed: 0 };
      if (ball.x - ball.r > R) return { goal: 0, maxSpeed: 0 };
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) collide(bodies[i], bodies[j], onImpact);
      }
      bodies.forEach(wall);
    }
    let maxSpeed = 0;
    for (const body of bodies) {
      const speed = Math.hypot(body.vx, body.vy);
      if (speed > constants.MAX_SPEED) {
        body.vx *= constants.MAX_SPEED / speed; body.vy *= constants.MAX_SPEED / speed;
      }
      maxSpeed = Math.max(maxSpeed, speed);
      if (speed < constants.STOP_SPEED) { body.vx = 0; body.vy = 0; }
    }
    return { goal: null, maxSpeed };
  }

  return Object.freeze({ constants, launch, step });
});
