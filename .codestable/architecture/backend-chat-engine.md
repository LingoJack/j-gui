---
doc_type: architecture
slug: backend-chat-engine
scope: j-gui 后端 Chat 引擎——LLM 调用封装 + 会话持久化 + 生成中止
summary: ChatEngine 是无状态结构体，封装 j_cli 的 call_llm_stream_async 做流式 LLM 调用，前端通过 Tauri Channel 接收 ChatEvent；辅以 STOPPED_SESSIONS 全局状态支持生成中止
status: current
last_reviewed: 2026-05-10
tags: [backend, chat, llm, streaming]
depends_on: [j-cli-chat-storage, j-cli-llm-stream]
implements: [j-gui-ai-interaction]
---

# ChatEngine — 后端 Chat 引擎

## 1. 定位与受众

ChatEngine 是 j-gui 后端唯一处理 AI 对话的模块。它不持有状态、不依赖 Tauri 生命周期——每次 `send_message` 调用是独立的。全局状态（写锁、中止标记）以 `static` 变量存放，与 ChatEngine 实例无关。

**受众**：feature-design（了解后端 Chat 能力边界）、issue-analyze（定位 LLM 调用失败根因）。

## 2. 结构与交互

### 核心数据流：send_message

```
Tauri Command (commands/chat.rs:send_message)
  │
  ├─ std::thread::spawn + tokio::block_on
  │
  └─► ChatEngine::send_message(session_id, content, Channel<ChatEvent>)
        │
        ├─ validate_session_id()                        → 检查输入合法性
        ├─ load_agent_config()                          → 读 ~/.jdata/agent/data/agent_config.json
        ├─ load_session(session_id)                     → 读 ~/.jdata/sessions/{id}/transcript.jsonl
        ├─ append_session_event_locked(user_msg)        → 用户消息先持久化（Mutex 保护）
        ├─ load_system_prompt()                         → 读 ~/.jdata/agent/data/system_prompt.md
        │
        ├─ call_llm_stream_async()                      → HTTP 流式请求 → 每个 chunk 推送 Channel
        │     │
        │     └─ callback: 检查 cancelled flag + on_event.send(Chunk)
        │                  send 失败 → 设置 cancelled = true（Channel drop 检测）
        │
        ├─ [流式结束后] append_session_event_locked(assistant_msg) → 完整回复持久化
        │
        └─ on_event.send(Done) 或 on_event.send(Error)
```

### 生成中止路径

```
stop_generation(session_id)                    (commands/chat.rs:57)
  │
  └─► STOPPED_SESSIONS.lock() → insert(session_id)
        │
        └─ [callback 中] is_session_stopped() → 设置 cancelled = true
              ┌─ 当前：TODO，callback 内有 `cancelled` 占位机制
              └─ 预期：在 callback 入口检查 is_session_stopped(&session_id)
```

### 会话 CRUD 路径

```
list_sessions()       → ChatEngine::list_sessions()   → j_cli list_sessions()
create_session()      → ChatEngine::create_session()   → 时间戳+PID+计数器 → hex ID
delete_session(id)    → ChatEngine::delete_session()   → 删除 transcript.jsonl + meta.json
get_session_messages  → ChatEngine::get_messages()     → load_session → MessageInfo[]
delete_message        → ChatEngine::delete_message()   → 按 pair_index 删除 user+assistant
clear_session         → ChatEngine::clear_session()    → append_session_event_locked(Clear)
```

### 关键设计决策

- **无状态**：`ChatEngine` 是空 struct（`pub struct ChatEngine;`），所有方法在 `impl ChatEngine` 上，每次调用创建新实例或复用均可
- **不使用 Agent Loop**：绕过 `MainAgentHandle::spawn()` / `ToolRegistry`，这些模块与 j-cli TUI 深度耦合。详见 `compound/2026-05-08-explore-j-cli-agent-coupling.md`
- **Channel 直推**：每个 chunk 通过 `on_event.send(ChatEvent::Chunk)` 推送，不做批量合并
- **线程模型**：`std::thread::spawn` + `tokio::runtime::Handle::block_on` 替代 `spawn_blocking`，因为 `call_llm_stream_async` 的 callback (`&mut dyn FnMut`) 不是 `Send`，无法在 Tauri async command 的 tokio 上下文中直接 await

### 代码入口

| 文件 | 职责 | 行数 |
|------|------|------|
| `src-tauri/src/chat_engine.rs` | ChatEngine 全部逻辑（send_message + 会话 CRUD + 写锁 + 计数器） | 1-250 |
| `src-tauri/src/commands/chat.rs` | Tauri 命令包装（8 个命令 + STOPPED_SESSIONS + 线程桥接） | 1-85 |

