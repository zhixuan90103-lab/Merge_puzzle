# 玩法架构 — `src/game/*`

| 元数据 | 内容 |
|--------|------|
| 版本 | **v0.9** |
| 规则真源 | [GAME_RULES.md](./GAME_RULES.md) |
| 拖合/推挤 | [DESIGN_DRAG_MERGE.md](./DESIGN_DRAG_MERGE.md) |
| 预览手感 | [DESIGN_PREVIEW.md](./DESIGN_PREVIEW.md) |
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
| `intent.ts` | 吸附/瞄准阈值、弱拉、扩张评分 |
| `dragPhase.ts` | FREE/LOCKED 状态机（纯逻辑） |
| `dropResolve.ts` | G / F / T*；两段式提案；瞄准&gt;异色&gt;空地 |
| `previewPush.ts` | 推挤预览状态机（[DESIGN_PREVIEW](./DESIGN_PREVIEW.md)） |
| `merge.ts` | tryMerge、面对齐推链、前缘分层；≤2V 可推 |
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
pointermove  → dragPhase FREE|LOCKED + proposeDrop
               蓝可合 / 灰原位 / 红非法 + T*
               方向：落点/微滑瞄准 > 异色可推 > 空地边
pointerup    → dropAt(最后一帧提案)
               ├─ merge → A 逻辑落 B → tryMerge(forcedTarget: T*)
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
| 合后形自由 | `allRectsForValue`；评分瞄准/异色/空边（并集不再默认最高） |
| 瞄准/吸附 | `intent` · `dragPhase` · 弱拉 ghost |
| 推 ≤ 2V + 面对齐/分层 | `merge`：`rootsPushableByFront` · `layersFaceMatch` · 前缘平面 |
| 两段拖合 | `dragPhase` + `view`；方向 `intent` + `dropResolve` |
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
浅色 UI / 塑料块：`style.css` · `view.ts` · `shapes.PIECE_PALETTE`。  
研究笔记在 `docs/research/**`，**不是规则真源**。
