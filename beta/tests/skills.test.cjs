const { test } = require('node:test');
const assert = require('node:assert/strict');
const Physics = require('../physics.js');
const OriginalPhysics = require('../../physics.js');
const Skills = require('../skills.js');
const Roster = require('../roster.js');
const AI = require('../ai.js');

function fixture(ids = ['suya', 'fandui'], random = () => .99, enabled = true) {
  const pieces = ids.map((playerId, index) => ({ uid: `p${index}`, playerId, team: index % 2, number: Math.floor(index / 2) + 1,
    x: index % 2 ? 800 - Math.floor(index / 2) * 90 : 250 + Math.floor(index / 2) * 90,
    y: 210 + Math.floor(index / 2) * 85, vx: 0, vy: 0, r: 27, mass: 3, angle: 0 }));
  const ball = { x: 540, y: 300, vx: 0, vy: 0, r: 11, mass: 1.4, team: -1, angle: 0 };
  const scores = [0, 0], events = [];
  const session = Skills.createSession({ pieces, ball, scores, random, enabled, onEvent: event => events.push(event) });
  return { pieces, ball, scores, events, session };
}
function sequence(values, fallback = .99) { let index = 0; return () => values[index++] ?? fallback; }
function finishPlanner(planner) { for (let i = 0; i < 101; i++) { const shot = planner.step(); if (shot) return shot; } assert.fail('planner did not finish'); }

test('roster has exactly 4 forwards, 5 midfielders and 2 defenders, and valid unique lineups', () => {
  assert.equal(Roster.players.length, 11);
  for (const [role, count] of [['forward', 4], ['midfield', 5], ['defender', 2]]) assert.equal(Roster.players.filter(p => p.role === role).length, count);
  for (const lineup of Roster.defaultLineups) {
    assert.equal(lineup.length, 5); assert.equal(new Set(lineup).size, 5);
    lineup.forEach(id => assert(Roster.byId[id]?.asset.endsWith(`/${id}.png`)));
  }
  assert.deepEqual(Roster.defaultLineups[0], Roster.defaultLineups[1], 'defaults give both sides the same player options and passive stats');
});

test('normal mode has no skills or passive stat changes and preserves original physics', () => {
  const f = fixture(['haaland', 'fandui', 'suya', 'shuiye', 'kante', 'beilin'], () => 0, false);
  f.scores[1] = 2; f.session.beginTurn(0); f.session.beginShot(f.pieces[0], 1);
  f.pieces.forEach(p => { assert.equal(p.r, 27); assert.equal(p.launchScale, 1); assert.equal(p.frictionScale, 1); assert.equal(p.shield, false); });
  f.session.onContact(f.pieces[2], f.pieces[3]);
  assert(!f.pieces.some(p => p.removed || p.injured || p.charged)); assert.equal(f.events.length, 0);
  const actual = [...f.pieces, f.ball], expected = structuredClone(actual);
  Physics.launch(actual[0], .3, .8); OriginalPhysics.launch(expected[0], .3, .8);
  for (let i = 0; i < 420; i++) assert.deepEqual(Physics.step(actual, 1 / 180), OriginalPhysics.step(expected, 1 / 180));
  assert.deepEqual(actual, expected);
});

test('Suya rolls once per opponent pair per shot and succeeds only below 4%', () => {
  let calls = 0;
  const f = fixture(['suya', 'qizu'], () => { calls++; return calls === 1 ? .04 : .01; });
  f.session.beginShot(f.pieces[0], 1);
  for (let i = 0; i < 5; i++) f.session.onContact(...f.pieces);
  assert.equal(calls, 1); assert.equal(f.pieces[1].removed, false);
  f.session.finishShot(); f.session.beginShot(f.pieces[0], 1); f.session.onContact(...f.pieces);
  assert.equal(f.pieces[1].removed, true); assert.equal(f.pieces[0].removed, true); assert.equal(f.pieces[0].biteUsed, true);
});

test('Suya spends one proc per match and self-red has a strict 50% boundary', () => {
  const f = fixture(['suya', 'qizu', 'modi', 'beilin'], sequence([.0399, .5, 0, 0]));
  f.session.beginShot(f.pieces[0], 1); f.session.onContact(f.pieces[0], f.pieces[1]);
  assert(f.pieces[1].removed); assert(!f.pieces[0].removed);
  f.session.finishShot(); f.session.clearRound(); f.session.beginShot(f.pieces[0], 1);
  f.session.onContact(f.pieces[0], f.pieces[3]); assert(!f.pieces[3].removed);
  assert.equal(f.events.filter(e => e.kind === 'removal').length, 1);
});