### 注册的命令

`src-tauri/src/lib.rs:38-45` 注册了 8 个 chat 命令：
`send_message`, `list_sessions`, `create_session`, `delete_session`, `get_session_messages`, `delete_message`, `clear_session`, `stop_generation`

## 3. 数据与状态

### ChatEvent（流式事件）

```rust
// chat_engine.rs:17-23
pub enum ChatEvent {
    Chunk { index: u32, content: String },  // 文本块，index 单调递增
    Done { total_tokens: u32 },              // 完成（当前 total_tokens 始终传 0）
    Error { message: String },               // 错误
}
```

仍为 3 个 variant，`total_tokens: 0` 是已知简化。ToolCall/ToolResult 预留但未实现——需 Agent Loop 模式。

### 会话持久化

- 读取：`load_session(&session_id)` → `Vec<ChatMessage>` (`chat_engine.rs:82`)
- 写入：`append_session_event_locked(&session_id, &SessionEvent::msg(...))` (`chat_engine.rs:57-66, 85, 126`)
- 清除：`append_session_event_locked(&session_id, &SessionEvent::Clear)` (`chat_engine.rs:234`)
- 删除消息对：按 `pair_index` 从 transcript.jsonl 中移除 user+assistant 两条记录 (`chat_engine.rs:181-229`)
- 数据目录：`~/.jdata/sessions/{id}/transcript.jsonl`（由 j_cli 的 `SessionPaths` 管理）

### 全局静态变量

```rust
// chat_engine.rs:13
static SESSION_WRITE_LOCK: Mutex<()> = Mutex::new(());

// chat_engine.rs:15
static SESSION_COUNTER: AtomicU64 = AtomicU64::new(0);

// commands/chat.rs:6
static STOPPED_SESSIONS: Mutex<Option<HashSet<String>>> = Mutex::new(None);
```

### MessageInfo（消息查询）

```rust
// chat_engine.rs:25-31
pub struct MessageInfo {
    pub role: String,
    pub content: String,
    pub timestamp: u64,
}
```

用于 `get_session_messages` 命令，从 `ChatMessage` 映射而来，timestamp 取调用时刻的当前时间（非消息原始时间）。

### SessionInfo（会话列表）

```rust
// chat_engine.rs:33-40
pub struct SessionInfo {
    pub id: String,
    pub title: Option<String>,
    pub message_count: usize,
    pub updated_at: u64,
}
```

从 j_cli 的 `list_sessions()` 映射而来，字段与 `SessionMeta` 一致。

### session ID 生成

```rust
// chat_engine.rs:154-161
pub fn create_session(&self) -> String {
    // 格式："{timestamp_micros}-{pid}-{counter}"
    // 例：`18f3a2b4c8d-9a3c-0`
}
```

由时间戳微秒 + 进程 ID + 单调递增计数器组成，十六进制编码，不含非 hex 字符（符合 `validate_session_id` 要求）。

## 4. 关键决策

### SESSION_WRITE_LOCK：单一互斥锁保护所有会话写操作

`chat_engine.rs:13` — `SESSION_WRITE_LOCK` 是全局 `Mutex<()>`，覆盖所有会写 transcript.jsonl 的操作（append 消息、clear 写入 Clear event、delete_message 重写文件）。目标是防止并发写导致 JSONL 交错。代价是**粗粒度**——不同会话之间的写入也会串行。

### validate_session_id：输入消毒前置检查

`chat_engine.rs:49-55` — `send_message`、`get_messages`、`clear_session`、`delete_session`、`delete_message` 入口处调用，只允许 hex digit 和连字符。防御路径遍历 / 注入。

### append_session_event_locked：统一写入口

`chat_engine.rs:57-66` — 封装 `append_session_event` + `SESSION_WRITE_LOCK`，传播 `Result` 而非吞掉。`send_message` 中 user 消息持久化 (`:85`) 和 assistant 消息持久化 (`:126`) 均通过此函数，失败时以 `?` 传播给调用方，不再用 `let _ =` 吞掉写错误。

### cancelled flag：流式回调内的中断信号

`chat_engine.rs:92, 99-113` — callback 闭包捕获 `cancelled: bool`。两个触发源：
- Channel 端 drop（前端 unmount）→ `send` 返回 `Err` → `cancelled = true`
- TODO: 通过 `is_session_stopped(&session_id)` 检查 `STOPPED_SESSIONS`

