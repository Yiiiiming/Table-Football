(function (root) {
  'use strict';

  const roles = [
    { id: 'forward', label: '前锋', code: 'FW', color: 'pink' },
    { id: 'midfield', label: '中场', code: 'MF', color: 'blue' },
    { id: 'defender', label: '后卫', code: 'DF', color: 'gold' }
  ];

  function createDraft(roster = root.FlickRoster, initialLineups) {
    if (!roster || !Array.isArray(roster.players) || !roster.byId) throw new Error('Player library is unavailable.');
    const validPlayer = id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(roster.byId, id);
    const input = initialLineups || roster.defaultLineups;
    if (!Array.isArray(input) || input.length !== 2) throw new Error('A draft requires two teams.');
    const lineups = input.map(lineup => {
      if (!Array.isArray(lineup) || lineup.length !== 5 || new Set(lineup).size !== 5 || lineup.some(id => !validPlayer(id))) {
        throw new Error('Each team needs five different players from the library.');
      }
      return [...lineup];
    });
    let team = 0;
    const slots = [0, 0];
    return {
      selectTeam(nextTeam) {
        if (nextTeam !== 0 && nextTeam !== 1) throw new RangeError('Team must be 0 or 1.');
        team = nextTeam;
        return this.getSelection();
      },
      selectSlot(slot) {
        if (!Number.isInteger(slot) || slot < 0 || slot > 4) throw new RangeError('Slot must be from 0 to 4.');
        slots[team] = slot;
        return this.getSelection();
      },
      assign(id) {
        if (!validPlayer(id)) throw new RangeError('Unknown player.');
        const slot = slots[team];
        const existing = lineups[team].indexOf(id);
        const changed = existing !== slot;
        if (existing >= 0 && changed) lineups[team][existing] = lineups[team][slot];
        lineups[team][slot] = id;
        return { team, slot, playerId: id, changed, swapped: existing >= 0 && changed };
      },
      getSelection() { return { team, slot: slots[team] }; },
      getLineups() { return lineups.map(lineup => [...lineup]); }
    };
  }

  function mount(options = {}) {
    const document = options.document || root.document;
    const roster = options.roster || root.FlickRoster;
    const model = createDraft(roster, options.lineups);
    const slotsElement = document.getElementById('draftSlots');
    const libraryElement = document.getElementById('playerLibrary');
    const hintElement = document.getElementById('draftHint');
    const rosterElement = document.getElementById('rosterSetup');
    const teamButtons = [document.getElementById('draftTeam0'), document.getElementById('draftTeam1')];
    if (!slotsElement || !libraryElement || !hintElement || !rosterElement || teamButtons.some(button => !button)) {
      throw new Error('The player draft containers are missing.');
    }
    const cards = new Map();

    function element(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function portrait(player, className) {
      const wrapper = element('span', className || 'player-portrait');
      const fallback = element('span', 'portrait-fallback', player.name.slice(0, 1));
      fallback.setAttribute('aria-hidden', 'true');
      const img = element('img');
      img.src = player.asset;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => { img.hidden = true; wrapper.classList.add('portrait-missing'); });
      wrapper.append(fallback, img);
      return wrapper;
    }

    function render() {
      const { team, slot } = model.getSelection();
      const lineup = model.getLineups()[team];
      rosterElement.dataset.team = String(team);
      teamButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === team)));
      slotsElement.replaceChildren();
      lineup.forEach((id, index) => {
        const player = roster.byId[id];
        const button = element('button', 'draft-slot');
        button.type = 'button';
        button.setAttribute('aria-pressed', String(index === slot));
        button.setAttribute('aria-label', `第 ${index + 1} 号位：${player.name}，点击更换球员`);
        button.append(element('span', 'slot-number', String(index + 1).padStart(2, '0')), portrait(player, 'slot-portrait'), element('strong', 'slot-name', player.name));
        button.addEventListener('click', () => {
          model.selectSlot(index);
          render();
          hintElement.textContent = `正在选择第 ${index + 1} 号位 · 点击球员卡替换${player.name}。`;
          // Restore keyboard focus after replacing the slot buttons.
          slotsElement.children[index].focus({ preventScroll: true });
        });
        slotsElement.append(button);
      });
      for (const [id, card] of cards) {
        const index = lineup.indexOf(id);
        const selected = lineup[slot] === id;
        card.button.classList.toggle('in-squad', index >= 0);
        card.button.setAttribute('aria-pressed', String(selected));
        card.badge.textContent = selected ? '当前选择' : index >= 0 ? `${index + 1} 号位 · 点击交换` : '加入阵容 +';
        card.button.setAttribute('aria-label', `${card.player.name}，${card.player.skill.name}。${card.player.skill.description} ${card.badge.textContent}`);
      }
    }

    libraryElement.replaceChildren();
    for (const role of roles) {
      const players = roster.players.filter(player => player.role === role.id);
      const group = element('section', `library-group role-${role.color}`);
      const heading = element('h4', 'role-heading');
      heading.append(element('span', 'role-code', role.code), element('span', '', role.label), element('small', '', `${players.length} 位`));
      const grid = element('div', 'player-grid');
      for (const player of players) {
        const button = element('button', 'player-card');
        button.type = 'button';
        button.dataset.playerId = player.id;
        button.title = `${player.name} · ${player.skill.name}\n${player.skill.description}`;
        const art = portrait(player);
        const content = element('span', 'player-info');
        const headingLine = element('span', 'player-heading');
        headingLine.append(element('strong', 'player-name', player.name), element('span', 'player-role', role.code));
        const description = element('span', 'player-description', player.skill.description);
        const badge = element('span', 'player-pick-state');
        content.append(headingLine, element('span', 'player-skill', player.skill.name), description, badge);
        button.append(art, content);
        button.addEventListener('click', () => {
          const result = model.assign(player.id);
          render();
          hintElement.textContent = result.swapped
            ? `${player.name}已换到第 ${result.slot + 1} 号位，原位置球员已交换。`
            : result.changed ? `${player.name}已加入第 ${result.slot + 1} 号位。继续选择其他位置，或开始对战。`
              : `${player.name}已在第 ${result.slot + 1} 号位，选择其他球员可替换。`;
        });
        cards.set(player.id, { button, badge, player });
        grid.append(button);
      }
      group.append(heading, grid);
      libraryElement.append(group);
    }
    teamButtons.forEach((button, team) => button.addEventListener('click', () => {
      model.selectTeam(team);
      render();
      hintElement.textContent = `正在编辑${team === 0 ? '冰蓝队' : '玫红队'} · 先选位置，再点球员卡。`;
    }));
    render();
    return { getLineups: () => model.getLineups() };
  }

  const api = { createDraft, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FlickDraft = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
