---
doc_type: lib-api-ref
entry: agent-commands
category: Tauri IPC
status: draft
source_files:
  - src-tauri/src/commands/agent.rs
  - src-tauri/src/agent_engine.rs
  - src-tauri/src/agent_session.rs
  - src/lib/ipc.ts
summary: Agent 生命周期、会话存储与流式事件的 Tauri 命令组参考。
last_reviewed: 2026-05-09
---

# Agent Commands

## 概述

`agent-commands` 提供一组 Tauri IPC 命令，用来启动和停止 Agent 进程、发送用户消息、回应工具中断，以及管理 Agent 会话。前端通过 `src/lib/ipc.ts` 的 wrapper 调用这些命令，并通过 `Channel<AgentEvent>` 接收流式事件。

当前实现的运行时边界是单槽位 `AgentState`：同一时刻只保存一个 `AgentEngine` 实例。`start_agent` 会写入该实例，`send_agent_message`、`respond_agent_interrupt` 和 `stop_agent` 都只作用于当前已启动的引擎。

## API 参考

### `start_agent`

```rust
fn start_agent(
    state: tauri::State<'_, AgentState>,
    on_event: Channel<AgentEvent>,
    permission_mode: Option<String>,
    session_id: Option<String>,
) -> Result<(), String>
```

- 启动 Claude CLI 驱动的 Agent 引擎，并把事件通过 `on_event` 向前端流式发送。
- `permission_mode` 为空时默认使用 `"bypassPermissions"`。
- `session_id` 为空时会先创建一个新会话，再用该会话启动引擎。
- 启动失败会以 `String` 错误返回，常见来源是模型提供方未配置或 CLI 启动失败。

### `send_agent_message`

```rust
fn send_agent_message(
    state: tauri::State<'_, AgentState>,
    content: String,
) -> Result<(), String>
```

- 向当前 Agent 发送一条用户消息。
- 仅在 Agent 已启动时可用；否则返回 `Agent 未启动`。
- 会先把用户消息追加到当前会话的 transcript，再写入 CLI 标准输入。

### `respond_agent_interrupt`

```rust
fn respond_agent_interrupt(
    state: tauri::State<'_, AgentState>,
    interrupt_id: String,
    allowed: bool,
) -> Result<(), String>
```

- 用于回应当前 Agent 的工具中断。
- `allowed = true` 时写入 `approved`，`allowed = false` 时写入 `denied`。
- 该响应会先更新会话 transcript 中对应的 `interrupt.response`，再以 `tool_result` 形式发给 CLI。
- 仅在 Agent 已启动时可用；否则返回 `Agent 未启动`。

### `stop_agent`

```rust
fn stop_agent(state: tauri::State<'_, AgentState>) -> Result<(), String>
```

- 停止当前 Agent 进程并释放引擎。
- 这会关闭 stdin、终止子进程，并等待后台读取线程结束。
- 如果当前没有启动中的 Agent，仍然返回 `Ok(())`。

### `create_agent_session`

```rust
fn create_agent_session() -> Result<String, String>
```

- 创建一个新会话并返回会话 ID。
- 目录和 `meta.json` 由会话层负责初始化。

### `list_agent_sessions`

```rust
fn list_agent_sessions() -> Result<Vec<AgentSessionInfo>, String>
```

- 返回会话列表摘要。
- 结果按 `updated_at` 倒序排列。

### `get_agent_session`

```rust
fn get_agent_session(session_id: String) -> Result<Vec<AgentTimelineItem>, String>
```

- 返回指定会话的时间线条目。
- 会话目录不存在时返回 `会话不存在`。

### `delete_agent_session`

```rust
fn delete_agent_session(session_id: String) -> Result<(), String>
```

- 删除指定会话目录及其内容。
- 如果目录不存在，当前实现直接返回成功。

### 相关类型

#### `AgentEvent`

Rust 侧事件使用 `serde(tag = "event", content = "data", rename_all = "camelCase")` 序列化，前端 wrapper 也按同样的事件名消费。

- `assistantContent` `{ text }`
- `toolUse` `{ toolId, toolName, toolInput }`
- `interrupt` `{ interruptId, kind, toolName, toolInput }`
- `toolResult` `{ toolId, content }`
- `done` `{ totalTokens }`
- `error` `{ message }`

#### `AgentSessionInfo`

- `id`
- `title`
- `messageCount`
- `updatedAt`

#### `AgentTimelineItem`

- `id`
- `kind`
- `content`
- `toolCall`
- `interrupt`
- `createdAt`

#### `ToolCallSnapshot`

- `toolId`
- `toolName`
- `toolInput`
- `toolOutput`
- `status`

#### `InterruptSnapshot`

- `interruptId`
- `kind`
- `toolName`
- `toolInput`
- `response`

### 前端 wrapper 要点

- `startAgent(onEvent, permissionMode?, sessionId?)` 会把省略的可选参数转成 `null` 再调用 `start_agent`。
- `sendAgentMessage(content)`、`respondAgentInterrupt(interruptId, allowed)` 和 `stopAgent()` 都是对 Rust 命令的直接封装。
- `createAgentSession()`、`listAgentSessions()`、`getAgentSession(sessionId)`、`deleteAgentSession(sessionId)` 分别对应会话创建、列表、详情和删除。
- `AgentEvent` 的前端类型与 Rust 的 `AgentEvent` 保持同一组事件名，只是字段名已经是 camelCase。

## 基本用法

1. 先调用 `startAgent(onEvent, permissionMode?, sessionId?)` 启动引擎。
2. 监听 `onEvent`，按 `event` 分派 `assistantContent`、`interrupt`、`done` 和 `error`。
3. 需要继续对话时调用 `sendAgentMessage(content)`。
4. 遇到 `interrupt` 时，用 `respondAgentInterrupt(interruptId, allowed)` 回应。
5. 结束时调用 `stopAgent()`。

```ts
import { Channel } from "@tauri-apps/api/core";
import {
  startAgent,
  sendAgentMessage,
  respondAgentInterrupt,
  stopAgent,
} from "@/lib/tauri";

const onEvent = new Channel({
  onMessage(event) {
    if (event.event === "interrupt") {
      // 根据 UI 决策回应
    }
  },
});

await startAgent(onEvent, "bypassPermissions");
await sendAgentMessage("请总结当前模块的职责");
```

## 典型场景

- 新建一个 Agent 会话并立即启动对话。
- 复用已有 `sessionId` 继续之前的运行记录。
- 在非 `bypassPermissions` 模式下，审批或拒绝工具权限中断。
- 查看某个会话的时间线，或删除不再需要的会话记录。

## 注意事项

- `send_agent_message`、`respond_agent_interrupt` 和 `stop_agent` 都依赖当前已启动的 Agent；它们不是按 `session_id` 定位，而是按进程内的当前引擎定位。
- `start_agent` 只保存一个 `AgentEngine`；再次启动会覆盖当前槽位。
- 当 `permission_mode` 不是 `bypassPermissions` 时，后端会把流里的 `ToolUse` 转成 `interrupt`，并固定标记 `kind = "permission"`。
- `toolResult` 不是单独的命令入口，而是后端从 CLI 流里解析到 `tool_result` 用户块后发出的事件。
- `respond_agent_interrupt` 只写入 `approved` / `denied` 两种响应，不支持任意自由文本。
- 会话 API 走的是 `agent_session` 的持久化层，不要求引擎正在运行。

## 相关条目

- `chat-commands`：同样使用流式事件模型的聊天命令组。
- `config-commands`：提供 Agent 配置和当前 provider 的读取/写入。
- `agent-components`：前端 Agent 面板消费这里的事件和会话数据。
