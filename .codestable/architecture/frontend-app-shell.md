---
doc_type: architecture
slug: frontend-app-shell
scope: j-gui 前端工作台外壳——AppShell、Sidebar、MainArea、Search、RightSidePanel、GlobalShortcuts、Tab 系统
summary: AppShell 是极简布局容器；左侧栏、标签页主区、搜索浮窗、右侧文件面板、全局快捷键各自由独立子模块承担，通过 Jotai atoms 协调
status: current
last_reviewed: 2026-05-10
tags: [frontend, app-shell, tabs, sidebar, workspace, shortcuts]
depends_on: [frontend-state-atoms]
implements: [j-gui-session-management]
---

# AppShell — 前端工作台外壳

## 1. 定位与受众

`frontend-app-shell` 描述 j-gui 前端工作台骨架。与上一版相比有重大架构变化：

- **AppShell 自身已减薄为极简布局容器**：不再负责会话加载、标题推导、快捷键注册等逻辑
- 全局快捷键剥离到 `GlobalShortcuts` 组件（`components/shortcuts/`）
- 多标签页系统完全独立为 `tab-atoms.ts` + `components/tabs/`
- 右侧文件面板从 `@tauri-apps/plugin-fs` 直读切换到 `SidePanel` + `FileBrowser` + 会话/工作区分层目录
- 左侧栏大幅膨胀，内联了会话列表项渲染、模式切换器、工作区选择器、可拖拽双区布局

受众：

- feature-design：理解工作区骨架与状态入口
- issue-analyze：定位 tab / session / sidebar / search 问题
- 新人上手：快速理解主界面如何拼装

## 2. 结构与交互

### 2.1 组件树

当前主树在 `src/components/app-shell/AppShell.tsx:30-55`：

```text
AppShell
  ├─ <titlebar drag region>
  ├─ LeftSidebar
  │    ├─ ModeSwitcher              (滑动指示器切换 agent/chat)
  │    ├─ WorkspaceSelector         (仅 agent 模式)
  │    ├─ 新对话/新会话按钮
  │    ├─ Chat: 置顶区 + 对话日期分组列表
  │    ├─ Agent: 可拖拽双区（上 Working/置顶 Tab，下最近会话列表）
  │    ├─ UserAvatar / 设置入口
  │    └─ SearchDialog              (全局搜索浮窗)
  ├─ MainArea
  │    ├─ Panel
  │    │    ├─ TabBar               (Chrome 风格多标签)
  │    │    └─ WelcomeView | TabContent
  │    │         ├─ ChatView(conversationId)   (chat tab)
  │    │         └─ AgentView(sessionId)       (agent tab)
  │    └─ SettingsDialog            (始终存在，浮窗形式)
  ├─ RightSidePanel?                (仅 agent 模式 + 有 currentSessionId)
  │    └─ SidePanel
  │         ├─ 会话文件区 (sessionPath)
  │         │    ├─ AttachedDirsSection (附加目录树)
  │         │    ├─ FileBrowser (工作文件)
  │         │    └─ FileDropZone
  │         ├─ 工作区文件区 (workspaceFilesPath)
  │         │    ├─ AttachedDirsSection (工作区级附加目录)
  │         │    ├─ FileBrowser
  │         │    └─ FileDropZone
  │         └─ 无工作区时显示「请选择工作区」
  └─ SettingsDialog (rendered inside MainArea)
```

全局浮窗（通过原子控制渲染，不在组件树固定位置）：

```text
SearchDialog              (searchDialogOpenAtom, 放在 LeftSidebar 内共同挂载)
SettingsDialog            (settingsOpenAtom, 放在 MainArea 内挂载)
TabCloseConfirmDialog     (pendingCloseTabIdAtom, 放在 TabBar 内挂载)
MoveSessionDialog         (moveTargetId, 放在 LeftSidebar 内局部挂载)
AlertDialog (删除确认)     (pendingDeleteId, 放在 LeftSidebar 内局部挂载)
```

特殊：`GlobalShortcuts` 组件不返回 UI（`return null`），在 `main.tsx` 顶层挂载。

### 2.2 布局容器（AppShell）

`AppShell` 已降级为纯布局容器。`src/components/app-shell/AppShell.tsx:24-56`：

