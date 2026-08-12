# Engineering — Merge Puzzle

配套：[AGENTS.md](../AGENTS.md) · [GAME_RULES.md](./GAME_RULES.md) · [ARCHITECTURE_GAME.md](./ARCHITECTURE_GAME.md) · [ENTRYPOINTS.md](./ENTRYPOINTS.md)

## 1. 定位

竖屏 WebGPU + **占位合成** 原型。玩法规则真源 `GAME_RULES.md`；模块图 `ARCHITECTURE_GAME.md`。

## 2. 目录

```
Merge_puzzle/
├── AGENTS.md · README.md
├── docs/
│   ├── GAME_RULES.md              # 规则 v0.4
│   ├── ARCHITECTURE_GAME.md       # 玩法架构
│   ├── CHANGELOG_PROTOTYPE.md     # 变更 v0.4
│   ├── research/intent/           # 拖合检索与 FINDINGS
│   ├── ENGINEERING.md · ENTRYPOINTS.md
│   └── …
├── src/
│   ├── main.ts
│   ├── game/                      # 见 ARCHITECTURE_GAME
│   ├── adapt/ · create-renderer.ts · style.css · utils/
├── plugins/native-haptics/
└── scripts/bootstrap-ios.mjs
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
| 拖合 | F 连续 / G 贴格 / T* 预告；松手只认预览 |
| 结算性能 | `isPlayable` 快；`isDeadlock` 仅终局 |
| 禁止 | 每帧 `tryMerge` 全模拟；静默改生长方向 |

## 5. 修订

| 版本 | 说明 |
|------|------|
| 0.4 | 对齐拖合一体与 ARCHITECTURE_GAME |
