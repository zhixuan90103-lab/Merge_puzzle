# 玩法架构 — `src/game/*`

| 元数据 | 内容 |
|--------|------|
| 版本 | **v0.6** |
| 规则真源 | [GAME_RULES.md](./GAME_RULES.md) |
| 变更 | [CHANGELOG_PROTOTYPE.md](./CHANGELOG_PROTOTYPE.md) |

---

## 1. 主线与模块

```
主线：同色合 → 推杂色出盘 → 单色 64 → 下一关
```

| 文件 | 职责 |
|------|------|
| `types.ts` | `Piece`（含 **color**）/ `BoardState` / `MAX_COLORS` |
| `progress.ts` | 关卡色种表、出块色权重、**盘上活跃色** |
| `board.ts` | 占用、克隆、**clip 保色** |
| `shapes.ts` | `canMergePair`、**allRectsForValue** / sizeCandidates、填色 |
| `deal.ts` | 开局 / 过关重摆 / Debug（按 wave + 色种） |
| `dropResolve.ts` | G / F / T*；摆放并进 solid 合后形 |
| `merge.ts` | tryMerge、推链、生长；优先 A∪B |
| `plan.ts` · `timeline.ts` | 步进计划与连续动画 |
| `spawn.ts` | 合后出块：只刷盘上色、配对、防秒死 |
| `deadlock.ts` | isPlayable / isDeadlock / hasSustainablePlay |
| `move.ts` | 搬家 |
| `game.ts` | 状态机、wave、unlockedColors、afterMerge |
| `view.ts` | DOM 棋盘与拖预览 |

---

## 2. 数据流

```
pointerdown  → hitTest → beginLift
pointermove  → proposeDrop → 绿/蓝/红 + T*
pointerup    → dropAt(最后一帧提案)
               ├─ place
               ├─ merge → tryMerge(forcedTarget)
               │          → playMergePlan
               │          → afterMerge
               │             ├─ 64 → dealAfterClear(下一关)
               │             └─ trySpawnAfterMerge（盘上色）
               └─ illegal / 原位 → 弹回 / 放回
```

---

## 3. 规则 ↔ 代码速查

| 规则 | 实现 |
|------|------|
| 同色合 | `canMergePair` |
| 合后形自由 | `allRectsForValue` + solid union 高分 |
| 推 &lt; 2V | `merge` 中 `value >= newValue` 挡 |
| 流放 | `colorsPresentOnBoard` → spawn 色 |
| 关卡色 | `unlockedColorsForWave` |
| 半出盘保色 | `clipPieceToBoard` |
| 过关 | `createdValue === 64` → deal |

---

## 4. 底座（非玩法）

`adapt/*` · `create-renderer` · Capacitor · haptics：壳与真机；玩法逻辑不依赖其细节。  
研究笔记在 `docs/research/**`，**不是规则真源**。
