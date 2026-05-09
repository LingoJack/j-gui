---
doc_type: lib-api-ref
entry: app-shell-components
category: React Components
status: draft
source_files:
  - src/components/app-shell/AppShell.tsx
  - src/components/app-shell/LeftSidebar.tsx
  - src/components/app-shell/MainArea.tsx
  - src/components/app-shell/RightSidePanel.tsx
  - src/components/app-shell/SearchDialog.tsx
  - src/components/app-shell/WelcomePage.tsx
summary: 工作台外壳、侧栏、主区、文件面板、搜索和欢迎页组件参考。
last_reviewed: 2026-05-09
---

# app-shell-components

## 概述

这组组件构成 j-gui 当前桌面工作台外壳：

- `AppShell`
- `LeftSidebar`
- `MainArea`
- `RightSidePanel`
- `SearchDialog`
- `WelcomePage`

它们负责：

- 会话与 tab 的外壳组织
- 左侧模式切换与会话列表
- 主区内容切换
- 跨模式搜索
- 右侧文件浏览器
- 无 provider 时的欢迎引导

## 组件参考

### `AppShell`

文件：`src/components/app-shell/AppShell.tsx`

职责：

- 页面总装配
- 初始加载配置和双模式 session 列表
- 根据当前 active tab 拉取 chat / agent 消息
- 打开设置、搜索和 toast 容器

主要输入：

- 无 props

主要输出：

- 渲染 `LeftSidebar`、`MainArea`、`RightSidePanel`、`SettingsDialog`、`SearchDialog`、`ToastContainer`

行为：

- 挂载时读取 `getAgentConfig()`
- 挂载时并行读取 `listSessions()` 与 `listAgentSessions()`
- `activeTab` 切换时按 `type` 读取 `getSessionMessages()` 或 `getAgentSession()`
- 通过 `deriveSessionTitle()` 回填标题覆盖

### `LeftSidebar`

文件：`src/components/app-shell/LeftSidebar.tsx`

props：

- `onOpenSettings: () => void`

职责：

- 切换 Chat / Agent 模式
- 展示当前模式下的会话列表
- 新建 / 切换 / 删除 / 重命名会话
- 控制侧栏折叠

主要本地状态：

- `pinnedIds`
- `showPinnedOnly`
- `editingId`
- `editValue`

行为：

- 按当前 `activeTab.type` 每 5 秒刷新一次会话列表
- 会话按 `今天 / 昨天 / 更早` 分组
- 双击会话标题进入重命名
- 折叠态保留新建、只看置顶和设置入口

### `MainArea`

文件：`src/components/app-shell/MainArea.tsx`

props：

- `onOpenSettings: () => void`

职责：

- 管理 tab 条
- 在无 tab 时创建默认 chat tab
- 渲染 `ChatView` 或 `AgentView`
- 流式中关闭 tab 时弹确认框

行为：

- `Ctrl+Tab` / `Ctrl+Shift+Tab` 切换 tab
- 离开 agent tab 时调用 `stopAgent()`
- 无 provider 时显示 `WelcomePage`
- 有 provider 但无 tab 时显示“新建标签页”空态

### `RightSidePanel`

文件：`src/components/app-shell/RightSidePanel.tsx`

职责：

- 提供右侧文件树浏览器

主要本地状态：

- `tree`
- `currentPath`
- `loading`

行为：

- 默认从 `"."` 目录加载
- 展开目录时按需异步加载子节点
- 忽略 `.git`、`node_modules`、`target`
- 提供 breadcrumb 导航和刷新按钮

### `SearchDialog`

文件：`src/components/app-shell/SearchDialog.tsx`

props：

- `open`
- `onClose`
- `chatSessions`
- `agentSessions`
- `onSelect`

职责：

- 提供跨 Chat / Agent 的会话搜索弹窗

行为：

- 合并两组 session 后按 `updatedAt` 倒序
- 搜索范围只包含 `title` 和 `id`
- 支持 IME composing 保护
- 支持 `ArrowUp` / `ArrowDown` / `Enter` / `Escape`

### `WelcomePage`

文件：`src/components/app-shell/WelcomePage.tsx`

props：

- `onOpenSettings`
- `version`

职责：

- 在未配置 provider 时展示引导页

内容：

- 产品欢迎标题
- 三步开始使用提示
- 打开设置按钮
- 版本号

## 组件关系

```text
AppShell
  -> LeftSidebar
  -> MainArea
     -> WelcomePage | ChatView | AgentView
  -> RightSidePanel?
  -> SearchDialog
  -> SettingsDialog
  -> ToastContainer
```

## 关键边界

- 这组组件直接依赖当前工作台状态 atoms，不是通用布局组件库。
- `AppShell` 负责数据装填，`MainArea` 负责 tab 内容选择，两者职责分开。
- `SearchDialog` 只处理会话搜索，不搜索消息正文。
- `RightSidePanel` 当前是浏览器式文件树，不包含“添加工作区目录”这类更高层管理能力。
- `LeftSidebar` 当前会话列表是按 active tab 类型单侧刷新，不是同时维护两套实时列表。

## 相关条目

- [src/components/app-shell/AppShell.tsx](/E:/Coding/AI/j-gui/src/components/app-shell/AppShell.tsx)
- [src/components/app-shell/LeftSidebar.tsx](/E:/Coding/AI/j-gui/src/components/app-shell/LeftSidebar.tsx)
- [src/components/app-shell/MainArea.tsx](/E:/Coding/AI/j-gui/src/components/app-shell/MainArea.tsx)
- [src/components/app-shell/RightSidePanel.tsx](/E:/Coding/AI/j-gui/src/components/app-shell/RightSidePanel.tsx)
- [src/components/app-shell/SearchDialog.tsx](/E:/Coding/AI/j-gui/src/components/app-shell/SearchDialog.tsx)
- [src/components/app-shell/WelcomePage.tsx](/E:/Coding/AI/j-gui/src/components/app-shell/WelcomePage.tsx)
- [frontend-app-shell](/E:/Coding/AI/j-gui/.codestable/architecture/frontend-app-shell.md)
