---
doc_type: architecture
slug: frontend-agent-ui
scope: j-gui 前端 Agent 视图——AgentView、消息时间线（SDKMessageRenderer）、审批横幅（Permission/AskUser/ExitPlan）、任务进度与工具调用展示
summary: AgentView 按 session 管理 Agent 会话的生命周期，通过 ipc 模块与 Tauri 后端通信；消息渲染基于 SDKMessage 格式，经 groupIntoTurns 分组后由 SDKMessageRenderer/AssistantTurnRenderer 展示；三个独立横幅系统处理权限/提问/计划审批
status: current
last_reviewed: 2026-05-10
tags: [frontend, agent, timeline, interrupt, workspace, session, sdk-message]
depends_on: [frontend-state-atoms]
implements: [j-gui-ai-interaction, j-gui-session-management]
---

# Agent UI — 前端 Agent 视图

## 1. 定位与受众

`frontend-agent-ui` 描述 j-gui Agent 模式前端视图的完整架构。它覆盖：

- `AgentView` 主编排（session 生命周期、消息发送/停止/重试/分叉/回退、附件管理、模型/权限选择）
- `AgentMessages` + `SDKMessageRenderer` 消息时间线（Turn 分组、ContentBlock 渲染、任务进度聚合）
- `PermissionBanner` / `AskUserBanner` / `ExitPlanModeBanner` 三个独立审批横幅系统
- `ContextUsageBadge` 上下文用量指示器
- `TaskProgressCard` 任务进度卡片
- `BackgroundTasksPanel` 后台任务面板

受众：

- feature-design：理解 Agent 模式前端状态、事件链、审批交互
- issue-analyze：定位 Agent 无回应、审批卡住、流式闪烁、会话恢复问题
- 新人上手：理解 Agent 页面如何与后端通过 ipc 通信，以及消息如何从 AgentEvent 流式状态渲染为界面

## 2. 结构与交互

### 2.1 组件树

当前主树在 `src/components/agent/AgentView.tsx:1316-1591`：

```text
AgentView (sessionId prop)
  ├─ AgentSessionProvider (sessionId → context)
  ├─ AgentHeader (title edit, file panel toggle)
  ├─ AgentMessages
  │   ├─ Conversation (scroll management)
  │   │   ├─ MessageGroupRenderer (by group type)
  │   │   │   ├─ UserInputMessage
  │   │   │   ├─ AssistantTurnRenderer
  │   │   │   │   ├─ MessageHeader (model icon + name + time)
  │   │   │   │   ├─ ContentBlock (text/tool_use/tool_result/thinking)
  │   │   │   │   │   ├─ TaskProgressCard (aggregated)
  │   │   │   │   │   ├─ ToolActivity rows
  │   │   │   │   │   └─ Child blocks (sub-agent nesting)
  │   │   │   │   ├─ MessageActions (duration, copy, fork, rewind, stop badge)
  │   │   │   │   └─ ErrorMessage (structured recovery actions)
  │   │   │   ├─ CompactBoundaryDivider
  │   │   │   └─ CompactingIndicator
  │   │   ├─ ScrollMinimap
  │   │   └─ ConversationScrollButton
  │   ├─ AgentRunningIndicator
  │   └─ RetryingNotice (collapsible retry history)
  ├─ PermissionBanner
  ├─ AskUserBanner
  ├─ ExitPlanModeBanner (with PlanModeDashedBorder indicator)
  ├─ (plan mode indicator bar)
  └─ Chat input area
      ├─ ModelSelector
      ├─ PermissionModeSelector
      ├─ AgentThinkingPopover
      ├─ SpeechButton
      ├─ AttachmentPreviewItem*
      ├─ RichTextInput (TipTap editor)
      ├─ ContextUsageBadge
      └─ Send/Stop button
```

### 2.2 发送链路

`handleSend()` 在 `src/components/agent/AgentView.tsx:815-1028`，分两种场景：

**场景 A：非流式状态下的首次/新发送**

