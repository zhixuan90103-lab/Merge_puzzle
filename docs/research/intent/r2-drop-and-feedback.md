# R2 — 落点状态与反馈

## 问题
RQ1, RQ6, RQ12

## 来源
- Apple HIG invalid drop feedback  
- Building / SaaS placement：合法绿、非法红、进入即变  
- Pencil&Paper / Atlassian drop indicator vs ghost  

## 可迁移结论
1. **Drop target 指示**（线/高亮/脚印）与 **drag ghost** 分离。  
2. 合法/非法在拖动中持续更新（proposal 模型）。  
3. Invalid 应阻止并反馈，非静默成功。  
4. 状态变化用色+描边为主，阴影为辅。

## 对本项目
`place | merge | blocked`；同数且 T* 合法才 merge；不同数 blocked。

## 影响用例
U1, U2, U10, F4–F6
