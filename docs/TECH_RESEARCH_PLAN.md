# 实现技术检索与改造方案

配套：[REQUIREMENTS.md](./REQUIREMENTS.md) · [GAME_RULES.md](./GAME_RULES.md) · [CORE_CONCEPTS.md](./CORE_CONCEPTS.md)

| 元数据 | 内容 |
|--------|------|
| 版本 | 0.4 |
| 目标 | 在 **需求 0.3** 下，解决「推挤生长不丝滑」，并给出可检索、可落地的技术路径 |
| 前提 | 规则逻辑大体正确；**问题在「逻辑步进 × 表现管线」架构** |
| 检索状态 | **Round A–D 已完成** → 结论见 [research/tech/FINDINGS.md](./research/tech/FINDINGS.md) |
| 编码状态 | **T1–T3 已落地**：`plan.ts` / `timeline.ts` / `visual.ts` + 拖动手感 |

---

## 0. 手感覆盖对照表（你问的三块都在这里）

| 手感主题 | 是否在计划中 | 写在哪 | 检索轮次 | 实施阶段 |
|----------|:------------:|--------|----------|----------|
| **拖动手感**（拿起/跟手/放下/弹回） | ✅ 有 | §4 全文；需求 D1–D7 | **Round C** | **T3** |
| **合成手感**（同 id 单边生长、不刷新块、因果可读） | ✅ 有 | §2 AtomicStep.grow；§3 同 t 插值；需求 M2–M5,M8–M9 | **Round A**（+ 生长关键词 §2.3） | **T1 + T2** |
| **推动效果**（推箱子同频、逐格、出界、外侧先） | ✅ 有 | §2 AtomicStep.pushes；§2.2–2.3；§3.2–3.3；需求 M6–M7,L1 | **Round B** | **T1 + T2** |
| 架构（逻辑步进 + 插值，解决不丝滑） | ✅ 有 | §1.3；§3 | **Round A** | **T1 + T2** |
| 出块出现动画 | ⚠️ 需求有、检索弱 | REQUIREMENTS S1 | 可补 **Round E**（可选） | T5 顺带 |
| 64 清空演出 | ⚠️ 需求有、检索弱 | REQUIREMENTS W1 | 可补 **Round E** | T5 顺带 |
| 障碍 / 主动丢弃 | ⏸ 暂缓 | REQUIREMENTS O1/L2 | 不进本轮检索 | P2 |

**结论：**  
- **拖动、合成、推动** 都已进检索计划与改造阶段，不是漏项。  
- 当前计划 **重心** 是「合成 + 推动」丝滑（T1–T2），拖动是 **紧随的 T3**，不是没有。  
- 若希望三者 **同等力度检索**，按下面 §6 的 Round A/B/C 并行做即可（已写全）。

### 0.1 与需求 ID 映射

| 需求 ID | 含义 | 检索/实施 |
|---------|------|-----------|
| D1–D5 | 拖：拿起跟手弹回 | Round C → T3 |
| D6–D7 | 拖：指尖偏移、预览色 | Round C 扩展 → T5 |
| M1–M5 | 合：规则与单边生长 | Round A/B 逻辑 → T1 |
| M6–M8 | 推：同频推箱子 + 因果 | Round B + A3 → T1–T2 |
| M9 | 丝滑插值 | Round A → T2 |
| L1 | 被动挤出可见 | Round B2 + §3.3 → T2 |
| S1 | 出块动画 | 可选 Round E → T5 |

---

## 1. 问题诊断（为何不丝滑）

### 1.1 现状管线

```
tryMerge → frames: BoardState[]（每步一整盘克隆）
    → setTimeout 每 90ms set(board)
        → view 全量对齐 DOM left/top/width
            → 依赖 CSS transition 碰运气对齐
```

### 1.2 缺陷

| # | 缺陷 | 后果 |
|---|------|------|
| 1 | **逻辑帧 = 渲染帧** | 只能「跳格」，难做缓动；时钟一抖就糊 |
| 2 | **整盘快照** | 成本高；难表达「谁在动」 |
| 3 | **CSS transition 被动画** | 与 JS 定时器不同源，易截断/跳变 |
| 4 | **节点删建** | 被推出块消失时无退场弧 |
| 5 | 历史「先推后长」 | 因果弱（已改为交错，但管线仍旧） |

### 1.3 目标架构（推荐）

