---
doc_type: architecture
slug: backend-agent-engine
scope: j-gui 后端 Agent 引擎与会话持久化
summary: AgentEngine 负责启动 claude CLI、解析 stream-json 事件、转发到前端并把 timeline 持久化到 agent session 目录
status: current
last_reviewed: 2026-05-09
tags: [backend, agent, claude-cli, streaming, session]
depends_on: []
implements: [j-gui-ai-interaction]
---

# Agent Engine — 后端 Agent 引擎

## 1. 定位与受众

`backend-agent-engine` 是 j-gui 当前 Agent 模式的后端执行面。它不复用 ChatEngine，而是直接启动外部 `claude` CLI，读取 `stream-json` 输出，把事件转成 `AgentEvent` 发给前端，同时把关键轨迹写回本地 timeline。

受众：

- feature-design：理解 Agent 运行边界
- issue-analyze：定位 Agent 无响应、审批、会话恢复问题
- 新人上手：理解前后端事件与持久化链路

## 2. 结构与交互

### 2.1 命令入口

`src-tauri/src/commands/agent.rs:8-74` 提供当前全部 Agent command：

- `start_agent`
- `create_agent_session`
- `list_agent_sessions`
- `get_agent_session`
- `delete_agent_session`
- `respond_agent_interrupt`
- `send_agent_message`
- `stop_agent`

这里的共享状态是单个 `AgentState(pub Arc<Mutex<Option<AgentEngine>>>)`，定义在 `src-tauri/src/commands/agent.rs:6`。当前进程内同一时刻只保存一个运行中的 `AgentEngine`。

### 2.2 运行链路

```text
start_agent
  -> create_agent_session?                 (无 session_id 时创建)
  -> AgentEngine::start(...)
     -> load_agent_config()
     -> which_claude()
     -> Command::new(claude_path)
     -> build_claude_args(model, permission_mode)
     -> spawn child process
     -> stdout thread 解析 stream-json
     -> stderr thread 读取错误输出
     -> Arc<Mutex<Option<AgentEngine>>> 保存当前引擎
```

核心入口在 `src-tauri/src/agent_engine.rs:52-222`。

### 2.3 stdout 事件链

stdout 后台线程位于 `src-tauri/src/agent_engine.rs:92-200`：

1. 逐行读取 CLI 输出
2. `parse_sdk_line(&line)` 解析为 `Vec<AgentEvent>` (`src-tauri/src/agent_engine.rs:316-406`)
3. 非 `bypassPermissions` 模式下，把 `ToolUse` 转成 `Interrupt` (`src-tauri/src/agent_engine.rs:104-116`)
4. 先构造 timeline item 或 tool result 更新
5. `event_channel.send(event)` 推给前端 (`src-tauri/src/agent_engine.rs:173-176`)
6. 再把 timeline / tool result 写回 agent session (`src-tauri/src/agent_engine.rs:177-197`)

### 2.4 会话持久化链

持久化层在 `src-tauri/src/agent_session.rs:83-250`，目录是：

`YamlConfig::data_dir()/agent/sessions/{session_id}/`

当前文件：

- `meta.json`
- `transcript.jsonl`

写入 API：

- `append_timeline_item()` (`src-tauri/src/agent_session.rs:93-109`)
- `update_tool_call_result()` (`src-tauri/src/agent_session.rs:140-159`)
- `update_interrupt_response()` (`src-tauri/src/agent_session.rs:161-179`)

读取 / 列表 API：

- `list_agent_sessions()` (`src-tauri/src/agent_session.rs:181-228`)
- `get_agent_session()` (`src-tauri/src/agent_session.rs:230-239`)
- `delete_agent_session()` (`src-tauri/src/agent_session.rs:241-249`)

## 3. 数据与状态

### `AgentEvent`

定义在 `src-tauri/src/agent_engine.rs:11-38`，当前只有六种事件：

- `AssistantContent { text }`
- `ToolUse { tool_id, tool_name, tool_input }`
- `Interrupt { interrupt_id, kind, tool_name, tool_input }`
- `ToolResult { tool_id, content }`
- `Done { total_tokens }`
- `Error { message }`

