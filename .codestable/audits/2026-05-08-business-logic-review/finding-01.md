---
doc_type: audit-finding
audit: business-logic-review
id: F-01
nature: bug
severity: P1
confidence: high
recommendation: cs-issue
---

# F-01: parse_sdk_line 未处理 "user" 类型消息 — ToolResult 事件永不被触发

## 位置

`src-tauri/src/agent_engine.rs:158-187` — `parse_sdk_line` 函数

## 证据

```rust
// agent_engine.rs:158-187
match msg_type {
    "assistant" => { ... }
    "result" => {
        let tokens = v["total_tokens"].as_u64().unwrap_or(0) as u32;
        AgentEvent::Done { total_tokens: tokens }
    }
    _ => AgentEvent::Error { message: format!("未知消息类型: {}", msg_type) },
}
```

只匹配了 `"assistant"` 和 `"result"` 两种消息类型。`"user"` 类型（携带工具执行结果）命中 `_` 通配分支，输出 `AgentEvent::Error`。

## 影响

- **AgentEvent::ToolResult 变体永远不被构造**（`agent_engine.rs:14` — 整个变体是死代码）
- 前端 `AgentView.tsx:89-104` 的 `case "toolResult"` 永远不执行
- 工具调用卡片 (`ToolCallDisplay`) 停留在 `status: "running"` 状态无输出内容
- 只有 `Done` 事件到达时（`AgentView.tsx:109-128`），running 状态的 toolCall 被批量标记为 `done`，但仍无输出内容

## 根因

`bypassPermissions` 模式下，Claude Code CLI 自行处理工具执行，**工具结果可能以内联形式出现在后续 assistant 消息中，而不是作为独立 "user" 消息发送到 stdout**。原始的 AgentEvent 设计假设了权限审批 + 独立 tool_result 消息的交互模式，但这个路径在当前 CLI 参数组合下不存在。

## 修复建议

两个方向：
1. **若保留 bypassPermissions**：删除 ToolResult/PermissionRequest 的死代码（见 F-08），在 ToolUse 事件后直接标记为 done（工具由 CLI 内部处理完成）
2. **若需要展示工具输出**：切换为 `--permission-mode default`，处理完整的 stdin 权限交互流，并补齐 parse_sdk_line 对 "user" 类型 tool_result 的解析

## 修复记录 (2026-05-08)

**已实施**：新增 `parse_user_event()` 函数（`agent_engine.rs:250-269`），从 "user" 类型消息的 content blocks 中提取 `tool_result` → `AgentEvent::ToolResult { tool_id, content }`。

同时将 `parse_sdk_line` 返回类型从单个 `AgentEvent` 改为 `Vec<AgentEvent>`，支持一行 JSON 产出多个事件。主 match 新增 `"user" => parse_user_event(&v)` 分支（`agent_engine.rs:203`）。

测试覆盖（`parse_sdk_line_keeps_all_assistant_blocks`）：验证单行含 tool_use + text 时两者都被产出。

**验证**：cargo test 7 passed ✅ | cargo clippy -D warnings 0 error ✅
