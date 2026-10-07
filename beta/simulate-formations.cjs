// Read-only opening-shot search. A finite sweep is regression evidence, not a
// mathematical proof that every possible continuous-angle shot is impossible.
const Physics = require('./physics.js');
const Skills = require('./skills.js');
const Roster = require('./roster.js');
const C = Physics.constants;
const neutral = ['qizu', 'meixi', 'beilin', 'modi', 'dingding'];
const profiles = ['classic', 'qizu', 'haaland', 'fandui', 'kante', 'beilin-behind', 'abluo-proc', 'dingding-proc', 'modi-proc', 'suya-proc', 'shuiye-proc', 'navas'];

function makeFixture(attack, defense, team, slot, profile, options = {}) {
  const id = profile.split('-')[0], enabled = profile !== 'classic';
  const own = neutral.filter(p => p !== id); own.splice(slot, 0, enabled ? id : 'navas');
  const enemy = [...neutral];
  if (options.enlarged) { enemy[options.enlarged[0]] = 'haaland'; enemy[options.enlarged[1]] = 'fandui'; }
  if (options.passiveSuya) (options.passiveSuya.side === 'own' ? own : enemy)[options.passiveSuya.slot] = 'suya';
  const pieces = [];
  for (let side = 0; side < 2; side++) {
    const formation = side === team ? attack : defense;
    formation.positions.forEach(([x, y], index) => pieces.push({
      x: side ? C.W - x : x, y, vx: 0, vy: 0, r: 27, mass: 3, angle: 0,
      team: side, number: index + 1, uid: `${side}:${index + 1}`, playerId: (side === team ? own : enemy)[index]
    }));
  }
  const ball = { x: C.W / 2, y: C.H / 2, vx: 0, vy: 0, r: 11, mass: 1.4, angle: 0, team: -1 };
  const scores = [0, 0]; if (profile === 'beilin-behind') scores[1 - team] = 1;
  let calls = 0, contactCalls = 0, contacts = false;
  const random = () => {
    if (contacts && options.passiveSuya) return contactCalls++ % 2 && !options.passiveSuya.selfRed ? .99 : 0;
    calls++; return profile.endsWith('-proc') && calls === 1 ? 0 : .99;
  };
  const events = [];
  const session = Skills.createSession({ pieces, ball, scores, enabled, random,
    onEvent: event => { if (options.captureEvents) events.push(event.kind); } });
  const actor = pieces.find(p => p.team === team && p.number === slot + 1);
  return { pieces, ball, actor, session, events, startContacts() { contacts = true; } };
}

function simulate(attack, defense, team, slot, profile, angle, power, options = {}) {
  const f = makeFixture(attack, defense, team, slot, profile, options);
  f.session.beginShot(f.actor, power); Physics.launch(f.actor, angle, power);
  f.startContacts();
  const bodies = [...f.pieces, f.ball];
  let steps = 0;
  for (; steps < 1800; steps++) {
    f.session.beforeStep();
    const update = Physics.step(bodies, C.DT, null, f.session.onContact, f.session.onTouch);
    if (update.goal !== null) return { goal: update.goal, steps, ball: { x: f.ball.x, y: f.ball.y }, events: options.captureEvents ? f.events : undefined };
    if (update.maxSpeed < C.STOP_SPEED) return { goal: null, steps, events: options.captureEvents ? f.events : undefined };
  }
  throw new Error('Opening shot did not settle');
}

function candidates(attack, defense, team, slot, profile, options = {}) {
  const f = makeFixture(attack, defense, team, slot, profile, options);
  f.session.beginShot(f.actor, 1);
  const { actor, ball } = f, result = [], seen = new Set();
  const powers = options.powers || [.5, .7, .85, 1];
  const add = angle => {
    for (const power of powers) {
      const key = angle.toFixed(7) + ':' + power;
      if (!seen.has(key)) { seen.add(key); result.push({ angle, power }); }
    }
  };
  const direct = Math.atan2(ball.y - actor.y, ball.x - actor.x);
  const spread = options.spread ?? 24, increment = options.increment ?? 2;
  for (let degrees = -spread; degrees <= spread; degrees += increment) add(direct + degrees * Math.PI / 180);
  const goalX = team === 0 ? C.R + ball.r : C.L - ball.r;
  const targets = [C.GT + ball.r + 1, 260, 280, 300, 320, 340, C.GB - ball.r - 1,
    2 * (C.T + ball.r) - 300, 2 * (C.B - ball.r) - 300];
  for (const targetY of targets) {
    const dx = goalX - ball.x, dy = targetY - ball.y, distance = Math.hypot(dx, dy);
    const x = ball.x - dx / distance * (actor.r + ball.r - .05), y = ball.y - dy / distance * (actor.r + ball.r - .05);
    add(Math.atan2(y - actor.y, x - actor.x));
  }
  // Broad angles also probe indirect puck collisions and side-wall routes.
  if (options.broad) for (let degrees = -180; degrees < 180; degrees += 15) add(degrees * Math.PI / 180);
  return result;
}

