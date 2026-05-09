---
doc_type: architecture
slug: frontend-agent-ui
scope: j-gui 前端 Agent 视图——AgentView、timeline 消息区、审批横幅、任务进度与工具调用展示
summary: AgentView 负责启动 Agent 会话、消费 AgentEvent、维护按 tab 隔离的 Agent 消息流，并编排权限审批和右侧文件面板入口
status: current
last_reviewed: 2026-05-09
tags: [frontend, agent, timeline, interrupt, workspace]
depends_on: []
implements: [j-gui-ai-interaction, j-gui-session-management]
---

# Agent UI — 前端 Agent 视图

## 1. 定位与受众

`frontend-agent-ui` 描述 j-gui 当前 Agent 模式前端视图。它覆盖：

- `AgentView` 主编排
- `AgentMessages` 时间线展示
- `PermissionBanner` 审批横幅
- `TaskProgressCard` 任务进度卡片
- `ToolCallDisplay` 工具调用展示

受众：

- feature-design：理解 Agent 模式前端状态和事件链
- issue-analyze：定位 Agent 无回应、审批、串流和恢复问题
- 新人上手：理解 Agent 页面如何和后端 `AgentEvent` 对接

## 2. 结构与交互

### 2.1 组件树

当前主树在 `src/components/agent/AgentView.tsx:365-419`：

```text
AgentView
  ├─ Header
  │   ├─ Agent 标题
  │   ├─ 当前 provider badge
  │   ├─ permission mode selector
  │   └─ right panel toggle
  ├─ AgentMessages
  │   ├─ TaskProgressCard?
  │   ├─ ToolCallDisplay*
  │   └─ MessageBubble*
  ├─ PermissionBanner?
  └─ ChatInput
```

### 2.2 发送链路

`handleSend()` 在 `src/components/agent/AgentView.tsx:265-360`，主流程是：

1. 取当前 `activeTab`
2. 如无 `currentSessionId`，先 `createAgentSession()`
3. 把新 sessionId 回写到 `currentSessionIdAtom` 和当前 tab
4. 如引擎未启动，调用 `startEngine(sessionId)`
5. 先把 user message 追加到 `agentMessagesAtom`
6. 推导标题并回写到 `agentSessionsListAtom` / `sessionTitleOverridesAtom`
7. 把当前 tab 的流式状态设为 `true`
8. 调用 `sendAgentMessage(content)`

### 2.3 `startEngine()` 与事件消费

`startEngine()` 在 `src/components/agent/AgentView.tsx:165-263`，它会：

- 为这次运行生成 `runId`
- 记录当前绑定的 `sessionId` 和 owner tab
- 创建 `Channel<AgentEvent>`
- 调用 `startAgent(onEvent, permissionMode, sessionId)`

`onEvent.onmessage` 按事件类型分派：

- `assistantContent`
- `toolUse`
- `interrupt`
- `toolResult`
- `done`
- `error`

实际写入目标是 `agentMessagesByTabAtom` 和 `agentStreamingByTabAtom`，因此当前 Agent 消息缓存是按 tab 隔离的。

### 2.4 审批链路

审批状态由本地 `interrupt` state 驱动 (`src/components/agent/AgentView.tsx:50-51`)。

收到 `interrupt` 事件时：

1. 先把一条 `toolCall.status = "running"` 的消息写进当前 tab 时间线 (`src/components/agent/AgentView.tsx:215-231`)
2. 再把本地 `interrupt` state 设为当前待审批项 (`src/components/agent/AgentView.tsx:232`)

用户操作 `PermissionBanner` 后，`handleInterruptDecision()` 会：

- 调 `respondAgentInterrupt(interruptId, allowed)` (`src/components/agent/AgentView.tsx:128-145`)
- 调 `updateInterruptMessage()` 把当前 tab 对应的 toolCall 更新为 `approved` / `denied` (`src/components/agent/AgentView.tsx:54-78`)
- 清空本地 `interrupt`

### 2.5 页面级辅助交互

- `Ctrl/Cmd + Enter` 不在 AgentView 自己处理，输入行为由复用的 `ChatInput` 负责。
- 右上角 `PanelRight` 按钮只切换 `rightPanelOpenAtom`，真正的 `RightSidePanel` 渲染发生在 `AppShell`。
- 权限模式切换只是改本地 `permissionMode` state，不会热更新已启动的后端引擎。

## 3. 子模块

### `AgentView`

位置：`src/components/agent/AgentView.tsx`

职责：

- 维护 Agent 模式本地运行状态
- 绑定当前 tab / session / runId
- 发起消息发送
- 消费 `AgentEvent`
- 控制审批横幅和右侧文件面板开关

### `AgentMessages`

位置：`src/components/agent/AgentMessages.tsx`

职责：

- 读取当前 `agentMessagesAtom`
- 空态时显示“输入消息启动 Agent 对话”
- 非空时先渲染 `TaskProgressCard`
- 按消息内容在 `ToolCallDisplay` 与 `MessageBubble` 之间切换

### `PermissionBanner`

位置：`src/components/agent/PermissionBanner.tsx`

