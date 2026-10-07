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

const { createMenuFlow, mount } = require('../draft.js');

test('dropping a player into a specific field position swaps teammates and rejects invalid drops', () => {
  const draft = createDraft(roster), original = draft.getLineups();
  draft.selectSlot(4);
  const result = draft.dropPlayer(original[0][2], 0);
  assert.equal(result.swapped, true);
  assert.equal(draft.getLineups()[0][0], original[0][2]);
  assert.equal(draft.getLineups()[0][2], original[0][0]);
  assert.equal(draft.getSelection().slot, 0);
  const valid = draft.getLineups();
  assert.throws(() => draft.dropPlayer('navas', -1), RangeError);
  assert.throws(() => draft.dropPlayer('missing', 3), RangeError);
  assert.deepEqual(draft.getLineups(), valid);
});

test('three formation choices are independent per team and preserve the selected players', () => {
  const draft = createDraft(roster), original = draft.getLineups();
  assert.equal(roster.formations.length, 3);
  for (const preset of roster.formations) {
    draft.selectTeam(0); draft.selectFormation(preset.id);
    assert.equal(draft.getFormations()[0], preset.id);
    assert.equal(draft.getFormations()[1], 'balanced');
    assert.deepEqual(draft.getLineups(), original);
  }
  draft.selectTeam(1); draft.selectFormation('defensive');
  assert.deepEqual(draft.getFormations(), ['attacking', 'defensive']);
  const output = draft.getFormations(); output[0] = 'missing';
  assert.deepEqual(draft.getFormations(), ['attacking', 'defensive']);
  assert.throws(() => draft.selectFormation('missing'), RangeError);
});

test('two-screen flow requires lineup confirmation and can return without resetting the draft', () => {
  const flow = createMenuFlow(), draft = createDraft(roster);
  assert.equal(flow.getStep(), 'mode'); assert.equal(flow.canStart(), false);
  flow.next(); assert.equal(flow.getStep(), 'lineup'); assert.equal(flow.canStart(), true);
  draft.dropPlayer('navas', 0); draft.selectFormation('defensive');
  const lineup = draft.getLineups();
  flow.back(); assert.equal(flow.canStart(), false);
  flow.next(); assert.deepEqual(draft.getLineups(), lineup); assert.equal(draft.getFormations()[0], 'defensive');
  flow.reset(); assert.equal(flow.getStep(), 'mode'); assert.equal(flow.canStart(), false);
});

function menuHarness(settings = { variant: 'brawl', mode: 'single', difficulty: 'medium' }) {
  class Node {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.style = {}; this.attributes = {}; this.listeners = {}; this.hidden = false; this.className = ''; this.parentNode = null;
      this.classList = {
        contains: name => this.className.split(/\s+/).includes(name),
        add: name => { if (!this.classList.contains(name)) this.className += ' ' + name; },
        remove: name => { this.className = this.className.split(/\s+/).filter(value => value !== name).join(' '); },
        toggle: (name, force) => { const add = force === undefined ? !this.classList.contains(name) : force; if (add) this.classList.add(name); else this.classList.remove(name); }
      };
    }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
    append(...children) { for (const child of children) { this.children.push(child); child.parentNode = this; } }
    replaceChildren(...children) { this.children.forEach(child => { child.parentNode = null; }); this.children = []; this.append(...children); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    closest(selector) { const matches = selector === '[data-drag-handle]' ? !!this.dataset.dragHandle : selector[0] === '.' && this.classList.contains(selector.slice(1)); return matches ? this : this.parentNode?.closest(selector); }
    querySelector(selector) { for (const child of this.children) { if (selector[0] === '.' && child.classList.contains(selector.slice(1))) return child; const result = child.querySelector(selector); if (result) return result; } return null; }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
    focus() { this.focused = true; }
    setPointerCapture(id) { this.capture = id; }
    hasPointerCapture(id) { return this.capture === id; }
    releasePointerCapture() { this.capture = null; }
    fire(name, extra = {}) { const event = { button: 0, pointerType: 'mouse', pointerId: 1, clientX: 10, clientY: 10, target: this, preventDefault() {}, ...extra }; for (const listener of this.listeners[name] || []) listener(event); }
  }
  const fs = require('node:fs'), path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Node()]));
  const content = new Node(); content.className = 'overlay-content'; nodes.get('overlay').append(content);
  const document = { body: new Node('body'), getElementById: id => nodes.get(id), createElement: tag => new Node(tag), elementFromPoint() { return this.hit || null; } };
  const api = mount({ document, roster, getSettings: () => settings });
  const el = id => nodes.get(id), cards = () => el('playerLibrary').children;
  return { api, el, document, settings, cards };
}

test('mounted menu separates mode selection from the field and includes the twelfth goalkeeper', () => {
  const menu = menuHarness();
  assert.equal(menu.el('menuStepMode').hidden, false); assert.equal(menu.el('menuStepLineup').hidden, true); assert.equal(menu.el('start').hidden, true); assert.equal(menu.api.canStart(), false);
  assert.equal(menu.cards().length, 12); assert(menu.cards().some(card => card.dataset.playerId === 'navas'));
  menu.el('draftNext').fire('click');
  assert.equal(menu.el('menuStepMode').hidden, true); assert.equal(menu.el('menuStepLineup').hidden, false); assert.equal(menu.el('start').hidden, false); assert.equal(menu.api.canStart(), true);
  assert.equal(menu.el('draftSlots').children.length, 5);
  assert.equal(menu.el('draftSlots').children[0].children[0].textContent, '后卫 / 门将');
  const before = menu.api.getLineups();
  menu.el('draftBack').fire('click'); menu.el('draftNext').fire('click');
  assert.deepEqual(menu.api.getLineups(), before);
});