- 读取 `appModeAtom`、`currentAgentSessionIdAtom`、`currentSessionSidePanelOpenAtom`
- 固定 `h-screen w-screen flex overflow-hidden`
- 左浮动 `LeftSidebar`（带 `p-2 pr-0` 圆角）
- 中间 `flex-1 min-w-0` 容纳 `MainArea`
- 右侧 `RightSidePanel` 条件渲染：`appMode === 'agent' && !!currentSessionId`
- 使用 `AppShellProvider` context 传递上下文值
- 顶部固定 `titlebar-drag-region` div（50px 高度，z-50）

它不再做：
- 不再加载 Agent config / 同步 theme（由 `ThemeInitializer` 等其他组件负责）
- 不再预加载会话列表（由 `LeftSidebar` 自己完成）
- 不再注册键盘快捷键（由 `GlobalShortcuts` 统一管理）
- 不再推导会话标题

### 2.3 多标签页系统

完全独立的 tab 系统，核心在 `src/atoms/tab-atoms.ts`：

**数据结构**：
- `TabItem`：`{ id, type: 'chat'|'agent', sessionId, title }`
- `tabsAtom`：`TabItem[]`（有序列表）
- `activeTabIdAtom`：`string | null`
- `activeTabAtom`：派生 atom，返回当前活跃 TabItem
- `tabStreamingMapAtom`：派生 atom，从 chat/agent 流式状态计算
- `tabIndicatorMapAtom`：派生 atom，标签页指示点状态
- `tabMruAtom`：最近使用顺序（当前未广泛使用）

**操作函数**（纯函数）：
- `openTab(tabs, item)`：查找同 type+sessionId 的现有 tab，找到则聚焦，否则新建
- `closeTab(tabs, activeTabId, tabId)`：关闭后自动激活相邻 tab
- `reorderTabs(tabs, fromIndex, toIndex)`：拖拽重排
- `updateTabTitle(tabs, sessionId, title)`：更新标题

**TabBar** `src/components/tabs/TabBar.tsx`（34-259 行）：
- 读取 `tabsAtom`、`activeTabIdAtom`、`tabIndicatorMapAtom`
- 点击 tab 时同步 `appModeAtom`、`currentConversationIdAtom` / `currentAgentSessionIdAtom`、`currentAgentWorkspaceIdAtom`
- 中键关闭、拖拽重排、Chrome 风格等分宽度（溢出可横向滚动）
- 悬停 300ms 后显示 mini 预览面板
- 依赖 `useCloseTab` hook

**TabContent** `src/components/tabs/TabContent.tsx`（19-49 行）：
- 根据 tab type 路由到 `ChatView(conversationId)` 或 `AgentView(sessionId)`
- 使用 `TabErrorBoundary` 包裹

**TabCloseConfirmDialog**：当关闭流式中的 Agent tab 时弹出确认对话框（用 `pendingCloseTabIdAtom` 控制）

**useOpenSession hook** `src/hooks/useOpenSession.ts`（23-65 行）：
- 统一封装 `openTab + setTabs + setActiveTabId + setAppMode + setCurrentXxxId`
- 同步 workspaceId 并持久化到 settings

**useCloseTab hook** `src/hooks/useCloseTab.tsx`（45-119 行）：
- TabBar 和 GlobalShortcuts 共用
- Agent tab 关闭前先调 `ipc.stopAgent(sessionId)`（Issue #357 修复）
- 流式中弹确认，通过 `pendingCloseTabIdAtom` 驱动

### 2.4 左侧栏（LeftSidebar）

`src/components/app-shell/LeftSidebar.tsx`（158-1356 行）——约 1200 行：

**布局**：
- 折叠状态（48px 宽图标列）
- 展开状态（280px 默认宽，最小 180px）
- macOS 自动避让左上角红绿灯区域

**内容**：
1. **ModeSwitcher**：滑动背景指示器，切换后自动恢复模式对应的上一次会话（`src/components/app-shell/ModeSwitcher.tsx`）
2. **WorkspaceSelector**（仅 agent 模式）：切换当前工作区
3. **新对话/新会话按钮** + **搜索按钮**
4. **Chat 模式**：
   - 置顶对话区域（可展开/收起）
   - 对话列表按日期分组（今天/昨天/更早），支持 `sidebarViewModeAtom` 切换活跃/归档
5. **Agent 模式 active 视图**：
   - 可拖拽双区布局：上区（Working / 置顶 Tab 切换，高度可通过分割条拖拽调整，持久化到 localStorage）
   - 下区：最近会话按日期分组
   - Working 区域分 todo/running/done 三组，用左侧色块标识（orange/blue/green）
