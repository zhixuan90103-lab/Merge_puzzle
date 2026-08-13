# Merge Puzzle

竖屏 **色阵营合成推挤** 原型：TypeScript + Three.js WebGPU + Vite + Capacitor iOS。

## 一句话玩法

**同色合成 → 把杂色推出盘 → 单色合满屏 64 → 下一关。**  
盘始终满（Σ=64）；只能拖合，不能搬家。

## 文档

| 文档 | 用途 |
|------|------|
| [AGENTS.md](./AGENTS.md) | 仓库第一入口 |
| [docs/GAME_RULES.md](./docs/GAME_RULES.md) | **规则真源 v0.9** |
| [docs/DESIGN_DRAG_MERGE.md](./docs/DESIGN_DRAG_MERGE.md) | 拖合意图 × 推挤 |
| [docs/DESIGN_PREVIEW.md](./docs/DESIGN_PREVIEW.md) | **预览手感**（融合皮 / T* / 推预览 / 松手） |
| [docs/ARCHITECTURE_GAME.md](./docs/ARCHITECTURE_GAME.md) | 玩法架构 |
| [docs/LEVEL_DESIGN.md](./docs/LEVEL_DESIGN.md) | 关卡设计 + 校验 |
| [docs/CHANGELOG_PROTOTYPE.md](./docs/CHANGELOG_PROTOTYPE.md) | 变更汇总 |
| [docs/ENGINEERING.md](./docs/ENGINEERING.md) | 工程约定 |
| [docs/ENTRYPOINTS.md](./docs/ENTRYPOINTS.md) | 启动链 |
| [docs/research/](./docs/research/) | 历史调研（非现行真源） |

## 上手

```bash
npm install
npm run dev
# → http://127.0.0.1:5200/

npm run validate:levels   # 关卡回归
```

## 玩法摘要（v0.9）

| | |
|--|--|
| 合 | 同色同数；朝向相容；连续重叠进锁；**合后形跟摆放走**；**只能拖合** |
| 推 | 合后体积 2V 推 **≤2V** 块；仅 **>2V** 铁门；面对齐 |
| 闭包 | 稳定态 Σ=64；推空后智能补块 |
| 流放 | 推光某色 → 本波不再补该色 |
| 过关 | 单色 **64** 满盘 → 清盘下一关（色种随关增加，最多 5） |
| 失败 | 无合法合，或每步合法合都死（一步死）；**32+32→64 是胜利** |

拖：块跟手 · 锁上出融合皮 · 半透明本体 = 合后形 · 被推块按盘面顺序挪开。详见 [DESIGN_PREVIEW.md](./docs/DESIGN_PREVIEW.md)。

## iOS

```bash
npm run ios:bootstrap
npm run cap:sync
# Xcode Run
```

`appId`：`lab.zhixuan.mergepuzzle`（npm 包名 `merge-puzzle`，避免与 portrait-webgpu-base 等底座冲突）。