1. 清除当前 session 的错误和提示建议
2. 如有 pending 文件：先通过 `ipc.saveFilesToAgentSession()` 保存到 workspace session 目录，构造 `<attached_files>` 引用块
3. 清除打断状态（`stoppedByUserSessionsAtom`）和 draft 标记
4. 初始化流式状态：`setStreamingStates()` 写入 `{ running: true, content: '', toolActivities: [], ... }`
5. 乐观更新：将用户消息以 SDKMessage 格式追加到 `persistedSDKMessages`
6. 调用 `ipc.sendAgentMessage(input)` 传递 `sessionId`, `userMessage`, `channelId`, `modelId`, `workspaceId`, `startedAt`, `permissionModeOverride`, `additionalDirectories`, `mentionedSkills`, `mentionedMcpServers`
7. 失败时回滚 streaming state

**场景 B：流式进行中的追加发送**

1. 生成 `localUuid`，立即注入 `liveMessagesMapAtom` 显示为合成用户消息
2. 清空输入框
3. 调用 `ipc.queueAgentMessage({ sessionId, userMessage, uuid, interrupt: true })` 软中断当前 turn 并追加
4. 失败时从 `liveMessagesMapAtom` 回滚

**场景 C：自动发送（从设置页"对话完成配置"触发）**

1. 监听 `agentPendingPromptAtom`，等待 `messagesLoaded` 为 true
2. 通过 `queueMicrotask` 延迟发送，避免竞态
3. 链路同场景 A

### 2.3 流式状态与事件消费

流式状态由 `agentStreamingStatesAtom`（`Map<sessionId, AgentStreamState>`）管理，全局监听器在 IPC 回调中调用 `applyAgentEvent()` 纯函数更新。

`applyAgentEvent()` 在 `src/atoms/agent-atoms.ts:534-843`，处理的事件类型：

| 事件类型 | 作用 |
|----------|------|
| `text_delta` | 追加流式文本，清除重试状态 |
| `text_complete` | 完整文本替换（回放场景） |
| `tool_start` | 新增/更新 ToolActivity（input, intent, displayName） |
| `tool_result` | 标记工具完成（result, isError, imageAttachments） |
| `task_backgrounded` | 标记 Task 为后台运行 |
| `task_progress` | 更新工具/teammate 的 elapsedSeconds 和进度描述 |
| `task_started` | 创建 TeammateState（Agent Teams） |
| `shell_backgrounded` | 标记 Shell 为后台运行 |
| `task_notification` | teammate 完成/失败/停止 |
| `usage_update` | 更新 token 用量和上下文窗口 |
| `compacting` / `compact_complete` | 上下文压缩开始/结束 |
| `retrying` / `retry_attempt` / `retry_cleared` / `retry_failed` | 重试生命周期 |
| `complete` | 标记工具/teammates 终态（兜底清理） |
| `typed_error` / `error` | 停止运行 |
| `permission_request` / `ask_user_request` | 由横幅系统处理，不影响流式状态 |

注意：`permission_request`、`ask_user_request` 等事件不修改 `AgentStreamState`，由独立的横幅系统 atoms 管理。

流式完成后的清理流程：
1. 后端触发 STREAM_COMPLETE IPC
2. 全局监听器递增 `agentMessageRefreshAtom` 版本号
3. `AgentView` 的 `useEffect` 监听版本号，调用 `ipc.getAgentSessionSDKMessages(sessionId)` 加载持久化消息
4. 加载完成后，清除 `liveMessagesMapAtom`，保留 usage 数据

### 2.4 审批链路

系统包含三个独立的审批横幅，共享相似的架构模式：

**通用模式**：
- 请求数据存储在 `Map<sessionId, readonly Request[]>` 原子中
- 双方操作（handleDismiss）：标记 streaming 停止、清除请求队列、调用 `ipc.stopAgent()`
- FIFO 队列展示（`requests[0]`）

**PermissionBanner**（`src/components/agent/PermissionBanner.tsx`）：

