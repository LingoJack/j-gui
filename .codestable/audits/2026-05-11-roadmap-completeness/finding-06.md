---
doc_type: audit-finding
audit: 2026-05-11-roadmap-completeness
finding_id: "06"
severity: P1
category: bug
confidence: high
suggested_action: cs-issue
files: [src-tauri/src/agent_session.rs]
---

# Finding 06: agent_session.rs 生产代码中有 unwrap() 调用

## 位置

- `src-tauri/src/agent_session.rs:113` — `serde_json::to_string(&meta).unwrap()`
- `src-tauri/src/agent_session.rs:297` — `serde_json::to_string(&v).unwrap()`

## 证据

```rust
// agent_session.rs:113 (append_timeline_item 内)
let line = serde_json::to_string(&item)? + "\n";
let meta = json!({"title": title.to_owned()});
let meta_str = serde_json::to_string(&meta).unwrap();  // ← panic 风险

// agent_session.rs:297 (update_session_title 内)
let meta = json!({"title": title});
let meta_json = serde_json::to_string(&v).unwrap();  // ← panic 风险
```

## 分析

这两个 `unwrap()` 的参数是从 `serde_json::json!()` 宏构造的简单 JSON 对象（仅包含字符串字段），在当前实践中不会序列化失败。但 CLUADE.md 明确要求"禁止 `unwrap()`/`expect()` 在库代码中使用"。

## 影响

如果 serde_json 内部状态异常（极少见但理论上可能），会导致进程 panic。运行时可靠性风险低（JSON 结构极简单），但违反编码规约。

## 建议

开 `cs-issue`：替换为 `.map_err(|e| anyhow::anyhow!("序列化失败: {}", e))?`，或使用 `?` 传播错误。
