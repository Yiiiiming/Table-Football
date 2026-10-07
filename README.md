# Table Football · 弹指足球

支持单人挑战 AI 和两人同屏、每队五枚圆片的弹射足球小游戏。按住本方圆片向后拖拽，松手出杆；所有棋子停稳后换手。先入三球获胜，乌龙球给对方计分。支持鼠标和触屏，空格暂停，切换窗口自动暂停。

在线游玩：https://yiiiiming.github.io/Table-Football/

## Beta 球员大乱斗

新增独立试玩入口：https://yiiiiming.github.io/Table-Football/beta/

提供经典模式及11位可选球员的大乱斗模式，均支持单人AI与同屏双人。技能、素材与有限样本平衡说明见 [Beta说明](beta/README.md)。正式版玩法保留。

## 比赛模式

开局菜单可选择「单人挑战」或「同屏双人」。单人时玩家使用冰蓝队，AI 使用玫红队，提供低、中、高三档：低档保留较大的瞄准误差；中档模拟击球路线；高档增加多角度和反弹路线，兼顾进攻与防守。AI 和玩家使用同一套物理、力度与计分规则，不会移动棋子或修改比分作弊。

点击「模式菜单」可暂停当前比赛并重新选择模式，点击「继续当前比赛」保留比分继续；点击开始新比赛才会清零。暂停、切换窗口或回到菜单时，AI 也会停止。

## 本地运行

无需安装依赖或构建：

```sh
python3 -m http.server 8767
```

在浏览器打开 http://localhost:8767。

## 检查

安装 Node.js 后运行：

```sh
node --check game.js
node --test tests/*.test.cjs
```

测试覆盖模式切换、三档 AI 决策、AI 回合和暂停恢复，以及双人选子、取消小幅拖拽、暂停、进球与乌龙球、胜负计分、开球路线和合法的第二回合进球。物理模拟采用固定 1/180 秒步长。

## 平衡设计

球门收窄至 144 个场地单位，后卫改为保护中路的 1-2-2 阵型。圆片最大速度 640，拖拽力度采用 1.25 次幂曲线；圆片与足球质量比为 3:1.4，碰撞恢复系数 0.78，球与圆片每秒减速分别为 210 和 180。所有回合使用相同物理和计分规则，不取消合法首球。

相同的 475 种开球采样，旧版 22 次进对方球门；新版 0 次。新版扩大到 1,090 种采样仍未见首杆进球，但这不等于数学上不存在精确的首杆路线。另已验证后续回合可正常进球。参数为本项目实测调整，不是商业游戏的官方参数。

参考：[Miniclip 入门说明](https://support.miniclip.com/hc/en-us/articles/4406133687697-How-to-start-playing-Soccer-Stars)、[开发者游戏介绍](https://play.google.com/store/apps/details?id=com.miniclip.soccerstars)、[Box2D 物理文档](https://box2d.org/documentation/md_simulation.html)。

## 文件与素材

- `index.html`：游戏页面
- `style.css`：黑底、冰蓝与玫红运动风格
- `game.js`：菜单、回合、输入、绘制、音效与计分
- `physics.js`：玩家与 AI 共用的物理模拟
- `ai.js`：三档 AI 的路线选择与分帧计算
- `assets/athlete.png`：内置 imagegen 生成的虚构成年足球运动员；透明背景、黑色无品牌球衣、冰蓝与玫红轮廓光，无真实人物身份
- `tests/game.test.cjs`：无第三方依赖的回归检查

运动员图像提示词摘要：cinematic fictional adult soccer athlete, black unbranded jersey, holding a football, cyan and magenta rim lighting, transparent background, no text or logos。图像用于开局画面，棋子与球场由 Canvas 绘制。

## GitHub Pages

仓库包含 GitHub Actions 发布工作流。在仓库 Settings → Pages 将 Source 设为 GitHub Actions 后，每次 main 分支更新会自动执行检查并发布。GitHub Free 的私有仓库不支持 Pages；私有仓库需要支持该功能的订阅。