```
┌─────────────────────────────────────────────┐
│  Logic (纯函数，可单测)                        │
│  tryMerge → MergePlan                         │
│    steps: AtomicStep[]                        │
│    每步: { grow?: RectDelta, pushes: Move[] } │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  Timeline Player (rAF + 时钟)                 │
│  每步占用固定时长 T（如 120ms）                 │
│  t∈[0,1] 对 step 内所有位移做 ease 插值        │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  View (只读 VisualState)                      │
│  每块: { id, x,y,w,h, value, opacity } 像素   │
│  不在 render 里用 transition 碰逻辑帧          │
└─────────────────────────────────────────────┘
```

**核心原则：逻辑只产出「离散步骤」；丝滑只在播放器插值层完成。**

---

## 2. 逻辑层规格（MergePlan）

### 2.1 原子步骤（一拍）

```ts
type CellMove = {
  pieceId: number;
  from: { x: number; y: number; w: number; h: number };
  to:   { x: number; y: number; w: number; h: number }; // 通常平移 1 格
};

type GrowDelta = {
  pieceId: number; // 永远是 B
  from: Rect;
  to: Rect;        // 比 from 单边多 1 格
  value: number;   // 新值（首步即可切到 newValue）
};

/** 一拍：先推（同向 1 格）再长（1 格），同屏同时间插值 */
type AtomicStep = {
  pushes: CellMove[];  // 本拍被顶的块（可多块，外侧先记录）
  grow: GrowDelta;     // 锚点本拍生长
};
```

### 2.2 计划生成算法（检索后实现）

```
输入: A, B, 目标 toRect, newValue
输出: steps[], finalBoard 或 fail

1. 校验同值/朝向/接触；算 toRect（优先 A∪B 实心矩形）
2. 校验 toRect 相对 B 单边生长
3. cur = B.rect
4. while cur != toRect:
     next = stepGrowUnilateral(cur, toRect, dir)
     收集 next 新格子上的更小块 → 按外侧排序
     对每块: 必须能沿 dir 推 1 格（出界允许）
        若落点被挡 → fail（或后续再做连环推箱子检索）
     记录 AtomicStep { pushes, grow: cur→next }
     在逻辑克隆盘上应用：先推后长
     cur = next
5. 成功
```

### 2.3 与「推箱子」对齐的检索关键词

| 主题 | 检索词 / 方向 |
|------|----------------|
| 推箱子步进 | `sokoban push one step resolution order` |
| 多箱同向 | `sokoban push multiple boxes same direction outward first` |
| 合并生长 | `merge grow rect animation single edge` |
| 逻辑与表现分离 | `game animation command pattern tween interpolate grid` |
| 时间轴 | `animation timeline steps lerp ease-out rAF` |

---

## 3. 表现层规格（Timeline Player）

### 3.1 播放

| 参数 | 建议初值 | 说明 |
|------|----------|------|
| `STEP_MS` | 100～140 | 每一拍总时长 |
| `ease` | ease-out cubic | 位移/尺寸 |
| 时钟 | `requestAnimationFrame` | 唯一时钟 |
| 输入 | step 进行中锁定 | 与现 animating 一致 |

### 3.2 一拍内插值（同频关键）

在 `t = 0→1`（一拍内）：

- 每个 `push`：`pos = lerp(from, to, ease(t))`  
- 同时 `grow`：`rect = lerpRect(from, to, ease(t))`  
- **同一 t**，故视觉上「长大的边推着小块走」

### 3.3 出界

- `to` 可在网格外（负坐标 / ≥8）  
- opacity：`lerp(1, 0, t)` 当 fully off  
- 步结束后从逻辑盘移除  

### 3.4 禁止

- 用 `BoardState[]` + `setTimeout` 当最终方案  
- 每帧 `innerHTML` 重写  
- 依赖 CSS transition 对齐逻辑步进  

### 3.5 可选增强（P1）

- 被推块 outline 高亮  
- 轻 haptic / 音效 tick 每拍  
- 合并完成 overshoot 1 帧  

---

## 4. 拖动表现规格（检索 + 实现）

### 4.1 参考