function sweep(options = {}) {
  const formations = options.formations || Roster.formations, results = [], started = performance.now();
  let shots = 0, failures = 0;
  for (const attack of formations.filter(f => !options.attackIds || options.attackIds.includes(f.id))) for (const defense of formations) for (const team of options.teams || [0, 1]) {
    const pair = { attack: attack.id, defense: defense.id, team, enlarged: options.enlarged,
      passiveSuya: options.passiveSuya, shots: 0, goals: [], events: options.captureEvents ? {} : undefined };
    profilesLoop: for (const profile of options.profiles || profiles) for (let slot = 0; slot < 5; slot++) {
      if (options.passiveSuya?.side === 'own' && options.passiveSuya.slot === slot) continue;
      if (options.passiveSuya?.side === 'own' && profile.startsWith('suya')) continue;
      for (const candidate of candidates(attack, defense, team, slot, profile, options)) {
        const result = simulate(attack, defense, team, slot, profile, candidate.angle, candidate.power, options);
        shots++; pair.shots++;
        if (result.events) for (const kind of result.events) pair.events[kind] = (pair.events[kind] || 0) + 1;
        if (result.goal !== null) {
          failures++; pair.goals.push({ profile, slot: slot + 1, ...candidate, ...result });
          if (options.firstPerPair) break profilesLoop;
        }
      }
    }
    results.push(pair); if (options.onPair) options.onPair(pair);
  }
  return { shots, failures, elapsedMs: performance.now() - started, formations: formations.map(f => ({ id: f.id, positions: f.positions })), results };
}

if (require.main === module) {
  const { Worker, isMainThread, workerData, parentPort } = require('node:worker_threads');
  if (!isMainThread) {
    parentPort.postMessage(sweep(workerData));
  } else {
  const options = { profiles: process.env.PROFILES?.split(','), increment: Number(process.env.INCREMENT || 2),
    spread: Number(process.env.SPREAD || 24), firstPerPair: process.env.FIRST === '1', broad: process.env.BROAD === '1',
    teams: process.env.TEAMS?.split(',').map(Number), powers: process.env.POWERS?.split(',').map(Number),
    enlarged: process.env.ENLARGED?.split(',').map(Number),
    attackIds: process.env.ATTACK?.split(','), captureEvents: process.env.CAPTURE === '1', passiveSuya: process.env.PASSIVE_SUYA ? {
      side: process.env.PASSIVE_SUYA.split(':')[0], slot: Number(process.env.PASSIVE_SUYA.split(':')[1]),
      selfRed: process.env.PASSIVE_SUYA.split(':')[2] === 'red' } : undefined };
  if (Number(process.env.WORKERS || 1) > 1) {
    const sizeCases = process.env.ALL_SIZES === '1' ? Array.from({ length: 5 }, (_, first) =>
      Array.from({ length: 5 }, (_, second) => [first, second]).filter(pair => pair[0] !== pair[1])).flat() : [options.enlarged];
    const passiveCases = process.env.ALL_PASSIVE === '1' ? ['own', 'enemy'].flatMap(side => [false, true].flatMap(selfRed =>
      Array.from({ length: 5 }, (_, slot) => ({ side, slot, selfRed })))) : [options.passiveSuya];
    const queue = Roster.formations.filter(f => !options.attackIds || options.attackIds.includes(f.id)).flatMap(f =>
      (options.teams || [0, 1]).flatMap(team => sizeCases.flatMap(enlarged => passiveCases.map(passiveSuya =>
        ({ ...options, enlarged, passiveSuya, attackIds: [f.id], teams: [team] })))));
    let shots = 0, failures = 0, complete = 0; const started = performance.now(), jobs = queue.length;
    const next = () => {
      const job = queue.shift(); if (!job) return;
      const worker = new Worker(__filename, { workerData: job });
      worker.once('message', report => {
        shots += report.shots; failures += report.failures; complete++;
        report.results.forEach(pair => console.log(JSON.stringify(pair)));
        if (complete === jobs) console.log(JSON.stringify({ shots, failures, elapsedMs: performance.now() - started,
          profiles: options.profiles || profiles, formations: Roster.formations.map(f => ({ id: f.id, positions: f.positions })) }));
        next();
      });
      worker.once('error', error => { console.error(error); process.exitCode = 1; });
    };
    for (let i = 0; i < Math.min(Number(process.env.WORKERS), jobs); i++) next();
  } else {
    options.onPair = pair => console.log(JSON.stringify(pair));
    const report = sweep(options);
    console.log(JSON.stringify({ ...report, results: undefined }));
  }
  }
}
module.exports = { makeFixture, simulate, candidates, sweep, profiles };
