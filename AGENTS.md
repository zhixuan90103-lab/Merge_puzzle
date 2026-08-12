# AGENTS.md — Merge Puzzle

> **打开本仓库时的第一入口。**  
> 玩法见 `docs/GAME_RULES.md`。底座：TypeScript + Three.js WebGPU + Vite + Capacitor iOS。

## 一句话

竖屏 **占位合成**：拖块搬家/合并，N 占 N，越合越满，64 清盘。  
设计空间 **390×844**，`base: './'`。

## 文档地图

| 文档 | 用途 |
|------|------|
| **[docs/GAME_RULES.md](./docs/GAME_RULES.md)** | **玩法规则真源 v0.4** |
| **[docs/ARCHITECTURE_GAME.md](./docs/ARCHITECTURE_GAME.md)** | **玩法模块与数据流** |
| **[docs/CHANGELOG_PROTOTYPE.md](./docs/CHANGELOG_PROTOTYPE.md)** | **变更汇总 v0.4** |
| [docs/research/intent/FINDINGS.md](./docs/research/intent/FINDINGS.md) | 拖合一体规格 |
| [docs/CORE_CONCEPTS.md](./docs/CORE_CONCEPTS.md) | L2 手感/障碍/离盘 |
| [docs/ENGINEERING.md](./docs/ENGINEERING.md) | 工程约定 |
| [docs/ENTRYPOINTS.md](./docs/ENTRYPOINTS.md) | 启动链 |

## 入口地图

| 职责 | 文件 |
|------|------|
| Web 启动 | `index.html` → `src/main.ts` |
| 玩法 | `src/game/*`（见 ARCHITECTURE_GAME） |
| 设计舞台 | `src/adapt/design.ts` |
| WebGPU | `src/create-renderer.ts` |
| 构建 | `vite.config.ts`（**`base: './'`** · port **5200**） |
| Capacitor | `capacitor.config.ts`（`contentInset: never`） |

## DOM（勿拆）

```
#shell > #viewport > #app > #stage
  canvas · #ui-root（玩法 UI）
#device-switcher  # 仅桌面预览
```

## 硬性约定

1. `vite` **`base: './'`**  
2. `webDir: dist`  
3. `ios.contentInset: never`  
4. 布局 **390×844**；禁止 `setSize(innerWidth…)`  
5. UI 只挂 `#ui-root`  
6. 无 WebGPU 则明确失败  

## 命令

```bash
npm install
npm run dev    # http://127.0.0.1:5200/
npm run build
npm run cap:sync && npm run ios:bootstrap  # iOS
```

## 玩法硬约定（v0.4）

1. **拖**：投影 G=落点；跟手 F=意图；紫虚线 T*=合后形  
2. **放** = G 全空；**合** = 同数+朝向+**重叠≥1**；**边邻只搬家**  
3. **放回原位** = 取消，不合  
4. 生长：F 相对 B；真空槽可双侧；`forcedTarget` 执行预览  
5. 推：比 **2V**；盘内可推；链推；结算才半出盘裁切  
6. **64 → 清空重摆**；失败=不能合且不能搬  
7. 结算：`isPlayable` 快路径；禁止每帧 full `tryMerge`  

## 业务改哪里

| 改什么 | 文件 |
|--------|------|
| 落点/意图 | `dropResolve.ts` · `view.ts` |
| 合并推挤 | `merge.ts` · `plan.ts` · `timeline.ts` |
| 开局/出块 | `deal.ts` · `spawn.ts` |
| 状态机 | `game.ts` |

改规则 **先改 GAME_RULES** 再改代码。
