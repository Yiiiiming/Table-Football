const test = require('node:test');
const assert = require('node:assert/strict');
const roster = require('../roster.js');
const { createDraft } = require('../draft.js');

test('assigning an existing teammate swaps positions without losing players', () => {
  const draft = createDraft(roster);
  const original = draft.getLineups()[0];
  draft.selectSlot(0);
  const result = draft.assign(original[3]);
  assert.equal(result.swapped, true);
  const lineup = draft.getLineups()[0];
  assert.equal(lineup[0], original[3]);
  assert.equal(lineup[3], original[0]);
  assert.equal(new Set(lineup).size, 5);
  assert.deepEqual([...lineup].sort(), [...original].sort());
});

test('every player can join either team and opponents may share a player', () => {
  const draft = createDraft(roster);
  for (const player of roster.players) {
    for (const team of [0, 1]) {
      draft.selectTeam(team);
      draft.selectSlot(2);
      draft.assign(player.id);
      assert.equal(draft.getLineups()[team][2], player.id);
      assert.equal(new Set(draft.getLineups()[team]).size, 5);
    }
    assert.equal(draft.getLineups()[0][2], draft.getLineups()[1][2]);
  }
});

test('draft changes cannot mutate defaults or returned lineups', () => {
  const defaults = roster.defaultLineups.map(team => [...team]);
  const supplied = defaults.map(team => [...team]);
  const draft = createDraft(roster, supplied);
  supplied[0][0] = 'invalid';
  const output = draft.getLineups();
  output[0][0] = 'invalid';
  output[1].pop();
  assert.deepEqual(draft.getLineups(), defaults);
  draft.assign('suya');
  assert.deepEqual(roster.defaultLineups, defaults);
});

test('each team remembers its selected position independently', () => {
  const draft = createDraft(roster);
  draft.selectSlot(4);
  draft.selectTeam(1);
  draft.selectSlot(2);
  draft.selectTeam(0);
  assert.deepEqual(draft.getSelection(), { team: 0, slot: 4 });
  draft.selectTeam(1);
  assert.deepEqual(draft.getSelection(), { team: 1, slot: 2 });
});

test('invalid selections do not corrupt a valid draft', () => {
  const draft = createDraft(roster);
  const original = draft.getLineups();
  assert.throws(() => draft.selectTeam(2), RangeError);
  assert.throws(() => draft.selectSlot(5), RangeError);
  assert.throws(() => draft.selectSlot(1.5), RangeError);
  assert.throws(() => draft.assign('nonexistent'), RangeError);
  assert.throws(() => draft.assign('toString'), RangeError);
  assert.deepEqual(draft.getLineups(), original);
  assert.deepEqual(draft.getSelection(), { team: 0, slot: 0 });
});

test('reject incomplete or duplicate starting lineups', () => {
  assert.throws(() => createDraft(roster, [['suya'], ['abluo']]));
  const invalid = roster.defaultLineups.map(team => [...team]);
  invalid[0][1] = invalid[0][0];
  assert.throws(() => createDraft(roster, invalid));
});