序列化形式是：

- `event`
- `data`
- `camelCase`

### `AgentEngine`

定义在 `src-tauri/src/agent_engine.rs:40-49`，字段包括：

- `process`
- `stdin`
- `stdout_thread`
- `stderr_thread`
- `session_id`
- `transcript_path`

它本身就是“当前运行引擎”对象，不是无状态 helper。

### `AgentTimelineItem`

定义在 `src-tauri/src/agent_session.rs:12-21`：

- `id`
- `kind`
- `content`
- `tool_call`
- `interrupt`
- `created_at`

这套结构是 Agent 会话恢复的事实源。

### `ToolCallSnapshot` / `InterruptSnapshot`

分别定义在 `src-tauri/src/agent_session.rs:23-41`，用于 timeline 中的工具调用和审批快照。

## 4. 关键决策

- 使用外部 `claude` CLI，而不是在 j-gui 内部直接嵌入模型客户端。证据：`which_claude()` 与 `Command::new(&claude_path)` 在 `src-tauri/src/agent_engine.rs:64-82`。
- 采用 `stream-json` 输入输出协议。证据：`build_claude_args()` 在 `src-tauri/src/agent_engine.rs:290-307`。
- 非 `bypassPermissions` 模式下，把 `ToolUse` 包装为前端审批型 `Interrupt`。证据：`src-tauri/src/agent_engine.rs:104-116`。
- timeline 写入和更新通过全局 `AGENT_TRANSCRIPT_LOCK` 串行化，避免并发写坏 `transcript.jsonl`。证据：`src-tauri/src/agent_session.rs:9-10`、`93-109`、`145-179`。
- `send_message()` 和 `respond_interrupt()` 都先更新 session 存储，再写 stdin。证据：`src-tauri/src/agent_engine.rs:224-248`、`250-267`。

## 5. 代码锚点

| 想看什么 | 从哪看 |
|----------|--------|
| Agent command 总入口 | `src-tauri/src/commands/agent.rs:8-74` |
| 单槽位运行状态 | `src-tauri/src/commands/agent.rs:6` |
| 引擎启动流程 | `src-tauri/src/agent_engine.rs:52-222` |
| stdout 解析与前端转发 | `src-tauri/src/agent_engine.rs:92-200` |
| CLI 事件解析 | `src-tauri/src/agent_engine.rs:316-406` |
| CLI 参数构造 | `src-tauri/src/agent_engine.rs:290-307` |
| 会话目录与 timeline 写入 | `src-tauri/src/agent_session.rs:52-109` |
| tool result / interrupt 回写 | `src-tauri/src/agent_session.rs:140-179` |
| 会话列表与读取 | `src-tauri/src/agent_session.rs:181-249` |

## 6. 已知约束

- 当前是单槽位 `AgentState`；再次 `start_agent` 会覆盖进程内当前引擎，而不是并行保存多个运行实例。证据：`src-tauri/src/commands/agent.rs:20-23`。
- `send_agent_message`、`respond_agent_interrupt`、`stop_agent` 都只作用于“当前已启动引擎”，不按 `session_id` 路由。证据：`src-tauri/src/commands/agent.rs:47-74`。
- `interrupt` 的 `kind` 当前固定是 `"permission"`，来自 `ToolUse -> Interrupt` 包装，不是更丰富的中断系统。证据：`src-tauri/src/agent_engine.rs:109-113`。
- stderr 线程当前直接 `eprintln!` 输出，而不是写文件日志。证据：`src-tauri/src/agent_engine.rs:202-208`。
- session title 在创建时写成 `null`，当前持久化层不会自动根据首条用户消息更新 `meta.json`。证据：`src-tauri/src/agent_session.rs:87-89`。
- API Key 通过 `ANTHROPIC_API_KEY` 环境变量传入 Claude CLI 子进程，在同用户进程中可见 (`src-tauri/src/agent_engine.rs:73-79`)。

## 7. 相关文档

- [ARCHITECTURE](./ARCHITECTURE.md)
- [backend-chat-engine](./backend-chat-engine.md)
- [agent-commands](/E:/Coding/AI/j-gui/docs/api/agent-commands.md)
