# 入口与调用链

配套：[AGENTS.md](../AGENTS.md) · [GAME_RULES.md](./GAME_RULES.md) · [ENGINEERING.md](./ENGINEERING.md)

## 1. 命令

| 命令 | 结果 |
|------|------|
| `npm run dev` | http://127.0.0.1:5200/ |
| `npm run build` | `tsc` 检查 + `dist/`（相对路径） |
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

玩法规则见 [GAME_RULES.md](./GAME_RULES.md) v0.6。

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
| base / 端口 | `vite.config.ts` |
| appId | `capacitor.config.ts` |
| 设计分辨率 | `design.ts` + `style.css` |
| 震动原生 | `plugins/native-haptics/*.swift` + bootstrap |
| 启动 / HUD | `index.html` + `main.ts` |

## 6. 玩法挂接（v0.4）

```
main.ts
  → adapt / createRenderer(#stage)
  → createGame()                    // game.ts
  → mountGameView(#stage, #ui-root) // view.ts
       → hitTest / beginLift
       → proposeDrop(F,G,origin) → 绿|蓝+T*|红|放回
       → dropAt(G, Δ, frame)
            ├ place → 搬家
            ├ merge → tryMerge(forcedTarget: T*) → playMergePlan → spawn
            └ illegal → 弹回
```

规则：`GAME_RULES.md` · 架构：`ARCHITECTURE_GAME.md` · 变更：`CHANGELOG_PROTOTYPE.md`
