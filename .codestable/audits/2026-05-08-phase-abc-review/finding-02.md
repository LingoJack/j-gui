---
doc_type: audit-finding
audit: phase-abc-review
id: F-02
nature: performance
severity: P2
confidence: medium
recommendation: cs-refactor
---

# F-02: list_agent_sessions reads full transcript to count lines

## 位置

`src-tauri/src/agent_session.rs:197-204`

## 证据

```rust
let message_count = if transcript_path.exists() {
    std::fs::read_to_string(&transcript_path)
        .map(|c| c.lines().filter(|l| !l.is_empty()).count())
        .unwrap_or(0)
} else {
    0
};
```

`read_to_string` 将整个 transcript 文件读入内存，仅为了数行数。长会话（数百轮 Agent 对话，含大量 tool_call JSON）会产生数 MB 的 transcript 文件。

## 影响

- 列出 10 个 agent 会话时，可能读取数十 MB 数据进内存
- 实际触发概率低——当前数据量小，但随着使用增长会线性恶化

## 修复建议

```rust
use std::io::{BufRead, BufReader};
let message_count = if transcript_path.exists() {
    std::fs::File::open(&transcript_path)
        .ok()
        .map(|f| BufReader::new(f).lines().count())
        .unwrap_or(0)
} else { 0 };
```
