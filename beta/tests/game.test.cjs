const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function game({mode='multi',variant='classic',plannerFactory,random=()=>.99,lineups,formations=['balanced','balanced'],canStart=()=>true}={}){
  const elements=new Map(),tools=[],windowListeners={};
  const gradient={addColorStop(){}};
  const ctx=new Proxy({},{get:(o,k)=>['createLinearGradient','createRadialGradient'].includes(k)?()=>gradient:()=>{},set:()=>true});
  function el(id){if(!elements.has(id))elements.set(id,{style:{},textContent:'',hidden:false,listeners:{},classList:{add(){},remove(){},toggle(){}},parentElement:{classList:{add(){},remove(){}}},addEventListener(n,f){this.listeners[n]=f},focus(){sandbox.document.activeElement=this;},blur(){if(sandbox.document.activeElement===this)sandbox.document.activeElement=null;},click(){this.listeners.click?.();},setAttribute(){},getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:1080,height:600}),setPointerCapture(){},releasePointerCapture(){},hasPointerCapture:()=>true});return elements.get(id);}
  const testMath=Object.create(Math);testMath.random=random;
  const sandbox={Image:class{constructor(){this.complete=false}},FlickDraft:{mount:()=>({getFormations:()=>[...formations],canStart,getLineups:()=>lineups?lineups.map(x=>[...x]):sandbox.FlickRoster.defaultLineups.map(x=>[...x])})},Math:testMath,Set,Map,Promise,AbortController,HTMLButtonElement:class{},setTimeout:()=>0,requestAnimationFrame(){},matchMedia:()=>({matches:true}),document:{getElementById:el,addEventListener(){},modelContext:{registerTool(t){tools.push(t)}}},window:{addEventListener(n,f){windowListeners[n]=f}}};
  const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8').replace('  setupPieces();syncMenu();syncUI();draw();requestAnimationFrame(frame);','  setupPieces();syncMenu();syncUI();globalThis.test={state,selection,update,tickAI,startMatch,pauseMatch,openMenu,resumeFromMenu,fire,aimVector,draw,turnReady,score,getSkills:()=>skillSession};');
  vm.createContext(sandbox);
  for(const filename of ['roster.js','physics.js','skills.js','ai.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',filename),'utf8'),sandbox);
  if(plannerFactory)sandbox.FlickAI={...sandbox.FlickAI,createPlanner:plannerFactory};
  vm.runInContext(source,sandbox);const api=sandbox.test;assert(api,'source hook exists');api.selection.mode=mode;api.selection.variant=variant;api.startMatch();return {...api,elements,tools,windowListeners,getFocus:()=>sandbox.document.activeElement};
}
function shoot(g,number,power,offset=0){const s=g.state,p=s.pieces.find(p=>p.team===s.turn&&p.number===number),a=Math.atan2(s.ball.y-p.y,s.ball.x-p.x)+offset*Math.PI/180;const d=power*135;s.aim={piece:p,start:{x:p.x,y:p.y},pointer:{x:p.x-Math.cos(a)*d,y:p.y-Math.sin(a)*d}};g.fire();for(let i=0;i<180*16&&s.phase==='moving';i++)g.update(1/180);assert.notEqual(s.phase,'moving','shots settle');}
test('five discs per side, all ten rendered',()=>{const g=game();assert.equal(g.state.pieces.length,10);for(let t=0;t<2;t++)assert.equal(g.state.pieces.filter(p=>p.team===t).length,5);g.draw();});
test('only own pieces can be selected; taps do not use a turn',()=>{const g=game(),events=g.elements.get('pitch').listeners,e=(x,y)=>({clientX:x,clientY:y,pointerId:1,button:0,preventDefault(){}});events.pointerdown(e(950,300));assert.equal(g.state.aim,null);events.pointerdown(e(135,300));assert.equal(g.aimVector().power,0);events.pointerup(e(135,300));assert.equal(g.state.phase,'aiming');assert.equal(g.state.turn,0);});
test('pause freezes motion and resume preserves the turn',()=>{const g=game();g.state.phase='moving';g.state.ball.vx=100;g.pauseMatch();const x=g.state.ball.x;g.update(.5);assert.equal(g.state.ball.x,x);g.pauseMatch();assert.equal(g.state.phase,'moving');});
test('normal goal, own goal, reset and winning goal count once',()=>{const g=game(),s=g.state;s.phase='moving';Object.assign(s.ball,{x:1030,y:300,vx:200,vy:0});g.update(1/180);assert.equal(s.scores[0],1);g.update(.1);assert.equal(s.scores[0],1);g.update(1.4);assert.equal(s.turn,1);s.phase='moving';s.turn=0;Object.assign(s.ball,{x:50,y:300,vx:-200,vy:0});g.update(1/180);assert.equal(s.scores[1],1);g.update(1.4);s.phase='moving';s.scores=[2,1];Object.assign(s.ball,{x:1030,y:300,vx:200,vy:0});g.update(1/180);g.update(1.4);assert.equal(s.phase,'won');g.update(9);assert.equal(s.scores[0],3);});
test('sampled opening routes are defended without special first-shot rules',()=>{const g=game();let shots=0;for(let n=1;n<=5;n++)for(let a=-18;a<=18;a+=2)for(const p of [.6,1]){g.startMatch();shoot(g,n,p,a);assert.equal(g.state.scores[0]+g.state.scores[1],0,`piece ${n}, angle ${a}, power ${p}`);shots++;}assert.equal(shots,190);});
test('a legitimate second-turn goal is possible after the keeper leaves the central lane',()=>{const g=game();shoot(g,1,.6,-30);assert.equal(g.state.turn,1);assert.equal(g.state.scores[0]+g.state.scores[1],0);shoot(g,1,1);assert.equal(g.state.scores[1],1);});
test('agent controls validate input and share UI state',()=>{const g=game(),control=g.tools.find(t=>t.name==='control_flick_football_match'),read=g.tools.find(t=>t.name==='read_flick_football_match');assert.throws(()=>control.execute({action:'invalid'}));assert.equal(control.execute({action:'pause'}).phase,'paused');assert.equal(control.execute({action:'restart'}).phase,'aiming');assert.equal(read.execute({}).piecesPerTeam,5);});