6. **归档入口** / 返回活跃按钮
7. **工作区能力指示器**（MCP 服务数 + Skills 数）
8. **用户头像 + 设置入口**
9. **操作按钮**（hover 时显示）：Pin/取消Pin、标记为工作中/取消工作中、迁移会话、重命名、归档/取消归档、删除

**数据加载**：`src/components/app-shell/LeftSidebar.tsx:390-416`
- 初始挂载：`ipc.listConversations()` + `ipc.getUserProfile()` + `ipc.listAgentSessions()`
- 窗口聚焦时重新同步（`window.addEventListener('focus', ...)`）

**删除确认**：`AlertDialog` 局部管理 `pendingDeleteId`
**迁移会话**：`MoveSessionDialog`（仅 agent 模式）
**Per-session Map atoms 清理**：`cleanupMapAtoms()` 统一删除 `conversationModelsAtom` 等 Map 中的条目

### 2.5 主内容区（MainArea）

`src/components/tabs/MainArea.tsx`（16-53 行）：

- 包裹在 `Panel` 容器内（`.bg-content-area.rounded-2xl.shadow-xl`）
- 渲染 `TabBar` + 内容区
  - 无 tab 时显示 `WelcomeView`
  - 有 `activeTabId` 时渲染 `TabContent(tabId)`
- `SettingsDialog` 始终作为同级渲染（通过 `settingsOpenAtom` 控制显示）
- 兜底逻辑：`tabs.length > 0` 但 `activeTabId` 为空时自动激活第一个标签

### 2.6 右侧文件面板（RightSidePanel + SidePanel）

`RightSidePanel`（`src/components/app-shell/RightSidePanel.tsx`，14-29 行）是薄壳：
- 读取 `appModeAtom`、`currentAgentSessionIdAtom`、`agentSessionPathMapAtom`
- 仅 agent 模式 + 有当前会话时渲染 `SidePanel`

`SidePanel`（`src/components/agent/SidePanel.tsx`，39-492 行）是完整文件浏览器面板，约 430 行：

**核心功能**：
- Per-session 面板开关（`agentSidePanelOpenMapAtom`，默认打开，带展开/收起动画）
- **会话文件区**（仅 `sessionPath` 非空时显示）：
  - breadcrumb 路径显示 + 在 Finder 中打开 + 刷新按钮
  - `AttachedDirsSection`：会话级附加目录，可展开/收起树，支持重命名、移动、在文件夹中显示
  - `FileBrowser`：展示会话工作文件
  - `FileDropZone`：拖拽上传
- **工作区文件区**：
  - 工作区级附加目录
  - `FileBrowser` 展示工作区文件
  - `FileDropZone`
- **添加到聊天**（`handleAddToChat`）：读取文件内容 → 创建 `AgentPendingFile` → 注入到待发送列表
- **文件变更自刷新**：`workspaceFilesVersionAtom` 递增时 FileBrowser 刷新

### 2.7 搜索弹窗（SearchDialog）

`src/components/app-shell/SearchDialog.tsx`（104-483 行）——双层搜索：

1. **标题匹配**（即时，客户端内存过滤）：
   - 基于 `searchDialogOpenAtom` 开关
   - 过滤 `conversationsAtom` + `agentSessionsAtom` 的 title
   - 按 `updatedAt` 降序，取前 20 条

2. **消息内容搜索**（debounce 300ms，IPC 调用）：
   - `ipc.searchConversationMessages(query)` + `ipc.searchAgentSessionMessages(query)`
   - 结果含 snippet、`matchStart`、`matchLength` 用于高亮
   - 排除已在标题结果中的会话
   - 搜索词 >= 2 字符才触发

3. **键盘导航**：上下箭头选择 + Enter 打开 + Esc 关闭
4. **IME 兼容**：compositionStart/compositionEnd + 60ms 微 debounce 处理中文输入
5. **导航**：使用 `useOpenSession` hook 打开对应会话
6. **额外信息**：Agent 会话显示工作区名称 badge，已归档显示归档图标

### 2.8 全局快捷键（GlobalShortcuts）

`src/components/shortcuts/GlobalShortcuts.tsx`（56-424 行）——`return null` 组件：

**初始化**：挂载时调用 `initShortcutRegistry()` + 从 settings 加载自定义配置

