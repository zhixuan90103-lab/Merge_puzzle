# R3 — 单侧意图分类

## 问题
RQ2, RQ4, RQ7

## 来源
- AABB protrusion / exclusive region（几何常规）  
- 触控末段速度（意图恢复）  
- 项目需求：偏左→向左长

## 可迁移结论
1. **Protrusion + exclusive cells** 优于纯中心差。  
2. 轴：较大分量 + 死区 ε。  
3. 正中：末段 80–120ms 进入侧。  
4. 分类输入必须是 **连续 F**，不能是已贴格的 G。

## 对本项目
`classifySide(F, B)`；数据流 aim→F 连续、G=snap(aim)。

## 影响用例
U3, U4, U5, U9, F7
