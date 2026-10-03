# Table Football · 弹指足球

两人同屏、每队五枚圆片的弹射足球小游戏。按住本方圆片向后拖拽，松手出杆；所有棋子停稳后换手。先入三球获胜，乌龙球给对方计分。支持鼠标和触屏，空格暂停，切换窗口自动暂停。

GitHub Pages 发布完成后的地址：https://Yiiiiming.github.io/Table-Football/

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
node --test tests/game.test.cjs
```

测试覆盖双人选子、取消小幅拖拽、暂停、进球与乌龙球、胜负计分、开球路线和合法的第二回合进球。物理模拟采用固定 1/180 秒步长。

## 平衡设计

球门收窄至 144 个场地单位，后卫改为保护中路的 1-2-2 阵型。圆片最大速度 640，拖拽力度采用 1.25 次幂曲线；圆片与足球质量比为 3:1.4，碰撞恢复系数 0.78，球与圆片每秒减速分别为 210 和 180。所有回合使用相同物理和计分规则，不取消合法首球。

相同的 475 种开球采样，旧版 22 次进对方球门；新版 0 次。新版扩大到 1,090 种采样仍未见首杆进球，但这不等于数学上不存在精确的首杆路线。另已验证后续回合可正常进球。参数为本项目实测调整，不是商业游戏的官方参数。

参考：[Miniclip 入门说明](https://support.miniclip.com/hc/en-us/articles/4406133687697-How-to-start-playing-Soccer-Stars)、[开发者游戏介绍](https://play.google.com/store/apps/details?id=com.miniclip.soccerstars)、[Box2D 物理文档](https://box2d.org/documentation/md_simulation.html)。

## 文件与素材

- `index.html`：游戏页面
- `style.css`：黑底、冰蓝与玫红运动风格
- `game.js`：输入、绘制、物理、音效与计分
- `assets/athlete.png`：内置 imagegen 生成的虚构成年足球运动员；透明背景、黑色无品牌球衣、冰蓝与玫红轮廓光，无真实人物身份
- `tests/game.test.cjs`：无第三方依赖的回归检查

运动员图像提示词摘要：cinematic fictional adult soccer athlete, black unbranded jersey, holding a football, cyan and magenta rim lighting, transparent background, no text or logos。图像用于开局画面，棋子与球场由 Canvas 绘制。

## GitHub Pages

仓库包含 GitHub Actions 发布工作流。在仓库 Settings → Pages 将 Source 设为 GitHub Actions 后，每次 main 分支更新会自动执行检查并发布。GitHub Free 的私有仓库不支持 Pages；私有仓库需要支持该功能的订阅。
