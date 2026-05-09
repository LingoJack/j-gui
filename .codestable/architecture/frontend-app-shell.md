---
doc_type: architecture
slug: frontend-app-shell
scope: j-gui 前端工作台外壳——AppShell、Sidebar、MainArea、Search、RightSidePanel
summary: AppShell 负责把 tab、session、settings、search、toast 和左右面板组装成桌面工作台
status: current
last_reviewed: 2026-05-09
tags: [frontend, app-shell, tabs, sidebar, workspace]
depends_on: []
implements: [j-gui-session-management]
---

# AppShell — 前端工作台外壳

## 1. 定位与受众

`frontend-app-shell` 描述 j-gui 当前前端工作台骨架。它不是单一组件，而是一组围绕 `AppShell` 组织的外壳模块：

- 左侧栏
- 标签页主区
- 搜索弹窗
- 右侧文件面板
- 设置弹窗与 toast 容器

受众：

- feature-design：理解工作区骨架与状态入口
- issue-analyze：定位 tab / session / sidebar / search 问题
- 新人上手：快速理解主界面如何拼装

## 2. 结构与交互

### 2.1 组件树

当前主树在 `src/components/app-shell/AppShell.tsx:193-209`：

```text
AppShell
  ├─ LeftSidebar
  ├─ MainArea
  ├─ RightSidePanel?           (仅 agent tab + rightPanelOpen)
  ├─ SettingsDialog
  ├─ SearchDialog
  └─ ToastContainer
```

### 2.2 启动与全局加载

`AppShell` 在挂载时做三件全局初始化：

1. 加载 Agent config，并同步 theme (`src/components/app-shell/AppShell.tsx:54-63`)
2. 预加载 Chat / Agent 两侧会话列表，供跨模式搜索使用 (`src/components/app-shell/AppShell.tsx:65-78`)
3. 监听 `themeAtom`，把 `dark` class 同步到 `documentElement` (`src/components/app-shell/AppShell.tsx:80-82`)

### 2.3 active tab 驱动的会话加载

当 `activeTab` 变化时，`AppShell` 会按 tab 类型加载对应 session 内容 (`src/components/app-shell/AppShell.tsx:84-153`)：

- 没有 active tab：清空 sessionId 和消息
- 有 active tab 但没有 sessionId：清空对应消息
- agent tab：`getAgentSession(sessionId)` -> `timelineToMessages()`
- chat tab：`getSessionMessages(sessionId)` -> 映射成 `Message[]`

同时会尝试从消息推导标题，并写回 session 列表与 `sessionTitleOverridesAtom`。

### 2.4 搜索弹窗

`SearchDialog` 是跨模式会话搜索入口，输入来自：

- `chatSessions`
- `agentSessions`

在 `AppShell` 里组装为：

- `chatSearchSessions` (`src/components/app-shell/AppShell.tsx:184-187`)
- `agentSearchSessions` (`src/components/app-shell/AppShell.tsx:188-191`)

弹窗内部会把两类会话合并排序，再按 query 过滤 (`src/components/app-shell/SearchDialog.tsx:42-55`)。

### 2.5 右侧文件面板

`RightSidePanel` 只会在两个条件同时满足时渲染：

- `activeTab?.type === "agent"`
- `rightPanelOpen === true`

证据：`src/components/app-shell/AppShell.tsx:199`。

它当前是一个基于 `@tauri-apps/plugin-fs` 的文件树浏览器，支持：

- 根目录刷新
- breadcrumb 导航
- 目录按需展开加载

核心逻辑在 `src/components/app-shell/RightSidePanel.tsx:54-175`。

## 3. 子模块

### `AppShell`

位置：`src/components/app-shell/AppShell.tsx`

职责：

- 全局装配
- 全局会话预载
- active tab 切换时装填消息
- 打开/关闭 settings 与 search

### `LeftSidebar`

位置：`src/components/app-shell/LeftSidebar.tsx`

职责：

- 模式切换
- 会话列表展示
- 新建 / 切换 / 删除会话
- 标题重命名
- 左栏折叠

它会按当前 active tab 类型拉取会话列表，周期性刷新 (`src/components/app-shell/LeftSidebar.tsx:142-165`)。

### `MainArea`

位置：`src/components/app-shell/MainArea.tsx`

