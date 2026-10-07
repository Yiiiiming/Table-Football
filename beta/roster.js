(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlickRoster = api;
})(globalThis, function () {
  'use strict';
  const definitions = [
    ['suya', '苏牙', 'forward', '咬住不放', '撞到对手时有4%概率将其永久罚下，每名苏牙每场最多触发1次；触发后自己也有50%概率被红牌罚下。'],
    ['abluo', 'AB罗', 'forward', '重炮轰门', '出杆时有30%概率，使本杆白球与自己质量相同（1:1）；本杆结束恢复。'],
    ['meixi', '眉西', 'forward', '灵巧过人', '每个正常己方回合开始有15%概率蓄力；选择眉西出杆后，可用他再行动1次。额外行动不重复抽取。'],
    ['haaland', '哈兰德', 'forward', '锋线巨人', '圆片半径增加20%，击球起速降低10%，以机动性换取更大的触球范围。'],
    ['modi', '魔笛', 'midfield', '魔法传球', '出杆时有8%概率，把白球传到另一名在场队友身边，优先寻找位置靠前的队友。'],
    ['dingding', '丁丁', 'midfield', '精准直塞', '出杆时有20%概率蓄力；本杆自己首次碰到白球时，白球速度提高18%。'],
    ['kante', '坎特', 'midfield', '不知疲倦', '圆片滑动阻力降低，同等力度的无碰撞滑行距离约增加15%。'],
    ['beilin', '贝林', 'midfield', '逆风领跑', '本队比分落后时，击球起速提高12%；追平后恢复。'],
    ['qizu', '齐祖', 'midfield', '大师控球', '使用不超过50%的力度出杆时，自己首次触球会使白球速度降低50%，便于控制落点。'],
    ['shuiye', '水爷', 'defender', '强硬拦截', '撞到对手时有5%概率使其受伤，接下来2个完整己方回合仅保留30%的起速与滑行距离；不叠加或刷新。'],
    ['fandui', '范队', 'defender', '钢铁屏障', '每场1层护盾，可挡一次罚下或受伤；圆片半径增加10%，击球起速降低5%。']
  ];
  const players = Object.freeze(definitions.map(([id, name, role, title, description]) => Object.freeze({
    id, name, role, asset: `assets/players/${id}.png`, skill: Object.freeze({ name: title, description })
  })));
  const byId = Object.freeze(Object.fromEntries(players.map(player => [player.id, player])));
  const defaultLineups = Object.freeze([
    Object.freeze(['fandui', 'kante', 'modi', 'meixi', 'abluo']),
    Object.freeze(['fandui', 'kante', 'modi', 'meixi', 'abluo'])
  ]);
  return Object.freeze({ players, byId, defaultLineups });
});
