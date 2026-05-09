---
doc_type: audit-finding
audit: 2026-05-09-full-scope
finding_id: "performance-09"
nature: performance
severity: P1
confidence: medium
suggested_action: cs-refactor
status: open
---

# Finding 09：agent_session 更新操作全量读写 transcript，O(n) 每更新

## 速答

`update_tool_call_result` 和 `update_interrupt_response` 每次调用都读取整个 transcript 文件、在内存中修改一条、再完整写回。对于长 Agent 会话（数百条 tool call），单次更新的 I/O 成本与 session 长度成正比。

## 关键证据

- `src-tauri/src/agent_session.rs:118-128` — `read_timeline` 将整个 JSONL 读入 `String`，逐行解析为 `Vec<AgentTimelineItem>`
- `src-tauri/src/agent_session.rs:131-139` — `write_timeline` 逐条序列化后全量写回
- `src-tauri/src/agent_session.rs:146-157` — `update_tool_call_result` 调用 read → 遍历查找 → write
- `src-tauri/src/agent_session.rs:164-174` — `update_interrupt_response` 同样模式

虽然 JSONL 每行独立，但更新任意一行都需要完整重写整个文件（因为没有原地修改机制）。对于频繁 tool call 的 Agent 会话，这造成不必要的 I/O 放大。

## 影响

Agent 会话越长，每次 tool call 的 transcript 写入越慢。对于 100+ tool call 的会话，单次更新从 sub-ms 退化到 ~ms 级。在 spinning disk 上更明显。主要影响是 I/O 浪费而非用户可感知延迟，因为写入在后台线程进行。

## 修复方向

改为 append-only 模型——每次更新追加新行而非重写全文件，读取时合并最新状态。或使用 SQLite 替代 JSONL。

## 建议动作

`cs-refactor`，涉及存储层优化但不改变行为。
