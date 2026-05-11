---
doc_type: audit-finding
audit: 2026-05-11-roadmap-completeness
finding_id: "11"
severity: P2
category: maintainability
confidence: high
suggested_action: cs-refactor
files: [src-tauri/src/agent_engine.rs, src-tauri/src/chat_engine.rs, src-tauri/src/commands/channels.rs, src-tauri/src/commands/agent.rs]
---

# Finding 11: 魔法值 — 多处理应提取的硬编码常量

## 1. 优雅退出宽限期 500ms

`src-tauri/src/agent_engine.rs:387` — `std::thread::sleep(std::time::Duration::from_millis(500))`

应提取为 `const CLAUDE_GRACE_PERIOD_MS: u64 = 500;`

## 2. 日志截断长度

- `agent_engine.rs:463` — `line.len().min(200)`
- `agent_engine.rs:492` — `line.len().min(120)`

应提取为 `LOG_LINE_TRUNCATE_SDK` / `LOG_LINE_TRUNCATE_UNKNOWN`。

## 3. 硬编码模型默认值

`src-tauri/src/commands/channels.rs:337-339` — `"claude-3-5-sonnet-20241022"` 和 `"gpt-3.5-turbo"`

当没有指定模型时的回退值。这些模型 ID 会过时。应添加注释说明回退意图。

## 4. generate_agent_title 中的魔法值

`src-tauri/src/commands/agent.rs:273,284,291` — fallback 标题截断 `30` 字符、LLM 提示"max 10 words"、`max_tokens: 30`

三个互不关联的魔法值，应提取为命名常量。

## 5. chat_engine 中 total_tokens 恒为 0

`src-tauri/src/chat_engine.rs:189` — `let _ = on_event.send(ChatEvent::Done { total_tokens: 0 })`

架构文档标注为已知简化。应提取为 `const TOKEN_COUNT_UNSUPPORTED: u32 = 0;` 自文档化。

## 建议

开 `cs-refactor`：逐项提取命名常量。CLAUDE.md 已要求"魔法值提取为 const"。