职责：

- 展示当前需要审批的工具调用
- 预览 `toolInput`
- 提供允许 / 拒绝按钮和键盘提示

### `TaskProgressCard`

位置：`src/components/agent/TaskProgressCard.tsx`

职责：

- 从消息里抽取 `TaskCreate` / `TaskUpdate` / `TodoWrite`
- 计算任务完成数和百分比
- 渲染可折叠进度卡片

### `ToolCallDisplay`

位置：`src/components/agent/ToolCallDisplay.tsx`

职责：

- 渲染工具名称、状态、输入和输出
- 根据 `toolCall.status` 选择 spinner / check / error 图标

## 4. 状态与数据

### 主要 atoms

`AgentView` 直接读写这些 atom：

- `agentMessagesAtom`
- `agentMessagesByTabAtom`
- `agentStreamingAtom`
- `agentStreamingByTabAtom`
- `agentDraftsAtom`
- `currentSessionIdAtom`
- `agentSessionsListAtom`
- `sessionTitleOverridesAtom`
- `agentConfigAtom`
- `activeTabAtom`
- `tabsAtom`
- `rightPanelOpenAtom`

其中：

- `agentMessagesAtom` / `agentStreamingAtom` 是“当前 active tab 视图”
- `agentMessagesByTabAtom` / `agentStreamingByTabAtom` 是真正的按 tab 存储

### 本地 state / ref

`AgentView` 还有一组不落入 atoms 的运行态：

- `agentStarted`
- `permissionMode`
- `interrupt`
- `respondingInterruptId`
- `streamingRef`
- `engineStartedRef`
- `engineRunIdRef`
- `boundSessionIdRef`
- `ownerTabIdRef`
- `activeTabIdRef`

这些状态用来隔离“当前运行中的后端引擎”和“当前 UI tab 上下文”。

### Message 渲染约定

实时事件映射为消息时：

- `assistantContent` 会尽量合并到最后一条 `assistant + isStreaming` 消息
- `toolUse` 会变成一条 `toolCall.status = running` 的消息
- `interrupt` 也会先变成一条 `toolCall.status = running` 的消息
- `toolResult` 会回填到匹配的 `toolId`
- `done` 会把仍在 `running` 的 toolCall 标成 `done`，并把流式 assistant 消息收尾

## 5. 关键决策

- Agent 输入区直接复用 `ChatInput`，而不是维护一套单独输入组件。证据：`src/components/agent/AgentView.tsx:28`、`:406-419`。
- Agent 消息缓存按 tab 隔离，而不是按 session 直接单例保存。证据：`src/components/agent/AgentView.tsx:34-35`、`:177-257`。
- 审批交互分两层：时间线中留一条 `toolCall` 消息，本地再挂一个 `PermissionBanner`。证据：`src/components/agent/AgentView.tsx:215-232`、`:395-405`。
- 页面顶部的权限模式是启动参数选择器，不是后端运行时动态配置。证据：`src/components/agent/AgentView.tsx:164-263`、`:375-391`。

## 6. 代码锚点

| 想看什么 | 从哪看 |
|----------|--------|
| Agent 主编排 | `src/components/agent/AgentView.tsx:30-419` |
| startEngine 与事件分派 | `src/components/agent/AgentView.tsx:165-263` |
| 发送链路 | `src/components/agent/AgentView.tsx:265-360` |
| 审批决策 | `src/components/agent/AgentView.tsx:122-163` |
| Agent 消息列表 | `src/components/agent/AgentMessages.tsx:1-29` |
| 审批横幅 | `src/components/agent/PermissionBanner.tsx:1-40` |
| 任务进度卡片 | `src/components/agent/TaskProgressCard.tsx:1-58` |
| 工具调用展示 | `src/components/agent/ToolCallDisplay.tsx:1-57` |
| 复用输入框 | `src/components/chat/ChatInput.tsx:1-59` |

## 7. 已知约束

- `permissionMode` 切换只影响后续启动的引擎；当前已启动引擎不会因为 UI 切换而重建。证据：`src/components/agent/AgentView.tsx:165-263`、`:375-391`。
- `TaskProgressCard` 只识别 `TaskCreate`、`TaskUpdate`、`TodoWrite` 三种工具名。证据：`src/components/agent/TaskProgressCard.tsx:4-17`。
- `PermissionBanner` 只展示单个当前 interrupt，本地状态不是队列。证据：`src/components/agent/AgentView.tsx:50-51`、`:395-405`。
- `ChatInput` 里有本地 `thinking` toggle，但当前 AgentView 没有把这个状态透传给后端。证据：`src/components/chat/ChatInput.tsx:12-18`、`:47-55`。

## 8. 相关文档

- [ARCHITECTURE](./ARCHITECTURE.md)
- [backend-agent-engine](./backend-agent-engine.md)
- [frontend-app-shell](./frontend-app-shell.md)
- [agent-commands](/E:/Coding/AI/j-gui/docs/api/agent-commands.md)
- [frontend-state-atoms](/E:/Coding/AI/j-gui/docs/api/frontend-state-atoms.md)
