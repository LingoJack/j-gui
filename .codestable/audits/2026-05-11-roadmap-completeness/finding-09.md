---
doc_type: audit-finding
audit: 2026-05-11-roadmap-completeness
finding_id: "09"
severity: P2
category: maintainability
confidence: high
suggested_action: cs-refactor
files: [src-tauri/src/kernel/adapter.rs, src-tauri/src/commands/governance.rs, src-tauri/src/commands/settings.rs, src-tauri/src/commands/channels.rs, src-tauri/src/commands/config.rs]
---

# Finding 09: 代码重复 — 3 组重复逻辑

## 1. home_dir() 存在 3 份独立实现

| 文件 | 行号 |
|------|------|
| `kernel/adapter.rs` | 724-737 |
| `commands/governance.rs` | 13-22 |
| `commands/settings.rs` | 24-37 |

三处都实现相同的 `#[cfg(target_os = "windows")]` / `USERPROFILE` / `HOME` 逻辑。如果路径解析策略变化，三处需同步更新。

## 2. parse_skill_frontmatter() 存在 2 份独立实现

| 文件 | 行号 |
|------|------|
| `kernel/adapter.rs` | 755-777 |
| `commands/governance.rs` | 356-383 |

完全相同的 frontmatter 解析逻辑（检查 `---` 开头行，提取 `name` 和 `description`）。两处独立维护，存在解析逻辑分叉风险。

## 3. mask_key() 存在 2 份实现

| 文件 | 行号 |
|------|------|
| `commands/config.rs` | 212-223 |
| `commands/channels.rs` | 426-437 |

相同的 API key 掩码逻辑（首 4 字符 + `...` + 末 4 字符）。

## 建议

开 `cs-refactor`：将 3 组重复函数提取到共享位置：
- `home_dir()` → `kernel/types.rs` 或新的 `kernel/util.rs`
- `parse_skill_frontmatter()` → 同上
- `mask_key()` → 同上
