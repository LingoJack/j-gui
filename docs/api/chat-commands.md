---
doc_type: lib-api-ref
entry: chat-commands
category: Tauri IPC
status: draft
source_files:
  - src-tauri/src/commands/chat.rs
  - src-tauri/src/chat_engine.rs
  - src/lib/tauri.ts
summary: Chat 会话、消息流式发送、历史读取、单条消息删除与会话清理的 IPC 参考。
last_reviewed: 2026-05-09
---

# chat-commands

## 概述

这组 API 负责聊天会话的生命周期和消息读写：创建会话、列出会话、读取消息、发送消息流、删除单条消息、清空会话、删除会话。Rust 侧通过 Tauri command 暴露，前端通过 `src/lib/tauri.ts` 的 wrapper 调用。

`send_message` 是唯一的流式接口。它通过 `Channel<ChatEvent>` 回传 `chunk`、`done`、`error` 三种事件，不存在其他事件类型。

## API 参考

### `send_message`

Rust command: `send_message(session_id: String, content: String, on_event: Channel<ChatEvent>) -> Result<(), String>`

前端 wrapper: `sendMessage(sessionId: string, content: string, onEvent: Channel<ChatEvent>): Promise<void>`

用途：
- 向指定会话发送一条用户消息，并接收流式响应。

输入：
- `session_id` / `sessionId`：会话 ID。
- `content`：用户输入内容。
- `on_event` / `onEvent`：流式事件通道。

输出：
- 成功时返回 `()`。
- 失败时返回 `String` 错误信息。

事件：
- `chunk`：`{ index: number; content: string }`
- `done`：`{ totalTokens: number }`
- `error`：`{ message: string }`

要点：
- 先校验 session ID。
- 依赖当前 active provider；未配置时直接报错。
- 用户消息会先写入会话记录，再发起流式调用。
- 如果事件通道关闭，调用会返回取消错误。

### `list_sessions`

Rust command: `list_sessions() -> Result<Vec<SessionInfo>, String>`

前端 wrapper: `listSessions(): Promise<SessionInfo[]>`

返回字段：
- `id: string`
- `title: string | null`
- `message_count: usize`
- `updated_at: u64`

用途：
- 获取当前保存的会话列表。

### `create_session`

Rust command: `create_session() -> Result<String, String>`

前端 wrapper: `createSession(): Promise<string>`

用途：
- 创建一个新的会话 ID。

要点：
- 当前实现由时间戳、进程 ID 和递增序号拼接生成。

### `delete_session`

Rust command: `delete_session(session_id: String) -> Result<(), String>`

前端 wrapper: `deleteSession(sessionId: string): Promise<void>`

用途：
- 删除指定会话的 transcript 和 meta 文件。

### `get_session_messages`

Rust command: `get_session_messages(session_id: String) -> Result<Vec<MessageInfo>, String>`

前端 wrapper: `getSessionMessages(sessionId: string): Promise<MessageInfo[]>`

返回字段：
- `role: string`
- `content: string`

用途：
- 读取指定会话的消息列表。

要点：
- `role` 当前映射为 `user`、`assistant` 或 `unknown`。

### `delete_message`

Rust command: `delete_message(session_id: String, pair_index: usize) -> Result<(), String>`

前端 wrapper: `deleteMessage(sessionId: string, pairIndex: number): Promise<void>`

用途：
- 删除指定会话中一组用户/助手消息对。

要点：
- `pair_index` 是按消息对计数的索引，从 `0` 开始。
- 只删除消息事件，`Clear` 等非消息事件会被跳过。
- 如果索引超出范围，会返回错误。

### `clear_session`

Rust command: `clear_session(session_id: String) -> Result<(), String>`

前端 wrapper: `clearSession(sessionId: string): Promise<void>`

用途：
- 清空会话内容。

要点：
- 当前实现是追加一个 `Clear` 事件，不是删除会话文件。

## 基本用法

```ts
import { Channel } from "@tauri-apps/api/core";
import { createSession, sendMessage, type ChatEvent } from "@/lib/tauri";

const sessionId = await createSession();
const events = new Channel<ChatEvent>();

events.onmessage = (event) => {
  if (event.event === "chunk") {
    console.log(event.data.index, event.data.content);
  }
};

await sendMessage(sessionId, "你好", events);
```

## 典型场景

- 新建对话后先调用 `create_session`，再用 `send_message` 发送第一条消息。
- 打开历史页时先用 `list_sessions`，再用 `get_session_messages` 还原单个会话内容。
- 删除某一轮问答时用 `delete_message`，按 pair 维度删除对应用户/助手消息。
- 需要重置当前会话上下文时用 `clear_session`，但保留会话文件本身。
- 用户明确要彻底移除一条会话时用 `delete_session`。

## 注意事项

- 这组 API 只公开 `chunk`、`done`、`error` 三种流式事件，不要假设还有别的事件类型。
- `send_message` 依赖当前 active provider；如果没配置 provider，会直接失败。
- `session_id` 会先做格式校验，非法值会被拒绝。
- `delete_message` 不是按单条消息删除，而是按用户/助手消息对删除。
- `clear_session` 和 `delete_session` 的语义不同：前者写入清空事件，后者删除文件。

## 相关条目

- [src/lib/tauri.ts](/E:/Coding/AI/j-gui/src/lib/tauri.ts)
- [src-tauri/src/commands/chat.rs](/E:/Coding/AI/j-gui/src-tauri/src/commands/chat.rs)
- [src-tauri/src/chat_engine.rs](/E:/Coding/AI/j-gui/src-tauri/src/chat_engine.rs)