| 来源 | 用途 |
|------|------|
| [Apple HIG Drag and Drop](https://developer.apple.com/design/human-interface-guidelines/drag-and-drop) | 跟手、多点等原则 |
| iOS 主屏图标 | 抬起 scale + elevation 阴影 |
| [redblobgames draggable](https://www.redblobgames.com/making-of/draggable/) | pointer capture |
| chessground | 幽灵/回弹 |

### 4.2 实现要点

| 阶段 | 技术 |
|------|------|
| Lift | 100ms spring scale 1→1.1；shadow 加大；逻辑 remove |
| Follow | pointermove 直接设 transform/left，**不用** transition |
| Drop 合法 | 吸附格；scale 1.1→1 spring 150ms |
| Drop 非法 | 从当前像素 tween 回原格 200ms spring |

### 4.3 检索词

`iOS icon drag lift shadow scale animation`  
`pointer capture drag ghost spring drop snap grid`

---

## 5. 代码改造地图（相对当前仓库）

| 文件 | 现状 | 改造 |
|------|------|------|
| `merge.ts` | 产出 `BoardState[]` 混合推长 | 改为产出 **`MergePlan` / `AtomicStep[]`**；应用函数可单测 |
| `game.ts` | `playFramesThen` setTimeout | **TimelinePlayer**：rAF + 插值；结束后再 spawn/死局 |
| `view.ts` | DOM + CSS transition | 读 **VisualPiece[]**；跟手拖用即时坐标；合并时只应用插值结果 |
| `board.ts` | 占用/克隆 | 保留；增加 applyStep 纯函数 |
| 新增 `plan.ts` / `timeline.ts` | 无 | 计划生成 + 播放器 |
| 新增 `visual.ts` | 无 | Rect lerp、ease |

**不建议：** 为丝滑上 Three.js 物理；ROI 低。

---

## 6. 技术检索任务清单（执行顺序）

### Round A — 动画架构（本周 P0）

| # | 检索 / 阅读目标 | 产出 |
|---|-----------------|------|
| A1 | 网格游戏「逻辑步进 + 插值播放」案例（2048 滑块动画、sokoban tween） | 选定 STEP_MS、ease |
| A2 | rAF timeline / 可取消动画 token 模式 | `timeline.ts` 草图 |
| A3 | 多物体同 t 插值（一拍多 push + 一 grow） | 数据结构定稿 |

### Round B — 推箱子正确性

| # | 检索 / 阅读目标 | 产出 |
|---|-----------------|------|
| B1 | 单步推、多箱同向、外侧优先 | 与 AtomicStep 对齐 |
| B2 | 推到边界外的处理 | 出界规则写进 plan |
| B3 | 失败整单回滚（事务） | clone + apply 测试用例 |

### Round C — 拖动手感（完整列项）

| # | 检索 / 阅读目标 | 对应需求 | 产出 |
|---|-----------------|----------|------|
| C1 | iOS 图标 **拿起**：scale、阴影 elevation | D2 | 数值表（如 scale 1.08–1.12） |
| C2 | **跟手**：pointer capture；触屏锚点上偏 | D1, D6 | follow 实现要点 |
| C3 | **放下** spring 回正常大小/阴影 | D4 | drop 150ms 曲线 |
| C4 | **非法弹回** 从当前点 tween 回原格 | D5 | snap-back 实现 |
| C5 | 拖中 **合法/非法/可合** 预览色（可选） | D7 | 状态色板 |

检索词补充：  
`iOS home screen icon drag lift scale shadow` · `spring animation drop snap` · `touch drag offset above finger`

### Round D — 合成手感（生长侧，与推动同管线）

| # | 检索 / 阅读目标 | 对应需求 | 产出 |
|---|-----------------|----------|------|
| D1a | 矩形 **单边扩张** 动画 / UI layout grow | M3, M5 | 固定边 + 扩一边的插值 |
| D2a | **同 id 变形** 而非替换节点（FLIP / morph） | M3, M8 | 禁止删节点重生 |
| D3a | 合并完成 **pop / overshoot**（可选） | M9 增强 | 收尾 1 帧 |

检索词补充：  
`rect grow animation one side anchor` · `FLIP technique DOM layout animation` · `merge tile morph same element`

### Round E — 推动效果（推箱子侧）

| # | 检索 / 阅读目标 | 对应需求 | 产出 |
|---|-----------------|----------|------|
| E1 | 单步推、落点占用检测 | M6, M7 | pushOneCell 规则 |
| E2 | 多块同向、**外侧优先** | M6 | 排序键 |
| E3 | **与生长同 t 插值**（一拍多物体） | M6, M8, M9 | Timeline 一拍契约 |
| E4 | 推出 **网格外** 淡出再删 | L1, N5 | 出界帧 + opacity |
| E5 | 失败整单回滚 | M7 | 事务测试 |

检索词补充：  
`sokoban push one step` · `push box off board animation` · `simultaneous multi object tween`

（原 Round B 与 E 合并理解：B=正确性，E=表现；实施时 T1 用 B/E 逻辑，T2 用 E3–E4 表现。）

### Round F — 回归用例（必须自动化或手测脚本）

| # | 用例 | 期望 | 覆盖手感 |
|---|------|------|----------|
| R1 | 1+1 横贴 | 单边长成 2，无推 | 合成 |
| R2 | 两横 8 上下叠，下方有 1 | **同频**向下长+1 被顶 | 合成+推动 |
| R3 | 推到墙边无法再推 | 合并失败，盘面回滚 | 推动 |
| R4 | 横 8 叠竖 8 | 拒绝，提示朝向 | 合成规则 |
| R5 | 拖起跟手、非法弹回 | 浮起/滑回 | **拖动** |
| R6 | 合法空位放下 | 吸附+缩小回落 | **拖动** |

---

## 7. 实施阶段（改造，非从零）

| 阶段 | 内容 | 完成标准 |
|------|------|----------|
| **T0** | 定稿 REQUIREMENTS + 本计划；冻结 AtomicStep | 文档一致 |
| **T1** | `merge` 只输出 MergePlan（可先双写 frames 对照） | R2 逻辑步骤正确 |
| **T2** | TimelinePlayer 插值播放 | R2 **观感丝滑**、因果可读 |
| **T3** | **拖动手感** lift/follow/drop/snap（Round C） | D1–D5；R5–R6 |
| **T4** | 删掉旧 BoardState 闪帧路径；清死代码 | 无双管线 |
| **T5** | 预览色 D7、STEP_MS 调参、出块动画微调 | 手感抛光 |

---

## 8. 成功标准（本轮改造）

| 标准 | 度量 |
|------|------|
| 丝滑 | 合并动画无肉眼瞬跳；60fps 设备不掉大帧 |
| 同频 | 任意一拍同时有「长大」与「被顶」位移（若该拍有挡路） |
| 因果 | 旁观者能叙述「大块把小块顶走」 |
| 正确 | R1–R5 全过；死局/64/出块不回归 |
| 可维护 | 逻辑单测不依赖 DOM |

---

## 9. 风险与对策

| 风险 | 对策 |
|------|------|
| 连环推箱子过难 | v1 仅 **单步顶**；落点有人则合并失败 |
| 插值与逻辑不一致 | 仅对 plan 插值；结束态强制 = finalBoard |
| 改造期间更难玩 | 保留 Debug 盘；feature flag `useTimelinePlayer` |
| 检索噪声 | 只收「步进+插值」「sokoban one step」类 |

---

## 10. 建议立即动作

1. **冻结** [REQUIREMENTS.md](./REQUIREMENTS.md) 为当前需求真源。  
2. **按 Round A→B** 做短检索（可 Grok/文档），把 AtomicStep 写进代码类型。  
3. **先 T1+T2** 只攻丝滑推挤；拖动 T3 紧随。  
4. 不做新玩法（障碍/丢弃）直到 T2 验收通过。

---

## 11. 实现状态（v0.3）

下列 P0 目标已在原型落地，细节见 [CHANGELOG_PROTOTYPE.md](./CHANGELOG_PROTOTYPE.md)：

| 目标 | 状态 |
|------|------|
| MergePlan 原子步 + 推挤生长同频 | **已实现** |
| Timeline 连续插值（非每格急刹） | **已实现** |
| 拖放提案预览（绿蓝红） | **已实现** |
| 连锁大推小 | **已实现** |
| 生长在盘内 / 放下侧方向 | **已实现** |
| 出盘整块滑 + 结算裁切 | **已实现** |

遗留：障碍、主动丢弃、末段速度、自动化测试。

## 12. 修订记录

| 版本 | 说明 |
|------|------|
| 0.3 | 针对不丝滑重定架构：MergePlan + Timeline 插值；检索与阶段 T0–T5 |
| 0.3.1 | 补 §0 手感覆盖对照表；Round C/D/E 显式拆开拖动/合成/推动检索项 |
| 0.4 | 执行 Grok Round A–D；结论写入 research/tech/FINDINGS.md；可进入 T1 编码 |
