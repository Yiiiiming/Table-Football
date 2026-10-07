const { test } = require('node:test');
const assert = require('node:assert/strict');
const Physics = require('../physics.js');
const Skills = require('../skills.js');

function piece(id, team = 0) { return { playerId: id, number: 1, team, x: 180, y: 300, vx: 0, vy: 0, r: 27, mass: 3, angle: 0 }; }
function ball() { return { team: -1, x: 540, y: 300, vx: 0, vy: 0, r: 11, mass: 1.4, angle: 0 }; }
function rng(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
function glide(p) {
  const x = p.x; Physics.launch(p, 0, .6);
  for (let i = 0; i < 1800 && Math.hypot(p.vx, p.vy) > 0; i++) Physics.step([p], 1 / 180);
  return p.x - x;
}

test('passive movement changes match intended travel tradeoffs under actual physics', t => {
  const plain = piece('qizu'), tireless = piece('kante'), injured = piece('qizu');
  Skills.createSession({ pieces: [plain], ball: ball(), scores: [0, 0] });
  Skills.createSession({ pieces: [tireless], ball: ball(), scores: [0, 0] });
  const hurt = Skills.createSession({ pieces: [injured], ball: ball(), scores: [0, 0] }); injured.injured = 2; hurt.refresh();
  const base = glide(plain), kante = glide(tireless), injury = glide(injured);
  assert(Math.abs(kante / base - 1.15) < .01);
  assert(Math.abs(injury / base - .3) < .01);
  t.diagnostic(`60% power free slide: baseline ${base.toFixed(2)}px, Kante ${kante.toFixed(2)}px (${(kante / base).toFixed(3)}x), injured ${injury.toFixed(2)}px (${(injury / base).toFixed(3)}x)`);
});

test('seeded skill sample reports rates and per-match limits without asserting statistical certainty', t => {
  const random = rng(20261006), runs = 1000;
  const counts = { bite: 0, selfRed: 0, cannon: 0, charge: 0, pass: 0, through: 0, injury: 0 };
  for (let i = 0; i < runs; i++) {
    for (const [id, key] of [['suya', 'bite'], ['abluo', 'cannon'], ['meixi', 'charge'], ['modi', 'pass'], ['dingding', 'through'], ['shuiye', 'injury']]) {
      const actor = piece(id), opponent = { ...piece('qizu', 1), x: 800, uid: 'opponent' }, mate = { ...piece('kante'), x: 650, y: 400, number: 2 };
      const white = ball(), events = [], session = Skills.createSession({ pieces: [actor, opponent, mate], ball: white, scores: [0, 0], random, onEvent: e => events.push(e) });
      session.beginTurn(0); const charged = actor.charged; session.beginShot(actor, .8); session.onContact(actor, opponent);
      const happened = key === 'bite' ? actor.biteUsed : key === 'cannon' ? white.mass === actor.mass : key === 'charge' ? charged : key === 'pass' ? events.some(e => e.kind === 'teleport') : key === 'through' ? events.some(e => e.kind === 'armed') : opponent.injured > 0;
      if (happened) counts[key]++;
      if (key === 'bite' && actor.removed) counts.selfRed++;
      // Repeated solver contacts must not multiply a single pair's chances.
      const eventCount = events.length; for (let n = 0; n < 6; n++) session.onContact(actor, opponent);
      assert.equal(events.length, eventCount);
      session.finishShot(); session.clearRound(); assert.equal(white.mass, 1.4);
    }
  }
  t.diagnostic(`One seeded run of ${runs} independent opportunities per skill: ${JSON.stringify(counts)}. These are observed sample counts, not guarantees.`);
});
