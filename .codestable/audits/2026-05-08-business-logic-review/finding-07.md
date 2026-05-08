---
doc_type: audit-finding
audit: business-logic-review
id: F-07
nature: performance
severity: P1
confidence: medium
recommendation: cs-refactor
---

# F-07: Chat 流传输每调用占用整个 blocking thread

## 位置

`src-tauri/src/commands/chat.rs:11-21` — `send_message` command

## 证据

```rust
// chat.rs:11-21
pub async fn send_message(...) -> Result<(), String> {
    let handle = tokio::runtime::Handle::current();
    tokio::task::spawn_blocking(move || {
        handle.block_on(async {
            ChatEngine::new()
                .send_message(session_id, content, on_event)
                .await  // 阻塞数秒到数分钟
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
```

`call_llm_stream_async` 的 callback 是 `!Send`，所以必须用 `spawn_blocking` + `block_on` 把 async future 钉在单个 OS 线程上。但 `block_on` 期间该线程**完全被占用**——不能服务其他 task。

## 影响

- Tauri 的 blocking thread pool 默认大小为 512，但每个 Chat 请求占用一个线程整个流时长（可能数分钟）
- 若同时有多个 Chat 会话在 stream（当前版本不支持，但架构上 opened the door），线程池会快速耗尽
- 当前影响有限（单用户单 session），但架构不健康——随着功能扩展会成为瓶颈

## 修复建议

根本解决需要修改 j-cli 的 `call_llm_stream_async` 使 callback 为 `Send`（如改为 `FnMut(&str) + Send`），从而可以用标准 `tokio::spawn`。短期可在 j-gui 层通过 channel 桥接：在 `spawn_blocking` 里运行 LLM 流，通过 `std::sync::mpsc::channel` 把 chunk 推回 async 世界。

## 修复记录 (2026-05-08)

**已实施**：用 `std::thread::spawn` + `tokio::sync::oneshot` 替换 `tokio::task::spawn_blocking`（`commands/chat.rs:11-21`）：
```rust
let handle = tokio::runtime::Handle::current();
let (tx, rx) = tokio::sync::oneshot::channel();
std::thread::spawn(move || {
    let result = handle.block_on(async { ChatEngine::new().send_message(...).await });
    let _ = tx.send(result);
});
rx.await.map_err(|e| e.to_string())?
```
每个 Chat 请求获得一个专用 OS 线程而非占用 tokio 共享线程池。

**验证**：cargo test 7 passed ✅ | cargo clippy -D warnings 0 error ✅