test('pointer drop uses the target position; cancelled drag leaves the lineup unchanged', () => {
  const menu = menuHarness(); menu.el('draftNext').fire('click');
  const original = menu.api.getLineups(), card = menu.cards().find(card => card.dataset.playerId === original[0][4]);
  menu.document.hit = menu.el('draftSlots').children[0];
  card.fire('pointerdown'); card.fire('pointermove', { clientX: 120, clientY: 120 });
  assert.equal(menu.document.body.children.length, 1, 'drag ghost appears');
  card.fire('pointerup', { clientX: 120, clientY: 120 });
  assert.equal(menu.api.getLineups()[0][0], original[0][4]); assert.equal(menu.api.getLineups()[0][4], original[0][0]);
  assert.equal(menu.document.body.children.length, 0, 'ghost removed');
  const changed = menu.api.getLineups();
  card.fire('pointerdown'); card.fire('pointermove', { clientX: 120, clientY: 120 }); card.fire('pointercancel');
  assert.deepEqual(menu.api.getLineups(), changed); assert.equal(menu.document.body.children.length, 0);
});

test('touch drags from the portrait while card text remains available for vertical scrolling', () => {
  const menu = menuHarness(); menu.el('draftNext').fire('click');
  const card = menu.cards().find(card => card.dataset.playerId === 'navas'), before = menu.api.getLineups();
  menu.document.hit = menu.el('draftSlots').children[0];
  card.fire('pointerdown', { pointerType: 'touch', target: card.children[1] });
  card.fire('pointermove', { pointerType: 'touch', clientX: 100, clientY: 100 }); card.fire('pointerup', { pointerType: 'touch' });
  assert.deepEqual(menu.api.getLineups(), before);
  card.fire('pointerdown', { pointerType: 'touch', target: card.children[0] });
  card.fire('pointermove', { pointerType: 'touch', clientX: 100, clientY: 100 }); card.fire('pointerup', { pointerType: 'touch', clientX: 100, clientY: 100 });
  assert.equal(menu.api.getLineups()[0][0], 'navas');
});

test('classic preview hides player skills but preserves each team formation and drafted players', () => {
  const menu = menuHarness(); menu.el('draftNext').fire('click');
  menu.el('draftFormationOptions').children[1].fire('click');
  const players = menu.api.getLineups();
  menu.settings.variant = 'classic'; menu.api.syncSettings();
  assert.equal(menu.el('rosterSetup').hidden, false); assert.equal(menu.el('draftLibraryPanel').hidden, true); assert.equal(menu.el('classicFormationNote').hidden, false);
  assert(menu.el('draftSlots').children.every(slot => slot.disabled));
  assert.equal(menu.api.getFormations()[0], 'defensive');
  menu.el('draftTeam1').fire('click'); menu.el('draftFormationOptions').children[2].fire('click');
  assert.deepEqual(menu.api.getFormations(), ['defensive', 'attacking']);
  menu.settings.variant = 'brawl'; menu.api.syncSettings();
  assert.equal(menu.el('draftLibraryPanel').hidden, false); assert.deepEqual(menu.api.getLineups(), players);
  menu.api.resetMenu(); assert.equal(menu.el('start').hidden, true); assert.equal(menu.api.canStart(), false);
});

test('separate position labels show the three defenders and accept a player drop', () => {
  const menu = menuHarness(); menu.el('draftNext').fire('click');
  let labels = menu.el('draftSlotLegend').children;
  assert.equal(labels.length, 5);
  assert.deepEqual(labels.map(label => label.children[2].textContent), roster.formations[0].roles);
  labels[1].fire('click');
  const card = menu.cards().find(card => card.dataset.playerId === 'navas');
  card.fire('click'); assert.equal(menu.api.getLineups()[0][1], 'navas');
  menu.document.hit = menu.el('draftSlotLegend').children[0];
  card.fire('pointerdown'); card.fire('pointermove', { clientX: 90, clientY: 90 }); card.fire('pointerup', { clientX: 90, clientY: 90 });
  assert.equal(menu.api.getLineups()[0][0], 'navas');
  assert.equal(new Set(menu.api.getLineups()[0]).size, 5);
});

test('diagram chip bounds remain separate for close defenders across compact viewport sizes', () => {
  for (const preset of roster.formations) for (const width of [120, 200, 350, 580]) for (const height of [70, 100, 160, 250, 400]) {
    // CSS bounds use min(38px, 11cqh); positions remain on the actual half-pitch scale.
    const diameter = Math.min(38, .11 * height);
    const points = preset.positions.map(([x, y]) => [(x - 64) / 476 * width, (y - 48) / 504 * height]);
    for (let a = 0; a < points.length; a++) for (let b = a + 1; b < points.length; b++) {
      const dx = Math.abs(points[a][0] - points[b][0]), dy = Math.abs(points[a][1] - points[b][1]);
      assert(dx >= diameter || dy >= diameter, `${preset.id} at ${width}x${height} has nonoverlapping chip hit boxes`);
    }
  }
});
