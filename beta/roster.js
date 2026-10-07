(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlickRoster = api;
})(globalThis, function () {
  'use strict';
  const definitions = [
    ['suya', '苏牙', 'forward', '咬住不放', '被动：无论谁在行动，只要与对方球员接触，就有4%概率让对方离场，自己有50%概率吃红牌。同一出杆对同一对手只判定1次，每场最多触发1次。'],
    ['abluo', 'AB罗', 'forward', '重炮轰门', '出手时有30%概率触发。本次出杆中，白球与碰到的对方球员按1:1的质量计算碰撞；本杆结束恢复。'],
    ['meixi', '眉西', 'forward', '灵巧过人', '每次轮到你时，有15%概率亮起金框。这回合如果用眉西出手，球停稳后还能再用他出手一次；最多多出手1次，进球后结束。'],
    ['haaland', '哈蓝德', 'forward', '锋线巨人', '圆片半径增加20%，击球起速降低10%，以机动性换取更大的触球范围。'],
    ['modi', '魔笛', 'midfield', '魔法传球', '出杆时有8%概率，把白球传到另一名在场队友身边，优先寻找位置靠前的队友。'],
    ['dingding', '丁丁', 'midfield', '精准直塞', '出杆时有20%概率蓄力；本杆自己首次碰到白球时，白球速度提高18%。'],
    ['kante', '坎特', 'midfield', '不知疲倦', '圆片滑动阻力降低，同等力度的无碰撞滑行距离约增加15%。'],
    ['beilin', '贝林', 'midfield', '逆风领跑', '本队比分落后时，击球起速提高12%；追平后恢复。'],
    ['qizu', '齐祖', 'midfield', '大师控球', '使用不超过50%的力度出杆时，自己首次触球会使白球速度降低50%，便于控制落点。'],
    ['shuiye', '水爷', 'defender', '强硬拦截', '撞到对手时有5%概率使其受伤，接下来2个完整己方回合仅保留30%的起速与滑行距离；不叠加或刷新。'],
    ['fandui', '范队', 'defender', '钢铁屏障', '每场1层护盾，可挡一次罚下或受伤；圆片半径增加10%，击球起速降低5%。'],
    ['navas', '纳瓦斯', 'goalkeeper', '海底捞月', '被动：白球进入己方门前危险区时，自动解围到己方四分之一场附近的边线。每场最多2次。']
  ];
  const players = Object.freeze(definitions.map(([id, name, role, title, description]) => Object.freeze({
    id, name, role, asset: `assets/players/${id}.png`, skill: Object.freeze({ name: title, description })
  })));
  const byId = Object.freeze(Object.fromEntries(players.map(player => [player.id, player])));
  const defaultLineups = Object.freeze([
    Object.freeze(['fandui', 'kante', 'modi', 'meixi', 'abluo']),
    Object.freeze(['fandui', 'kante', 'modi', 'meixi', 'abluo'])
  ]);
  const formations = Object.freeze([
    {id:'balanced',name:'均衡双锋',label:'3-2 / 双锋接应',positions:[[110,300],[110,234],[110,366],[423,180],[423,420]],roles:['后卫 / 门将','后卫','后卫','前锋','前锋']},
    {id:'defensive',name:'稳守反击',label:'3-2 / 双锋回收',positions:[[110,300],[110,234],[110,366],[385,180],[385,420]],roles:['后卫 / 门将','后卫','后卫','前锋','前锋']},
    {id:'attacking',name:'两翼拉开',label:'3-2 / 边路展开',positions:[[110,300],[110,234],[110,366],[423,140],[423,460]],roles:['后卫 / 门将','后卫','后卫','前锋','前锋']}
  ].map(f=>Object.freeze({...f,positions:Object.freeze(f.positions.map(p=>Object.freeze(p))),roles:Object.freeze(f.roles)})));
  return Object.freeze({ players, byId, defaultLineups, formations });
});
