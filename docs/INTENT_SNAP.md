# 拖合意图（摘要）

> **完整设计真源：** [DESIGN_DRAG_MERGE.md](./DESIGN_DRAG_MERGE.md)

## 两段式

| 阶段 | 职责 |
|------|------|
| FREE | 大拖选可合 B |
| LOCKED | 逻辑锁定 B；弱磁吸；小滑定方向 |

## 方向优先级

**玩家瞄准 > 异色可推 > 空地单侧边**（禁止无意义居中双侧）

## 代码

| 文件 | 职责 |
|------|------|
| `intent.ts` | 阈值、弱拉、瞄准、扩张评分 |
| `dragPhase.ts` | FREE/LOCKED 状态机 |
| `dropResolve.ts` | 提案 / T* |
| `view.ts` | 指针与表现 |