- 数据源：`allPendingPermissionRequestsAtom`
- 展示工具名、命令内容、危险等级（safe/normal/dangerous）、SDK 标题/描述
- 操作：allow / deny / always-allow
- 键盘：Enter 快捷允许（仅在非输入框焦点时）
- 支持队列计数（`(+N)`）

**AskUserBanner**（`src/components/agent/AskUserBanner.tsx`）：

- 数据源：`allPendingAskUserRequestsAtom`
- 支持多问题 Tab 切换、单选/多选、自定义文本输入
- 键盘：↑↓ 选择选项，Enter 确认/翻页
- 选项可关联 `preview`（Markdown 内容）
- 单选项自动跳转下一题（150ms 延迟）

**ExitPlanModeBanner**（`src/components/agent/ExitPlanModeBanner.tsx`）：

- 数据源：`allPendingExitPlanRequestsAtom`
- 四个选项：approve_auto / approve_edit / deny / feedback
- 键盘：↑↓ 选择，Enter 确认，1-4 快速选择
- feedback 模式弹出输入框
- 展示 `allowedPrompts` 列表

### 2.5 页面级辅助交互

- `Ctrl/Cmd + Enter` 发送由 `sendWithCmdEnterAtom` 控制，RichTextInput 内部处理
- 快捷键 `jgui:stop-generation` DOM 事件全局分发，AgentView 监听后调 `handleStop()`
- 快捷键 `jgui:focus-input` 聚焦输入框（`Cmd+L`）
- 输入框附件支持：文件对话框、粘贴图片、拖放文件/文件夹、文件夹附加
- 思考模式切换通过 `AgentThinkingPopover`（Brain 图标）控制 `agentThinkingAtom`，写入 `ipc.updateSettings()`
- 模型选择：per-session map + 全局默认值，写入 ipc settings

## 3. 子模块

### `AgentView`

位置：`src/components/agent/AgentView.tsx`

职责：
- 按 sessionId 管理 Agent 会话生命周期
- 消息发送/停止/重试/分叉/回退/压缩
- 附件管理（上传、粘贴、拖放、文件夹附加）
- 模型/渠道/权限模式选择
- 错误显示与复制
- 回退确认弹窗（AlertDialog）

### `AgentMessages`

位置：`src/components/agent/AgentMessages.tsx`

职责：
- 合并持久化消息（`persistedSDKMessages`）和实时消息（`liveMessages`）
- 通过 `groupIntoTurns()` 分组为 MessageGroup[]
- 遍历 groups 调用 `MessageGroupRenderer` 渲染
- 流式文本通过 `useSmoothStream` 平滑展示
- 渲染 `AgentRunningIndicator`（计时器）、`RetryingNotice`（重试折叠面板）
- 压缩流程中抑制运行指示器（`suppressAgentRunning`）
- 迷你地图、StickyUserMessage

### `SDKMessageRenderer` / `AssistantTurnRenderer`

位置：`src/components/agent/SDKMessageRenderer.tsx`

职责：
- `groupIntoTurns()`：将扁平 SDKMessage[] 按 turn 分组（用户输入中断、同模型相邻合并）
- `MessageGroupRenderer`：按 group type 分发到 `UserInputMessage` / `AssistantTurnRenderer` / `CompactBoundaryDivider`
- `AssistantTurnRenderer`：渲染完整 assistant turn（header + content blocks + actions）
- 错误消息渲染（`ErrorMessage`）含结构化 recovery actions
- 附件解析（`<attached_files>` 块）、图片缩略图/文件芯片

### `PermissionBanner`

位置：`src/components/agent/PermissionBanner.tsx`

职责：
- 展示当前待审批的工具调用
- 显示工具名、命令内容、SDK 标题/描述、危险等级
- 提供 allow / deny / always-allow 操作
- Enter 键快捷允许

### `AskUserBanner`

位置：`src/components/agent/AskUserBanner.tsx`

职责：
- 展示需要用户回答的多选题
- 支持多问题 Tab 切换
- 单选/多选 + 自定义文本输入
- 键盘导航选择
- 选项 preview Markdown 展示

