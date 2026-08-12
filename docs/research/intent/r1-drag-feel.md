# R1 — 拖动手感（抬起 · 阴影 · 跟手 · 遮挡）

## 问题
RQ8–RQ11, RQ14

## 来源
- [Apple HIG · Drag and Drop](https://developer.apple.com/design/human-interface-guidelines/drag-and-drop)
- [NN/g · Drag-and-Drop](https://www.nngroup.com/articles/drag-drop/)
- [Smart Interface Patterns · DnD UX](https://smart-interface-design-patterns.com/articles/drag-and-drop-ux/)
- Finger occlusion / grab offset 实践与专利讨论
- 既有 `tech/C-drag-feel.md`

## 可迁移结论
1. 拖起后尽快显示半透明/可区分的拖影像；约 3pt 移动即可。  
2. 抬起 = scale + 阴影 + 层级；阴影表「离板」，不是装饰。  
3. 拖影像可微调以预告结果，但勿每帧大变。  
4. 跟手宜 1:1；大块用 grab offset。  
5. 指上偏移保证落点指示可见。  
6. 跟手连续 / 投影贴格 才能同时服务舒适与意图。

## 对本项目
采纳双层：F 连续 + G 贴格；阴影克制；参数见 FINDINGS §1.2。

## 影响用例
F1–F7, U3–U4（偏置可见）
