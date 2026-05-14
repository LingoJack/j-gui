---
doc_type: decision
name: frontend-ui-performance-constraints
description: j-gui 前端 UI 动画、滚动与 React 性能硬约束
status: active
date: 2026-05-14
---

# 前端 UI 性能硬约束

## 背景

侧边栏展开/收起、消息滚动条和主内容布局连续出现卡顿、跳闪、双滚动条与点击命中不稳定问题。根因不是单个 CSS 类，而是缺少统一的前端 UI 性能约束：布局动画、滚动所有权、Jotai 订阅边界和交互按钮命中区域由不同组件各自决定，容易互相打架。

外部笔记 `E:\下载文件\Text File.txt` 中的 React / Tauri 性能建议大体适用于本项目，但需要按本项目架构裁剪。`React.memo` / `useMemo` / `useCallback` 不能作为无证据的默认动作；本项目优先级更高的是状态订阅收敛、滚动所有权唯一、动画职责统一，以及 IPC / 重计算不阻塞交互。

## 已经利用的部分

- 本项目已经使用 Jotai，符合“细粒度状态库”方向。
- `sessionSidePanelOpenAtom(sessionId)` 已经把右侧栏开关收敛为会话级派生读取，避免 AppShell 直接依赖整张 Map 的业务语义。
- `LeftSidebar` 已把折叠态壳层与展开态重内容拆开，展开内容用 `React.memo` 避免只因折叠状态变化而重渲染会话列表。
- Chat / Agent 流式链路已经使用 Channel，符合“高频流式不要走轮询”的 Tauri 方向。

## 硬约束

1. **一个可滚动表面只能有一个滚动条所有者。**
   消息区如果使用浏览器原生滚动条，就不能再叠加自绘滚动进度条。需要消息导航时，应作为显式导航组件出现，不能伪装成第二套滚动条。

2. **AppShell 统一拥有三列布局动画。**
   左侧栏、主内容、右侧栏的列宽变化必须由 AppShell 顶层布局统一驱动。子面板只允许做内容裁剪、透明度或内部 transform，不允许各自再用独立 width 动画制造竞争布局。

3. **开关按钮必须保持稳定命中。**
   展开/收起按钮不能因为状态切换被 `key` 强制重挂载，也不能在动画期间被父容器裁剪或移动到不可预测位置。右侧栏这类跨列控制优先使用稳定 overlay 命中层。

4. **不要为“GPU 加速”滥用 `will-change`。**
   `width` / `padding` / `grid-template-columns` 都是布局属性，加 `will-change` 不能把它们变成纯合成动画。只有真实 transform / opacity 热路径且有 profiling 证据时，才允许临时使用。

5. **Jotai 订阅要贴近消费点。**
   大壳层不要订阅大对象 Map 后再在 render 中筛选。优先使用会话级派生 atom、布尔派生 atom，或把只在事件回调里使用的 setter 与读取拆开。

6. **`React.memo` / `useCallback` 只用于有边界收益的位置。**
   对重子树、稳定 props、或会被高频父状态牵连的组件使用 memo。不要为了“最佳实践”给简单表达式和局部按钮批量包 memo / callback。

7. **交互优先级高于非关键副作用。**
   切换侧栏、输入、滚动这类交互不能等待文件树扫描、会话列表刷新、IPC 请求或 tooltip 生命周期完成。非关键副作用应放到事件之后、idle、transition 或后端异步链路里。

8. **性能结论必须带证据。**
   任何“卡顿根因”判断至少需要对应代码路径、复现症状和验证方式。没有 profiling 或回归测试时，只能标记为假设，不能写成已确认结论。

## 对外部笔记的裁剪结论

- 可直接采用：细粒度状态、状态下沉、正确清理 effect、被动滚动监听、减少重复 IPC、重计算下放 Rust、二进制走路径而非 JSON。
- 谨慎采用：`React.memo`、`useMemo`、`useCallback`、`useDeferredValue`、`useTransition`。这些要绑定具体热点，不作为全局默认。
- 暂不适用：Next.js / RSC / SSR / API Routes 相关规则。本项目是 Tauri + Vite SPA，不应把服务端渲染规则搬进来。

## 后续落点

- AppShell / LeftSidebar / RightSidePanel 的动画必须继续按本决策约束维护。
- 如果后续恢复消息导航迷你地图，必须先设计成独立导航入口，而不是叠加第二套滚动条。
- `frontend-domain-reorganization` 推进时，应把 shell、chat、agent、settings 的性能约束写入对应 architecture 文档。