### `ExitPlanModeBanner`

位置：`src/components/agent/ExitPlanModeBanner.tsx`

职责：
- 展示 Agent 计划审批界面
- 四个预定义选项 + 反馈输入
- 键盘导航（箭头 + 数字快捷键）
- allowedPrompts 权限列表展示

### `TaskProgressCard`

位置：`src/components/agent/TaskProgressCard.tsx`

职责：
- 从 ToolActivity[] 中聚合 TaskCreate / TaskUpdate / TodoWrite 活动
- 显示进度条、任务列表、完成计数
- 可折叠（超过 MAX_VISIBLE=8 项）
- 流式结束后降级 in_progress 为 pending

### `ContextUsageBadge`

位置：`src/components/agent/ContextUsageBadge.tsx`

职责：
- 36x36 圆形按钮，SVG 圆环显示上下文占用比例
- hover/popover 展示 token 明细（输入/输出/缓存/上下文）
- 手动压缩按钮（接近阈值时变琥珀色高亮）
- 压缩中显示 Loader2 spinner
- stableRef 保留上次有效值，避免切换 session 时闪烁消失

### `BackgroundTasksPanel`

位置：`src/components/agent/BackgroundTasksPanel.tsx`

职责：
- 表格展示运行中的后台任务（shell / agent）
- 显示序号、任务描述、运行状态
- 无任务时不渲染

### `AgentHeader`

位置：`src/components/agent/AgentHeader.tsx`

职责：
- 显示会话标题（可点击编辑）
- Session title 编辑模式（Enter 保存 / Escape 取消）
- 文件面板切换按钮（面板关闭时显示，有文件变化时脉冲指示）

## 4. 状态与数据

### 核心 Atoms

所有 Agent 模式 Jotai atom 定义在 `src/atoms/agent-atoms.ts`。

**会话管理：**
- `agentSessionsAtom` —— `AgentSessionMeta[]`
- `currentAgentSessionIdAtom` —— 当前激活的 session ID
- `agentSessionChannelMapAtom` / `agentSessionModelMapAtom` —— per-session 渠道/模型 Map
- `agentSessionDraftsAtom` / `agentSessionDraftHtmlAtom` —— per-session 输入框草稿
- `agentSessionPathMapAtom` —— per-session 工作路径
- `agentAttachedDirectoriesMapAtom` / `workspaceAttachedDirectoriesMapAtom` —— 附加目录

**流式状态：**
- `agentStreamingStatesAtom` —— `Map<sessionId, AgentStreamState>`
  - `AgentStreamState` 包含：`running`, `content`, `toolActivities`, `teammates`, `model`, `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheCreationTokens`, `contextWindow`, `isCompacting`, `compactInFlight`, `startedAt`, `retrying`, `waitingResume`
- `liveMessagesMapAtom` —— `Map<sessionId, SDKMessage[]>`（流式期间实时累积）
- `agentMessageRefreshAtom` —— `Map<sessionId, number>`（版本号，触发消息重新加载）
- `agentStreamErrorsAtom` —— `Map<sessionId, string>`

**审批请求：**
- `allPendingPermissionRequestsAtom` —— `Map<sessionId, readonly PermissionRequest[]>`
- `allPendingAskUserRequestsAtom` —— `Map<sessionId, readonly AskUserRequest[]>`
- `allPendingExitPlanRequestsAtom` —— `Map<sessionId, readonly ExitPlanModeRequest[]>`

**配置：**
- `agentChannelIdAtom` / `agentModelIdAtom` —— 全局默认渠道/模型
- `agentChannelIdsAtom` —— Agent 启用渠道白名单
- `agentPermissionModeMapAtom` —— per-session 权限模式 Map
- `agentDefaultPermissionModeAtom` —— 默认权限模式
- `agentThinkingAtom` —— 思考模式配置
- `agentPlanModeSessionsAtom` —— 处于 Plan 模式的 session 集合
- `agentEffortAtom` / `agentMaxBudgetUsdAtom` / `agentMaxTurnsAtom`

