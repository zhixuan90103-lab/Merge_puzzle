# Engineering — Merge Puzzle

配套：[AGENTS.md](../AGENTS.md) · [GAME_RULES.md](./GAME_RULES.md) · [ARCHITECTURE_GAME.md](./ARCHITECTURE_GAME.md) · [ENTRYPOINTS.md](./ENTRYPOINTS.md)

## 1. 定位

竖屏 WebGPU + **色阵营合成推挤** 原型。  
玩法规则真源 `GAME_RULES.md` **v0.8**；模块图 `ARCHITECTURE_GAME.md`；关卡备忘 `LEVEL_DESIGN.md`。

## 2. 目录

```
Merge_puzzle/
├── AGENTS.md · README.md
├── docs/
│   ├── GAME_RULES.md              # 规则真源 v0.8
│   ├── ARCHITECTURE_GAME.md       # 玩法架构
│   ├── LEVEL_DESIGN.md            # 关卡设计 + 校验
│   ├── CHANGELOG_PROTOTYPE.md     # 变更汇总
│   ├── ENGINEERING.md · ENTRYPOINTS.md
│   ├── ART_DIRECTION.md · art/
│   ├── research/                  # 历史调研（非真源）
│   └── …
├── src/
│   ├── main.ts
│   ├── game/                      # 见 ARCHITECTURE_GAME
│   ├── adapt/ · create-renderer.ts · style.css · utils/
├── scripts/
│   ├── validate-levels.mjs
│   └── bootstrap-ios.mjs
├── plugins/native-haptics/
└── package.json
```

## 3. 配置

| 项 | 值 |
|----|-----|
| Vite `base` | `'./'` |
| port | **5200** |
| `outDir` / `webDir` | `dist` |
| 设计尺寸 | 390×844 |
| ios.contentInset | `never` |

## 4. 玩法约定

| 项 | 约定 |
|----|------|
| 规则 | 先改 GAME_RULES 再改代码 |
| 关卡 | 先改 deal 注释意图，再摆盘；改完 `validate:levels` |
| 拖合 | F 连续 / G 贴格 / T* 预告；松手只认预览 |
| 稳定态 | 永远满盘 Σ=64；无空地放置 |
| 结算性能 | `isPlayable` 热路径；`isForcedLoss` / `isDeadlock` 仅结算 |
| 禁止 | 每帧 `tryMerge` 全模拟；静默改生长方向；把 32+32 当死 |

## 5. 常用命令

```bash
npm install
npm run dev              # http://127.0.0.1:5200/
npm run build
npm run validate:levels  # 关卡回归
npm run cap:sync && npm run ios:bootstrap
```

## 6. 修订

| 版本 | 说明 |
|------|------|
| 0.4 | 对齐拖合一体与 ARCHITECTURE_GAME |
| 0.8 | 闭包满盘、仅拖合、一步死、validate:levels、文档对齐 |
