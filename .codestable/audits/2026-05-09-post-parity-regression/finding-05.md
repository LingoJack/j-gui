---
doc_type: audit-finding
audit: 2026-05-09-post-parity-regression
finding_id: "bug-05"
nature: bug
severity: P1
confidence: medium
suggested_action: cs-issue
status: open
---

# Finding 05：parse_sdk_line 对未知消息类型静默丢弃，不产生 Error 事件

## 速答

`agent_engine.rs:362-365` 的 `parse_sdk_line` 对未知 `msg_type` 执行 `_ => Vec::new()`，静默丢弃不认识的 JSON 行。如果 Claude CLI 变更输出格式或出现非预期的消息类型，前端不会收到任何错误提示，用户看到的就是"没有反应"。

## 关键证据

- `agent_engine.rs:362-365` — `_ => Vec::new()` 丢弃所有未识别消息类型
- 对比 `agent_engine.rs:334-339` — JSON 解析失败会返回 Error 事件，但格式不匹配则静默
- `agent_engine.rs:357-361` — `"system"` 和 `"stream_event"` 类型也被静默过滤

## 影响

Claude CLI 输出格式偏差、新版本引入新消息类型时，Agent 静默无响应，用户不清楚是前端问题还是 CLI 问题。当前 Chat 无回复 bug 可能与此相关。

## 修复方向

1. `_ => Vec::new()` 改为 `eprintln!("[warn] parse_sdk_line: unknown msg_type: {}", msg_type)`
2. 对 `"system"` 和 `"stream_event"` 也加可选的调试日志
