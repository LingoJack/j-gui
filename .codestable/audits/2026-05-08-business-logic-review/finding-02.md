---
doc_type: audit-finding
audit: business-logic-review
id: F-02
nature: bug
severity: P1
confidence: high
recommendation: cs-issue
---

# F-02: AgentEngine.close() 在 kill 前 join reader 线程 — 可无限挂死

## 位置

`src-tauri/src/agent_engine.rs:125-142` — `AgentEngine::close` 方法

## 证据

```rust
// agent_engine.rs:125-142
pub fn close(&mut self) {
    if let Some(stdin) = self.stdin.take() {
        drop(stdin);           // Step 1: close stdin pipe
    }
    // Step 2: join reader threads — BLOCKS HERE if stdout still producing
    if let Some(handle) = self.stdout_thread.take() {
        let _ = handle.join(); // ⚠️ 可能无限阻塞
    }
    if let Some(handle) = self.stderr_thread.take() {
        let _ = handle.join();
    }
    // Step 3: kill process — NEVER REACHED if Step 2 hangs
    if let Some(mut process) = self.process.take() {
        let _ = process.kill();
        let _ = process.wait();
    }
}
```

stdout reader 线程的 `BufReader::lines()` 是**阻塞读**——它在子进程持续输出时会一直等在 `read()` 上。关闭 stdin 向子进程发 EOF，但子进程可能不立即退出（尤其是正在执行工具调用时）。在子进程退出前，stdout 线程的 `lines()` 迭代器不会返回 `None`，`join()` 会无限阻塞。

## 影响

- 用户在 Agent 正执行工具时关闭窗口 → `Drop::drop` 调用 `close()` → 线程卡死在 `join()`
- 用户点"新建"或切换模式 → UI 卡死
- 最坏情况：必须杀进程才能恢复

## 根因

操作顺序错误：应该**先 kill 进程再 join 线程**。kill 后子进程 stdout/stderr 管道被打破，reader 线程的 `lines()` 会收到 broken pipe 或 EOF，自然退出。

## 修复建议

```rust
pub fn close(&mut self) {
    drop(self.stdin.take());
    // Kill first — this unblocks reader threads
    if let Some(mut process) = self.process.take() {
        let _ = process.kill();
        let _ = process.wait();
    }
    // Now join — reader threads will exit promptly
    if let Some(handle) = self.stdout_thread.take() {
        let _ = handle.join();
    }
    if let Some(handle) = self.stderr_thread.take() {
        let _ = handle.join();
    }
}
```

## 修复记录 (2026-05-08)

**已实施**：调整 `close()` 顺序（`agent_engine.rs:131-143`），先 `process.kill()` → `process.wait()`，再 `handle.join()`。注释标注了顺序理由。

**验证**：cargo clippy -D warnings 0 error ✅ | 逻辑审查确认线程不再可无限阻塞 ✅