**UI 状态：**
- `agentSidePanelOpenMapAtom` —— per-session 文件面板开关
- `agentPendingFilesAtom` —— 待发送文件列表
- `agentPendingPromptAtom` —— 待自动发送提示（从设置页触发）
- `agentPromptSuggestionsAtom` —— per-session 提示建议
- `agentRunningSessionIdsAtom` —— 所有 running 状态的 session ID
- `agentSessionIndicatorMapAtom` —— per-session 侧边栏指示点状态（idle/running/blocked/completed）
- `dockBadgeCountAtom` —— Dock 角标数量
- `stoppedByUserSessionsAtom` —— 被用户打断的 session 集合
- `unviewedCompletedSessionIdsAtom` / `workingDoneSessionIdsAtom`

### 流式状态机

AgentStreamState 由 `applyAgentEvent()` 纯函数驱动（`src/atoms/agent-atoms.ts:534-843`）：

```
初始状态: { running: false, content: '', toolActivities: [], teammates: [] }

发送消息 → { running: true, content: '', toolActivities: [], startedAt: now, ... }
  text_delta → content += text
  tool_start → toolActivities.push({ toolUseId, toolName, input, done: false })
  tool_result → toolActivities[i].done = true, result = ...
  task_started → teammates.push({ taskId, ... })
  task_progress → teammates[i].progressDescription = ...
  usage_update → inputTokens/outputTokens/... updated
  complete → finalizeActivities (teammates run→stopped, tools done)
  error/typed_error → running: false
  retrying → retrying state set
  retry_failed → running: false, retrying.failed = true
  compacting → isCompacting: true
  compact_complete → isCompacting: false
IP流结束 → 从 IPC 收到 STREAM_COMPLETE → 清除 state (保留 usage)
```

### 数据流摘要

```
用户输入 → AgentView.handleSend()
  → ipc.sendAgentMessage()  [Tauri 命令]
  → 后端启动 Claude CLI 子进程
  → AgentEvent → applyAgentEvent() → agentStreamingStatesAtom
  → React 重渲染 AgentMessages / ToolActivity

审批：
  AgentEvent.permission_request → allPendingPermissionRequestsAtom
  → PermissionBanner 展示
  用户操作 → ipc.respondPermission()
  → 后端处理 → AgentEvent.permission_resolved

消息持久化：
  流式完成 → STREAM_COMPLETE IPC → 递增 refresh 版本号
  → AgentView useEffect → ipc.getAgentSessionSDKMessages()
  → setPersistedSDKMessages → 清空 liveMessagesMapAtom
```

### 按 session 隔离机制

所有动态状态均通过 `Map<sessionId, T>` 原子实现 per-session 隔离：

- `agentStreamingStatesAtom` 流式状态
- `liveMessagesMapAtom` 实时消息
- `allPendingPermissionRequestsAtom` 权限请求
- `allPendingAskUserRequestsAtom` AskUser 请求
- `allPendingExitPlanRequestsAtom` 计划审批
- `agentSessionChannelMapAtom` / `agentSessionModelMapAtom` 渠道模型
- `agentSessionDraftsAtom` / `agentSessionDraftHtmlAtom` 输入框草稿
- `agentAttachedDirectoriesMapAtom` 附加目录
- `agentSidePanelOpenMapAtom` 文件面板开关
- `agentSessionPathMapAtom` 工作路径
- `agentMessageRefreshAtom` 消息版本号

切换 session 时这些数据保留，`AgentView` 通过 `sessionId` prop 从 Map 中读取对应数据。

### 消息渲染约定

流式事件映射为 SDKMessage 后，通过 `groupIntoTurns()` 分组：

- `user` 消息 → 单独的 user group（实际用户输入）或归入当前 turn（tool_result）
- `assistant` 消息 → 归入 assistant-turn，多消息合并
- `system(compact_boundary)` → 独立渲染为分隔线
- `result` → 归入当前 turn，提取 durationMs 和 usage