test('Fan shield consumes once, persists across goals, and prevents both removal and injury', () => {
  const f = fixture(['suya', 'fandui', 'shuiye', 'qizu'], sequence([0, .99, 0]));
  const [suya, fan, shuiye] = f.pieces;
  f.session.beginShot(suya, 1); f.session.onContact(suya, fan);
  assert(!fan.shield); assert(!fan.removed); assert(suya.biteUsed);
  f.session.finishShot(); f.session.clearRound(); assert(!fan.shield);
  f.session.beginShot(shuiye, 1); f.session.onContact(shuiye, fan); assert.equal(fan.injured, 2);
  const g = fixture(['shuiye', 'fandui'], () => 0);
  g.session.beginShot(g.pieces[0], 1); g.session.onContact(...g.pieces);
  assert(!g.pieces[1].shield); assert.equal(g.pieces[1].injured, 0);
});

test('injury lasts two complete own turns, does not refresh, and reduces motion immediately', () => {
  const f = fixture(['shuiye', 'kante'], () => 0), target = f.pieces[1];
  f.session.beginTurn(1); f.session.beginShot(target, .8); target.vx = 100;
  f.session.onContact(...f.pieces);
  assert.equal(target.injured, 2); assert.equal(target.vx, 30);
  assert.equal(target.launchScale, .3); assert(Math.abs(target.frictionScale - .3 / 1.15) < 1e-12);
  f.session.finishShot(); f.session.endTurn(1); assert.equal(target.injured, 2, 'partial turn is not consumed');
  f.session.beginTurn(1); f.session.beginShot(target, .8); f.session.onContact(...f.pieces);
  f.session.finishShot(); f.session.endTurn(1); assert.equal(target.injured, 1);
  f.session.clearRound(); assert.equal(target.injured, 1);
  f.session.beginTurn(1); f.session.beginTurn(1, { bonus: true }); f.session.endTurn(1);
  assert.equal(target.injured, 0); assert.equal(target.launchScale, 1);
  assert.equal(f.events.filter(e => e.kind === 'injury').length, 1); assert.equal(f.events.filter(e => e.kind === 'recovery').length, 1);
  const threshold = fixture(['shuiye', 'qizu'], () => .05);
  threshold.session.beginShot(threshold.pieces[0], 1); threshold.session.onContact(...threshold.pieces);
  assert.equal(threshold.pieces[1].injured, 0, 'injury activates strictly below 5%');
});

test('Meixi charges only on normal own turns, bonus is same piece once, and never rerolls', () => {
  let calls = 0;
  const f = fixture(['meixi', 'qizu'], () => { calls++; return .1499; }), meixi = f.pieces[0];
  f.session.beginTurn(1); assert.equal(calls, 0);
  f.session.beginTurn(0); assert(meixi.charged); assert.equal(calls, 1);
  f.session.beginShot(meixi, .8); assert(!meixi.charged);
  assert.equal(f.session.finishShot(), meixi); assert.equal(f.session.finishShot(), null);
  f.session.beginTurn(0, { bonus: true }); assert.equal(calls, 1);
  f.session.beginShot(meixi, .8); assert.equal(f.session.finishShot(), null);
  const noCharge = fixture(['meixi', 'qizu'], () => .15); noCharge.session.beginTurn(0); assert(!noCharge.pieces[0].charged);
  f.session.beginTurn(0); f.session.beginShot(meixi, 1); Object.assign(f.ball, { x: 1030, y: 300 });
  assert.equal(f.session.finishShot(), null, 'a goal ends the round without advertising an unusable bonus');
  Object.assign(f.ball, { x: 540, y: 300 }); f.session.beginTurn(0); f.session.beginShot(meixi, 1);
  const bonusEvents = f.events.filter(e => e.kind === 'bonus').length;
  assert.equal(f.session.finishShot({ allowExtra: false }), null);
  assert.equal(f.events.filter(e => e.kind === 'bonus').length, bonusEvents, 'goal/forfeit cleanup suppresses the bonus announcement');
});

test('AB mass is exactly 1:1 for this shot and restores on settle, goal, and subsequent shot', () => {
  const f = fixture(['abluo', 'qizu'], sequence([.2999, .3, 0]));
  f.session.beginShot(f.pieces[0], 1); assert.equal(f.ball.mass, f.pieces[0].mass);
  f.session.finishShot({ allowExtra: false }); assert.equal(f.ball.mass, 1.4);
  f.session.beginShot(f.pieces[0], 1); assert.equal(f.ball.mass, 1.4);
  f.session.beginShot(f.pieces[0], 1); assert.equal(f.ball.mass, 3);
  f.session.clearRound(); assert.equal(f.ball.mass, 1.4);
});

