---
doc_type: audit-finding
audit: business-logic-review
id: F-10
nature: maintainability
severity: P2
confidence: low
recommendation: cs-refactor
---

# F-10: parse_sdk_line 仅处理首个 content block — 多 block 被静默丢弃

## 位置

`src-tauri/src/agent_engine.rs:163-178` — `parse_sdk_line` function

## 证据

```rust
// agent_engine.rs:163-178
if let Some(items) = content.as_array() {
    for item in items {
        match item["type"].as_str() {
            Some("text") => {
                // returns immediately — ignores remaining blocks
                return AgentEvent::AssistantContent { ... };
            }
            Some("tool_use") => {
                // returns immediately — ignores remaining blocks
                return AgentEvent::ToolUse { ... };
            }
            _ => {}
        }
    }
}
```

当前 Claude Code `--include-partial-messages` 模式下，每行 JSON 只含一个 content block（增量式推送），所以**当前不会触发**。但若协议未来变化或同一行包含 text + tool_use，第二个 block 被静默丢弃。

## 影响

- 当前零影响——SDK 行为保证单 block 单行
- 代码结构脆弱——协议格式的微小变化会导致功能静默失效（不报错、日志不可见）

## 修复建议

收集所有 blocks 而非 return on first match：
```rust
let mut events = Vec::new();
for item in items {
    match item["type"].as_str() {
        Some("text") => events.push(AgentEvent::AssistantContent { ... }),
        Some("tool_use") => events.push(AgentEvent::ToolUse { ... }),
        _ => {}
    }
}
// Return first, or change AgentEvent to support multiple per line
```

但当前 Channel 单事件架构不支持一行发多个事件，所以另一个选项：如果遇到多个 blocks，至少 log warning 而非静默。

## 修复记录 (2026-05-08)

**已实施**：三项改动：

1. `parse_sdk_line` 返回类型改为 `Vec<AgentEvent>`（`agent_engine.rs:173`）—— 支持一行产出多个事件
2. `parse_assistant_event` 收集所有 blocks 到 `Vec` 而非首次 match 即 return（`agent_engine.rs:208-248`）
3. 多 block 时 `eprintln!` 警告（`agent_engine.rs:237-244`）：`block_count > 1` 触发
4. stdout reader 遍历事件列表逐个发送（`agent_engine.rs:83-89`）

另外新增测试 `parse_sdk_line_keeps_all_assistant_blocks` 验证一行含 tool_use + text 两者都被保留。

**验证**：cargo test 7 passed ✅ | clippy -D warnings 0 error ✅