**注册的快捷键**：

| 快捷键 | 功能 | 实现 |
|--------|------|------|
| `close-tab` | Cmd+W 关闭标签 | 浮窗优先关闭 → IPC 菜单事件代理 |
| `open-settings` | Cmd+, 打开设置 | `setSettingsOpen(true)` |
| `global-search` | Cmd+F 全局搜索 | `setSearchOpen(true)` |
| `new-session` | Cmd+N 新建对话/会话 | 根据模式调用 `createChat({ draft: true })` / `createAgent({ draft: true })` |
| `toggle-sidebar` | Cmd+B 切换侧边栏 | `setSidebarCollapsed(!sidebarCollapsed)` |
| `toggle-mode` | Cmd+Shift+M 切换模式 | `setAppMode(appMode === 'chat' ? 'agent' : 'chat')` |
| `clear-context` | Cmd+K 清除上下文 | `CustomEvent('jgui:clear-context')` |
| `focus-input` | Cmd+L 聚焦输入框 | `CustomEvent('jgui:focus-input')` |
| `stop-generation` | Cmd+Shift+Backspace 停止生成 | `CustomEvent('jgui:stop-generation')` |

**IPC 事件监听**：
- `onMenuCloseTab`：菜单栏 Cmd+W 转发
- `onQuickTaskOpenSession`：快速任务窗口创建会话并自动发送（含附件处理）
- `onVoiceDictationInsertText`：语音输入插入到当前输入框
- `onTrayOpenAgentSession` / `onTrayCreateSession`：系统托盘操作

**快捷键注册机制**：`useShortcut` hook → `registerShortcut(id, callback)` → `shortcut-registry` lib

## 3. 子模块

### AppShell

位置：`src/components/app-shell/AppShell.tsx`

职责：
- 三栏布局容器
- 条件渲染右侧面板
- 提供 `AppShellProvider` context

### LeftSidebar

位置：`src/components/app-shell/LeftSidebar.tsx`

职责：
- 模式切换（ModeSwitcher）
- 工作区选择（WorkspaceSelector，仅 agent）
- 会话/对话列表展示（置顶/日期分组/归档/Working 区域）
- 创建/选择/删除/重命名/置顶/归档/标记工作中/迁移会话
- 搜索弹窗挂载点
- 折叠/展开状态

### MainArea

位置：`src/components/tabs/MainArea.tsx`

职责：
- 标签页条
- 标签内容路由（ChatView / AgentView）
- WelcomeView（无标签时）
- SettingsDialog 挂载点

### TabBar

位置：`src/components/tabs/TabBar.tsx`

职责：
- 多标签显示、切换、关闭、拖拽重排
- 标签流式状态指示点
- 悬停预览面板
- middle-click 关闭

### TabContent

位置：`src/components/tabs/TabContent.tsx`

职责：
- 根据 tab type 路由到 ChatView 或 AgentView
- TabErrorBoundary 错误边界

### SearchDialog

位置：`src/components/app-shell/SearchDialog.tsx`

职责：
- 全局会话/对话搜索（标题 + 消息内容）
- 键盘导航与选中高亮
- IME 输入兼容

### RightSidePanel

位置：`src/components/app-shell/RightSidePanel.tsx`

职责：
- 薄壳，读取 sessionId + sessionPath 委托给 SidePanel

### SidePanel

位置：`src/components/agent/SidePanel.tsx`

职责：
- 会话文件树 + 工作区文件树
- 附加目录管理（会话级 + 工作区级）
- 文件拖拽上传
- 添加文件到聊天
- 文件操作（重命名、移动、在文件夹中显示）

### GlobalShortcuts

位置：`src/components/shortcuts/GlobalShortcuts.tsx`

职责：
- 全局快捷键注册与所有 handler
- 设置面板上自定义快捷键加载
- 菜单栏 IPC 事件代理
- 快速任务 / 语音输入 / 系统托盘操作

### BackgroundTasksPanel

位置：`src/components/agent/BackgroundTasksPanel.tsx`

职责：
- 在 Agent 消息工具执行区域显示运行中后台任务表格
- 展示 Shell 任务和 Agent 子代理任务（仅运行中）
- 不在 AppShell 直接渲染，由 AgentView 内部按需使用

## 4. 状态入口

### tab-atoms.ts

