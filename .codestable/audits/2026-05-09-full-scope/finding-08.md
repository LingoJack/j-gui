---
doc_type: audit-finding
audit: 2026-05-09-full-scope
finding_id: "security-08"
nature: security
severity: P2
confidence: low
suggested_action: cs-issue
status: fixed
---

# Finding 08：JSON 解析失败用 unwrap_or("") 吞没错误，掩盖数据完整性问题

## 速答

多处 SDK 消息解析使用 `unwrap_or("")` 处理缺失字段，将解析异常静默转为空字符串。如果 Claude CLI 输出格式变更或数据损坏，这些位置不会产生错误日志，前端收到空字段但不清楚原因。

## 关键证据

- `src-tauri/src/agent_engine.rs:310` — `v["type"].as_str().unwrap_or("")` 决定消息分发
- `src-tauri/src/agent_engine.rs:352` — `item["id"].as_str().unwrap_or("")` 生成空 tool_id
- `src-tauri/src/agent_engine.rs:353` — `item["name"].as_str().unwrap_or("")` 生成空 tool_name

空字符串作为 tool_id/tool_name 会传播到前端 ToolCallDisplay，渲染为空白的工具调用卡片，用户看到 UI 异常但不清楚原因。

## 影响

低概率触发（需要 Claude CLI 输出非预期格式）。触发后影响用户体验（空白工具调用卡片），不影响数据安全。

## 修复方向

对关键字段（type、id、name）在 `unwrap_or` 位置加 `eprintln!` 日志，或返回 Error 事件而非静默继续。

## 建议动作

`cs-issue`，低优先级但属于防御性编程改进。
