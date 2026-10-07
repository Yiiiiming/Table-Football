const { test } = require('node:test');
const assert = require('node:assert/strict');
const Roster = require('../roster.js');
const Physics = require('../physics.js');
const Search = require('../simulate-formations.cjs');

test('starting presets retain room for enlarged players and keep every goal physically open', () => {
  for (const formation of Roster.formations) {
    assert.equal(formation.positions.length, 5);
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
      const [x, y] = formation.positions[i], [otherX, otherY] = formation.positions[j];
      assert(Math.hypot(x - otherX, y - otherY) > 2 * 27 * 1.2, `${formation.id} overlaps enlarged discs`);
    }
  }
  for (const team of [0, 1]) {
    const white = { team: -1, x: team === 0 ? 1010 : 70, y: 300, vx: team === 0 ? 200 : -200,
      vy: 0, r: 11, mass: 1.4, angle: 0 };
    assert.equal(Physics.step([white], .2).goal, team, 'there is no first-shot exception or closed goal');
  }
});

test('the search reproduces an old precise Kante opening goal and the revised formation blocks it', () => {
  const old = { id: 'old-balanced', positions: [[130, 300], [270, 240], [270, 360], [423, 180], [423, 420]] };
  const angle = .8809588547012308;
  assert.equal(Search.simulate(old, old, 0, 3, 'kante', angle, 1).goal, 0);
  for (const attack of Roster.formations) for (const defense of Roster.formations) for (const team of [0, 1]) {
    assert.equal(Search.simulate(attack, defense, team, 3, 'kante', team ? Math.PI - angle : angle, 1).goal, null);
  }
});

test('all preset matchups withstand the bounded opening regression grid on both sides', t => {
  const report = Search.sweep({ profiles: ['classic', 'kante', 'dingding-proc', 'beilin-behind', 'modi-proc'],
    spread: 18, increment: 6, powers: [.75, 1], firstPerPair: true });
  assert.equal(report.failures, 0, JSON.stringify(report.results.filter(pair => pair.goals.length)));
  t.diagnostic(`${report.shots} deterministic first-shot samples, all preset pairs, both ends, five active slots; finite regression coverage only.`);
});
