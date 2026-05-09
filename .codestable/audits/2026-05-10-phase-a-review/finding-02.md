---
doc_type: audit-finding
finding_id: 02
title: "files.rs: save_attachment 路径穿越风险"
severity: P1
nature: security
confidence: high
suggested_action: cs-issue
---

## Evidence

`src-tauri/src/commands/files.rs:71-89`
```rust
pub fn save_attachment(args: SaveAttachmentArgs) -> Result<SaveAttachmentResult, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&args.data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let dir = attachments_dir();
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create attachments directory: {}", e))?;

    let file_path = dir.join(&args.file_name);  // 无路径穿越防护
    fs::write(&file_path, &bytes)
```

`args.file_name` 直接拼接路径，未做清理。若传入 `../../../Windows/System32/evil.dll`，文件将写入附件目录外的任意位置。

## Fix

使用 `PathBuf::file_name()` 提取纯文件名，或验证规范化后的路径仍在 `attachments_dir()` 之内。