| Atom | 类型 | 说明 |
|------|------|------|
| `tabsAtom` | `TabItem[]` | 所有打开的标签页 |
| `activeTabIdAtom` | `string \| null` | 当前激活标签 ID |
| `tabMruAtom` | `string[]` | 最近使用顺序 |
| `sidebarCollapsedAtom` | `boolean` | 侧边栏收起状态（持久化） |
| `tabMinimapCacheAtom` | `Map<string, TabMinimapItem[]>` | 标签消息预览缓存 |
| `activeTabAtom` | `TabItem \| null` | 派生：当前活跃标签 |
| `tabStreamingMapAtom` | `Map<string, boolean>` | 派生：流式状态映射 |
| `tabIndicatorMapAtom` | `Map<string, SessionIndicatorStatus>` | 派生：标签指示点 |

### sidebar-atoms.ts

| Atom | 类型 | 说明 |
|------|------|------|
| `sidebarViewModeAtom` | `'active' \| 'archived'` | 侧边栏视图模式 |
| `workspaceListHeightAtom` | `number` | 工作区列表高度（持久化） |
| `agentSidebarTopHeightAtom` | `number` | Agent 上区高度（持久化，-1 表示未初始化） |

### search-atoms.ts

| Atom | 类型 | 说明 |
|------|------|------|
| `searchDialogOpenAtom` | `boolean` | 搜索弹窗开关 |

### active-view.ts

| Atom | 类型 | 说明 |
|------|------|------|
| `activeViewAtom` | `'conversations'` | 当前视图（仅一个值，预留扩展） |

### settings-tab.ts

| Atom | 类型 | 说明 |
|------|------|------|
| `settingsTabAtom` | `SettingsTab` | 设置面板当前 tab |
| `settingsOpenAtom` | `boolean` | 设置浮窗开关 |
| `channelFormDirtyAtom` | `boolean` | 渠道表单未保存标记 |
| `settingsCloseRequestedAtom` | `boolean` | 外部请求关闭设置 |

### chat-atoms.ts（AppShell 相关部分）

| Atom | 类型 | 说明 |
|------|------|------|
| `conversationsAtom` | `ConversationMeta[]` | 对话列表 |
| `currentConversationIdAtom` | `string \| null` | 当前对话 ID |
| `streamingConversationIdsAtom` | `Set<string>` | 派生：流式对话 ID 集合 |
| `conversationDraftsAtom` | `Map<string, string>` | 对话输入框草稿 |

### agent-atoms.ts（AppShell 相关部分）

| Atom | 类型 | 说明 |
|------|------|------|
| `agentSessionsAtom` | `AgentSessionMeta[]` | Agent 会话列表 |
| `currentAgentSessionIdAtom` | `string \| null` | 当前会话 ID |
| `agentSidePanelOpenMapAtom` | `Map<string, boolean>` | per-session 侧面板开关 |
| `currentSessionSidePanelOpenAtom` | `boolean` | 派生：当前会话侧面板状态 |
| `agentSessionPathMapAtom` | `Map<string, string>` | per-session 工作路径 |
| `agentSessionChannelMapAtom` | `Map<string, string>` | per-session 渠道 |
| `agentSessionModelMapAtom` | `Map<string, string>` | per-session 模型 |
| `agentSessionIndicatorMapAtom` | `Map<string, SessionIndicatorStatus>` | 会话指示点状态 |
| `unviewedCompletedSessionIdsAtom` | `Set<string>` | 未查看完成会话 |
| `workingDoneSessionIdsAtom` | `Set<string>` | 本次会话完成集合 |
| `backgroundTasksAtomFamily` | atomFamily | per-session 后台任务列表 |
| `workspaceCapabilitiesVersionAtom` | `number` | 工作区能力版本号 |

### app-mode.ts

| Atom | 类型 | 说明 |
|------|------|------|
| `appModeAtom` | `'chat' \| 'agent'` | 应用模式（持久化） |

### working-atoms.ts

| Atom | 说明 |
|------|------|
| `workingSessionGroupsAtom` | 派生：按 todo/running/done 分组的会话 |
| `workingSessionIdsSetAtom` | 派生：所有 working 中的会话 ID 集合 |

### draft-session-atoms.ts

| Atom | 说明 |
|------|------|
| `draftSessionIdsAtom` | 新建但未发送消息的 session ID 集合 |

### 数据流概览