合并规则：
- 相邻同模型 assistant-turn 自动合并（`mergeAdjacentSameModelTurns`）
- 真正用户输入（非 tool_result、非 synthetic）中断 turn

ToolActivity 聚合：
- `TaskCreate` / `TaskUpdate` / `TodoWrite` 聚合为 `TaskProgressCard`
- 子代理（Agent/Task 工具）的嵌套内容块通过 `childBlocksMap` 组织

## 5. 关键决策

- **Session 化架构取代单例引擎**：AgentView 不再内部管理引擎生命周期，改为以 `sessionId` prop 驱动，通过 per-session atoms 和 ipc 调用与后端通信。证据：`src/components/agent/AgentView.tsx:204` 接收 `sessionId` prop，`:50-80` 从 atoms 读取数据。
- **消息渲染 SDKMessage 格式**：统一使用 `@proma/shared` 的 SDKMessage 类型，不再维护自定义消息格式。持久化消息从 JSONL 加载，实时消息流式累积。证据：`src/components/agent/AgentMessages.tsx:48-53` props 含 `persistedSDKMessages` 和 `liveMessages`。
- **消息 Turn 分组渲染**：扁平 SDKMessage[] 经 `groupIntoTurns()` 分组为 MessageGroup[]，同模型相邻 assistant 消息合并。证据：`src/components/agent/SDKMessageRenderer.tsx:215-283`。
- **审批系统三横幅架构**：PermissionBanner / AskUserBanner / ExitPlanModeBanner 各司其职，共享 FIFO 队列 + dismissable 设计模式。证据：`src/components/agent/AgentView.tsx:1344-1359` 三个横幅独立渲染。
- **流式状态纯函数更新**：`applyAgentEvent()` 是纯函数，接收旧 state + 事件，返回新 state，无副作用。证据：`src/atoms/agent-atoms.ts:534-843`。
- **审批请求不阻塞流式状态**：`permission_request` 等事件不修改 `AgentStreamState`，而是写入独立原子，横幅组件独立订阅。证据：`src/atoms/agent-atoms.ts:820-827`。
- **附件文件名去重**：粘贴多张同文件名图片时自动添加 `-1`、`-2` 后缀。证据：`src/components/agent/AgentView.tsx:585-595`。
- **流式追加发送通过软中断实现**：流式进行中再次发送时调用 `ipc.queueAgentMessage()` 带 `interrupt: true` 参数。证据：`src/components/agent/AgentView.tsx:862-879`。
- **压缩流程用 compactInFlight 抑制闪烁**：从点击压缩到 stream 结束期间 `compactInFlight=true`，抑制 AgentRunningIndicator 显示。证据：`src/atoms/agent-atoms.ts:134`、`src/components/agent/AgentMessages.tsx:448`。
- **拖放文件/文件夹混合处理**：通过 `ipc.checkPathsType` 检测拖放路径类型，文件夹直接附加，普通文件作为附件。证据：`src/components/agent/AgentView.tsx:714-772`。

## 6. 代码锚点