职责：

- 维护标签页条
- 首次启动时补默认 chat tab
- 根据 active tab 渲染 `ChatView` 或 `AgentView`
- 关闭 tab 时处理流式确认

它还会在离开 agent tab 时调用 `stopAgent()` (`src/components/app-shell/MainArea.tsx:85-95`)。

### `SearchDialog`

位置：`src/components/app-shell/SearchDialog.tsx`

职责：

- 处理 `Ctrl/Cmd + K` 后的会话搜索
- 合并 Chat / Agent 会话源
- 支持键盘上下选择和 Enter 确认

### `RightSidePanel`

位置：`src/components/app-shell/RightSidePanel.tsx`

职责：

- 展示当前文件树
- 提供目录展开、刷新和 breadcrumb 导航

## 4. 状态入口

AppShell 主要消费以下 atoms：

- `themeAtom`
- `agentConfigAtom`
- `tabsAtom`
- `activeTabIdAtom`
- `activeTabAtom`
- `chatSessionsAtom`
- `agentSessionsListAtom`
- `currentSessionIdAtom`
- `chatMessagesAtom`
- `agentMessagesAtom`
- `sessionTitleOverridesAtom`
- `rightPanelOpenAtom`

这些状态里，`tabs + activeTab` 定义工作区上下文，`sessions + messages` 定义当前会话内容，`rightPanelOpen` 控制 agent 侧工具面板。

## 5. 关键决策

- 会话搜索数据与当前侧栏列表分开维护，`AppShell` 在挂载时一次性预取双模式会话源。证据：`src/components/app-shell/AppShell.tsx:65-78`。
- 主区内容完全由 active tab 决定，而不是由单独的 route 或 mode 页面决定。证据：`src/components/app-shell/MainArea.tsx:298-311`。
- Agent 右侧面板不是全局常驻区域，只在 agent tab 下显示。证据：`src/components/app-shell/AppShell.tsx:199`。
- tab 关闭时，若当前 tab 正在流式中，会先弹确认框而不是直接关闭。证据：`src/components/app-shell/MainArea.tsx:150-160`、`273-296`。

## 6. 代码锚点

| 想看什么 | 从哪看 |
|----------|--------|
| 外壳总装配 | `src/components/app-shell/AppShell.tsx:32-210` |
| active tab 会话装填 | `src/components/app-shell/AppShell.tsx:84-153` |
| 搜索会话预载 | `src/components/app-shell/AppShell.tsx:65-78` |
| 左侧栏刷新与会话操作 | `src/components/app-shell/LeftSidebar.tsx:142-258` |
| 模式切换与 tab 建立 | `src/components/app-shell/LeftSidebar.tsx:260-276` |
| 主区 tab 条与关闭逻辑 | `src/components/app-shell/MainArea.tsx:101-171`、`200-311` |
| Agent 离开时 stop | `src/components/app-shell/MainArea.tsx:85-95` |
| 搜索过滤与键盘交互 | `src/components/app-shell/SearchDialog.tsx:42-88` |
| 文件树加载与展开 | `src/components/app-shell/RightSidePanel.tsx:54-175` |

## 7. 已知约束

- `SearchDialog` 只搜索会话标题和 session id，不搜索消息正文。证据：`src/components/app-shell/SearchDialog.tsx:48-55`。
- `RightSidePanel` 当前根路径默认是 `"."`，没有独立的“工作区列表/添加目录”状态层。证据：`src/components/app-shell/RightSidePanel.tsx:119-137`。
- `MainArea` 在切走 agent tab 时直接 `stopAgent()`，当前没有“后台继续运行但切走标签页”的工作台策略。证据：`src/components/app-shell/MainArea.tsx:85-95`。
- `LeftSidebar` 的周期刷新是按当前 active tab 类型单侧拉取，不是一次性同步两组列表。证据：`src/components/app-shell/LeftSidebar.tsx:142-165`。

## 8. 相关文档

- [ARCHITECTURE](./ARCHITECTURE.md)
- [frontend-chat-ui](./frontend-chat-ui.md)
- [frontend-settings-ui](./frontend-settings-ui.md)
- [frontend-state-atoms](/E:/Coding/AI/j-gui/docs/api/frontend-state-atoms.md)
