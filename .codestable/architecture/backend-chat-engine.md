---
doc_type: architecture
slug: backend-chat-engine
scope: j-gui 后端 Chat 引擎——LLM 调用封装 + 会话持久化
summary: ChatEngine 是无状态结构体，封装 j_cli 的 call_llm_stream_async 做流式 LLM 调用，前端通过 Tauri Channel 接收 ChatEvent
status: current
last_reviewed: 2026-05-08
tags: [backend, chat, llm, streaming]
depends_on: []
implements: [j-gui-ai-interaction]
---

# ChatEngine — 后端 Chat 引擎

## 1. 定位与受众

ChatEngine 是 j-gui 后端唯一处理 AI 对话的模块。它不持有状态、不依赖 Tauri 生命周期——每次 `send_message` 调用是独立的。

**受众**：feature-design（了解后端 Chat 能力边界）、issue-analyze（定位 LLM 调用失败根因）。

## 2. 结构与交互

```
Tauri Command (commands/chat.rs)
  │
  └─► ChatEngine::send_message(session_id, content, Channel<ChatEvent>)
        │
        ├─ load_agent_config()          → 读 ~/.jdata/agent/data/agent_config.json
        ├─ load_session(session_id)     → 读 ~/.jdata/sessions/{id}/transcript.jsonl
        ├─ load_system_prompt()         → 读 ~/.jdata/agent/data/system_prompt.md
        │
        ├─ call_llm_stream_async()      → HTTP 流式请求 → 每个 chunk 推送 Channel
        │
        └─ append_session_event()       → 写回 JSONL
```

**关键设计决策**：
- **无状态**：`ChatEngine` 是空 struct（`pub struct ChatEngine;`），每次调用创建新实例或复用均可
- **不使用 Agent Loop**：绕过 `MainAgentHandle::spawn()` / `ToolRegistry`，这些模块与 j-cli TUI 深度耦合。详见 `compound/2026-05-08-explore-j-cli-agent-coupling.md`
- **Channel 直推**：每个 chunk 通过 `on_event.send(ChatEvent::Chunk)` 推送，不做批量合并

### 代码入口

| 文件 | 职责 |
|------|------|
| `src-tauri/src/chat_engine.rs:1-129` | ChatEngine 全部逻辑 |
| `src-tauri/src/commands/chat.rs:1-34` | Tauri 命令包装（`send_message` 内 `spawn_blocking`） |

## 3. 数据与状态

### ChatEvent（流式事件）

```rust
// chat_engine.rs:16-20
pub enum ChatEvent {
    Chunk { index: u32, content: String },  // 文本块
    Done { total_tokens: u32 },              // 完成
    Error { message: String },               // 错误
}
```

当前仅 3 个 variant。ToolCall/ToolResult 预留但未实现——需 Agent Loop 模式。

### 会话持久化

- 读取：`load_session(&session_id)` → `Vec<ChatMessage>` (`chat_engine.rs:49`)
- 写入：`append_session_event(&session_id, &SessionEvent::msg(...))` (`chat_engine.rs:50,76`)
- 数据目录：`~/.jdata/sessions/{id}/transcript.jsonl`（由 j_cli 的 `SessionPaths` 管理）

### SessionInfo

```rust
// chat_engine.rs:23-29
pub struct SessionInfo {
    pub id: String,
    pub title: Option<String>,
    pub message_count: usize,
    pub updated_at: u64,
}
```

从 j_cli 的 `list_sessions()` 映射而来，字段与 `SessionMeta` 一致。

## 4. 关键决策

- **无 Agent Loop**：`call_llm_stream_async` 直达，跳过 `MainAgentHandle`/`ToolRegistry`。理由见 `compound/2026-05-08-explore-j-cli-agent-coupling.md`
- **`spawn_blocking` 隔离**：`commands/chat.rs:10` — LLM 调用在独立线程中运行，因为 `call_llm_stream_async` 的 callback (`&mut dyn FnMut`) 不是 Send，无法直接在 Tauri async command 中 await
- **user 消息先持久化**：`chat_engine.rs:50` — `append_session_event` 在 LLM 调用前执行，确保即使 LLM 失败也不会丢失用户消息

## 5. 代码锚点

| 想看什么 | 从哪看 |
|----------|--------|
| ChatEngine 完整逻辑 | `src-tauri/src/chat_engine.rs:1-129` |
| send_message 主流程 | `src-tauri/src/chat_engine.rs:38-88` |
| 会话 CRUD | `src-tauri/src/chat_engine.rs:90-119` |
| Tauri 命令包装 | `src-tauri/src/commands/chat.rs:1-34` |
| ChatEvent 定义 | `src-tauri/src/chat_engine.rs:16-20` |

## 6. 已知约束

- **无工具调用**：当前不支持 Agent 模式，需要先在 j-cli 侧抽取 `j-agent` crate
- **无流式中断**：Channel send 错误被 `let _ =` 忽略，前端 unmount 后 LLM 调用不会中止
- **无并发保护**：快速连续 `send_message` 存在 load/save 竞态

## 7. 相关文档

- `compound/2026-05-08-explore-j-cli-agent-coupling.md` — 为什么不用 Agent Loop
- `compound/2026-05-08-decision-j-gui-chat-engine.md` — ChatEngine 设计决策
- `compound/2026-05-08-decision-j-gui-ipc-dataflow.md` — Channel 流式协议
- `requirements/j-gui-ai-interaction.md` — 承载的能力需求
