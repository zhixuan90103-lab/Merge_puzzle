# 玩法架构 — `src/game/*`

| 元数据 | 内容 |
|--------|------|
| 版本 | **v0.8** |
| 规则真源 | [GAME_RULES.md](./GAME_RULES.md) |
| 关卡 | [LEVEL_DESIGN.md](./LEVEL_DESIGN.md) |
| 变更 | [CHANGELOG_PROTOTYPE.md](./CHANGELOG_PROTOTYPE.md) |

---

## 1. 主线与模块

```
主线：同色合 → 推杂色出盘 → 单色 64 → 下一关
稳定态：Σ value = 64（闭包满盘 · 无空格 · 无搬家）
```

| 文件 | 职责 |
|------|------|
| `types.ts` | `Piece`（含 **color**）/ `BoardState` / `MAX_COLORS` / `GRID_SIZE` |
| `progress.ts` | 关卡色种表、出块色权重、**盘上活跃色**、`waveIntroMessage` |
| `board.ts` | 占用、克隆、**clip 保色**、面积 |
| `shapes.ts` | `canMergePair`、**allRectsForValue** / sizeCandidates |
| `deal.ts` | 开局 / 过关重摆 / Debug（**关 1–8 手摆**，**9+ 五色模板**） |
| `dropResolve.ts` | G / F / T*；摆放并进 solid 合后形；**拒绝空地放置** |
| `merge.ts` | tryMerge、推链、生长；优先 A∪B；障碍 &lt; 2V |
| `plan.ts` · `timeline.ts` | 步进计划与连续动画 |
| `fill.ts` | **闭包补满**：推出后 pack 至 64；配对/合后色；防补死 |
| `spawn.ts` | 遗留工具；合后入口 re-export `fill` |
| `deadlock.ts` | `isPlayable` / `isForcedLoss` / `isSafeToContinue` / `isDeadlock` |
| `move.ts` | **遗留**：自由搬家已禁用（接口可保留） |
| `game.ts` | 状态机、wave、unlockedColors、afterMerge |
| `view.ts` | DOM 棋盘与拖预览 |
| `visual.ts` | 块视觉辅助 |

---

## 2. 数据流

```
pointerdown  → hitTest → beginLift
pointermove  → proposeDrop → 蓝可合 / 灰原位 / 红非法 + T*
pointerup    → dropAt(最后一帧提案)
               ├─ merge → tryMerge(forcedTarget: T*)
               │          → playMergePlan
               │          → afterMerge
               │             ├─ 64 → dealAfterClear(下一关·满盘)
               │             ├─ area<64 → fillToFull（补满·盘上色·防死）
               │             └─ !isSafeToContinue → 判负
               └─ illegal / 原位 → 弹回 / 放回
（无 place；稳定态永远满 64 格）
```

---

## 3. 规则 ↔ 代码速查

| 规则 | 实现 |
|------|------|
| 同色合 | `canMergePair` |
| 合后形自由 | `allRectsForValue` + solid union 高分 |
| 推 &lt; 2V | `merge` 中 `value >= newValue` 挡 |
| 无搬家 | `dropResolve` 拒绝空地；`hasLegalMove` ≡ false |
| 流放 | `colorsPresentOnBoard` → fill 色池 |
| 关卡色 | `unlockedColorsForWave` |
| 半出盘保色 | `clipPieceToBoard` |
| 过关 | `createdValue === 64` → deal |
| 硬死 | `!hasPotentialMerge` |
| 一步死 | `isForcedLoss`（32→64 短路为活） |
| 结算安全 | `isSafeToContinue` |
| 热路径可玩 | `isPlayable`（只查对，不扫一步死） |

---

## 4. 死局 API 约定（性能）

| API | 何时用 | 成本 |
|-----|--------|------|
| `isPlayable` | 热路径 / 启发式 | 只查可合对 |
| `isForcedLoss` | 结算、fill 评分 | 有限 `tryMerge` 搜索 |
| `isSafeToContinue` | 合后判负 | `!isForcedLoss` |
| `isDeadlock` | 终局确认 | 较重；**勿进 tryMerge 内环** |

禁止：每帧 full `tryMerge` 模拟全盘；在 `tryMerge` 内部调 `isDeadlock`。

---

## 5. 关卡与校验

| 项 | 位置 |
|----|------|
| 手摆布局 | `deal.dealOpening` |
| 色种/文案 | `progress.ts` |
| 自动校验 | `scripts/validate-levels.mjs` → `npm run validate:levels` |
| 设计备忘 | [LEVEL_DESIGN.md](./LEVEL_DESIGN.md) |

---

## 6. 底座（非玩法）

`adapt/*` · `create-renderer` · Capacitor · haptics：壳与真机；玩法逻辑不依赖其细节。  
研究笔记在 `docs/research/**`，**不是规则真源**。