function advanceAI(g,frames=100){for(let i=0;i<frames&&g.state.phase==='aiming';i++)g.tickAI(1/30);}
function instantPlanner(pieces,ball,team){const p=pieces.find(p=>p.team===team&&p.number===4);return {step:()=>({number:4,angle:Math.atan2(ball.y-p.y,ball.x-p.x),power:.8})};}
test('menu selects solo difficulty or local multiplayer and preserves a resumable match',()=>{
  const g=game({mode:'single'}),s=g.state,el=id=>g.elements.get(id);
  s.scores[0]=2;g.openMenu();assert.equal(s.phase,'ready');assert.equal(el('resumeMatch').hidden,false);
  el('difficultyHigh').listeners.click();el('modeMulti').listeners.click();assert.equal(el('difficultyOptions').hidden,true);
  g.resumeFromMenu();assert.equal(s.mode,'single');assert.equal(s.difficulty,'medium');assert.equal(s.scores[0],2);
  g.openMenu();el('start').listeners.click();assert.equal(s.mode,'multi');assert.equal(s.scores[0],0);
  g.openMenu();el('modeSingle').listeners.click();assert.equal(el('difficultyOptions').hidden,false);el('start').listeners.click();
  assert.equal(s.mode,'single');assert.equal(s.difficulty,'high');assert.equal(el('resumeMatch').hidden,true);assert.equal(el('overlay').hidden,true);
});
test('solo AI takes exactly one legal turn; player cannot grab AI pieces',()=>{
  const g=game({mode:'single',plannerFactory:instantPlanner}),s=g.state;shoot(g,4,.6);assert.equal(s.turn,1);
  const p=s.pieces.find(p=>p.team===1);g.elements.get('pitch').listeners.pointerdown({clientX:p.x,clientY:p.y,button:0,pointerId:7,preventDefault(){}});assert.equal(s.aim,null);
  advanceAI(g);assert.equal(s.phase,'moving');assert.equal(s.turn,1);
  for(let i=0;i<180*16&&s.phase==='moving';i++)g.update(1/180);
  assert.equal(s.phase,'aiming');assert.equal(s.turn,0);const x=s.pieces[0].x;
  advanceAI(g);assert.equal(s.pieces[0].x,x);assert.equal(s.turn,0);
});
test('AI work freezes on pause, and menu/restart discard old plans',()=>{
  let steps=0;const g=game({mode:'single',plannerFactory:(...args)=>{const p=instantPlanner(...args);return {step(){steps++;return p.step()}}}}),s=g.state;
  shoot(g,4,.6);g.tickAI(.5);g.tickAI(.1);assert(s.aim?.isAI);const before=steps;
  g.pauseMatch();advanceAI(g);assert.equal(s.phase,'paused');assert.equal(steps,before);assert.equal(s.aim,null);
  g.pauseMatch();assert.equal(s.phase,'aiming');advanceAI(g);assert.equal(s.phase,'moving');
  g.openMenu();const x=s.ball.x;g.update(1);g.tickAI(1);assert.equal(s.ball.x,x);g.resumeFromMenu();assert.equal(s.phase,'moving');
  g.startMatch();advanceAI(g);assert.equal(s.turn,0);assert.equal(s.phase,'aiming');assert.equal(s.ai,null);
});
test('multiplayer never plans or fires an AI shot',()=>{
  const g=game({mode:'multi',plannerFactory:()=>{throw new Error('AI called in multiplayer')}});shoot(g,4,.6);advanceAI(g);assert.equal(g.state.phase,'aiming');assert.equal(g.state.turn,1);assert.equal(g.state.ai,null);
});

