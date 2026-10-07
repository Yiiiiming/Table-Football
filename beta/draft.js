(function (root) {
  'use strict';
  const roles = [
    { id: 'forward', label: '前锋', code: 'FW', color: 'pink' },
    { id: 'midfield', label: '中场', code: 'MF', color: 'blue' },
    { id: 'defender', label: '后卫', code: 'DF', color: 'gold' },
    { id: 'goalkeeper', label: '门将', code: 'GK', color: 'violet' }
  ];
  const fallbackFormations = [{ id: 'balanced', name: '均衡', label: '1–2–2', positions: [[130,300],[270,240],[270,360],[423,180],[423,420]], roles: ['后卫 / 门将','中场','中场','前锋','前锋'] }];
  function createDraft(roster = root.FlickRoster, initialLineups, initialFormations) {
    if (!roster || !Array.isArray(roster.players) || !roster.byId) throw new Error('Player library is unavailable.');
    const validPlayer = id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(roster.byId, id);
    const presets = roster.formations || fallbackFormations;
    const validFormation = id => presets.some(preset => preset.id === id);
    const input = initialLineups || roster.defaultLineups;
    if (!Array.isArray(input) || input.length !== 2) throw new Error('A draft requires two teams.');
    const lineups = input.map(lineup => {
      if (!Array.isArray(lineup) || lineup.length !== 5 || new Set(lineup).size !== 5 || lineup.some(id => !validPlayer(id))) throw new Error('Each team needs five different players from the library.');
      return [...lineup];
    });
    const formations = initialFormations ? [...initialFormations] : [presets[0].id, presets[0].id];
    if (formations.length !== 2 || formations.some(id => !validFormation(id))) throw new Error('Unknown formation.');
    let team = 0;
    const slots = [0, 0];
    const validSlot = slot => Number.isInteger(slot) && slot >= 0 && slot <= 4;
    function assignTo(id, slot) {
      if (!validPlayer(id)) throw new RangeError('Unknown player.');
      if (!validSlot(slot)) throw new RangeError('Slot must be from 0 to 4.');
      const existing = lineups[team].indexOf(id), changed = existing !== slot;
      if (existing >= 0 && changed) lineups[team][existing] = lineups[team][slot];
      lineups[team][slot] = id; slots[team] = slot;
      return { team, slot, playerId: id, changed, swapped: existing >= 0 && changed };
    }
    return {
      selectTeam(nextTeam) { if (nextTeam !== 0 && nextTeam !== 1) throw new RangeError('Team must be 0 or 1.'); team = nextTeam; return this.getSelection(); },
      selectSlot(slot) { if (!validSlot(slot)) throw new RangeError('Slot must be from 0 to 4.'); slots[team] = slot; return this.getSelection(); },
      selectFormation(id) { if (!validFormation(id)) throw new RangeError('Unknown formation.'); formations[team] = id; },
      assign(id) { return assignTo(id, slots[team]); },
      dropPlayer(id, slot) { return assignTo(id, slot); },
      getSelection() { return { team, slot: slots[team] }; },
      getLineups() { return lineups.map(lineup => [...lineup]); },
      getFormations() { return [...formations]; }
    };
  }
  function createMenuFlow() {
    let step = 'mode';
    return { next() { step = 'lineup'; }, back() { step = 'mode'; }, reset() { step = 'mode'; }, getStep() { return step; }, canStart() { return step === 'lineup'; } };
  }
  function mount(options = {}) {
    const document = options.document || root.document, roster = options.roster || root.FlickRoster;
    const settings = () => ({ variant: 'brawl', mode: 'single', difficulty: 'medium', ...(options.getSettings ? options.getSettings() : {}) });
    const model = createDraft(roster, options.lineups, options.formations), flow = createMenuFlow();
    const presets = roster.formations || fallbackFormations;
    const $ = id => document.getElementById(id);
    const slotsElement = $('draftSlots'), legendElement = $('draftSlotLegend'), libraryElement = $('playerLibrary'), hintElement = $('draftHint'), rosterElement = $('rosterSetup');
    const teamButtons = [$('draftTeam0'), $('draftTeam1')], cards = new Map(), filterButtons = new Map(), formationButtons = new Map();
    const content = $('overlay').querySelector('.overlay-content');
    let roleFilter = 'all', drag = null, suppressClickUntil = 0;
    function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
    function portrait(player, className) {
      const wrapper = element('span', className || 'player-portrait'), fallback = element('span', 'portrait-fallback', player.name.slice(0, 1)), img = element('img');
      fallback.setAttribute('aria-hidden', 'true'); img.src = player.asset; img.alt = ''; img.draggable = false; img.loading = 'lazy'; img.decoding = 'async';
      img.addEventListener('error', () => { img.hidden = true; wrapper.classList.add('portrait-missing'); }); wrapper.append(fallback, img); return wrapper;
    }
    function showDetail(player) {
      const detail = $('selectedPlayerDetail'); detail.replaceChildren();
      detail.append(element('strong', '', player.name + ' · ' + player.skill.name), element('span', '', player.skill.description));
    }
    function selectedPreset() { return presets.find(preset => preset.id === model.getFormations()[model.getSelection().team]); }
    function cancelDrag() {
      if (!drag) return;
      drag.source.classList.remove('is-dragging');
      if (drag.target) drag.target.classList.remove('drop-target');
      if (drag.ghost) drag.ghost.remove();
      const old = drag; drag = null;
      if (old.source.hasPointerCapture?.(old.pointerId)) old.source.releasePointerCapture(old.pointerId);
    }
    function assign(id, slot) {
      const result = slot === undefined ? model.assign(id) : model.dropPlayer(id, slot), name = roster.byId[id].name;
      renderDraft();
      hintElement.textContent = result.swapped ? `${name}已换到 ${result.slot + 1} 号位，原位置球员已交换。` : `${name}已就位 · ${selectedPreset().roles[result.slot]}，可继续调整或开始比赛。`;
    }
    function dropTarget(x, y) {
      const hit = document.elementFromPoint?.(x, y), button = hit?.closest?.('.draft-slot') || hit?.closest?.('.position-legend-button');
      return button && (slotsElement.contains(button) || legendElement.contains(button)) ? button : null;
    }
    function bindDrag(source, id) {
      source.addEventListener('pointerdown', event => {
        if (event.button !== 0 || settings().variant !== 'brawl' || flow.getStep() !== 'lineup') return;
        // The avatar is the touch drag handle; the row still scrolls naturally.
        if (event.pointerType === 'touch' && !event.target.closest?.('[data-drag-handle]')) return;
        cancelDrag(); drag = { source, id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, ghost: null, target: null };
        source.setPointerCapture?.(event.pointerId);
      });
      source.addEventListener('pointermove', event => {
        if (!drag || drag.source !== source || drag.pointerId !== event.pointerId) return;
        if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7) return;
        event.preventDefault();
        if (!drag.moved) {
          drag.moved = true; source.classList.add('is-dragging');
          drag.ghost = element('div', 'draft-drag-ghost'); drag.ghost.setAttribute('aria-hidden', 'true');
          drag.ghost.append(portrait(roster.byId[id], 'slot-portrait'), element('span', '', roster.byId[id].name)); document.body.append(drag.ghost);
        }
        drag.ghost.style.left = event.clientX + 'px'; drag.ghost.style.top = event.clientY + 'px';
        const target = dropTarget(event.clientX, event.clientY);
        if (drag.target !== target) { drag.target?.classList.remove('drop-target'); target?.classList.add('drop-target'); drag.target = target; }
      });
      source.addEventListener('pointerup', event => {
        if (!drag || drag.source !== source || drag.pointerId !== event.pointerId) return;
        const moved = drag.moved, target = moved ? dropTarget(event.clientX, event.clientY) : null;
        if (moved) { event.preventDefault(); suppressClickUntil = Date.now() + 500; }
        cancelDrag();
        if (target) assign(id, Number(target.dataset.slot));
        else if (moved) hintElement.textContent = '没有放到位置上，阵容保持不变。把头像拖到任意场上圆圈即可。';
      });
      source.addEventListener('pointercancel', cancelDrag);
      source.addEventListener('lostpointercapture', () => { if (drag?.source === source) cancelDrag(); });
      source.addEventListener('dragstart', event => event.preventDefault());
    }
    function renderDraft() {
      const { team, slot } = model.getSelection(), lineup = model.getLineups()[team], preset = selectedPreset(), classic = settings().variant === 'classic';
      rosterElement.dataset.team = String(team); rosterElement.dataset.variant = classic ? 'classic' : 'brawl';
      teamButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === team)));
      $('formationDirection').textContent = team ? '← 向左进攻' : '向右进攻 →';
      $('formationLabel').textContent = preset.label;
      $('formationBoard').dataset.team = String(team);
      $('rosterHeading').textContent = classic ? '选择你的开场阵型' : '拖入球员，排好首发';
      $('draftLibraryPanel').hidden = classic; $('selectedPlayerDetail').hidden = classic; $('classicFormationNote').hidden = !classic;
      $('libraryCount').hidden = classic;
      $('libraryCount').textContent = roster.players.length + ' 位球员';
      slotsElement.replaceChildren(); legendElement.replaceChildren();
      lineup.forEach((id, index) => {
        const player = roster.byId[id], button = element('button', 'draft-slot'), position = preset.positions[index];
        button.type = 'button'; button.dataset.slot = String(index); button.disabled = classic;
        button.title = `${index + 1} 号位 · ${preset.roles[index]}${classic ? '' : ' · ' + player.name}`;
        const x = (position[0] - 64) / (540 - 64) * 100;
        button.style.left = (team ? 100 - x : x) + '%'; button.style.top = ((position[1] - 48) / (552 - 48) * 100) + '%';
        button.setAttribute('aria-pressed', String(!classic && index === slot));
        button.setAttribute('aria-label', `${index + 1} 号位，${preset.roles[index]}${classic ? '' : '：' + player.name + '，点击更换或拖入球员'}`);
        const art = classic ? element('span', 'classic-disc', String(index + 1).padStart(2, '0')) : portrait(player, 'slot-portrait');
        art.dataset.dragHandle = 'true';
        button.append(element('span', 'slot-role', preset.roles[index]), art, element('strong', 'slot-name', classic ? `${index + 1} 号位` : player.name), element('span', 'slot-chip-number', String(index + 1).padStart(2, '0')));
        button.addEventListener('click', () => {
          if (Date.now() < suppressClickUntil || classic) return;
          model.selectSlot(index); renderDraft(); hintElement.textContent = `已选 ${index + 1} 号位 · ${preset.roles[index]}。点球员卡替换，或把头像拖过来。`;
          slotsElement.children[index].focus({ preventScroll: true });
        });
        bindDrag(button, id); slotsElement.append(button);
        const legend = element('button', 'position-legend-button'); legend.type = 'button'; legend.dataset.slot = String(index); legend.dataset.dragHandle = 'true'; legend.disabled = classic;
        legend.setAttribute('aria-pressed', String(!classic && index === slot)); legend.setAttribute('aria-label', `${index + 1} 号位，${preset.roles[index]}${classic ? '' : '：' + player.name}`);
        legend.append(element('span', 'position-legend-number', String(index + 1).padStart(2, '0')), element('strong', 'position-legend-name', classic ? '统一圆片' : player.name), element('span', 'position-legend-role', preset.roles[index]));
        legend.addEventListener('click', () => {
          if (Date.now() < suppressClickUntil || classic) return;
          model.selectSlot(index); renderDraft(); hintElement.textContent = `已选 ${index + 1} 号位 · ${preset.roles[index]}。点右侧球员卡即可替换。`; legendElement.children[index].focus({preventScroll:true});
        });
        bindDrag(legend, id); legendElement.append(legend);
      });
      formationButtons.forEach((button, id) => button.setAttribute('aria-pressed', String(id === preset.id)));
      for (const [id, card] of cards) {
        const index = lineup.indexOf(id), selected = lineup[slot] === id;
        card.button.hidden = roleFilter !== 'all' && card.player.role !== roleFilter;
        card.button.classList.toggle('in-squad', index >= 0); card.button.setAttribute('aria-pressed', String(selected));
        card.badge.textContent = selected ? '当前选择' : index >= 0 ? `${index + 1} 号位 · 可交换` : '选择 +';
        card.button.setAttribute('aria-label', `${card.player.name}，${card.player.skill.name}。${card.player.skill.description} ${card.badge.textContent}`);
      }
      showDetail(roster.byId[lineup[slot]]);
      if (classic) hintElement.textContent = '选择一个开场阵型；两队可以使用不同阵型。';
    }
    function renderStep() {
      cancelDrag();
      const step = flow.getStep(), isMode = step === 'mode', chosen = settings();
      content.dataset.menuStep = step; $('menuStepMode').hidden = !isMode; $('menuStepLineup').hidden = isMode; $('start').hidden = isMode;
      $('menuProgressMode').setAttribute('aria-current', isMode ? 'step' : 'false'); $('menuProgressLineup').setAttribute('aria-current', isMode ? 'false' : 'step');
      $('menuProgressLineup').textContent = '02  ' + (chosen.variant === 'classic' ? '选择阵型' : '调整阵容');
      $('draftSettingsSummary').textContent = (chosen.variant === 'classic' ? '经典模式' : '球员大乱斗') + ' · ' + (chosen.mode === 'multi' ? '同屏双人' : ({low:'低',medium:'中',high:'高'}[chosen.difficulty] || '中') + '档 AI');
      $('draftNext').textContent = '下一步 · ' + (chosen.variant === 'classic' ? '选择阵型 →' : '调整阵容 →');
      $('overlayKicker').textContent = isMode ? 'CHOOSE YOUR MATCH.' : 'BUILD YOUR STARTING FIVE.';
      $('overlayTitle').textContent = isMode ? 'YOUR MATCH.' : chosen.variant === 'classic' ? 'SET YOUR FORMATION.' : 'BUILD YOUR FIVE.';
      $('overlayText').textContent = isMode ? '先选玩法与对手，下一步再排兵布阵。' : chosen.variant === 'classic' ? '为两队选择开场阵型，然后开始比赛。' : '左侧安排站位，右侧选择球员；每队五人，自由搭配。';
      $('draftBack').hidden = isMode;
      rosterElement.hidden = false;
      renderDraft();
    }
    $('draftFormationOptions').replaceChildren();
    presets.forEach(preset => {
      const button = element('button', 'formation-option'); button.type = 'button';
      button.append(element('strong', '', preset.name), element('span', '', preset.label));
      button.addEventListener('click', () => { cancelDrag(); model.selectFormation(preset.id); renderDraft(); hintElement.textContent = `已切换${preset.name}阵型，五位球员保持不变。`; });
      formationButtons.set(preset.id, button); $('draftFormationOptions').append(button);
    });
    $('draftRoleFilters').replaceChildren();
    [{id:'all',label:'全部'},...roles].forEach(role => {
      const button = element('button', 'role-filter', role.label); button.type = 'button'; button.setAttribute('aria-pressed', String(role.id === 'all'));
      button.addEventListener('click', () => { roleFilter = role.id; filterButtons.forEach((b,id) => b.setAttribute('aria-pressed', String(id === role.id))); renderDraft(); libraryElement.scrollTop = 0; });
      filterButtons.set(role.id, button); $('draftRoleFilters').append(button);
    });
    libraryElement.replaceChildren();
    for (const player of roster.players) {
      const role = roles.find(role => role.id === player.role) || roles[0], button = element('button', 'player-card role-' + role.color); button.type = 'button'; button.dataset.playerId = player.id;
      button.title = player.name + ' · ' + player.skill.name + '\n' + player.skill.description;
      const art = portrait(player); art.dataset.dragHandle = 'true'; art.setAttribute('title', '拖动头像到场上位置');
      const info = element('span', 'player-info'), heading = element('span', 'player-heading'), badge = element('span', 'player-pick-state');
      heading.append(element('strong', 'player-name', player.name), element('span', 'player-role', role.label));
      info.append(heading, element('span', 'player-skill', player.skill.name), element('span', 'player-description', player.skill.description), badge);
      button.append(art, info, element('span', 'drag-grip', '⠿'));
      button.addEventListener('click', () => { if (Date.now() >= suppressClickUntil) assign(player.id); });
      button.addEventListener('focus', () => showDetail(player)); bindDrag(button, player.id);
      cards.set(player.id, { button, badge, player }); libraryElement.append(button);
    }
    teamButtons.forEach((button, team) => button.addEventListener('click', () => { cancelDrag(); model.selectTeam(team); renderDraft(); hintElement.textContent = `正在调整${team === 0 ? '冰蓝队' : '玫红队'} · ${settings().variant === 'classic' ? '选择这支球队的开场阵型。' : '球员可在任意位置出场。'}`; }));
    $('draftNext').addEventListener('click', () => { flow.next(); renderStep(); $('draftBack').focus({preventScroll:true}); });
    $('draftBack').addEventListener('click', () => { flow.back(); renderStep(); $('draftNext').focus({preventScroll:true}); });
    root.addEventListener?.('blur', cancelDrag);
    renderStep();
    return {
      getLineups: () => model.getLineups(), getFormations: () => model.getFormations(), canStart: () => flow.canStart(),
      resetMenu() { flow.reset(); renderStep(); },
      syncSettings() { renderStep(); }
    };
  }
  const api = { createDraft, createMenuFlow, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FlickDraft = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
