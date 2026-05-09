---
doc_type: audit-finding
audit: 2026-05-09-full-scope
finding_id: "bug-01"
nature: bug
severity: P0
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 01：transcript 竞态——update_tool_call_result 和 update_interrupt_response 无协调

## 速答

`agent_session.rs` 的两个更新函数都在独立线程中执行 read-modify-write，没有文件级锁协调。stdout 线程写 tool_result 的同时，Tauri 命令线程可能写 interrupt_response，后者覆盖前者导致 tool_result 丢失。

## 关键证据

- `src-tauri/src/agent_session.rs:146-157` — `update_tool_call_result` 调用 `read_timeline`（读全文件）→ 内存修改 → `write_timeline`（写全文件）
- `src-tauri/src/agent_session.rs:164-174` — `update_interrupt_response` 同样模式：read → modify → write
- `src-tauri/src/agent_engine.rs:177` — stdout 线程调用 `update_tool_call_result`（`let _ = agent_session::update_tool_call_result(...)`）
- `src-tauri/src/commands/agent.rs:54` — Tauri 命令线程调用 `respond_agent_interrupt` → `engine.respond_interrupt()` → `update_interrupt_response`

两个调用路径在不同线程中执行，无任何锁或 channel 串行化。如果一个 ToolResult 和被审批的 Interrupt 同时到达，后执行的 `write_timeline` 会完全覆盖先执行的修改。

## 影响

Agent 会话的 transcript.jsonl 可能损坏——tool_result 或 interrupt_response 丢失。表现为前端审批后 tool 状态卡在 "running"，或 tool 输出不显示。触发条件：用户在 Agent 对话中审批 permission 的同时，恰好有其他 tool 的 result 到达。

## 修复方向

将 transcript 的读写操作串行化——可以用 `Arc<Mutex<()>>` 保护所有 transcript 文件操作，或将所有 transcript 更新通过 mpsc channel 发送到单个后台写线程。

## 建议动作

`cs-issue`，因为涉及数据完整性 bug，需分析 → 方案选择 → 修复 → 验证闭环。