test('Space resumes a match from the menu without resetting the score',()=>{
  const g=game({mode:'single'});g.state.scores[0]=2;g.openMenu();
  g.windowListeners.keydown({code:'Space',repeat:false,target:{},preventDefault(){}});
  assert.equal(g.state.phase,'aiming');assert.equal(g.state.scores[0],2);
});

test('agent resume also continues a match held in the mode menu',()=>{
  const g=game({mode:'single'}),control=g.tools.find(t=>t.name==='control_flick_football_match');
  g.state.scores[1]=1;g.openMenu();assert.equal(control.execute({action:'resume'}).phase,'aiming');assert.equal(g.state.scores[1],1);
});

test('real easy AI can execute its gentle retreat through the live turn controller',()=>{
  const g=game({mode:'single',plannerFactory:(...args)=>require('../ai.js').createPlanner(...args,()=>.5)}),s=g.state;
  s.turn=1;s.difficulty='low';Object.assign(s.ball,{x:970,y:300});Object.assign(s.pieces.find(p=>p.team===1&&p.number===1),{x:910,y:300});
  g.pauseMatch();g.pauseMatch();advanceAI(g);assert.equal(s.phase,'moving','minimum-power AI shot must pass the drag threshold');
  for(let i=0;i<180*16&&s.phase==='moving';i++)g.update(1/180);
  assert.equal(s.scores[0],0,'AI does not score an own goal');assert.equal(s.turn,0);assert.equal(s.phase,'aiming');
});

