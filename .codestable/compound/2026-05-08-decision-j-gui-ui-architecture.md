---
doc_type: decision
category: architecture
status: active
created: 2026-05-08
slug: j-gui-ui-architecture
title: j-gui 前端 UI 架构——三栏布局与组件层级
---

# j-gui 前端 UI 架构

## 背景

j-gui 需要支持两种工作模式（Chat / Agent），并按 Proma 的 Electron 三栏布局与交互组织做 1:1 复刻。Chat 模式是简单对话流，Agent 模式增加了工具调用可视化、权限审批和文件浏览器。

## 决定

采用三栏布局 + 标签页主区域，按 Proma 的 UI 结构复刻：

```
AppShell
├── LeftSidebar (可折叠 280px / 48px)
│   ├── ModeSwitch (Chat / Agent 切换 — 滑动指示器)
│   ├── SessionList (按 今日/昨日/更早 分组)
│   │   └── SessionItem (置顶、悬停操作、右键菜单)
│   ├── SettingsButton (底部)
│   └── VersionBadge
├── MainArea
│   ├── TabBar (多标签页: 标题、关闭、切换)
│   └── TabContent
│       ├── ChatView
│       │   ├── ChatHeader (标题、模型选择、清空上下文)
│       │   ├── ChatMessages (流式渲染)
│       │   │   └── MessageBubble (Markdown + 代码高亮)
│       │   └── ChatInput (文本输入、发送)
│       └── AgentView
│           ├── AgentHeader
│           ├── AgentMessages (含工具调用气泡)
│           ├── PermissionBanner (plan/ask/tool 审批)
│           └── AgentInput
└── RightSidePanel (仅 Agent 模式 — 工作区文件浏览器)
```

## 理由

- 三栏布局是成熟 AI 桌面应用的通用模式（Proma、ChatGPT Desktop、Copilot Chat 均采用）
- 左侧栏承载导航（模式 + 会话），主区域承载内容，右侧承载辅助信息——信息密度分层合理
- Chat 和 Agent 共享 MainArea 的标签页框架，避免模式切换时重建整个布局
- 标签页允许多会话并行（Chat Tab 1 + Agent Tab 2 同时打开）
- RightSidePanel 仅在 Agent 模式显示，按需占用空间

## 影响

- `src/components/app-shell/` 承担布局职责（AppShell, LeftSidebar, RightSidePanel）
- `src/components/chat/` 和 `src/components/agent/` 各自独立，通过 MainArea 标签页挂载
- 前端路由不依赖 React Router——标签页切换通过 Jotai atom 管理
- 侧栏折叠状态需保持到 localStorage 或配置

## 相关文档

- `2026-05-08-decision-j-gui-frontend-stack.md` — 前端技术栈（Jotai, Tailwind, shadcn/ui）
- `2026-05-08-decision-j-gui-ipc-dataflow.md` — 事件驱动的流式更新
