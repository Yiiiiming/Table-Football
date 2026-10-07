(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./physics.js'), require('./roster.js'));
  else root.FlickSkills = factory(root.FlickPhysics, root.FlickRoster);
})(globalThis, function (physics, roster) {
  'use strict';
  const C = physics.constants;
  const rates = Object.freeze({ suya: .04, abluo: .30, meixi: .15, modi: .08, dingding: .20, shuiye: .05 });

  function createSession({ pieces, ball, scores, onEvent = () => {}, random = Math.random, enabled = true }) {
    // A new match/classic session must not inherit an unfinished mass skill.
    if (Number.isFinite(ball.massMatchBase) && ball.massMatchBase > 0) ball.mass = ball.massMatchBase;
    delete ball.massMatchTeam; delete ball.massMatchBase;
    const baseBallMass = ball.mass;
    const bases = new Map();
    for (const piece of pieces) {
      piece.uid = piece.uid || `${piece.team}:${piece.number}`;
      bases.set(piece.uid, { r: piece.r, mass: piece.mass });
      Object.assign(piece, { removed: false, injured: 0, charged: false, shield: enabled && piece.playerId === 'fandui', biteUsed: false,
        rescuesLeft: enabled && piece.playerId === 'navas' ? 2 : 0, launchScale: 1, frictionScale: 1 });
    }
    let shot = null, injuryEligible = new Set();
    const roll = chance => { const n = random(); return Number.isFinite(n) && n >= 0 && n < chance; };
    const name = piece => roster.byId[piece.playerId]?.name || `球员${piece.number}`;
    function emit(title, text, kind, piece, other) {
      onEvent({ title, text, kind, pieceUid: piece?.uid || null, otherUid: other?.uid || null });
    }
    function restoreBallMass() {
      ball.mass = baseBallMass;
      delete ball.massMatchTeam; delete ball.massMatchBase;
    }
    function refresh() {
      for (const piece of pieces) {
        const base = bases.get(piece.uid);
        piece.r = base.r; piece.mass = base.mass;
        piece.launchScale = 1; piece.frictionScale = 1;
        if (!enabled) continue;
        if (piece.playerId === 'haaland') { piece.r *= 1.2; piece.launchScale *= .9; }
        if (piece.playerId === 'fandui') { piece.r *= 1.1; piece.launchScale *= .95; }
        if (piece.playerId === 'kante') piece.frictionScale /= 1.15;
        if (piece.playerId === 'beilin' && scores[piece.team] < scores[1 - piece.team]) piece.launchScale *= 1.12;
        if (piece.injured > 0) { piece.launchScale *= .3; piece.frictionScale *= .3; }
      }
    }
    function blockStatus(target, actor) {
      if (!target.shield) return false;
      target.shield = false;
      emit('钢铁屏障', `${name(target)}的护盾挡住了${name(actor)}的技能。`, 'shield', target, actor);
      return true;
    }
    function remove(target, actor, selfRed = false) {
      if (target.removed || blockStatus(target, actor)) return;
      target.removed = true; target.charged = false; target.vx = 0; target.vy = 0;
      emit(selfRed ? '红牌罚下' : '咬住不放', selfRed ? `${name(target)}也吃到红牌，本场无法继续出场。` : `${name(target)}被${name(actor)}罚下，本场无法继续出场。`, 'removal', target, actor);
    }
    function injure(target, actor) {
      if (target.removed || target.injured > 0 || blockStatus(target, actor)) return;
      target.injured = 2;
      target.vx *= .3; target.vy *= .3;
      // If a piece is injured during its own ongoing turn, that partial turn
      // does not consume one of the two subsequent complete injured turns.
      injuryEligible.delete(target.uid);
      refresh();
      emit('强硬拦截', `${name(target)}受伤，接下来2个完整己方回合只保留30%的起速与滑行距离。`, 'injury', actor, target);
    }
    function teleport(actor) {
      const direction = actor.team === 0 ? 1 : -1;
      const teammates = pieces.filter(p => !p.removed && p.team === actor.team && p !== actor)
        .sort((a, b) => direction * (b.x - a.x) || a.number - b.number);
      for (const teammate of teammates) {
        const gap = teammate.r + ball.r + 4;
        for (const offset of [0, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4]) {
          const angle = (direction === 1 ? 0 : Math.PI) + offset;
          const x = teammate.x + Math.cos(angle) * gap, y = teammate.y + Math.sin(angle) * gap;
          if (x < C.L + ball.r + 2 || x > C.R - ball.r - 2 || y < C.T + ball.r + 2 || y > C.B - ball.r - 2) continue;
          if (pieces.some(p => !p.removed && Math.hypot(p.x - x, p.y - y) < p.r + ball.r + 2)) continue;
          Object.assign(ball, { x, y, vx: 0, vy: 0 });
          emit('魔法传球', `${name(actor)}把白球传到了${name(teammate)}身边。`, 'teleport', actor, teammate);
          return true;
        }
      }
      return false;
    }
    function finishShot({ allowExtra = true } = {}) {
      restoreBallMass();
      if (!shot) return null;
      const goal = ball.y > C.GT + ball.r && ball.y < C.GB - ball.r &&
        (ball.x + ball.r < C.L || ball.x - ball.r > C.R);
      const extra = allowExtra && shot.extra && !shot.piece.removed && !goal ? shot.piece : null;
      shot = null;
      if (extra) emit('灵巧过人', `球停稳了，${name(extra)}还能再出手一次。`, 'bonus', extra);
      return extra;
    }
    function beginTurn(team, { bonus = false } = {}) {
      if (bonus) { refresh(); return; }
      finishShot({ allowExtra: false });
      injuryEligible = new Set(pieces.filter(p => p.team === team && !p.removed && p.injured > 0).map(p => p.uid));
      for (const piece of pieces) {
        piece.charged = false;
        if (enabled && !piece.removed && piece.team === team && piece.playerId === 'meixi' && roll(rates.meixi)) {
          piece.charged = true;
          emit('灵巧过人', `${name(piece)}亮起金框！这回合用他出手，球停稳后还能再出手一次。`, 'charge', piece);
        }
      }
      refresh();
    }
    function beginShot(piece, power) {
      // Clear the old shot without carrying a bonus into a second shot.
      restoreBallMass();
      shot = null;
      if (!piece || piece.removed || !pieces.includes(piece)) return false;
      refresh();
      shot = { piece, pairs: new Set(), extra: enabled && piece.playerId === 'meixi' && piece.charged, ballEffect: null };
      piece.charged = false;
      if (!enabled) return true;
      if (piece.playerId === 'abluo' && roll(rates.abluo)) {
        const opponent = pieces.filter(p => !p.removed && p.team === 1 - piece.team)
          .sort((a, b) => Math.hypot(a.x - ball.x, a.y - ball.y) - Math.hypot(b.x - ball.x, b.y - ball.y))[0];
        if (opponent) {
          ball.mass = opponent.mass; ball.massMatchTeam = 1 - piece.team; ball.massMatchBase = baseBallMass;
          emit('重炮轰门', '本次出手中，白球碰到对方球员时，会按与他相同的质量计算碰撞。', 'mass', piece);
        }
      }
      if (piece.playerId === 'modi' && roll(rates.modi)) teleport(piece);
      if (piece.playerId === 'dingding' && roll(rates.dingding)) {
        shot.ballEffect = 'boost';
        emit('精准直塞', '丁丁本杆首次触球将使白球提速18%。', 'armed', piece);
      }
      if (piece.playerId === 'qizu' && power <= .5) shot.ballEffect = 'control';
      return true;
    }
    function onTouch(a, b) {
      if (!enabled || !shot || a.removed || b.removed || a.team === -1 || b.team === -1 || a.team === b.team) return;
      for (const [actor, target] of [[a, b], [b, a]]) {
        if (actor.removed || target.removed || actor.playerId !== 'suya' || actor.biteUsed) continue;
        const key = `bite:${actor.uid}:${target.uid}`;
        if (shot.pairs.has(key)) continue;
        shot.pairs.add(key);
        if (roll(rates.suya)) {
          actor.biteUsed = true; remove(target, actor);
          if (roll(.5)) remove(actor, actor, true);
        }
      }
    }
    function onContact(a, b) {
      // Compatibility for direct callers; the shared pair set deduplicates a
      // touch already delivered by the pre-impulse physics hook.
      onTouch(a, b);
      if (!enabled || !shot || a.removed || b.removed) return;
      const soccerBall = a.team === -1 ? a : b.team === -1 ? b : null;
      if (soccerBall) {
        const player = a === soccerBall ? b : a;
        if (player === shot.piece && shot.ballEffect) {
          const boost = shot.ballEffect === 'boost'; shot.ballEffect = null;
          soccerBall.vx *= boost ? 1.18 : .5; soccerBall.vy *= boost ? 1.18 : .5;
          emit(boost ? '精准直塞' : '大师控球', boost ? '白球速度提高18%。' : '白球速度降低50%，方便控制下一落点。', boost ? 'boost' : 'control', player);
        }
        return;
      }
      if (a.team === b.team) return;
      for (const [actor, target] of [[a, b], [b, a]]) {
        if (actor.removed || target.removed) continue;
        if (actor.playerId === 'shuiye' && !target.injured) {
          const key = `injury:${actor.uid}:${target.uid}`;
          if (shot.pairs.has(key)) continue;
          shot.pairs.add(key);
          if (roll(rates.shuiye)) injure(target, actor);
        }
      }
    }
    function beforeStep() {
      // Only live shots can trigger the keeper; an already crossed goal line
      // is deliberately ineligible even before the normal scoring check.
      if (!enabled || !shot || ball.x < C.L || ball.x > C.R || ball.y < C.GT - 30 || ball.y > C.GB + 30) return false;
      for (const keeper of pieces) {
        if (keeper.removed || keeper.playerId !== 'navas' || keeper.rescuesLeft <= 0) continue;
        const distance = keeper.team === 0 ? ball.x - C.L : C.R - ball.x;
        if (distance > 110) continue;
        const x = keeper.team === 0 ? C.L + (C.R - C.L) / 4 : C.R - (C.R - C.L) / 4;
        const upper = C.T + ball.r + 4, lower = C.B - ball.r - 4;
        const sides = ball.y <= (C.T + C.B) / 2 ? [upper, lower] : [lower, upper];
        for (const side of sides) {
          const towardMiddle = side === upper ? 1 : -1;
          for (const inward of [0, 40, 80]) {
            for (const offset of [0, 40, -40, 80, -80]) {
              const targetX = x + offset, targetY = side + inward * towardMiddle;
              if (targetX < C.L + ball.r + 4 || targetX > C.R - ball.r - 4 || targetY < upper || targetY > lower) continue;
              if (pieces.some(p => !p.removed && Math.hypot(p.x - targetX, p.y - targetY) < p.r + ball.r + 4)) continue;
              Object.assign(ball, { x: targetX, y: targetY, vx: 0, vy: 0 });
              keeper.rescuesLeft--;
              emit('海底捞月', `${name(keeper)}救下门前险球，把白球送到了己方边线附近。本场还可发动${keeper.rescuesLeft}次。`, 'rescue', keeper);
              return true;
            }
          }
        }
      }
      return false;
    }
    function endTurn(team) {
      for (const piece of pieces) {
        if (piece.team !== team) continue;
        piece.charged = false;
        if (piece.injured > 0 && injuryEligible.has(piece.uid)) {
          piece.injured--;
          if (!piece.injured) emit('伤势恢复', `${name(piece)}已恢复正常行动。`, 'recovery', piece);
        }
      }
      injuryEligible.clear(); refresh();
    }
    function clearRound() {
      shot = null; restoreBallMass();
      for (const piece of pieces) piece.charged = false;
      refresh();
    }
    refresh();
    return Object.freeze({ beginTurn, beginShot, onTouch, onContact, beforeStep, finishShot, endTurn, clearRound, refresh });
  }
  return Object.freeze({ rates, createSession });
});