test('classic disables every player attribute while brawl uses the drafted squad',()=>{
  const lineups=[['haaland','suya','abluo','kante','qizu'],['fandui','beilin','modi','shuiye','dingding']];
  const classic=game({lineups}),brawl=game({variant:'brawl',lineups});
  for(const p of classic.state.pieces){assert.equal(p.r,27);assert.equal(p.launchScale,1);assert.equal(p.frictionScale,1);assert.equal(p.shield,false);}
  assert.equal(brawl.state.pieces[0].playerId,'haaland');assert.equal(brawl.state.pieces[0].r,32.4);
  assert.equal(brawl.state.pieces[5].shield,true);
});
test('charged Messi gains exactly one same-piece action and pause/menu never reroll',()=>{
  let rolls=0;const g=game({variant:'brawl',random:()=>{rolls++;return 0;}}),s=g.state;
  const messi=s.pieces.find(p=>p.team===0&&p.playerId==='meixi');assert.equal(messi.charged,true);
  const before=rolls;g.pauseMatch();g.pauseMatch();g.openMenu();g.resumeFromMenu();assert.equal(rolls,before);assert.equal(messi.charged,true);
  shoot(g,messi.number,.15);assert.equal(s.phase,'aiming');assert.equal(s.turn,0);assert.equal(s.bonusPiece,messi.uid);assert.equal(rolls,before);
  const other=s.pieces.find(p=>p.team===0&&p!==messi);
  g.elements.get('pitch').listeners.pointerdown({clientX:other.x,clientY:other.y,button:0,pointerId:3,preventDefault(){}});assert.equal(s.aim,null);
  g.pauseMatch();g.pauseMatch();assert.equal(s.bonusPiece,messi.uid);shoot(g,messi.number,.15);assert.equal(s.turn,1);assert.equal(s.bonusPiece,null);
});
test('sending off persists after a goal; a new match restores both players',()=>{
  const lineups=[['suya','haaland','abluo','kante','qizu'],['meixi','shuiye','modi','dingding','beilin']];
  const g=game({variant:'brawl',lineups,random:()=>0}),s=g.state,actor=s.pieces[0],target=s.pieces[6];
  s.aim={piece:actor,start:{x:actor.x,y:actor.y},pointer:{x:actor.x-40,y:actor.y}};g.fire();
  g.getSkills().onContact(actor,target);assert.equal(actor.removed,true);assert.equal(target.removed,true);
  Object.assign(s.ball,{x:1030,y:300,vx:200,vy:0});g.update(1/180);g.update(1.4);
  assert.equal(s.pieces.find(p=>p.uid===target.uid).removed,true);assert.equal(s.pieces.find(p=>p.uid===actor.uid).removed,true);
  g.startMatch();assert(s.pieces.every(p=>!p.removed));
});
test('mass skill remains through pause and is cleared by goal or match restart',()=>{
  const lineups=[['abluo','haaland','suya','kante','qizu'],['meixi','shuiye','modi','dingding','beilin']];
  const g=game({variant:'brawl',lineups,random:()=>0}),s=g.state,p=s.pieces[0];
  s.aim={piece:p,start:{x:p.x,y:p.y},pointer:{x:p.x-40,y:p.y}};g.fire();assert.equal(s.ball.mass,p.mass);
  g.pauseMatch();g.pauseMatch();assert.equal(s.ball.mass,3);
  Object.assign(s.ball,{x:1030,y:300,vx:200,vy:0});g.update(1/180);assert.equal(s.ball.mass,1.4);
  g.startMatch();assert.equal(s.ball.mass,1.4);
});
test('AI obeys a bonus-piece restriction in a brawl match',()=>{
  let allowed=null;const lineups=[['haaland','suya','abluo','kante','qizu'],['fandui','meixi','modi','dingding','beilin']];
  const g=game({mode:'single',variant:'brawl',lineups,random:()=>0,plannerFactory:(pieces,ball,team,difficulty,random,options)=>{
    allowed=options.allowedNumbers;const p=pieces.find(p=>p.team===team&&p.playerId==='meixi');return {step:()=>({number:p.number,angle:-Math.PI/2,power:.15})};
  }}),s=g.state;s.turn=1;g.turnReady();const p=s.pieces.find(p=>p.team===1&&p.playerId==='meixi');assert(p.charged);
  advanceAI(g);for(let i=0;i<180*16&&s.phase==='moving';i++)g.update(1/180);
  assert.equal(s.bonusPiece,p.uid);advanceAI(g);assert.deepEqual(Array.from(allowed),[p.number]);
  for(let i=0;i<180*16&&s.phase==='moving';i++)g.update(1/180);assert.equal(s.turn,0);assert.equal(s.bonusPiece,null);
});
test('missing all players ends the match instead of locking AI planning',()=>{
  const g=game({variant:'brawl'}),s=g.state;s.pieces.filter(p=>p.team===1).forEach(p=>p.removed=true);s.phase='moving';g.update(1/180);assert.equal(s.phase,'won');
});


