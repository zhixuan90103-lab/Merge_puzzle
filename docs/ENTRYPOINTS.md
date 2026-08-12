# 入口与调用链

配套：[AGENTS.md](../AGENTS.md) · [GAME_RULES.md](./GAME_RULES.md) · [ENGINEERING.md](./ENGINEERING.md)

## 1. 命令

| 命令 | 结果 |
|------|------|
| `npm run dev` | http://127.0.0.1:5200/ |
| `npm run build` | `tsc` 检查 + `dist/`（相对路径） |
| `npm run validate:levels` | 关卡布局/可玩/清异色/双 32 回归 |
| `npm run cap:sync` | build + cap sync ios |
| `npm run ios:bootstrap` | add ios + 注入插件 + sync |
| `npm run ios` | sync + open Xcode |

## 2. Web 启动链

```
index.html
  → style.css
  → main.ts
       → applyNativeClass / safeArea
       → createRenderer(#stage)   # 可选背景；canvas 不抢指针
       → mountDevicePreview → computeStageLayout → applyStageTransform
       → watchStageLayout
       → createGame + mountGameView(#stage, #ui-root)
```

玩法规则见 [GAME_RULES.md](./GAME_RULES.md) **v0.8**。

## 3. DOM

```
#shell
  #viewport
    #app
      #stage
        canvas
        #ui-root
#device-switcher / #device-label   (web only)
```

## 4. iOS

```
Xcode → BridgeViewController
  → register AdvancedHapticsPlugin
  → load App/public (= dist)
  → 同上 Web 链
```

## 5. 改配置找谁

| 要改 | 文件 |
|------|------|
| **玩法规则** | `docs/GAME_RULES.md` → 再改 `src/game/*` |
| 关卡布局 | `src/game/deal.ts` · 校验 `npm run validate:levels` |
| 色种/文案 | `src/game/progress.ts` |
| base / 端口 | `vite.config.ts` |
| appId | `capacitor.config.ts` |
| 设计分辨率 | `design.ts` + `style.css` |
| 震动原生 | `plugins/native-haptics/*.swift` + bootstrap |
| 启动 / HUD | `index.html` + `main.ts` |

## 6. 玩法挂接（v0.8）

```
main.ts
  → adapt / createRenderer(#stage)
  → createGame()                    // game.ts
  → mountGameView(#stage, #ui-root) // view.ts
       → hitTest / beginLift
       → proposeDrop(F,G,origin) → 蓝可合 | 灰原位 | 红非法 + T*
       → dropAt(G, Δ, frame)
            ├ merge → tryMerge(forcedTarget: T*)
            │         → playMergePlan
            │         → afterMerge
            │              ├ 64 → dealAfterClear
            │              ├ area<64 → fillToFull
            │              └ !isSafeToContinue → 判负
            └ illegal / 原位 → 弹回 / 放回
（无 place / 无搬家；稳定态 Σ=64）
```

规则：`GAME_RULES.md` · 架构：`ARCHITECTURE_GAME.md` · 关卡：`LEVEL_DESIGN.md` · 变更：`CHANGELOG_PROTOTYPE.md`
