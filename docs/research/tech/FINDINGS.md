# 技术检索结论（Round A–D）

执行日期：与 TECH_RESEARCH_PLAN v0.3.1 对齐。  
原始结果：`A-timeline-interp.md` · `B-sokoban-push.md` · `C-drag-feel.md` · `D-merge-grow.md`

---

## Round A — 动画架构（合成/推动丝滑底座）

### 高价值来源

| 来源 | 要点 |
|------|------|
| [mateuszsokola/2048-animation-examples](https://github.com/mateuszsokola/2048-animation-examples) | 2048：**逻辑算出移动/合并，动画层单独播** |
| [Flutter board game Part II](https://medium.com/flutter-community/a-board-game-with-flutter-part-ii-89088f8b69f7) | **Tween 在离散格点之间插值** |
| Reddit / React 2048 动画帖 | 滑块与合并动画分轨，避免直接 setState 闪 |

### 落地结论

| 参数/做法 | 建议 |
|-----------|------|
| 时钟 | **仅 rAF**，不用 setTimeout 驱动位置 |
| 步进 | 逻辑只出 **AtomicStep**；播放器对每步 `t∈[0,1]` lerp |
| STEP_MS | **120ms** 初值（可 100–140 调） |
| ease | **ease-out cubic**（落地减速，少线性） |
| 多物体 | **同一 t** 同时插值 grow + 所有 push |

**采用：** TECH_RESEARCH_PLAN §1.3 架构成立。  
**不采用：** 继续 `BoardState[]` + CSS transition 对表。

---

## Round B — 推动（推箱子）

### 高价值来源

| 来源 | 要点 |
|------|------|
| [Basic Search Algorithms on Sokoban](https://timallanwheeler.com/blog/2022/01/19/basic-search-algorithms-on-sokoban/) | **unmove / 回滚**；推失败可撤销 |
| [UVA Sokoban Visualizer](https://www.cs.virginia.edu/~rmw7my/sokoban/help.html) | 多箱同线推是 **规则扩展**；经典是单步单箱 |
| [paskhaver/sokoban](https://github.com/paskhaver/sokoban) | JS 实现：一步推、状态清晰 |

### 落地结论

| 规则 | v1 定案 |
|------|---------|
| 一步 | 被顶块 **只移 1 格**（与生长 1 格同拍） |
| 多块同向 | **外侧优先** 各移 1 格，再应用生长 |
| 落点占用 | 有块则 **本拍失败 → 整单 merge 回滚**（不做无限连环） |
| 出界 | 允许移到格外；动画淡出后再从逻辑删除 |
| 事务 | plan 在 clone 上生成；失败丢弃 clone |

**采用：** AtomicStep 模型 + 外侧排序。  
**暂缓：** 完整连环推箱子（多格穿透链式）。

---

## Round C — 拖动手感

### 高价值来源

| 来源 | 要点 |
|------|------|
| [Apple UIKit Drag and Drop](https://developer.apple.com/documentation/uikit/drag-and-drop) | 连续手势；拖动中保持视觉反馈 |
| [MDN Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) | **setPointerCapture** 保证跟手不丢事件 |
| [SO pointer capture](https://stackoverflow.com/questions/77482267/javascript-drag-and-drop-not-working-with-pointer-events) | 捕获失败会导致拖断 |
| iOS 图标/阴影实践 | 抬起 = 阴影 + 略放大（elevation 感） |

### 落地参数表（实现用）

| 阶段 | 参数 |
|------|------|
| Lift | scale **1.0 → 1.10**，100–120ms ease-out；shadow 加大 |
| Follow | **无 transition**；`setPointerCapture`；触屏锚点上偏 **12px 设计坐标** |
| Drop 合法 | scale **1.10 → 1.0**，140–160ms；吸附格中心 |
| Drop 非法 | 当前位置 → 原格，180–220ms ease-out；再写回逻辑 |
| 预览 | 绿/红/可合（T5） |

**采用：** CORE_CONCEPTS §4 + 上表。  
**不采用：** 长按进 wiggle 编辑模式。

---

## Round D — 合成生长

### 高价值来源

| 来源 | 要点 |
|------|------|
| [Motion layout animations / FLIP](https://motion.dev/docs/react-layout-animations) | **同元素** 尺寸变化动画；可锚点 |
| [FLIP 原理](https://www.nan.fyi/magic-motion) | First-Last-Invert-Play，避免删节点重建 |
| Maxime Heckel FLIP 文 | 变形时防拉伸失真（我们格对齐矩形，风险低） |

### 落地结论

| 做法 | 定案 |
|------|------|
| 节点 | **同一 pieceId / 同一 DOM 节点** 改 left/top/width/height |
| 生长 | 逻辑：单边 +1 格/步；表现：该步内 lerp 矩形 |
| 禁止 | 删 B 再 create 新 div（会像「刷块」） |
| 可选 | 步末轻微 overshoot（P1） |

**采用：** FLIP/同元素 morph 思想，自写 rAF lerp（不必上 Framer）。  
**不采用：** 依赖 React/Framer 全家桶（项目是 vanilla TS）。

---

## 综合：推荐实现契约（检索后冻结）

```ts
// 逻辑输出
type AtomicStep = {
  pushes: { pieceId: number; from: Rect; to: Rect }[];
  grow:   { pieceId: number; from: Rect; to: Rect; value: number };
};

// 播放：每步 STEP_MS，t 0→1
// visual[id] = lerp(from, to, easeOutCubic(t))  for grow and each push
// 结束后 commit finalBoard，再 spawn / 死局
```

| 手感 | 检索结论一句话 |
|------|----------------|
| **拖动** | Capture + 跟手无缓动；抬起/放下用短 spring |
| **合成** | 同节点矩形 lerp；单边逐步；不重建 |
| **推动** | 与 grow 同 step、同 t；外侧先；出界淡出 |

---

## 下一步实施顺序（检索已完成 → 可写码）

1. **T1** `MergePlan` + `AtomicStep` 生成（可单测 R1–R4）  
2. **T2** `TimelinePlayer` rAF 插值（验收 R2 丝滑）  
3. **T3** 拖动 lift/follow/drop（R5–R6）  
4. **T4** 删除旧 `BoardState[]` + setTimeout 管线  

---

## 修订

| 版本 | 说明 |
|------|------|
| 1.0 | Grok Round A–D 检索汇总与落地参数 |
