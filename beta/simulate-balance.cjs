// Manual, bounded self-play benchmark. Not included in the node:test suite.
// Usage: node beta/simulate-balance.cjs [pairs=6] [output.json] [initial|swap-midfield]
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const Physics = require('./physics.js');
const AI = require('./ai.js');
const Skills = require('./skills.js');
const Roster = require('./roster.js');
const formation = Roster.formations.find(f => f.id === "balanced").positions;
const preset = ['initial', 'swap-midfield'].includes(process.argv[4]) ? process.argv[4] : 'current-default';
const initialLineups = [['fandui', 'kante', 'modi', 'meixi', 'abluo'], ['shuiye', 'beilin', 'dingding', 'haaland', 'suya']];
const baseLineups = (preset === 'current-default' ? Roster.defaultLineups : initialLineups).map(lineup => [...lineup]);
if (preset === 'swap-midfield') [baseLineups[0][1], baseLineups[1][1]] = [baseLineups[1][1], baseLineups[0][1]];
function rng(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
function match(seed, swapped, enabled = true) {
  const random = rng(seed), lineups = swapped ? [...baseLineups].reverse() : baseLineups;
  const pieces = [], ball = { x: 540, y: 300, vx: 0, vy: 0, r: 11, mass: 1.4, team: -1, angle: 0 }, scores = [0, 0];
  lineups.forEach((lineup, team) => lineup.forEach((playerId, i) => pieces.push({
    playerId, team, number: i + 1, uid: `${team}:${i + 1}`, x: team ? 1080 - formation[i][0] : formation[i][0], y: formation[i][1],
    vx: 0, vy: 0, r: 27, mass: 3, angle: 0
  })));
  const events = {}, session = Skills.createSession({ pieces, ball, scores, random, enabled, onEvent(event) { events[event.kind] = (events[event.kind] || 0) + 1; } });
  let team = 0, bonus = null, turns = 0, shots = 0, bonusShots = 0, winner = null, capped = false, timedOutShots = 0;
  const started = performance.now();
  while (turns < 80 || bonus) {
    const active = [0, 1].map(side => pieces.some(p => p.team === side && !p.removed));
    if (!active.every(Boolean)) { winner = active[0] ? 0 : active[1] ? 1 : null; break; }
    if (!bonus) turns++;
    else bonusShots++;
    session.beginTurn(team, { bonus: !!bonus });
    const planner = AI.createPlanner(pieces, ball, team, 'medium', random, { allowedNumbers: bonus ? [bonus.number] : undefined });
    let choice;
    for (let candidate = 0; candidate < 101 && !choice; candidate++) choice = planner.step();
    if (!choice) throw new Error('Planner exceeded candidate budget');
    const selected = pieces.find(p => p.team === team && p.number === choice.number && !p.removed);
    if (!selected) throw new Error('Planner selected unavailable piece');
    session.beginShot(selected, choice.power); Physics.launch(selected, choice.angle, choice.power); shots++;
    let settle = 0, scored = null, ended = false;
    for (let tick = 0; tick < 3600; tick++) {
      session.beforeStep();
      const result = Physics.step([...pieces, ball], Physics.constants.DT, null, session.onContact, session.onTouch);
      if (result.goal !== null) { scored = result.goal; ended = true; break; }
      if (![0, 1].every(side => pieces.some(p => p.team === side && !p.removed))) { ended = true; break; }
      settle = result.maxSpeed < 5 ? settle + Physics.constants.DT : 0;
      if (settle > .32) { ended = true; break; }
    }
    if (!ended) timedOutShots++;
    for (const body of [...pieces, ball]) { body.vx = 0; body.vy = 0; }
    const extra = session.finishShot();
    if (scored !== null) {
      session.endTurn(team); session.clearRound(); bonus = null; scores[scored]++;
      if (scores[scored] >= 3) { winner = scored; break; }
      for (const p of pieces) Object.assign(p, { x: p.team ? 1080 - formation[p.number - 1][0] : formation[p.number - 1][0], y: formation[p.number - 1][1], vx: 0, vy: 0, angle: 0 });
      Object.assign(ball, { x: 540, y: 300, vx: 0, vy: 0, angle: 0 }); team = 1 - scored;
    } else if (extra && !extra.removed) bonus = extra;
    else { session.endTurn(team); bonus = null; team = 1 - team; }
  }
  if (winner === null && turns >= 80) capped = true;
  return { seed, swapped, preset, mode: enabled ? 'brawl' : 'normal', scores, turns, shots, bonusShots, winner,
    winningLineup: winner === null ? null : (winner === (swapped ? 1 : 0) ? 'A' : 'B'), capped, timedOutShots,
    remaining: [0, 1].map(side => pieces.filter(p => p.team === side && !p.removed).length), events,
    elapsedMs: Math.round(performance.now() - started) };
}
const pairs = Math.max(1, Math.min(12, Number(process.argv[2]) || 6)), results = [];
for (let pair = 0; pair < pairs; pair++) for (const swapped of [false, true]) {
  const result = match(20261006 + pair * 733, swapped); results.push(result); console.log(JSON.stringify(result));
}
const summary = {
  matches: results.length, completed: results.filter(r => r.winner !== null).length, capped: results.filter(r => r.capped).length,
  lineupWins: { A: results.filter(r => r.winningLineup === 'A').length, B: results.filter(r => r.winningLineup === 'B').length },
  sideWins: [0, 1].map(side => results.filter(r => r.winner === side).length),
  goals: results.reduce((sum, r) => sum + r.scores[0] + r.scores[1], 0),
  meanTurns: results.reduce((sum, r) => sum + r.turns, 0) / results.length,
  meanShots: results.reduce((sum, r) => sum + r.shots, 0) / results.length,
  bonusShots: results.reduce((sum, r) => sum + r.bonusShots, 0),
  timedOutShots: results.reduce((sum, r) => sum + r.timedOutShots, 0), events: { removal: 0, injury: 0, shield: 0, bonus: 0 }
};
for (const result of results) for (const [kind, count] of Object.entries(result.events)) summary.events[kind] = (summary.events[kind] || 0) + count;
console.log(JSON.stringify({ summary }));
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify({ note: 'Bounded deterministic medium-AI sample; not a statistical balance guarantee. Same seeds are paired with swapped lineups.', preset, lineups: baseLineups, summary, results }, null, 2) + '\n');
