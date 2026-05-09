---
doc_type: audit-finding
finding_id: 03
title: "files.rs: read_attachment 任意文件读取"
severity: P1
nature: security
confidence: high
suggested_action: cs-issue
---

## Evidence

`src-tauri/src/commands/files.rs:91-96`
```rust
pub fn read_attachment(local_path: String) -> Result<String, String> {
    let data = fs::read(&local_path)  // 任意路径可读
        .map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&data))
}
```

`local_path` 未经路径校验直接读取。前端可传入任意系统路径（如 `~/.ssh/id_rsa`），后端会读取并以 base64 返回。

## Fix

验证 `local_path` 规范化后以 `attachments_dir()` 为前缀，拒绝越界读取。