| 想看什么 | 从哪看 |
|----------|--------|
| Agent 主编排 | `src/components/agent/AgentView.tsx:204-1591` |
| 发送链路（首次 + 追加 + 自动） | `src/components/agent/AgentView.tsx:815-1028` |
| 停止生成 | `src/components/agent/AgentView.tsx:1031-1045` |
| 压缩上下文 | `src/components/agent/AgentView.tsx:1048-1114` |
| 重试 & 分叉 & 回退 | `src/components/agent/AgentView.tsx:1130-1286` |
| 附件处理（文件对话框/粘贴/拖放/文件夹） | `src/components/agent/AgentView.tsx:596-772` |
| 模型/渠道选择 | `src/components/agent/AgentView.tsx:775-806` |
| 流式状态纯函数 | `src/atoms/agent-atoms.ts:534-843` |
| AgentStreamState 定义 | `src/atoms/agent-atoms.ts:110-152` |
| ToolActivity 定义 | `src/atoms/agent-atoms.ts:17-33` |
| TeammateState 定义 | `src/atoms/agent-atoms.ts:45-78` |
| 消息分组逻辑 | `src/components/agent/SDKMessageRenderer.tsx:215-328` |
| AssistantTurnRenderer | `src/components/agent/SDKMessageRenderer.tsx:355-613` |
| 错误消息渲染（结构化 recovery） | `src/components/agent/SDKMessageRenderer.tsx:863-1018` |
| AgentMessages 主编排 | `src/components/agent/AgentMessages.tsx:348-598` |
| PermissionBanner | `src/components/agent/PermissionBanner.tsx:40-220` |
| AskUserBanner | `src/components/agent/AskUserBanner.tsx:38-337` |
| ExitPlanModeBanner | `src/components/agent/ExitPlanModeBanner.tsx:72-335` |
| TaskProgressCard 聚合 | `src/components/agent/TaskProgressCard.tsx:45-136` |
| ContextUsageBadge | `src/components/agent/ContextUsageBadge.tsx:113-274` |
| BackgroundTasksPanel | `src/components/agent/BackgroundTasksPanel.tsx:23-86` |
| AgentHeader | `src/components/agent/AgentHeader.tsx:21-154` |
| Plan mode 指示 | `src/components/agent/AgentView.tsx:1350-1356` |
| 回退确认弹窗 | `src/components/agent/AgentView.tsx:1567-1588` |
| 所有 Agent atoms 定义 | `src/atoms/agent-atoms.ts:1-993` |
| 全局 IPC 模块 | `src/lib/ipc.ts`（Tauri invoke 封装） |

## 7. 已知约束

- 权限模式切换只影响后续发送的消息（通过 `permissionModeOverride` 参数），当前已运行流式不受影响。证据：`src/components/agent/AgentView.tsx:285-287` 读取当前 `permissionMode`，`:995-1002` 传给 ipc。
- `TaskProgressCard` 只识别 `TaskCreate`、`TaskUpdate`、`TodoWrite` 三种工具名。证据：`src/components/agent/TaskProgressCard.tsx:26`。
- AskUserBanner 和 ExitPlanModeBanner 显示时隐藏输入区域（`hasBannerOverlay`）。证据：`src/components/agent/AgentView.tsx:1309-1311`、`:1362`。
- 三个横幅系统当前都是 FIFO 单队列（只显示 `requests[0]`），非多请求并行。证据：`src/components/agent/AskUserBanner.tsx:47`、`src/components/agent/ExitPlanModeBanner.tsx:81`。
- ContextUsageBadge 使用 `stableRef` 保留上次有效 token 值，切换 session 时不闪烁消失。证据：`src/components/agent/ContextUsageBadge.tsx:124-133`。
- 流式追加发送不支持附带附件（仅纯文本），如有 pending 文件会 toast 提示。证据：`src/components/agent/AgentView.tsx:824-829`。
- `getAgentSessionPath` 和 `getWorkspaceFilesPath` 是异步 IPC 调用，首次加载时有延迟。证据：`src/components/agent/AgentView.tsx:379-426`。
- 渠道已选但模型未选时自动选择第一个可用模型。证据：`src/components/agent/AgentView.tsx:355-376`。
- 模型选择同时更新 per-session map 和全局默认值，并持久化到 settings。证据：`src/components/agent/AgentView.tsx:775-806`。
- 快速任务窗口触发 auto-send 通过 `agentPendingPromptAtom` + `useEffect` 组合，等待 `messagesLoaded` 确保初始化完成。证据：`src/components/agent/AgentView.tsx:515-581`。

## 8. 相关文档

- [backend-agent-engine](./backend-agent-engine.md)
- [frontend-app-shell](./frontend-app-shell.md)
- [agent-commands](/E:/Coding/AI/j-gui/docs/api/agent-commands.md)
- [frontend-state-atoms](./frontend-state-atoms.md)