```
LeftSidebar ──→ conversationsAtom / agentSessionsAtom ←── IPC(list/delete/create)
TabBar ──────→ tabsAtom / activeTabIdAtom
         └──→ currentConversationIdAtom / currentAgentSessionIdAtom (handleActivate)
SidePanel ──→ agentSidePanelOpenMapAtom / agentSessionPathMapAtom
          └──→ workspaceFilesVersionAtom (refresh trigger)
SearchDialog → searchDialogOpenAtom / conversationsAtom / agentSessionsAtom
GlobalShortcuts → shortcut-atoms / tab-atoms / agent-atoms / chat-atoms / settings-tab / search-atoms
```

## 5. 关键决策

1. **AppShell 不做逻辑，只做布局**。理由：多标签页系统引入后，每个 tab 需要自己管理 session 状态，AppShell 不再适合做全局会话持有者。证据：`src/components/app-shell/AppShell.tsx:24-56`（~30 行纯布局）。

2. **全局快捷键从 AppShell/hook 抽取为 GlobalShortcuts 组件**，直接在 main.tsx 挂载。理由：组件挂载/卸载生命周期天然管理注册/注销，避免 hook 位置不当导致漏注册。证据：`src/components/shortcuts/GlobalShortcuts.tsx:56-424`。

3. **快捷键使用注册表模式**（shortcut-registry lib），支持用户自定义覆盖。证据：`src/components/shortcuts/GlobalShortcuts.tsx:77-86`。

4. **Tab 使用纯函数操作 + atoms**，不经过 React state。`openTab`/`closeTab` 返回新 `{tabs, activeTabId}` 而非副作用。证据：`src/atoms/tab-atoms.ts:118-165`。

5. **Tab 切换时同步 appMode 和 currentXxxId**，确保非 tab 组件（侧边栏、右侧面板）正确响应。证据：`src/components/tabs/TabBar.tsx:62-91`。

6. **Agent tab 关闭前先 stopAgent**（IPC 终止子进程），修复子进程残留。证据：`src/hooks/useCloseTab.tsx:76-106`。

7. **搜索双层架构**：标题即时匹配（客户端过滤）+ 消息内容搜索（debounced IPC，含高亮）。理由：标题搜索低延迟，内容搜索需要后端支持。证据：`src/components/app-shell/SearchDialog.tsx:174-246`。

8. **右侧面板由 per-session 原子控制**（`agentSidePanelOpenMapAtom`），每个会话独立记忆面板开关状态。证据：`src/components/agent/SidePanel.tsx:57-64`。

9. **Agent 侧边栏双区布局**（Working/置顶上区 + 最近会话下区），上区高度可拖拽调整并持久化。证据：`src/components/app-shell/LeftSidebar.tsx:1013-1193`。

10. **会话归档/删除时同步清理标签页和 Map atoms**，避免残留状态。证据：`src/components/app-shell/LeftSidebar.tsx:530-603`（删除流程含 closeTab + cleanupMapAtoms + syncActiveTabSideEffects）。

11. **模式切换时自动恢复上次会话**，通过 `useOpenSession` hook 统一处理 fallback 链（上次选中→同类型 Tab→最近未归档→仅切换模式）。证据：`src/components/app-shell/ModeSwitcher.tsx:36-63`。

12. **BackgroundTasksPanel 不是 AppShell 的直接子组件**，而是嵌入在 Agent 消息的工具执行区域中。理由：后台任务与特定会话绑定，不适合全局渲染。证据：`src/components/agent/BackgroundTasksPanel.tsx`。

## 6. 代码锚点

