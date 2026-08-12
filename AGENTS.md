# AGENTS.md — Merge Puzzle

> **打开本仓库时的第一入口。**

## 一句话

**同色合成 → 推杂色出盘 → 单色满屏 64 → 下一关。**  
稳定态 **闭包满盘**（Σ=64）；操作 **只能拖合**。  
底座：TypeScript + Three.js WebGPU + Vite + Capacitor iOS · 设计 **390×844** · `base: './'`。

## 文档地图

| 文档 | 用途 |
|------|------|
| **[docs/GAME_RULES.md](./docs/GAME_RULES.md)** | **玩法规则真源 v0.8** |
| **[docs/ARCHITECTURE_GAME.md](./docs/ARCHITECTURE_GAME.md)** | 玩法模块与数据流 |
| **[docs/LEVEL_DESIGN.md](./docs/LEVEL_DESIGN.md)** | 关卡设计原则 + 校验 |
| **[docs/CHANGELOG_PROTOTYPE.md](./docs/CHANGELOG_PROTOTYPE.md)** | 变更汇总 v0.8 |
| [docs/ENGINEERING.md](./docs/ENGINEERING.md) | 工程约定 |
| [docs/ENTRYPOINTS.md](./docs/ENTRYPOINTS.md) | 启动链 |
| [docs/CORE_CONCEPTS.md](./docs/CORE_CONCEPTS.md) | L2 手感/障碍草案 |
| [docs/research/](./docs/research/) | 历史调研（非真源） |

## 入口地图

| 职责 | 文件 |
|------|------|
| Web 启动 | `index.html` → `src/main.ts` |
| 玩法 | `src/game/*` |
| 关卡布局 | `src/game/deal.ts` |
| 关卡/色权重 | `src/game/progress.ts` |
| 补满 | `src/game/fill.ts` |
| 死局 | `src/game/deadlock.ts` |
| 设计舞台 | `src/adapt/design.ts` |
| 关卡校验 | `scripts/validate-levels.mjs` |
| 构建 | `vite.config.ts`（**`base: './'`** · port **5200**） |
| Capacitor | `capacitor.config.ts`（`contentInset: never`） |

## DOM（勿拆）

```
#shell > #viewport > #app > #stage
  canvas · #ui-root（玩法 UI）
#device-switcher  # 仅桌面预览
```

## 硬性约定（底座）

1. `vite` **`base: './'`**  
2. `webDir: dist`  
3. `ios.contentInset: never`  
4. 布局 **390×844**  
5. UI 只挂 `#ui-root`  
6. 无 WebGPU 则明确失败  

## 玩法硬约定（v0.8）

1. **主线**：合成 + 推杂色 + 单色 64 过关  
2. **闭包满盘**：稳定态 **Σ value = 64**；合占格守恒；推出/裁切后 **fill 补满**  
3. **合**：同色同数 + 朝向；重叠≥1；**合后形由摆放决定**；可跨盘拖到目标上  
4. **无自由搬家**：不能放到空格；原位松手 = 取消  
5. **推**：障碍 **&lt; 合后 2V**；同体积不可推  
6. **流放**：盘上无某色 → 本波不补该色  
7. **64** → 清盘按关卡表重摆（满盘）  
8. **失败** = 无合法合，或 **一步死**（每个合法合后都死）；**32+32→64 是胜利**  
9. 结算：`isPlayable` 热路径；`isForcedLoss` / `isSafeToContinue` 仅合后；禁每帧 full `tryMerge`  

## 业务改哪里

| 改什么 | 文件 |
|--------|------|
| 规则表 | 先 `GAME_RULES` 再 `progress` / `deal` |
| 关卡盘面 | `deal.ts` → `npm run validate:levels` |
| 落点/意图 | `dropResolve.ts` · `view.ts` |
| 合并推挤 | `merge.ts` · `timeline.ts` |
| 补满/出块 | `fill.ts` · `spawn.ts` |
| 死局 | `deadlock.ts` |
| 状态机 | `game.ts` |

## 命令

```bash
npm install
npm run dev              # http://127.0.0.1:5200/
npm run build
npm run validate:levels  # 关卡回归
npm run cap:sync && npm run ios:bootstrap
```
