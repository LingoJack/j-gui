---
doc_type: lib-api-ref
entry: agent-components
category: React Components
status: draft
source_files:
  - src/components/agent/AgentView.tsx
  - src/components/agent/AgentMessages.tsx
  - src/components/agent/PermissionBanner.tsx
  - src/components/agent/TaskProgressCard.tsx
  - src/components/agent/ToolCallDisplay.tsx
summary: Agent 主视图、消息区、审批横幅、任务进度卡片和工具调用展示组件参考。
last_reviewed: 2026-05-11
---

# agent-components

## 概述

这组组件构成 j-gui 当前 Agent 模式的主要可见 UI 面：

- `AgentView`
- `AgentMessages`
- `PermissionBanner`
- `TaskProgressCard`
- `ToolCallDisplay`

它们共同承接：

- Agent 消息发送与流式接收
- timeline / tool call 渲染
- permission interrupt 审批
- 任务进度摘要

当前这些组件不是通用组件库，而是工作台内部组件。

## 组件参考

### `AgentView`

文件：`src/components/agent/AgentView.tsx`

职责：

- Agent 页面总编排
- 启动后端引擎
- 发送用户消息
- 消费 `AgentEvent`
- 控制 permission mode
- 控制右侧文件面板开关

主要依赖：

- `startAgent`
- `sendAgentMessage`
- `respondAgentInterrupt`
- `createAgentSession`
- `stopAgent`
- `agentMessages*` / `agentStreaming*` / `agentDraftsAtom`
- `currentSessionIdAtom`
- `tabsAtom`
- `rightPanelOpenAtom`

主要可见结构：

- 顶部 header
- `AgentMessages`
- 条件渲染 `PermissionBanner`
- 底部复用的 `ChatInput`

关键行为：

- 无 session 时先创建 Agent session
- 引擎未启动时先 `startEngine`
- 收到 `interrupt` 时既写 timeline 消息，又显示审批横幅
- 切走已绑定不同 session 的 tab 时会停止当前引擎

主要输入：

- 无显式 props

主要输出：

- 通过 atoms 更新当前 Agent tab 状态
- 通过 Tauri wrapper 调后端

边界：

- `permissionMode` 是页面本地 state，不是全局设置
- `ChatInput` 的 thinking toggle 当前不会透传到后端
- 当前实现以当前 active tab 为上下文，不是多实例独立组件 API

### `AgentMessages`

文件：`src/components/agent/AgentMessages.tsx`

职责：

- 渲染当前 Agent 会话的消息区
- 空态时展示引导文案
- 统一渲染持久化消息与实时 SDK 消息
- 在流式过程中展示运行态、重试态和压缩态

主要输入：

- 无 props

渲染规则：

- 无内容且未流式时显示空态
- 当前主渲染路径基于 `SDKMessageRenderer` 的分组结果，不再使用旧文档描述的 `MessageBubble`
- 流式过程中会按状态补充运行指示器、重试提示和压缩指示器

### `PermissionBanner`

文件：`src/components/agent/PermissionBanner.tsx`

职责：

- 展示当前待审批工具调用
- 预览工具输入
- 提供允许/拒绝操作

props：

- `toolName`
- `toolInput`
- `disabled?`
- `onAllow`
- `onDeny`

行为：

- 如果 `toolInput` 是 JSON，尝试 pretty-print 后截断到 300 字符
- `disabled` 时两个操作按钮都进入不可点击状态
- 按钮文案直接提示 `Enter` / `Esc`

### `TaskProgressCard`

文件：`src/components/agent/TaskProgressCard.tsx`

职责：

- 从当前消息列表提取任务类工具调用
- 生成简单进度卡片

props：

- `messages: Message[]`

识别范围：

- `TaskCreate`
- `TaskUpdate`
- `TodoWrite`

行为：

- 没有任务项时返回 `null`
- 默认展开
- 任务多于 8 项时只显示前 8 项并给出剩余数

### `ToolCallDisplay`

文件：`src/components/agent/ToolCallDisplay.tsx`

职责：

- 展示单条工具调用的输入、输出和状态

props：

- `toolCall: ToolCall`

行为：

- 默认展开
- 尝试把 `toolInput` pretty-print 成 JSON
- `status` 为 `running` / `done` / `error` 时分别显示 spinner / check / x
- `toolOutput !== undefined` 时才显示输出区

## 组件关系

```text
AgentView
  -> AgentMessages
     -> TaskProgressCard
     -> SDKMessageRenderer / ToolCallDisplay
  -> PermissionBanner?
  -> ChatInput
```

## 关键边界

- 这组组件强依赖 Jotai atoms 和 `src/lib/ipc.ts`，不是脱离工作台可独立复用的展示组件。
- `AgentMessages` 自己不做事件消费，事件消费全部由 `AgentView` 完成。
- `PermissionBanner` 只负责当前一个 interrupt，不维护审批队列。
- `TaskProgressCard` 的任务识别来自工具名集合，不是通用任务协议。
- `ToolCallDisplay` 只理解当前 `ToolCall` 结构，不读取更高层 timeline item。

## 相关条目

- [src/components/agent/AgentView.tsx](/E:/Coding/AI/j-gui/src/components/agent/AgentView.tsx)
- [src/components/agent/AgentMessages.tsx](/E:/Coding/AI/j-gui/src/components/agent/AgentMessages.tsx)
- [src/components/agent/PermissionBanner.tsx](/E:/Coding/AI/j-gui/src/components/agent/PermissionBanner.tsx)
- [src/components/agent/TaskProgressCard.tsx](/E:/Coding/AI/j-gui/src/components/agent/TaskProgressCard.tsx)
- [src/components/agent/ToolCallDisplay.tsx](/E:/Coding/AI/j-gui/src/components/agent/ToolCallDisplay.tsx)
- [frontend-agent-ui](/E:/Coding/AI/j-gui/.codestable/architecture/frontend-agent-ui.md)
