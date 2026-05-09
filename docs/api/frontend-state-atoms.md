---
doc_type: lib-api-ref
entry: frontend-state-atoms
category: Frontend API
status: draft
source_files:
  - src/atoms/app-mode.ts
  - src/atoms/config.ts
  - src/atoms/sessions.ts
  - src/atoms/sidebar.ts
  - src/atoms/tabs.ts
  - src/atoms/theme.ts
  - src/atoms/toast.ts
summary: j-gui 前端用作跨组件状态面的 Jotai atoms 参考。
last_reviewed: 2026-05-09
---

# frontend-state-atoms

## 概述

`src/atoms/` 目录定义了 j-gui 当前主要的跨组件状态面。它们不是通用状态库，而是直接服务于当前工作台结构：

- 模式
- 标签页
- 会话与消息
- 配置
- 侧栏与右侧面板
- 主题
- Toast

当前状态组织里，`tabs` 是工作区入口，`sessions` 是 Chat / Agent 数据面，`config` 和 `theme` 是全局配置面。

## Atom 分类

### 基础状态 atom

直接保存原始值：

- `appModeAtom`
- `tabsAtom`
- `activeTabIdAtom`
- `sidebarOpenAtom`
- `rightPanelOpenAtom`
- `themeAtom`
- `agentConfigAtom`
- `chatSessionsAtom`
- `agentSessionsListAtom`
- `chatMessagesByTabAtom`
- `chatStreamingByTabAtom`
- `agentMessagesByTabAtom`
- `agentStreamingByTabAtom`
- `sessionTitleOverridesAtom`
- `chatDraftsAtom`
- `agentDraftsAtom`
- `toastsAtom`

### 派生 atom

只读地从别的 atom 推导结果：

- `activeProviderAtom`
- `activeTabAtom`
- `sessionsAtom`

### 读写型 atom

读取当前上下文并把写入定向到“当前 active tab”：

- `currentSessionIdAtom`
- `chatMessagesAtom`
- `chatStreamingAtom`
- `agentMessagesAtom`
- `agentStreamingAtom`

这组 atom 不是全局单值存储，而是对 `*ByTabAtom` 的当前 tab 视图。

## 逐项参考

### `appModeAtom`

类型：`Atom<"chat" | "agent">`

用途：

- 保存当前主模式。

要点：

- 当前默认值是 `"chat"`。
- 这是独立模式值，不等于当前 active tab 的类型。

### `tabsAtom`

类型：`Atom<Tab[]>`

`Tab` 字段：

- `id`
- `type`
- `title`
- `sessionId?`

用途：

- 保存工作区所有标签页。

要点：

- `type` 只分 `chat` 和 `agent`。
- `sessionId` 可空，代表这个 tab 还没绑定到具体会话。

### `activeTabIdAtom`

类型：`Atom<string | null>`

用途：

- 保存当前激活标签页 ID。

### `activeTabAtom`

类型：派生 atom

用途：

- 根据 `tabsAtom + activeTabIdAtom` 找出当前激活的 tab。

要点：

- 找不到时返回 `null`。

### `sidebarOpenAtom` / `rightPanelOpenAtom`

类型：

- `Atom<boolean>`
- `Atom<boolean>`

用途：

- 控制左侧栏是否展开
- 控制右侧文件面板是否展开

### `themeAtom`

类型：`Atom<"dark" | "light">`

用途：

- 保存当前主题。

要点：

- 这里只有两态，不包含更细的 provider theme 字符串。

### `agentConfigAtom`

类型：`Atom<AgentConfigInfo>`

字段：

- `providers`
- `activeIndex`
- `theme`

用途：

- 保存后端读取回来的 Agent 配置快照。

### `activeProviderAtom`

类型：派生 atom

用途：

- 根据 `agentConfigAtom.activeIndex` 解析当前 provider。

要点：

- 越界时返回 `null`。

### `chatSessionsAtom` / `agentSessionsListAtom`

类型：

- `Atom<SessionInfo[]>`
- `Atom<AgentSessionInfo[]>`

用途：

- 分别保存 Chat 会话列表和 Agent 会话列表。

其中：

- `SessionInfo` 来自 Chat 会话列表模型
- `AgentSessionInfo` 来自 Agent 会话列表模型

### `sessionsAtom`

类型：派生 atom

用途：

- 根据当前 `activeTab.type`，在 Chat / Agent 会话列表之间切换。

要点：

- 当前 active tab 是 agent 时返回 `agentSessionsListAtom`
- 其他情况返回 `chatSessionsAtom`

这意味着它是“当前模式视图”，不是跨模式聚合列表。

### `currentSessionIdAtom`

类型：读写型 atom

用途：

- 读取当前 active tab 绑定的 `sessionId`
- 写入时只更新当前 active tab 对应的 `sessionId`

