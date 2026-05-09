---
doc_type: audit-finding
audit: 2026-05-09-full-scope
finding_id: "bug-02"
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 02：delete_message 与 send_message 并发可能导致消息丢失

## 速答

`chat_engine.rs` 的 `delete_message` 用 `DELETE_LOCK` 互斥删除操作，但 `send_message` 路径中的 `append_session_event` 不持有该锁。如果 delete 的 read→write 之间 send 追加了新行，delete 的重写会丢弃这些新行。

## 关键证据

- `src-tauri/src/chat_engine.rs:165-212` — `delete_message` 获取 `DELETE_LOCK` → 读整个 transcript → 移除指定行 → 写回整个文件
- `src-tauri/src/chat_engine.rs:73` — `send_message` 中 `append_session_event(&session_id, &SessionEvent::msg(...))` 不获取 `DELETE_LOCK`
- `src-tauri/src/chat_engine.rs:13` — `static DELETE_LOCK: Mutex<()> = Mutex::new(())` 仅用于删除互斥

并发场景：用户在流式接收 LLM 回复时删除了之前的某对消息。`delete_message` 在读取 transcript 时取得锁，但 `append_session_event`（由 j_cli 调用）可能在此期间追加了新的 assistant 消息行。delete 写回时不包含这些新行。

## 影响

偶尔丢失一条 assistant 消息（仅当删除操作与流式接收并发时触发）。丢失后 transcript 中 user 和 assistant 消息不成对，后续 `delete_message` 的 pair_index 计算可能错误。

## 修复方向

让 transcript 所有写操作（append + delete）共享同一个锁，或改为按行标记删除而非全量重写。

## 建议动作

`cs-issue`，涉及并发数据完整性。
