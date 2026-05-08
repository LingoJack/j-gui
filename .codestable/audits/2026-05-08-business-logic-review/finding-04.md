---
doc_type: audit-finding
audit: business-logic-review
id: F-04
nature: bug
severity: P2
confidence: medium
recommendation: cs-issue
---

# F-04: delete_message 存在 TOCTOU 竞态

## 位置

`src-tauri/src/chat_engine.rs:162-208` — `delete_message` 方法

## 证据

```rust
// chat_engine.rs:170-204
let content = std::fs::read_to_string(&transcript_path)?;   // 读
// ... 解析行号 ...
let new_content: String = content.lines()...collect();       // 基于旧内容构造新内容
std::fs::write(&transcript_path, new_content)?;              // 写（可能覆盖其他写入）
```

两个 `delete_message` 调用并发执行时：
1. 线程 A 读到文件（含 10 条消息）
2. 线程 B 读到文件（含 10 条消息）
3. 线程 A 删除第 0-1 行，写入（8 条消息）
4. 线程 B 基于旧行号删除第 2-3 行，写入 → 线程 A 的删除被覆盖

## 影响

- 文件级数据竞争——并发删除后会话文件损坏或丢失消息
- 实际触发概率低：单用户桌面应用很少并发操作同一 session
- 无数据恢复机制

## 修复建议

对同一 session 的写入操作加文件锁（`fs2::FileExt` 或 `std::fs::File::lock_exclusive`），或改为追加式日志（只追加不覆盖删除——删除改为写逻辑删除标记）。

## 修复记录 (2026-05-08)

**已实施**：新增静态 `Mutex` 串行化 `delete_message` 调用：
- `chat_engine.rs:9`: `use std::sync::Mutex;`
- `chat_engine.rs:13`: `static DELETE_LOCK: Mutex<()> = Mutex::new(());`
- `chat_engine.rs:166`: `let _lock = DELETE_LOCK.lock().map_err(|e| format!("锁定失败: {}", e))?;` — 在方法入口获取锁

**验证**：cargo clippy -D warnings 0 error ✅
