(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./physics.js'));
  else root.FlickAI = factory(root.FlickPhysics);
})(globalThis, function (physics) {
  'use strict';
  if (!physics) throw new Error('FlickPhysics must be loaded before FlickAI.');
  const C = physics.constants;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clone = bodies => bodies.map(body => ({ ...body }));

  function segmentDistance(point, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    const t = length ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / length, 0, 1) : 0;
    return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
  }

  function createPlanner(pieces, ball, team, difficulty = 'medium', random = Math.random, options = {}) {
    if (team !== 0 && team !== 1) throw new RangeError('AI team must be 0 or 1.');
    const original = clone([...pieces.filter(piece => !piece.removed), ball]);
    for (const body of original) {
      if (!['x', 'y', 'vx', 'vy', 'r', 'mass'].every(key => Number.isFinite(body[key])) || body.r <= 0 || body.mass <= 0) {
        throw new TypeError('AI needs finite, valid physics bodies.');
      }
    }
    const startingBall = original[original.length - 1];
    const allowed = options.allowedNumbers ? new Set(options.allowedNumbers) : null;
    const allies = original.filter(piece => piece.team === team && Number.isFinite(piece.number) && (!allowed || allowed.has(piece.number)));
    if (!allies.length) throw new RangeError('AI has no playable pieces.');
    const level = ['low', 'medium', 'high'].includes(difficulty) ? difficulty : 'medium';
    const direction = team === 0 ? 1 : -1;
    const goalX = team === 0 ? C.R + ball.r : C.L - ball.r;
    const ownGoalX = team === 0 ? C.L : C.R;
    const centerY = (C.GT + C.GB) / 2;
    const sample = () => { const n = random(); return Number.isFinite(n) ? clamp(n, 0, 1) : .5; };

    // Favor nearby pieces approaching from behind the ball; the goalkeeper is
    // available but slightly less attractive than equally useful field players.
    const priority = piece => {
      const ahead = (piece.x - startingBall.x) * direction > 0 ? 170 : 0;
      const blockers = original.filter(other => other !== piece && other.team !== -1 &&
        segmentDistance(other, piece, startingBall) < other.r + piece.r - 3).length;
      return distance(piece, startingBall) + ahead + blockers * 80 + (piece.number === 1 ? 25 : 0);
    };
    allies.sort((a, b) => priority(a) - priority(b) || a.number - b.number);
    const candidates = [], keys = new Set();
    const add = (piece, angle, power) => {
      if (!Number.isFinite(angle) || !Number.isFinite(power)) return;
      power = clamp(power, .065, 1);
      const key = `${piece.number}:${angle.toFixed(5)}:${power.toFixed(3)}`;
      if (!keys.has(key)) { keys.add(key); candidates.push({ number: piece.number, angle, power }); }
    };
    const directAngle = piece => Math.atan2(startingBall.y - piece.y, startingBall.x - piece.x);
    const aimAtGoal = (piece, targetY) => {
      const dx = goalX - startingBall.x, dy = targetY - startingBall.y, length = Math.hypot(dx, dy) || 1;
      const impact = { x: startingBall.x - dx / length * (piece.r + ball.r - .05),
        y: startingBall.y - dy / length * (piece.r + ball.r - .05) };
      return Math.atan2(impact.y - piece.y, impact.x - piece.x);
    };

    if (level === 'low') {
      const piece = allies[Math.min(allies.length - 1, sample() > .78 ? 1 : 0)];
      // Error is introduced before simulation, never after choosing a safe shot.
      const error = (sample() - .5) * .17;
      add(piece, directAngle(piece) + error, .55 + sample() * .4);
      add(piece, directAngle(piece), .6);
    } else {
      // Every piece gets a direct contact trial at full power, including distant
      // interceptions. Then add gentler trials for controlled play.
      for (const piece of allies) for (const power of [1, .72, .48]) add(piece, directAngle(piece), power);
      const targets = level === 'high'
        ? [centerY, C.GT + ball.r + 8, C.GB - ball.r - 8, centerY - 25, centerY + 25]
        : [centerY, centerY - 37, centerY + 37];
      for (const piece of allies) for (const y of targets) for (const power of [1, .72]) add(piece, aimAtGoal(piece, y), power);
      if (level === 'high') {
        for (const piece of allies) {
          for (const wallY of [C.T + ball.r, C.B - ball.r]) {
            for (const power of [1, .88]) add(piece, aimAtGoal(piece, 2 * wallY - centerY), power);
          }
          for (const offset of [-.055, .055]) add(piece, directAngle(piece) + offset, 1);
        }
      }
    }

    const nearest = (bodies, target, side) => Math.min(Math.hypot(C.R - C.L, C.B - C.T), ...bodies.filter(p => p.team === side).map(p => distance(p, target) - p.r - target.r));
    const startNearest = nearest(original, startingBall, team);
    let index = 0, fallback = 0, best = null, bestValue = -Infinity, result = null;
    let evaluated = 0, simulatedSteps = 0;

    function evaluate(shot) {
      const bodies = clone(original), puck = bodies.find(p => p.team === team && p.number === shot.number);
      const virtualBall = bodies[bodies.length - 1];
      physics.launch(puck, shot.angle, shot.power);
      let settle = 0, stopped = false, goal = null, contacted = false, maxTravel = 0;
      for (let i = 0; i < 1800; i++) {
        const update = physics.step(bodies, C.DT);
        simulatedSteps++;
        maxTravel = Math.max(maxTravel, distance(virtualBall, startingBall));
        if (maxTravel > 1) contacted = true;
        if (update.goal !== null) { goal = update.goal; stopped = true; break; }
        settle = update.maxSpeed < C.STOP_SPEED ? settle + C.DT : 0;
        if (settle > C.SETTLE_TIME) { stopped = true; break; }
      }
      if (goal === team) return 100000;
      if (goal !== null) return -100000;
      // An unfinished trajectory is not accepted as a safe attack.
      if (!stopped) return -50000;
      const progress = (virtualBall.x - startingBall.x) * direction;
      const allyDistance = nearest(bodies, virtualBall, team);
      const opponentDistance = nearest(bodies, virtualBall, 1 - team);
      let value = (contacted ? 110 : -100) + progress * .48;
      value += (opponentDistance - allyDistance) * .09;
      value += (startNearest - allyDistance) * (contacted ? .04 : .3);
      value -= Math.abs(virtualBall.y - centerY) * .035;
      value -= shot.power * 3 + (shot.number === 1 ? 7 : 0);
      if (level === 'high') {
        const homeDistance = Math.abs(virtualBall.x - ownGoalX);
        const defenders = bodies.filter(p => p.team === team);
        let openRoutes = 0;
        for (const y of [centerY - 32, centerY, centerY + 32]) {
          const end = { x: ownGoalX, y };
          if (!defenders.some(p => segmentDistance(p, virtualBall, end) < p.r + virtualBall.r)) openRoutes++;
        }
        value -= openRoutes * Math.max(0, 1 - homeDistance / 560) * 65;
        const defendersBehind = defenders.filter(p => (virtualBall.x - p.x) * direction > 0).length;
        if (!defendersBehind) value -= 35;
      }
      return value;
    }

    return {
      step() {
        if (result) return result;
        const shot = candidates[index++];
        const value = evaluate(shot); evaluated++;
        if (value > bestValue) { bestValue = value; best = shot; }
        // If every attacking choice concedes, test a gentle move away from the
        // ball before accepting an own goal. Added lazily, one trial per frame.
        if (index === candidates.length && bestValue <= -50000 && fallback < allies.length) {
          const piece = allies[fallback++];
          add(piece, directAngle(piece) + Math.PI, .08);
          return null;
        }
        // Easy mode keeps its deliberate imprecision unless that choice would
        // immediately concede; medium/high stop once an exact goal is found.
        if (value === 100000 || (level === 'low' && value > -50000) || index === candidates.length) {
          result = Object.freeze({ ...best });
          return result;
        }
        return null;
      },
      get evaluated() { return evaluated; },
      get candidateCount() { return candidates.length; },
      get simulatedSteps() { return simulatedSteps; }
    };
  }

  return Object.freeze({ createPlanner });
});
