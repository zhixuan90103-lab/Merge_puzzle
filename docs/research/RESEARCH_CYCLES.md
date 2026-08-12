# 三轮 Grok 检索循环记录

流程每轮：**反查补漏 → 修订计划要点 → Grok 再检索**。共 3 轮。  
综合修订已并入 [PROTOTYPE_PLAN.md](../PROTOTYPE_PLAN.md) §12–§13。

---

## 第 0 基线（循环前）

| 已覆盖 | 明显空洞 |
|--------|----------|
| 2048 状态机、出块/死局壳 | 大推小 / 多格推 |
| polyomino 放置思路 | 公平 spawn（严于 2048） |
| 拖合产品、合成赛道 | 指针拖拽+格吸附 |
| | 合并事务回滚 |
| | 64 清盘=波次重置 UX |
| | 矩形生长算法 |
| | letterbox 触控 |
| | 开局密度、拖预览、合法步枚举、Debug |

---

## 第 1 轮

### 反查缺口

1. 多格推动 + 失败整单回滚  
2. spawn 不即死（比 2048 更严）  
3. 触屏/鼠标拖、格吸附  

### 检索文件

| 文件 | 主题 |
|------|------|
| `r1/r1-push.md` | Sokoban / 多格箱 / unmove 回滚 |
| `r1/r1-spawn-fair.md` | 合后出块、无步则负 |
| `r1/r1-drag-input.md` | pointer capture、snap grid |

### 关键结论 → 计划修订

| 结论 | 写入计划 |
|------|----------|
| 多格推参考 Sokenban；推前查自由格 | `merge` 推：**脚印平移**，非像素 |
| Sokoban `unmove` / 克隆盘 | **tryMerge 克隆提交**，失败丢弃 |
| 经典 2048 **不保证** spawn 不堵死 | 我们 **额外**「出后仍可动」过滤（自研） |
| [redblobgames draggable](https://www.redblobgames.com/making-of/draggable/) | `input.ts` 必读：pointer capture + 触屏 |
| 格吸附 Konva/interact 模式 | 松手 **snap 到格**，预览可半格跟随 |

---

## 第 2 轮

### 反查缺口（R1 后仍缺）

1. 不可变/事务棋盘 + 单测  
2. 64 清空续局的节奏隐喻  
3. 两矩形合成更大矩形（横/竖）  
4. 固定设计分辨率 + letterbox 触控 + HUD  

### 检索文件

| 文件 | 主题 |
|------|------|
| `r2/r2-board-transaction.md` | immutable state / pure logic |
| `r2/r2-wave-clear.md` | roguelite 波次/楼层重置（弱相关） |
| `r2/r2-rect-grow.md` | 轴对齐矩形合并算法 |
| `r2/r2-touch-letterbox.md` | letterbox / HUD pointer-events |

### 关键结论 → 计划修订

| 结论 | 写入计划 |
|------|----------|
| pure TS 逻辑 + Vitest 类单测可行 | Phase 2 为 `merge` 加 **无 DOM 单测**（可选但推荐） |
| 楼层重置 ≠ 我们的 64，但「高潮后清空再 deal」可类比 | HUD 文案：**波次清空**，非「游戏结束」 |
| SO：两矩形能否合成单矩形 / 并集 | `shapes.ts`：目标形 = 标准表，**非**任意并集；但可用「并集是否覆盖目标形」做邻接捷径校验 |
| letterbox + `clientToDesign` 已有底座 | 棋盘交互挂 **stage 内**；HUD `pointer-events` 不挡棋盘 |
| 波次检索偏 meta 进度，价值有限 | 不引入跨局养成 |

---

## 第 3 轮

### 反查缺口（R2 后仍缺）

1. 手写开局空位密度  
2. 拖拽幽灵预览 / 非法落点反馈  
3. 多尺寸矩形合法放置枚举（死局）  
4. 原型 Debug 面板（强制 64、重开）  

### 检索文件

| 文件 | 主题 |
|------|------|
| `r3/r3-opening-density.md` | Block Jam 类（偏社区吐槽，密度公式弱） |
| `r3/r3-drag-preview-ux.md` | ghost、非法 drop、chessground |
| `r3/r3-legal-moves.md` | 矩形装箱/无重叠放置 |
| `r3/r3-debug-playtest.md` | jam 原型：重开、debug mode |

### 关键结论 → 计划修订

| 结论 | 写入计划 |
|------|----------|
| 开局密度无硬公式 | 维持 **手写盘 + 空位≥40% + 可立刻合**（自定验收） |
| [chessground](https://github.com/lichess-org/chessground) 幽灵+非法回弹 | Phase 5：**ghost + 合法绿/非法红** 升为 P1 体验项 |
| 合法放置 ≈ 遍历锚点+脚印 | `deadlock`：对每块扫所有 `(x,y)` 脚印是否全空；合并对扫同值对+双朝向 tryMerge |
| jam：稳定重开、快速反馈 | Debug：**重开 / 升级选中 / 铺测试盘** 进 P0 HUD |

---

## 三轮后：仍自研（检索无法替代）

| 模块 | 原因 |
|------|------|
| 值=占格 + 拖势定 2×4/4×2 | 无同构开源 |
| 大推小 + 推出界 + 新值严格更大 | 需自写，仅借 Sokoban 脚印思想 |
| 先腾 A 吃旧格再生 | 合并流水线自研 |
| 64 清空后 deal | 自研状态机 |
| spawn 安全过滤 | 严于 2048，自研 |

---

## 检索质量自评

| 轮次 | 命中率 | 说明 |
|------|--------|------|
| R1 | 高 | 推、拖、出块直接可用 |
| R2 | 中高 | 事务/矩形/letterbox 可用；波次类噪声多 |
| R3 | 中 | UX/Debug 可用；开局密度与「多尺寸死局」需自推算法 |

---

## 推荐阅读清单（实现前 30 分钟）

1. https://www.redblobgames.com/making-of/draggable/  
2. https://ken.garstin.ca/2023/08/07/sokoban-type-game/（多格推）  
3. https://github.com/lichess-org/chessground（拖幽灵/回弹）  
4. https://stackoverflow.com/questions/6664281/detect-if-two-rectangles-can-be-combined-into-a-single-rectangle  
5. 本仓库 `docs/GAME_RULES.md` §5.5 结算顺序  
