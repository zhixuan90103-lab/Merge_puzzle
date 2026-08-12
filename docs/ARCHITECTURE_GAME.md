# 玩法架构 — `src/game/*`

| 元数据 | 内容 |
|--------|------|
| 版本 | **v0.4** |
| 规则真源 | [GAME_RULES.md](./GAME_RULES.md) |
| 拖合规格 | [research/intent/FINDINGS.md](./research/intent/FINDINGS.md) |
| 变更汇总 | [CHANGELOG_PROTOTYPE.md](./CHANGELOG_PROTOTYPE.md) |

---

## 1. 模块职责

| 文件 | 职责 |
|------|------|
| `types.ts` | `Piece` / `BoardState` / `DragTrend` / `GRID_SIZE` |
| `board.ts` | 占用表、克隆、`clipPieceToBoard`、接触检测 |
| `shapes.ts` | 形枚举、`canMergeByShape`、色值 |
| `deal.ts` | 开局 / Debug / 64 后重摆（底边整齐） |
| `dropResolve.ts` | **拖合帧**：拾取、投影 G、跟手 F、T*、`proposeDrop` |
| `merge.ts` | `tryMerge` / 推链 / 生长；`forcedTarget` 执行预览形 |
| `plan.ts` | `AtomicStep` / `MergePlan` |
| `timeline.ts` | 连续 keyframe 播放推挤+生长 |
| `visual.ts` | ease / lerp |
| `spawn.ts` | 合后出块（分阶段权重、`isPlayable`） |
| `deadlock.ts` | `isPlayable`（快）/ `isDeadlock`（终局） |
| `move.ts` | 搬家合法性 |
| `game.ts` | 状态机、`dropAt`、结算 |
| `view.ts` | DOM 棋盘、拖层、投影/T* 预览 |
| `index.ts` | 对外导出 |

---

## 2. 拖合一体数据流

```
pointerdown  → hitTestPiece → beginLift（A 腾空）
pointermove  → aim = finger - offsetY
             → F = continuous rect on aim
             → G = snap(aim)  // 投影
             → proposeDrop(board, A, G, { F, enter, origin })
             → paint: G 色 + T* 紫虚线 + 跟手阴影
pointerup    → dropAt(G, Δ, lastProposal)  // 只认预览帧
             ├─ place  → 写入 A@G
             ├─ merge  → tryMerge(..., forcedTarget: T*)
             │            → playMergePlan → afterMerge → trySpawnOne
             └─ illegal / 放回原位 → bounce / place home
```

| 层 | 符号 | 含义 |
|----|------|------|
| 跟手 | F | 连续；意图（偏置 / 进入） |
| 投影 | G | 贴格；落点（空/同数/禁止） |
| 生长形 | T* | 可合时预告；松手强制 `forcedTarget` |

---

## 3. 关键规则速查（与代码一致）

| 规则 | 实现要点 |
|------|----------|
| 放 | G 脚印全空 |
| 合 | 同数 + 朝向 + **重叠 ≥1 格**（边邻只搬家） |
| 放回原位 | G 在 lift origin → **不合** |
| 投影压可推小块 + 叠到 B | 允许合，生长时推开 |
| 生长意图 | `classifySide(F,B)`；碎块不主导方向 |
| 双侧 | 真·空槽填满时（如 4×2 中心 4） |
| 推 | 比较 **2V**；链推；盘内可推；出盘整块滑 |
| 半出盘裁切 | **结算后** `clipPieceToBoard` |
| 软吸附 | **默认关** |
| 结算性能 | `isPlayable` 快路径；`isDeadlock` 仅终局 |

---

## 4. 出块阶段

| 盘面 max | 倾向 |
|----------|------|
| &lt; 8 | 2 为主，1 已压低，4 可观 |
| ≥ 8 | 1 更少，2/4 并重 |
| ≥ 16 | 几乎无 1，4 权重高 |

---

## 5. 依赖与禁止

- `deadlock.hasLegalMerge` → 可调 `tryMerge`；**禁止** 在 `proposeDrop` / 每帧 / 每出块格 调用  
- `merge` 评分仅用 `isPlayable`  
- UI 只挂 `#ui-root` + 棋盘层；坐标 390×844  

---

## 6. 修订

| 版本 | 说明 |
|------|------|
| 0.4 | 拖合一体落地后的模块图与数据流 |
