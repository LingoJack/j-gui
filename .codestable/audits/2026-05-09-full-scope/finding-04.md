---
doc_type: audit-finding
audit: 2026-05-09-full-scope
finding_id: "bug-04"
nature: bug
severity: P2
confidence: medium
suggested_action: cs-issue
status: open
---

# Finding 04：AgentEngine::Drop 无条件杀子进程，可能丢失未持久化数据

## 速答

`AgentEngine::Drop` 直接调用 `close()`，后者 `kill()` 子进程后 `join()` 线程。如果 AgentEngine 因 panic unwind 或意外 drop 被销毁，stdout 线程中尚未处理的流式事件会丢失——既没发送到前端，也没写入 transcript。

## 关键证据

- `src-tauri/src/agent_engine.rs:294-298` — `impl Drop for AgentEngine { fn drop(&mut self) { self.close(); } }`
- `src-tauri/src/agent_engine.rs:253-271` — `close()` 先 drop stdin（触发 CLI 退出），再 kill 进程，最后 join 线程

`close()` 的顺序是 stdin→kill→join，这意味着子进程收到 stdin close 后可能还有缓冲的输出。kill 会立即终止进程，可能丢掉最后几条 JSON 行。join 只等线程结束，不检查 stdout 缓冲区是否读空。

## 影响

AgentEngine 意外销毁时（如 Tauri state 被替换、组件 unmount 时序问题），最后几条 agent 消息可能丢失。正常通过 `stop_agent` Tauri 命令调用 `close()` 也一样。

## 修复方向

在 kill 之前等待子进程自然退出（设置超时），或在 close 前 flush stdin 并给子进程一个 grace period。

## 建议动作

`cs-issue`，风险低但涉及数据完整性。