test('Modi finds an advanced teammate safely, respects bounds and handles no teammate', () => {
  const f = fixture(['modi', 'qizu', 'kante', 'beilin', 'haaland'], () => .0799);
  f.pieces[2].x = 600; f.pieces[4].x = 900;
  f.session.beginShot(f.pieces[0], .8);
  assert.equal(f.events.find(e => e.kind === 'teleport').otherUid, f.pieces[4].uid);
  const C = Physics.constants;
  assert(f.ball.x >= C.L + f.ball.r && f.ball.x <= C.R - f.ball.r);
  assert(f.ball.y >= C.T + f.ball.r && f.ball.y <= C.B - f.ball.r);
  f.pieces.forEach(p => assert(Math.hypot(p.x - f.ball.x, p.y - f.ball.y) >= p.r + f.ball.r));
  const empty = fixture(['modi', 'qizu'], () => 0), before = structuredClone(empty.ball);
  assert.doesNotThrow(() => empty.session.beginShot(empty.pieces[0], 1)); assert.deepEqual(empty.ball, before);
  const miss = fixture(['modi', 'qizu', 'kante'], () => .08); miss.session.beginShot(miss.pieces[0], 1); assert.equal(miss.events.length, 0);
});

test('Dingding and Qizu modify only their own first ball contact, once', () => {
  const f = fixture(['dingding', 'qizu', 'kante'], () => .1999);
  f.session.beginShot(f.pieces[0], .8); f.ball.vx = 100;
  f.session.onContact(f.pieces[2], f.ball); assert.equal(f.ball.vx, 100);
  f.session.onContact(f.pieces[0], f.ball); assert.equal(f.ball.vx, 118);
  f.session.onContact(f.ball, f.pieces[0]); assert.equal(f.ball.vx, 118);
  f.session.finishShot(); f.session.beginShot(f.pieces[1], .5); f.ball.vx = 100;
  f.session.onContact(f.pieces[1], f.ball); assert.equal(f.ball.vx, 50);
  f.session.onContact(f.pieces[1], f.ball); assert.equal(f.ball.vx, 50);
  f.session.finishShot(); f.session.beginShot(f.pieces[1], .5001); f.ball.vx = 100;
  f.session.onContact(f.pieces[1], f.ball); assert.equal(f.ball.vx, 100);
  const miss = fixture(['dingding', 'qizu'], () => .2); miss.session.beginShot(miss.pieces[0], 1); miss.ball.vx = 100; miss.session.onContact(miss.pieces[0], miss.ball); assert.equal(miss.ball.vx, 100);
});

test('passive tradeoffs and trailing-score boost update without stacking', () => {
  const f = fixture(['haaland', 'fandui', 'kante', 'beilin']);
  assert.equal(f.pieces[0].r, 32.4); assert.equal(f.pieces[0].launchScale, .9);
  assert(Math.abs(f.pieces[1].r - 29.7) < 1e-12); assert.equal(f.pieces[1].launchScale, .95);
  assert.equal(f.pieces[2].frictionScale, 1 / 1.15);
  f.scores[0] = 1; f.session.beginTurn(1); assert.equal(f.pieces[3].launchScale, 1.12);
  f.session.beginTurn(1); assert.equal(f.pieces[3].launchScale, 1.12);
  f.scores[1] = 1; f.session.refresh(); assert.equal(f.pieces[3].launchScale, 1);
});

test('physics contact hook ignores separating overlaps and excludes removed bodies immediately', () => {
  const f = fixture(['suya', 'qizu', 'kante'], sequence([0, .99]));
  const [a, b, c] = f.pieces;
  Object.assign(a, { x: 300, y: 300, vx: -40 }); Object.assign(b, { x: 350, y: 300, vx: 40 });
  let contacts = 0;
  Physics.step([a, b], 1 / 180, null, () => contacts++); assert.equal(contacts, 0);
  Object.assign(a, { x: 300, y: 300, vx: 120 }); Object.assign(b, { x: 352, y: 300, vx: 0 }); Object.assign(c, { x: 404, y: 300 });
  f.session.beginShot(a, 1);
  Physics.step([a, b, c], 1 / 180, null, (left, right) => { contacts++; f.session.onContact(left, right); });
  assert(b.removed); assert.equal(b.vx, 0); assert.equal(c.vx, 0);
  const position = { x: b.x, y: b.y }; b.vx = 100;
  Physics.step([a, b, c], 1 / 180); assert.equal(b.x, position.x); assert.equal(b.y, position.y);
  assert.equal(Physics.launch(b, 0, 1), false);
});

test('AI skips removals, respects bonus-piece restriction and passives, and handles absent opponents', () => {
  const f = fixture(['kante', 'qizu', 'haaland', 'beilin']);
  f.pieces[0].removed = true;
  const original = JSON.stringify(f.pieces);
  const shot = finishPlanner(AI.createPlanner(f.pieces, f.ball, 0, 'high', () => .5, { allowedNumbers: [2] }));
  assert.equal(shot.number, 2); assert.equal(JSON.stringify(f.pieces), original);
  f.pieces.filter(p => p.team === 1).forEach(p => p.removed = true);
  const last = finishPlanner(AI.createPlanner(f.pieces, f.ball, 0, 'medium')); assert(Number.isFinite(last.angle));
  f.pieces[2].removed = true; assert.throws(() => AI.createPlanner(f.pieces, f.ball, 0, 'high'), RangeError);
});
