---
doc_type: audit-finding
audit: 2026-05-11-roadmap-completeness
finding_id: "12"
severity: P2
category: arch-drift
confidence: high
suggested_action: cs-arch
files: [.codestable/architecture/ARCHITECTURE.md, .codestable/architecture/backend-chat-engine.md]
---

# Finding 12: STOPPED_SESSIONS 文档标注 TODO 但实际已实现

## 位置

- ARCHITECTURE.md:275 — "当前为 TODO 半完成态"
- backend-chat-engine.md:56 — "当前：TODO，callback 内有 cancelled 占位机制"
- backend-chat-engine.md:189 — "此集成尚为 TODO"

## 证据

代码中 `is_session_stopped()` 已完全集成：

```rust
// chat_engine.rs:161 — 流式回调中主动轮询
if crate::commands::chat::is_session_stopped(&session_id) {
    log::info!("检测到停止请求，中止流式传输: {}", session_id);
    break;
}

// chat_engine.rs:180,190,194 — 所有退出路径调用 clear_stopped_session
crate::commands::chat::clear_stopped_session(&session_id);
```

`is_session_stopped` 和 `clear_stopped_session` 均**未**标记 `#[allow(dead_code)]`。停止机制通过 STOPPED_SESSIONS 标志 + Channel drop 双重实现。

## 建议

开 `cs-arch update`：将文档中的 "TODO" 更新为"已实现——通过 STOPPED_SESSIONS 标志 + Channel drop 双重取消机制"。