要点：

- 它本身不独立持久化 session id，只是 `tabsAtom` 的上下文投影。

### `chatMessagesByTabAtom` / `agentMessagesByTabAtom`

类型：

- `Atom<Record<string, Message[]>>`
- `Atom<Record<string, Message[]>>`

用途：

- 以 tab id 为 key 保存消息列表。

这是当前 Chat / Agent 状态隔离的核心层。

### `chatStreamingByTabAtom` / `agentStreamingByTabAtom`

类型：

- `Atom<Record<string, boolean>>`
- `Atom<Record<string, boolean>>`

用途：

- 以 tab id 为 key 保存流式中状态。

### `chatMessagesAtom` / `agentMessagesAtom`

类型：读写型 atom

用途：

- 对当前 active tab 读写对应的消息数组。

要点：

- 读取时如果没有 active tab，返回空数组。
- 写入时如果没有 active tab，直接忽略。
- 实际底层存储仍在 `*MessagesByTabAtom`。

### `chatStreamingAtom` / `agentStreamingAtom`

类型：读写型 atom

用途：

- 对当前 active tab 读写对应的流式状态。

### `sessionTitleOverridesAtom`

类型：`Atom<Record<string, string>>`

用途：

- 保存用户手改标题或前端派生标题的覆盖值。

要点：

- key 是 session id，不是 tab id。

### `chatDraftsAtom` / `agentDraftsAtom`

类型：

- `Atom<Record<string, string>>`
- `Atom<Record<string, string>>`

用途：

- 按 tab id 保存输入草稿。

### `toastsAtom`

类型：`Atom<Toast[]>`

`Toast` 字段：

- `id`
- `message`
- `type`

用途：

- 保存当前 toast 队列。

### `registerToast()` / `toast()`

这两个不是 atom，但与 `toastsAtom` 配套：

- `registerToast(add)`：注册 UI 层注入的实际添加函数
- `toast(message, type?)`：供其他模块触发提示

当前实现依赖外部先调用 `registerToast()`，否则 `toast()` 不生效。

## 会话、tab 与消息的关系

当前数据关系是：

1. `tabsAtom` 保存工作区标签页
2. 每个 tab 通过 `sessionId` 绑定一个 Chat 或 Agent 会话
3. `chatMessagesByTabAtom` / `agentMessagesByTabAtom` 按 tab id 缓存当前消息视图
4. `currentSessionIdAtom` 是“当前 tab 的 sessionId 读写代理”
5. 侧栏和搜索更多使用 session 列表；主区渲染使用 active tab + 当前消息 atom

这意味着：

- 同一个 session 可以被不同 tab 引用
- 消息缓存粒度是 tab，不是 session
- 标题覆盖粒度是 session，不是 tab

## 辅助函数

### `timelineToMessages(items)`

用途：

- 把 Agent timeline 条目转成前端 `Message[]`。

转换规则：

- `user_message` -> user message
- `assistant_content` -> assistant text，连续文本会尝试合并
- `tool_call` -> assistant toolCall message
- `interrupt` -> assistant toolCall 风格消息，并把 `response` 映射为状态
- 其他 kind -> assistant 占位文本

### `deriveSessionTitle(messages)`

用途：

- 从第一条非空用户消息推导标题。

要点：

- 只取首个子句
- 最长 24 字符，超出加省略号
- 没有有效首条用户消息时返回 `null`

## 关键边界

- `sessionsAtom` 不是跨模式总列表，只是“跟着当前 active tab 切换”的视图。
- `chatMessagesAtom` / `agentMessagesAtom` 的写入目标依赖当前 active tab；它们不适合脱离 tab 上下文单独使用。
- session 列表和消息缓存不是同一个维度：前者按 session，后者按 tab。
- `appModeAtom` 与 `activeTabAtom.type` 不是同一件事，调用方不能默认二者始终同步。
- `toast()` 依赖先注册回调，不是纯原子写入接口。

## 相关条目

- [src/atoms/app-mode.ts](/E:/Coding/AI/j-gui/src/atoms/app-mode.ts)
- [src/atoms/config.ts](/E:/Coding/AI/j-gui/src/atoms/config.ts)
- [src/atoms/sessions.ts](/E:/Coding/AI/j-gui/src/atoms/sessions.ts)
- [src/atoms/tabs.ts](/E:/Coding/AI/j-gui/src/atoms/tabs.ts)
- [src/atoms/sidebar.ts](/E:/Coding/AI/j-gui/src/atoms/sidebar.ts)
- [src/atoms/theme.ts](/E:/Coding/AI/j-gui/src/atoms/theme.ts)
- [src/atoms/toast.ts](/E:/Coding/AI/j-gui/src/atoms/toast.ts)
- [tauri-frontend-bridge](./tauri-frontend-bridge.md)
