# Merge Puzzle

竖屏 **占位合成** 原型：TypeScript + Three.js WebGPU + Vite + Capacitor iOS。

## 文档

| 文档 | 用途 |
|------|------|
| [AGENTS.md](./AGENTS.md) | 仓库第一入口 |
| [docs/GAME_RULES.md](./docs/GAME_RULES.md) | **规则真源 v0.4** |
| [docs/ARCHITECTURE_GAME.md](./docs/ARCHITECTURE_GAME.md) | **玩法架构与数据流** |
| [docs/CHANGELOG_PROTOTYPE.md](./docs/CHANGELOG_PROTOTYPE.md) | **变更汇总 v0.4** |
| [docs/research/intent/FINDINGS.md](./docs/research/intent/FINDINGS.md) | 拖合一体规格 |
| [docs/research/INTENT_RECOGNITION_PLAN.md](./docs/research/INTENT_RECOGNITION_PLAN.md) | 检索计划 |
| [docs/CORE_CONCEPTS.md](./docs/CORE_CONCEPTS.md) | L2 概念 |
| [docs/ENGINEERING.md](./docs/ENGINEERING.md) | 工程约定 |
| [docs/ENTRYPOINTS.md](./docs/ENTRYPOINTS.md) | 启动链 |

## 上手

```bash
npm install
npm run dev
# → http://127.0.0.1:5200/
```

## 玩法摘要（v0.4）

- **投影 G**：空=放 · 同数重叠≥1=合 · 不同=禁止 · **原位=放回**  
- **跟手 F**：连续偏置 = 生长意图；紫虚线 = 合后形 T*（可双侧空槽）  
- 推：比合成后 **2V**，盘内可推；动画连续；结算裁切半出盘  
- 开局底边整齐；出块中后期少 1、多 2/4  
- **64** → 清空重摆  

## iOS

```bash
npm run ios:bootstrap
npm run cap:sync
# Xcode Run
```

`appId` 占位：`com.example.portraitwebgpubase`。