一旦 `cancelled = true`，后续 chunk 不再推送，`send_message` 返回 `Err("流式传输已取消")`。

### STOPPED_SESSIONS：外部中止请求登记

`commands/chat.rs:6` — 全局 `Mutex<Option<HashSet<String>>>`，`stop_generation` 命令将 session_id 插入。当前为止是**注册机制**——stream callback 需要主动轮询 `is_session_stopped()` 才能生效，此集成尚为 TODO。`is_session_stopped` 和 `clear_stopped_session` 已编写但标注 `#[allow(dead_code)]`。

### 线程桥接：std::thread::spawn + tokio::block_on

`commands/chat.rs:14-24` — Tauri command 是 async fn（tokio context），但 `call_llm_stream_async` 的 callback 非 `Send`，不能直接 `.await`。用 `std::thread::spawn` 启动新 OS 线程，在新线程中 `handle.block_on(...)` 来完成 async LLM 调用。结果通过 `oneshot::channel` 传回 async 侧。

### user 消息先持久化

`chat_engine.rs:84-85` — `append_session_event_locked` 在 LLM 调用前执行，确保即使 LLM 失败也不会丢失用户消息。写错误现在用 `?` 传播（原为 `let _ =` 吞掉）。

## 5. 代码锚点

| 想看什么 | 从哪看 |
|----------|--------|
| ChatEngine 完整逻辑 | `src-tauri/src/chat_engine.rs:1-250` |
| send_message 主流程 | `src-tauri/src/chat_engine.rs:68-139` |
| append_session_event_locked | `src-tauri/src/chat_engine.rs:57-66` |
| cancelled flag + Channel drop 检测 | `src-tauri/src/chat_engine.rs:92, 99-113` |
| validate_session_id | `src-tauri/src/chat_engine.rs:49-55` |
| 会话 CRUD（list/create/delete） | `src-tauri/src/chat_engine.rs:141-249` |
| delete_message（按 pair 删除行） | `src-tauri/src/chat_engine.rs:181-229` |
| clear_session（写 Clear event） | `src-tauri/src/chat_engine.rs:232-235` |
| Tauri 命令包装 + 线程桥接 | `src-tauri/src/commands/chat.rs:1-24` |
| stop_generation + STOPPED_SESSIONS | `src-tauri/src/commands/chat.rs:57-84` |
| ChatEvent 定义 | `src-tauri/src/chat_engine.rs:17-23` |
| MessageInfo 定义 | `src-tauri/src/chat_engine.rs:25-31` |
| SessionInfo 定义 | `src-tauri/src/chat_engine.rs:33-40` |
| SESSION_WRITE_LOCK / SESSION_COUNTER | `src-tauri/src/chat_engine.rs:13-15` |

## 6. 已知约束

- **无工具调用**：当前不支持 Agent 模式的工具调用（ToolUse/ToolResult）。需要先在 j-cli 侧抽取 `j-agent` crate 并接入 Agent Loop。
- **生成中止半完成**：`STOPPED_SESSIONS` 注册机制已实现，但 stream callback 内的轮询集成（`is_session_stopped` 检查）是 TODO。当前只能通过前端 drop Channel 来中止。
- **`total_tokens: 0`**：`ChatEvent::Done` 的 `total_tokens` 始终传 0，未从 LLM 响应中提取 token 用量。
- **粗粒度写锁**：`SESSION_WRITE_LOCK` 锁所有会话的所有写操作，不同会话的写入不能并发。
- **`STOPPED_SESSIONS` 无自动清理**：已中止的 session_id 会一直留在 `HashSet` 中。`clear_stopped_session` 已编写但未被 `send_message` 调用。
- **`MessageInfo.timestamp` 不准确**：`get_messages` 中每条消息的 timestamp 取调用时刻而非消息原始时间戳。
- **`delete_message` 文本操作**：message 删除通过字符串行级过滤实现，没有使用 j_cli 的事务 API，在超大 transcript 下效率较低。
- **无 Agent Loop**：`call_llm_stream_async` 直达，跳过 `MainAgentHandle`/`ToolRegistry`。理由见 `compound/2026-05-08-explore-j-cli-agent-coupling.md`。

## 7. 相关文档

- `compound/2026-05-08-explore-j-cli-agent-coupling.md` — 为什么不用 Agent Loop
- `compound/2026-05-08-decision-j-gui-chat-engine.md` — ChatEngine 设计决策
- `compound/2026-05-08-decision-j-gui-ipc-dataflow.md` — Channel 流式协议
- `requirements/j-gui-ai-interaction.md` — 承载的能力需求