test('draft formations determine both teams and survive goals and match restart',()=>{
  const formations=['defensive','balanced'],g=game({variant:'brawl',formations}),s=g.state;
  const roster=require('../roster.js');
  function check(ids){for(const piece of s.pieces){const [x,y]=roster.formations.find(f=>f.id===ids[piece.team]).positions[piece.number-1];assert.equal(piece.x,piece.team?1080-x:x);assert.equal(piece.y,y);}}
  check(['defensive','balanced']);
  formations[0]='attacking';g.openMenu();g.resumeFromMenu();check(['defensive','balanced']);
  s.phase='moving';Object.assign(s.ball,{x:1030,y:300,vx:200,vy:0});g.update(1/180);g.update(1.4);check(['defensive','balanced']);
  g.elements.get('restart').listeners.click();check(['defensive','balanced']);
  g.startMatch();check(['attacking','balanced']);
});
test('live update triggers Navas before physics, persists charges after goal, resets new match',()=>{
  const lineups=[['navas','kante','modi','meixi','abluo'],['fandui','haaland','beilin','qizu','dingding']];
  const g=game({variant:'brawl',lineups}),s=g.state;
  function rescue(){const p=s.pieces[4];g.getSkills().beginShot(p,.5);s.phase='moving';Object.assign(s.ball,{x:100,y:300,vx:-100,vy:0});g.update(1/180);}
  rescue();assert.equal(s.pieces[0].rescuesLeft,1);assert.equal(s.ball.x,302);assert.equal(s.ball.y,63);assert.equal(s.scores[1],0);
  Object.assign(s.ball,{x:1030,y:300,vx:200,vy:0});g.update(1/180);g.update(1.4);assert.equal(s.pieces[0].rescuesLeft,1);
  rescue();assert.equal(s.pieces[0].rescuesLeft,0);
  g.startMatch();assert.equal(s.pieces[0].rescuesLeft,2);
});
test('Space advances mode screen and agent start waits for lineup step',()=>{
  let ready=false,next=0;const g=game({canStart:()=>ready});g.openMenu();g.state.resumePhase=null;
  g.elements.set('draftNext',{click(){ready=true;next++;}});
  const control=g.tools.find(t=>t.name==='control_flick_football_match');
  assert.equal(control.execute({action:'start'}).phase,'ready');
  g.elements.get('start').listeners.click();assert.equal(g.state.phase,'ready');
  g.windowListeners.keydown({code:'Space',repeat:false,target:{},preventDefault(){}});
  assert.equal(next,1);assert.equal(g.state.phase,'ready');
  g.windowListeners.keydown({code:'Space',repeat:false,target:{},preventDefault(){}});
  assert.equal(g.state.phase,'aiming');
});

test('ready-state restart advances to lineup instead of bypassing the menu',()=>{
  let ready=false,next=0;const g=game({canStart:()=>ready});g.openMenu();g.state.resumePhase=null;
  g.elements.set('draftNext',{click(){ready=true;next++;}});g.elements.get('restart').listeners.click();
  assert.equal(next,1);assert.equal(g.state.phase,'ready');
  g.elements.get('restart').listeners.click();assert.equal(g.state.phase,'aiming');
});

test('starting and resuming focus the pitch so Space pauses the match',()=>{
  const g=game();assert.equal(g.getFocus(),g.elements.get('pitch'));
  const space=()=>g.windowListeners.keydown({code:'Space',repeat:false,target:g.getFocus(),preventDefault(){}});
  space();assert.equal(g.state.phase,'paused');g.elements.get('start').listeners.click();
  assert.equal(g.getFocus(),g.elements.get('pitch'));space();assert.equal(g.state.phase,'paused');
});
