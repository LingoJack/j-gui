---
doc_type: audit-finding
audit: 2026-05-11-roadmap-completeness
finding_id: "08"
severity: P2
category: bug
confidence: medium
suggested_action: cs-issue
files: [src-tauri/src/chat_engine.rs]
---

# Finding 08: delete_message 先加锁后校验

## 位置

`src-tauri/src/chat_engine.rs:256-264`

## 证据

```rust
// delete_message — 先加锁，后验证
pub fn delete_message(&self, session_id: &str, pair_index: usize) -> Result<()> {
    let _lock = SESSION_WRITE_LOCK.lock().unwrap();                       // line 257 — 先加锁
    // ...
    validate_session_id(session_id)?;                                      // line 260 — 后验证
```

对比其他方法：

```rust
// clear_session — 先验证，后加锁
pub fn clear_session(&self, session_id: &str) -> Result<()> {
    validate_session_id(session_id)?;                                      // 先验证
    let _lock = SESSION_WRITE_LOCK.lock().unwrap();                       // 后加锁

// delete_session — 先验证，后加锁
pub fn delete_session(&self, session_id: &str) -> Result<()> {
    validate_session_id(session_id)?;                                      // 先验证
    let _lock = SESSION_WRITE_LOCK.lock().unwrap();                       // 后加锁
```

## 分析

`delete_message` 是唯一一个先获取全局写锁、再校验输入的方法。如果传入无效 session_id，会不必要地阻塞所有其他会话的写操作。这不是安全问题（无效输入最终仍会被拒绝），但顺序不一致且影响锁竞争。

## 建议

开 `cs-issue`：将 `validate_session_id(session_id)?;` 移到 `SESSION_WRITE_LOCK.lock()` 之前，与其他方法保持一致。
