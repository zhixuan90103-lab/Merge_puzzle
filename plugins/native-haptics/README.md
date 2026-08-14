# AdvancedHaptics（iOS）

本底座震动插件真源。运行时副本在 `ios/App/App/`。

改插件后执行：

```bash
npm run ios:bootstrap
```

## 注册

`SceneDelegate` 必须 `rootViewController = BridgeViewController()`  
（Capacitor 8 不再走 storyboard 根 VC）。  
`BridgeViewController.capacitorDidLoad` → `registerPluginInstance(AdvancedHapticsPlugin())`

## JS

请用 `src/utils/haptics.ts`：

```ts
import { haptics } from '../../src/utils/haptics';

await haptics.impact('medium');
await haptics.playTransient(0.5, 0.4);
await haptics.startContinuous({ intensity: 0.15, sharpness: 0.2 });
await haptics.stopContinuous();
await haptics.setKeepAwake(true);
```