| 想看什么 | 从哪看 |
|----------|--------|
| 外壳总装配 | `src/components/app-shell/AppShell.tsx:24-56` |
| 左侧栏完整实现 | `src/components/app-shell/LeftSidebar.tsx:158-1356` |
| 模式切换器 | `src/components/app-shell/ModeSwitcher.tsx:26-98` |
| 左侧栏折叠视图 | `src/components/app-shell/LeftSidebar.tsx:844-911` |
| 左侧栏展开视图（Chat 列表） | `src/components/app-shell/LeftSidebar.tsx:968-1010` |
| 左侧栏展开视图（Agent 双区） | `src/components/app-shell/LeftSidebar.tsx:1013-1193` |
| Agent 上区拖拽分割条 | `src/components/app-shell/LeftSidebar.tsx:243-276` |
| 对话列表项 | `src/components/app-shell/LeftSidebar.tsx:1360-1549` |
| Agent 会话列表项 | `src/components/app-shell/LeftSidebar.tsx:1584-1803` |
| 创建/删除/归档/置顶操作 | `src/components/app-shell/LeftSidebar.tsx:434-754` |
| 主区多标签 | `src/components/tabs/MainArea.tsx:16-53` |
| 标签栏实现 | `src/components/tabs/TabBar.tsx:37-259` |
| 标签内容路由 | `src/components/tabs/TabContent.tsx:19-49` |
| Tab 原子操作 | `src/atoms/tab-atoms.ts:118-189` |
| 统一关闭标签（含 stopAgent） | `src/hooks/useCloseTab.tsx:45-119` |
| 统一打开会话 | `src/hooks/useOpenSession.ts:23-65` |
| 同步标签副作用 | `src/hooks/useSyncActiveTabSideEffects.ts:27-82` |
| 全局快捷键 | `src/components/shortcuts/GlobalShortcuts.tsx:56-424` |
| 快捷键 hook | `src/hooks/useShortcut.ts:18-27` |
| 搜索弹窗（标题 + 内容） | `src/components/app-shell/SearchDialog.tsx:104-483` |
| 搜索高亮组件 | `src/components/app-shell/SearchDialog.tsx:52-102` |
| 右侧面板薄壳 | `src/components/app-shell/RightSidePanel.tsx:14-29` |
| 文件面板（SidePanel） | `src/components/agent/SidePanel.tsx:39-492` |
| 附加目录树 | `src/components/agent/SidePanel.tsx:504-867` |
| 后台任务面板 | `src/components/agent/BackgroundTasksPanel.tsx:23-85` |
| 后台任务 hook | `src/hooks/useBackgroundTasks.ts:40-122` |
| 侧边栏原子 | `src/atoms/sidebar-atoms.ts` |
| 搜索原子 | `src/atoms/search-atoms.ts` |
| 设置原子 | `src/atoms/settings-tab.ts` |
| 视图原子 | `src/atoms/active-view.ts` |
| 模式原子 | `src/atoms/app-mode.ts` |

## 7. 已知约束

- `SearchDialog` 只搜索会话标题和消息正文 snippet（IPC 返回匹配片段），不支持按会话 ID、工作区过滤或全文检索。证据：`src/components/app-shell/SearchDialog.tsx:174-246`。

- `SidePanel` 当前依赖 `workspaceSlug` 才能展示工作区文件；无工作区时仅显示「请选择工作区」占位。证据：`src/components/agent/SidePanel.tsx:275-488`。

- 右侧面板展开/收起动画仅在同一会话的开关切换时触发（通过 `prevSessionIdRef` 判断），切换会话时即时显示/隐藏。证据：`src/components/agent/SidePanel.tsx:48-55`。

- `SidePanel` 的侧面板关闭后仅显示一个切换按钮（当前在 `LeftSidebar` 底部），没有独立的侧面板切换入口（如 Pro 左上角的悬浮按钮），当关闭侧面板后需要回到 `LeftSidebar` 再操作。

- Agent 模式侧边栏支持拖拽调整上区高度，但只保存绝对像素值到 localStorage，不会在窗口大小变化时自动适配。证据：`src/components/app-shell/LeftSidebar.tsx:243-276` 和 `src/atoms/sidebar-atoms.ts:28-31`。

- 标签页关闭确认仅针对流式中的 Agent tab；Chat tab 关闭不弹确认框（流式内容通过自动保存恢复）。证据：`src/hooks/useCloseTab.tsx:108-116`。

- `GlobalShortcuts` 的快读任务创建（`onQuickTaskOpenSession`）通过 `store.set` 直接操作所有相关原子，而非通过 `openTab`/`useOpenSession` 等封装，存在重复的 tab 创建逻辑。证据：`src/components/shortcuts/GlobalShortcuts.tsx:196-307`。

- `LeftSidebar` 的内联 `ConversationItem` 和 `AgentSessionItem` 组件（各约 200 行）与 TabBarItem 共享部分语义但独立实现，没有统一的「会话列表项」组件。

## 8. 相关文档

- [ARCHITECTURE](./ARCHITECTURE.md)
- [frontend-chat-ui](./frontend-chat-ui.md)
- [frontend-settings-ui](./frontend-settings-ui.md)
- [frontend-state-atoms](/E:/Coding/AI/j-gui/docs/api/frontend-state-atoms.md)
