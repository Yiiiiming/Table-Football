(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas=$('pitch'),ctx=canvas.getContext('2d');
  const W=1080,H=600,L=64,R=1016,T=48,B=552,GT=228,GB=372,TARGET=3;
  const teams=[{name:'冰蓝队',short:'冰蓝队',color:'#39bdf2',dark:'#074368'},{name:'玫红队',short:'玫红队',color:'#fa346c',dark:'#700d32'}];
  const physics=globalThis.FlickPhysics,aiEngine=globalThis.FlickAI;
  const levels={low:'低',medium:'中',high:'高'};
  const roster=globalThis.FlickRoster;
  const selection={mode:'single',difficulty:'medium',variant:'brawl'};
  let skillSession=null,draft=null;
  const portraitImages=new Map();
  const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state={variant:'brawl',lineups:roster.defaultLineups.map(x=>[...x]),formations:['balanced','balanced'],bonusPiece:null,skillEvents:[],toastTime:0,mode:'single',difficulty:'medium',ai:null,resumePhase:null,phase:'ready',beforePause:'aiming',turn:0,scores:[0,0],pieces:[],ball:null,aim:null,timer:0,settle:0,shotTime:0,sound:false,particles:[],lastScorer:0};
  let previous=0,accumulator=0,audioContext;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const aiTurn=()=>state.mode==='single'&&state.turn===1;
  const usable=piece=>!piece.removed&&piece.team===state.turn&&(!state.bonusPiece||piece.uid===state.bonusPiece);
  const humanTurn=()=>state.phase==='aiming'&&!aiTurn();
  const moving=()=>state.phase==='moving';
  const playable=()=>['aiming','moving','goal'].includes(state.phase);
  function sound(f,d=.07,type='sine',volume=.04){if(!state.sound)return;try{audioContext ||= new (window.AudioContext||window.webkitAudioContext)();audioContext.resume();const o=audioContext.createOscillator(),g=audioContext.createGain();o.type=type;o.frequency.setValueAtTime(f,audioContext.currentTime);g.gain.setValueAtTime(volume,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+d);o.connect(g).connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+d);}catch{}}
  function setupPieces(reset=false){
    const formation=t=>(roster.formations.find(f=>f.id===state.formations[t])||roster.formations[0]).positions;
    if(reset||!state.pieces.length){
      state.pieces=[];
      teams.forEach((team,t)=>formation(t).forEach(([x,y],i)=>state.pieces.push({x:t?W-x:x,y,vx:0,vy:0,r:27,mass:3,team:t,number:i+1,uid:t+':'+(i+1),playerId:state.lineups[t][i],angle:0})));
    }else for(const piece of state.pieces){const [x,y]=formation(piece.team)[piece.number-1];Object.assign(piece,{x:piece.team?W-x:x,y,vx:0,vy:0,angle:0});}
    const ball={x:540,y:300,vx:0,vy:0,r:11,mass:1.4,team:-1,angle:0};
    if(state.ball)Object.assign(state.ball,ball);else state.ball=ball;
    state.aim=null;state.settle=0;state.shotTime=0;setPower(0);
  }
  function playerName(piece){return roster.byId[piece.playerId]?.name||teams[piece.team].name;}
  function syncRoster(){
    const brawl=state.variant==='brawl';
    for(const id of ['rosterStrip','brawlStatus','skillFeed'])$(id).hidden=!brawl;
    if(!brawl)return;
    $('brawlStatus').textContent=state.bonusPiece?'还能再出手一次 · 请使用金框球员':'球员大乱斗 · 金框球员这回合可以出手两次';
    $('rosterStrip').innerHTML=teams.map((team,t)=>'<div class="roster-team '+(t?'pink':'')+'"><b>'+team.name+'</b><div class="roster-tokens">'+state.pieces.filter(p=>p.team===t).map(p=>{
      const card=roster.byId[p.playerId],label=p.removed?'已离场':p.injured?'伤停 '+p.injured+' 回合':p.charged||p.uid===state.bonusPiece?'额外行动':p.playerId==='navas'?'救险 '+p.rescuesLeft+'/2':p.shield?'护盾就绪':'';
      return '<div class="roster-token '+(p.removed?'is-sent-off ':p.injured?'is-injured ':'')+(p.charged||p.uid===state.bonusPiece?'is-charged':'')+'" title="'+escapeHTML(card.name+' · '+card.skill.name+'：'+card.skill.description)+'"><img src="'+card.asset+'" alt=""><span class="roster-token-name">'+escapeHTML(card.name)+'</span><span class="roster-state">'+label+'</span></div>';
    }).join('')+'</div></div>').join('');
    $('skillFeed').innerHTML=state.skillEvents.length?state.skillEvents.slice(-5).reverse().map(e=>'<div class="skill-event"><b>'+escapeHTML(e.title)+'</b><span>'+escapeHTML(e.text)+'</span></div>').join(''):'<div class="skill-event">技能事件会显示在这里。每次出杆对同一对手只判定一次碰撞技能。</div>';
  }
  function skillEvent(event){
    state.skillEvents.push(event);if(state.skillEvents.length>30)state.skillEvents.shift();
    $('skillToast').textContent=event.title+' · '+event.text;$('skillToast').hidden=false;state.toastTime=3.5;syncRoster();
  }
  function setPower(value){const n=Math.round(value*100);$('powerValue').textContent=n+'%';$('powerFill').style.width=n+'%';$('powerTrack').setAttribute('aria-valuenow',String(n));}
  function syncUI(){
    $('score0').textContent=state.scores[0];$('score1').textContent=state.scores[1];$('pause').disabled=['ready','won'].includes(state.phase);$('pause').textContent=state.phase==='paused'?'继续':'暂停';
    $('turnDot').style.background=teams[state.turn].color;
    $('turnText').textContent=state.phase==='ready'?'选择比赛模式':state.phase==='moving'?teams[state.turn].short+'出杆中':state.phase==='won'?'比赛结束':state.phase==='paused'?'比赛已暂停':state.phase==='goal'?'进球！':aiTurn()?'AI 正在思考 · '+levels[state.difficulty]+'档':teams[state.turn].short+'的回合';
    $('team0').classList.toggle('inactive',state.turn!==0&&state.phase!=='ready'&&state.phase!=='won');$('team1').classList.toggle('inactive',state.turn!==1&&state.phase!=='ready'&&state.phase!=='won');
    $('matchType').textContent=state.mode==='single'?'SOLO CHALLENGE':'LOCAL MATCH';
    $('matchInfo').textContent=state.mode==='single'?'单人挑战 · '+levels[state.difficulty]+'档 AI':'同屏双人 · 各五枚棋子';
    $('team0Meta').textContent=state.mode==='single'?'你 · 向右进攻':'玩家 1 · 向右进攻';
    $('team1Meta').textContent=state.mode==='single'?'AI · '+levels[state.difficulty]+'档 · 向左进攻':'玩家 2 · 向左进攻';
    $('footerMode').textContent=state.mode==='single'?'空格暂停 · 你执冰蓝队':'空格暂停 · 同屏双人';
    canvas.style.cursor=humanTurn()?'grab':'default';syncRoster();
  }
  function syncMenu(){
    $('ruleClassic').setAttribute('aria-pressed',String(selection.variant==='classic'));$('ruleBrawl').setAttribute('aria-pressed',String(selection.variant==='brawl'));
    $('modeSingle').setAttribute('aria-pressed',String(selection.mode==='single'));
    $('modeMulti').setAttribute('aria-pressed',String(selection.mode==='multi'));
    $('difficultyOptions').hidden=selection.mode!=='single';
    for(const level of Object.keys(levels))$('difficulty'+level[0].toUpperCase()+level.slice(1)).setAttribute('aria-pressed',String(selection.difficulty===level));
    $('difficultyHelp').textContent={low:'轻松练习：瞄准更随性，适合熟悉手感。',medium:'认真对抗：计算击球路线，寻找射门机会。',high:'进阶挑战：尝试反弹与多角度射门，兼顾防守。'}[selection.difficulty];
    if(state.phase==='ready')$('start').textContent=selection.mode==='single'?'挑战'+levels[selection.difficulty]+'档 AI':'开始双人对战';
    draft?.syncSettings?.();
  }
  function turnReady(fresh=true){
    if(fresh)skillSession?.beginTurn(state.turn,{bonus:!!state.bonusPiece});
    state.phase='aiming';state.settle=0;state.aim=null;state.ai=aiTurn()?{delay:.45,planner:null,choice:null,preview:0}:null;setPower(0);
    $('status').textContent=aiTurn()?'玫红队 AI 正在思考 · '+levels[state.difficulty]+'档':state.bonusPiece?'还能再出手一次 · 请使用'+playerName(state.pieces.find(p=>p.uid===state.bonusPiece)):'轮到'+teams[state.turn].name+' · 向后拖拽圆片';syncUI();
  }
  function lockBackground(locked){
    const arena=canvas.parentElement,shell=canvas.closest?.('.game-shell');
    if(shell)for(const child of shell.children)if(child!==arena)child.inert=locked;
    canvas.inert=locked;
    $('overlay').setAttribute('role','dialog');$('overlay').setAttribute('aria-modal','true');$('overlay').setAttribute('aria-labelledby','overlayTitle');
  }
  function hideOverlay(){ lockBackground(false);canvas.tabIndex=0;canvas.focus?.({preventScroll:true});$('overlay').hidden=true;$('resumeMatch').hidden=true;$('overlay').classList.remove('is-menu');canvas.parentElement.classList.remove('show-menu'); }
  function startMatch(keepLineup=false){
    state.formations=keepLineup?[...state.formations]:(draft?.getFormations?.()||['balanced','balanced']);
    state.mode=selection.mode;state.difficulty=selection.difficulty;state.variant=selection.variant;state.lineups=keepLineup?state.lineups.map(x=>[...x]):draft?draft.getLineups():roster.defaultLineups.map(x=>[...x]);state.ai=null;state.resumePhase=null;state.bonusPiece=null;state.skillEvents=[];state.toastTime=0;state.scores=[0,0];state.turn=0;state.particles=[];setupPieces(true);
    skillSession=globalThis.FlickSkills.createSession({pieces:state.pieces,ball:state.ball,scores:state.scores,enabled:state.variant==='brawl',onEvent:skillEvent});$('skillToast').hidden=true;hideOverlay();$('goalCall').classList.remove('show');turnReady();sound(440,.1);
  }
  function restartMatch(){if(state.phase==='ready'&&draft?.canStart?.()===false){$('draftNext').click();return;}const keepLineup=state.phase!=='ready';if(keepLineup){selection.mode=state.mode;selection.difficulty=state.difficulty;selection.variant=state.variant;}startMatch(keepLineup);}
  function showOverlay(title,text,button,kicker){
    $('skillToast').hidden=true;state.toastTime=0;
    $('menuOptions').hidden=true;$('resumeMatch').hidden=true;$('overlay').classList.remove('is-menu');canvas.parentElement.classList.remove('show-menu');
    $('start').hidden=false;$('overlayTitle').textContent=title;$('overlayText').textContent=text;$('start').textContent=button;$('overlayKicker').textContent=kicker;$('overlay').hidden=false;lockBackground(true);$('start').focus?.({preventScroll:true});
  }
  function openMenu(){
    $('skillToast').hidden=true;state.toastTime=0;
    if(state.phase==='ready')return;
    state.resumePhase=state.phase==='paused'?state.beforePause:playable()?state.phase:null;
    state.phase='ready';state.ai=null;cancelAim();$('goalCall').classList.remove('show');
    $('overlay').classList.add('is-menu');canvas.parentElement.classList.add('show-menu');$('overlay').hidden=false;
    $('overlayTitle').textContent='BUILD YOUR FIVE.';$('overlayText').textContent='经典对战，或挑选五人阵容挑战球员大乱斗。';$('overlayKicker').textContent='YOUR TURN. YOUR GAME.';
    $('menuOptions').hidden=false;$('resumeMatch').hidden=!state.resumePhase;
    $('status').textContent=state.resumePhase?'当前比赛已暂停 · 开始新比赛将重置比分':'选择模式，准备开球';draft?.resetMenu?.();syncMenu();syncUI();lockBackground(true);$('draftNext').focus?.({preventScroll:true});
  }
  function resumeFromMenu(){
    if(!state.resumePhase)return;state.phase=state.resumePhase;state.resumePhase=null;hideOverlay();
    if(state.phase==='aiming')turnReady(false);else{$('status').textContent=state.phase==='goal'?'进球！':'等待球停稳';if(state.phase==='goal')$('goalCall').classList.add('show');syncUI();}
  }
  function cancelAim(){state.aim=null;setPower(0);canvas.style.cursor=humanTurn()?'grab':'default';}
  function pauseMatch(){
    if(state.phase==='paused'){
      state.phase=state.beforePause;hideOverlay();
      if(state.phase==='aiming')turnReady(false);else {$('status').textContent=state.phase==='goal'?'进球！':'等待球停稳';if(state.phase==='goal')$('goalCall').classList.add('show');}
    }else if(playable()){
      state.beforePause=state.phase;state.phase='paused';state.ai=null;cancelAim();$('goalCall').classList.remove('show');$('status').textContent='比赛已暂停';showOverlay('休息一下','棋盘会停在这里，准备好再继续。','继续比赛','MATCH PAUSED');
    }
    syncUI();
  }
  function tickAI(dt){
    if(state.phase!=='aiming'||!aiTurn())return;
    const work=state.ai;if(!work)return;
    if(work.delay>0){work.delay-=dt;return;}
    if(work.choice){work.preview-=dt;if(work.preview<=0)fire();return;}
    work.planner ||= aiEngine.createPlanner(state.pieces,state.ball,state.turn,state.difficulty,Math.random,{allowedNumbers:state.bonusPiece?[state.pieces.find(p=>p.uid===state.bonusPiece).number]:undefined});
    const choice=work.planner.step();if(!choice)return;
    const piece=state.pieces.find(p=>usable(p)&&p.number===choice.number);
    if(!piece)return;
    work.choice=choice;work.preview=.35;
    const pull=choice.power*135;
    state.aim={piece,start:{x:piece.x,y:piece.y},pointer:{x:piece.x-Math.cos(choice.angle)*pull,y:piece.y-Math.sin(choice.angle)*pull},isAI:true};
    setPower(choice.power);$('status').textContent='AI 瞄准中 · 准备出杆';
  }
  function aimVector(){if(!state.aim)return {dx:0,dy:0,power:0};const a=state.aim,dx=a.start.x-a.pointer.x,dy=a.start.y-a.pointer.y,dist=Math.hypot(dx,dy),scale=dist>135?135/dist:1;return {dx:dx*scale,dy:dy*scale,power:Math.min(dist/135,1)};}
  function fire(){
    if(!state.aim||state.phase!=='aiming')return;const v=aimVector(),piece=state.aim.piece;cancelAim();
    if(v.power<.065){$('status').textContent='向后拉一点，再松手';return;}
    skillSession?.beginShot(piece,v.power);physics.launch(piece,Math.atan2(v.dy,v.dx),v.power);state.ai=null;state.phase='moving';state.settle=0;state.shotTime=0;$('status').textContent=teams[state.turn].name+'出杆 · 等待球停稳';syncUI();sound(180,.08,'triangle');
  }
  function score(team){
    if(state.phase!=='moving')return;skillSession?.finishShot({allowExtra:false});skillSession?.endTurn(state.turn);skillSession?.clearRound();state.bonusPiece=null;state.scores[team]++;state.lastScorer=team;state.phase='goal';state.timer=1.35;cancelAim();$('goalTeam').textContent=teams[team].name;$('goalCall').classList.add('show');$('status').textContent=teams[team].name+'进球！';syncUI();sound(660,.15,'triangle',.07);setTimeout(()=>sound(880,.2,'triangle',.05),130);
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches)for(let i=0;i<48;i++)state.particles.push({x:state.ball.x,y:state.ball.y,vx:(Math.random()-.5)*400,vy:(Math.random()-.5)*500,life:1.3,color:i%2?teams[team].color:'#fff5d7'});
  }
  function update(dt){
    if(!playable())return;
    if(state.toastTime>0){state.toastTime-=dt;if(state.toastTime<=0)$('skillToast').hidden=true;}
    state.particles=state.particles.filter(p=>p.life>0);for(const p of state.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=250*dt;p.life-=dt;}
    if(state.phase==='goal'){
      state.timer-=dt;if(state.timer<=0){$('goalCall').classList.remove('show');if(state.scores[state.lastScorer]>=TARGET){state.phase='won';$('status').textContent=teams[state.lastScorer].name+'赢得比赛';showOverlay(teams[state.lastScorer].short+'获胜！',state.scores[0]+' : '+state.scores[1]+' · 好球，再战一场？','再来一局','FULL TIME');syncUI();}else{state.turn=1-state.lastScorer;setupPieces();turnReady();}}return;
    }
    if(!moving())return;state.shotTime+=dt;
    const bodies=[...state.pieces,state.ball];
    skillSession?.beforeStep();
    const result=physics.step(bodies,dt,(speed,ballCollision)=>sound(ballCollision?480:240,.035,'triangle',Math.min(.045,speed/18000)),skillSession?.onContact,skillSession?.onTouch);
    if(result.goal!==null){score(result.goal);return;}
    if(checkTeamOut())return;
    const max=result.maxSpeed;
    state.settle=max<5?state.settle+dt:0;
    if(state.settle>.32){
      bodies.forEach(o=>{o.vx=0;o.vy=0;});const extra=skillSession?.finishShot();
      if(extra&&!extra.removed){state.bonusPiece=extra.uid;turnReady();}
      else{skillSession?.endTurn(state.turn);state.bonusPiece=null;state.turn=1-state.turn;turnReady();}
    }
  }
  function checkTeamOut(){
    const active=teams.map((_,t)=>state.pieces.some(p=>p.team===t&&!p.removed));
    if(active.every(Boolean))return false;
    skillSession?.finishShot({allowExtra:false});skillSession?.clearRound();state.bonusPiece=null;state.ai=null;cancelAim();state.phase='won';
    const winner=active[0]?0:active[1]?1:null;
    const title=winner===null?'本局平局':teams[winner].name+'获胜！';
    $('status').textContent=title;showOverlay(title,winner===null?'双方均无可用球员。':'对手已无可用球员。','再来一局','FULL TIME');syncUI();return true;
  }
  function rect(x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
  function line(x1,y1,x2,y2,color,width=1){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
  function circle(x,y,r,fill,stroke,width=1){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
  function draw(){
    ctx.clearRect(0,0,W,H);
    const corner=physics.constants.CORNER_RADIUS;
    const frame=ctx.createLinearGradient(0,0,0,H);frame.addColorStop(0,'#4a4b56');frame.addColorStop(.05,'#292a33');frame.addColorStop(.5,'#15151c');frame.addColorStop(1,'#444550');rect(17,12,1046,576,9,frame);rect(34,28,1012,544,3,'#080c14');
    ctx.save();ctx.beginPath();ctx.roundRect(L,T,R-L,B-T,corner);ctx.clip();const turf=ctx.createLinearGradient(L,T,R,B);turf.addColorStop(0,'#213745');turf.addColorStop(.48,'#24353d');turf.addColorStop(1,'#382933');ctx.fillStyle=turf;ctx.fillRect(L,T,R-L,B-T);for(let i=0;i<12;i++){ctx.fillStyle=i%2?'rgba(255,255,255,.018)':'rgba(0,0,0,.06)';ctx.fillRect(L+i*(R-L)/12,T,(R-L)/12,B-T);}
    ctx.strokeStyle='#d5e8f052';ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(L+15,T+15,R-L-30,B-T-30,corner-15);ctx.stroke();line(540,T+15,540,B-15,'#d5e8f052',1.5);circle(540,300,79,null,'#d5e8f052',1.5);circle(540,300,3,'#d5e8f087');ctx.strokeRect(L-1,176,132,248);ctx.strokeRect(R-131,176,132,248);ctx.strokeRect(L-1,GT+12,54,GB-GT-24);ctx.strokeRect(R-53,GT+12,54,GB-GT-24);circle(186,300,3,'#d5e8f052');circle(894,300,3,'#d5e8f052');
    ctx.textAlign='center';ctx.fillStyle='#d9ebfc0f';ctx.font='900 21px system-ui';ctx.fillText('FIVE A SIDE',540,472);ctx.restore();
    for(const x of [29,R]){rect(x,GT,35,GB-GT,1,'#06080e');for(let y=GT+8;y<GB;y+=12)line(x,y,x+35,y,'#9eabc02d');for(let xx=x+7;xx<x+35;xx+=9)line(xx,GT,xx,GB,'#9eabc02d');}
    line(L+corner,T,R-corner,T,'#b0bbc929',2);line(L+corner,B,R-corner,B,'#b0bbc929',2);line(L,T+corner,L,GT,teams[0].color,3);line(L,GB,L,B-corner,teams[0].color,3);line(R,T+corner,R,GT,teams[1].color,3);line(R,GB,R,B-corner,teams[1].color,3);
    for(const [x,y,start,end,color] of [[L+corner,T+corner,Math.PI,Math.PI*1.5,teams[0].color],[R-corner,T+corner,-Math.PI/2,0,teams[1].color],[L+corner,B-corner,Math.PI/2,Math.PI,teams[0].color],[R-corner,B-corner,0,Math.PI/2,teams[1].color]]){ctx.beginPath();ctx.arc(x,y,corner,start,end);ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.stroke();}
    for(const x of [L,R])for(const y of [GT,GB])circle(x,y,4,'#f0f2f6');
    if(state.aim){
      const a=state.aim,v=aimVector(),length=Math.hypot(v.dx,v.dy),p=a.piece;
      circle(p.x,p.y,37,null,teams[p.team].color+'50',2);ctx.beginPath();ctx.arc(p.x,p.y,37,-Math.PI/2,-Math.PI/2+Math.PI*2*v.power);ctx.strokeStyle=teams[p.team].color;ctx.lineWidth=3;ctx.stroke();
      if(length>6){const nx=v.dx/length,ny=v.dy/length,reach=65+length*1.1;for(let d=43;d<reach;d+=12){ctx.globalAlpha=.8*(1-d/(reach*1.25));circle(p.x+nx*d,p.y+ny*d,2.4,'#f0f3f8');}ctx.globalAlpha=1;const ex=p.x+nx*reach,ey=p.y+ny*reach;ctx.fillStyle='#f0f3f8';ctx.beginPath();ctx.moveTo(ex+nx*8,ey+ny*8);ctx.lineTo(ex-nx*5-ny*6,ey-ny*5+nx*6);ctx.lineTo(ex-nx*5+ny*6,ey-ny*5-nx*6);ctx.closePath();ctx.fill();line(p.x-nx*36,p.y-ny*36,p.x-v.dx,p.y-v.dy,teams[p.team].color,3);circle(p.x-v.dx,p.y-v.dy,5,teams[p.team].color);}
    }
    for(const p of state.pieces){
      if(p.removed)continue;
      const t=teams[p.team],r=p.r;
      circle(p.x+2,p.y+5,r+2,'#03050ba0');circle(p.x+2,p.y+6,r-1,'#03050b');
      if(state.phase==='aiming'&&usable(p))circle(p.x,p.y,r+6,null,t.color+'45',1.5);
      const rim=ctx.createLinearGradient(p.x-r,p.y-r,p.x+r,p.y+r);rim.addColorStop(0,'#f1f3fa');rim.addColorStop(.18,'#a4b3c6');rim.addColorStop(.42,'#49586b');rim.addColorStop(.57,'#d1d9e5');rim.addColorStop(.8,'#778294');rim.addColorStop(1,'#303845');circle(p.x,p.y,r,rim,'#0b0f17',1.2);circle(p.x,p.y,r-3,'#0a1421');
      const enamel=ctx.createRadialGradient(p.x-10,p.y-12,2,p.x,p.y,r+5);enamel.addColorStop(0,p.team===0?'#73dafa':'#ff83a4');enamel.addColorStop(.40,t.color);enamel.addColorStop(.76,p.team===0?'#1474aa':'#bd174c');enamel.addColorStop(1,t.dark);circle(p.x,p.y,r-5,enamel);circle(p.x,p.y,r-8,null,'#ffffff35',.9);
      ctx.save();ctx.beginPath();ctx.arc(p.x,p.y,r-6,0,Math.PI*2);ctx.clip();const gloss=ctx.createLinearGradient(0,p.y-r,0,p.y+7);gloss.addColorStop(0,'#ffffff3d');gloss.addColorStop(1,'#ffffff00');ctx.fillStyle=gloss;ctx.beginPath();ctx.ellipse(p.x-3,p.y-13,27,12,-.22,0,Math.PI*2);ctx.fill();line(p.x-r,p.y+14,p.x+r,p.y+4,'#09152235',5);ctx.restore();
      if(state.variant==='brawl'){
        const portrait=portraitImages.get(p.playerId);
        if(portrait?.complete&&portrait.naturalWidth){ctx.save();ctx.beginPath();ctx.arc(p.x,p.y,r-6,0,Math.PI*2);ctx.clip();ctx.drawImage(portrait,p.x-r+5,p.y-r+5,(r-5)*2,(r-5)*2);ctx.restore();}
        circle(p.x,p.y,r-4,null,t.color,2.5);
        if(p.charged||p.uid===state.bonusPiece)circle(p.x,p.y,r+3,null,'#ffd45a',4);
        if(p.shield)circle(p.x,p.y,r+6,null,'#c7e7ff99',1.5);
        if(p.injured){circle(p.x,p.y,r-5,'#15121c77');ctx.fillStyle='#ffb0a5';ctx.font='bold 17px system-ui';ctx.textAlign='center';ctx.fillText('伤',p.x,p.y+6);}
        const nameOnRight=p.x<W/2;ctx.textAlign=nameOnRight?'left':'right';ctx.font='bold 9px system-ui';ctx.fillStyle='#fff';ctx.fillText(playerName(p),p.x+(nameOnRight?1:-1)*(r+8),p.y+3);ctx.textAlign='center';
        circle(p.x+r-4,p.y+r-4,8,t.color,'#0e1822',1);ctx.font='bold 9px system-ui';ctx.fillStyle='#07131d';ctx.fillText(p.number,p.x+r-4,p.y+r-1);
        continue;
      }
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 19px system-ui';ctx.fillStyle='#08142177';ctx.fillText(String(p.number).padStart(2,'0'),p.x,p.y+2);ctx.fillStyle='#f1f6ff';ctx.fillText(String(p.number).padStart(2,'0'),p.x,p.y);ctx.textBaseline='alphabetic';ctx.beginPath();ctx.arc(p.x,p.y,r-1,Math.PI*1.15,Math.PI*1.72);ctx.strokeStyle='#ffffff88';ctx.lineWidth=1.2;ctx.stroke();
    }
    const b=state.ball;if(b){circle(b.x+2,b.y+4,b.r+1,'#02070b88');ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.angle);const leather=ctx.createRadialGradient(-4,-5,1,1,2,b.r+2);leather.addColorStop(0,'#fff');leather.addColorStop(.55,'#edf1f7');leather.addColorStop(1,'#939fab');circle(0,0,b.r,leather,'#f7faffaa',.8);ctx.fillStyle='#182333';ctx.beginPath();for(let i=0;i<5;i++){const a=i*Math.PI*.4;ctx.lineTo(Math.cos(a)*4.6,Math.sin(a)*4.6);}ctx.closePath();ctx.fill();for(let i=0;i<5;i++){const a=i*Math.PI*.4;line(Math.cos(a)*4.6,Math.sin(a)*4.6,Math.cos(a)*10.5,Math.sin(a)*10.5,'#718295',.75);circle(Math.cos(a+.62)*11,Math.sin(a+.62)*11,2.1,'#28384a');}ctx.restore();}
    for(const p of state.particles){ctx.globalAlpha=clamp(p.life,0,1);rect(p.x,p.y,5,8,1,p.color);}ctx.globalAlpha=1;
  }
  function frame(time){if(!previous)previous=time;const elapsed=Math.min((time-previous)/1000,.06);accumulator+=elapsed;previous=time;while(accumulator>=1/180){update(1/180);accumulator-=1/180;}tickAI(elapsed);draw();requestAnimationFrame(frame);}
  function position(e){const box=canvas.getBoundingClientRect();return{x:(e.clientX-box.left)*W/box.width,y:(e.clientY-box.top)*H/box.height};}
  canvas.addEventListener('pointerdown',e=>{
    if(!humanTurn()||state.aim||e.button!==0)return;const point=position(e),radius=Math.max(34,22*W/canvas.getBoundingClientRect().width);let piece=null,distance=Infinity;
    for(const p of state.pieces){const d=Math.hypot(p.x-point.x,p.y-point.y);if(usable(p)&&d<radius&&d<distance){piece=p;distance=d;}}
    if(!piece){$('status').textContent=state.bonusPiece?'这次只能用金框球员再出手':'请拖动'+teams[state.turn].short+'的可用圆片';return;}
    e.preventDefault();canvas.setPointerCapture(e.pointerId);state.aim={piece,start:point,pointer:point,pointerId:e.pointerId};canvas.style.cursor='grabbing';$('status').textContent='向后拉，松手弹射 · 拉得越远，力度越大';
  });
  canvas.addEventListener('pointermove',e=>{if(state.aim?.pointerId!==e.pointerId)return;e.preventDefault();state.aim.pointer=position(e);setPower(aimVector().power);});
  canvas.addEventListener('pointerup',e=>{if(state.aim?.pointerId!==e.pointerId)return;state.aim.pointer=position(e);fire();if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
  canvas.addEventListener('pointercancel',e=>{if(state.aim?.pointerId===e.pointerId){cancelAim();if(state.phase==='aiming')turnReady(false);}});canvas.addEventListener('lostpointercapture',e=>{if(state.aim?.pointerId===e.pointerId)cancelAim();});canvas.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('keydown',e=>{if(e.code==='Tab'&&!$('overlay').hidden){const buttons=Array.from($('overlay').querySelectorAll?.('button:not([disabled]), a[href], [tabindex="0"]')||[]).filter(el=>!el.hidden&&el.offsetParent!==null);const index=buttons.indexOf(document.activeElement);if(buttons.length&&(index===-1||e.shiftKey&&index===0||!e.shiftKey&&index===buttons.length-1)){e.preventDefault();buttons[e.shiftKey?buttons.length-1:0].focus();}}if(e.code==='Space'&&!e.repeat&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();if(state.phase==='ready'&&state.resumePhase)resumeFromMenu();else if(state.phase==='ready'){if(draft?.canStart?.()!==false)startMatch();else $('draftNext').click();}else if(state.phase==='won')restartMatch();else pauseMatch();}if(e.code==='Escape'){if(state.phase==='ready'&&state.resumePhase)resumeFromMenu();else if(state.aim&&!state.aim.isAI)cancelAim();else if(playable())pauseMatch();}});
  window.addEventListener('blur',()=>{if(playable())pauseMatch();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&playable())pauseMatch();});
  $('ruleClassic').addEventListener('click',()=>{selection.variant='classic';syncMenu();});
  $('ruleBrawl').addEventListener('click',()=>{selection.variant='brawl';syncMenu();});
  $('modeSingle').addEventListener('click',()=>{selection.mode='single';syncMenu();});
  $('modeMulti').addEventListener('click',()=>{selection.mode='multi';syncMenu();});
  for(const level of Object.keys(levels))$('difficulty'+level[0].toUpperCase()+level.slice(1)).addEventListener('click',()=>{selection.difficulty=level;syncMenu();});
  $('menu').addEventListener('click',()=>{openMenu();$('menu').blur();});
  $('resumeMatch').addEventListener('click',()=>{resumeFromMenu();$('resumeMatch').blur();});
  $('start').addEventListener('click',()=>{if(state.phase==='paused')pauseMatch();else if(state.phase==='won')restartMatch();else if(draft?.canStart?.()!==false)startMatch();$('start').blur();});$('pause').addEventListener('click',()=>{pauseMatch();$('pause').blur();});$('restart').addEventListener('click',()=>{restartMatch();$('restart').blur();});$('sound').addEventListener('click',()=>{state.sound=!state.sound;$('sound').textContent='音效：'+(state.sound?'开':'关');$('sound').setAttribute('aria-pressed',String(state.sound));sound(440,.1);$('sound').blur();});
  function snapshot(){return {phase:state.phase,variant:state.variant,formations:[...state.formations],bonusPiece:state.bonusPiece,availablePlayers:teams.map((_,t)=>state.pieces.filter(p=>p.team===t&&!p.removed).length),mode:state.mode,difficulty:state.mode==='single'?state.difficulty:null,aiThinking:state.phase==='aiming'&&aiTurn(),turn:teams[state.turn].name,scores:[...state.scores],target:TARGET,piecesPerTeam:5};}
  if(document.modelContext?.registerTool){const lifecycle=new AbortController();const definitions=[{name:'read_flick_football_match',description:'读取五对五弹指足球的比分与当前回合。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(input){if(input&&Object.keys(input).length)throw new Error('No parameters accepted');return snapshot();}},{name:'control_flick_football_match',description:'按菜单选择开始、暂停、继续或重开弹指足球。重开会清空比分。',inputSchema:{type:'object',properties:{action:{type:'string',enum:['start','pause','resume','restart']}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||Object.keys(input).length!==1||!['start','pause','resume','restart'].includes(input.action))throw new Error('Invalid action');if(input.action==='start'&&state.phase==='ready'&&draft?.canStart?.()!==false)startMatch();if(input.action==='restart')restartMatch();if(input.action==='resume'&&state.phase==='ready'&&state.resumePhase)resumeFromMenu();if(input.action==='pause'&&playable()||input.action==='resume'&&state.phase==='paused')pauseMatch();return snapshot();}}];for(const tool of definitions)try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}
  draft=globalThis.FlickDraft.mount({getSettings:()=>selection});
  for(const player of roster.players){const img=new Image();portraitImages.set(player.id,img);img.onload=()=>draw();img.src=player.asset;}
  lockBackground(true);$('draftNext').focus?.({preventScroll:true});
  setupPieces();syncMenu();syncUI();draw();requestAnimationFrame(frame);
})();
