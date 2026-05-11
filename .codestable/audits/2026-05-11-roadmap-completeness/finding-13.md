---
doc_type: audit-finding
audit: 2026-05-11-roadmap-completeness
finding_id: "13"
severity: P1
category: arch-drift
confidence: high
suggested_action: cs-arch
files: [.codestable/architecture/ARCHITECTURE.md, src-tauri/src/commands/settings.rs]
---

# Finding 13: ARCHITECTURE.md 中 Unix 数据目录路径不一致

## 位置

- ARCHITECTURE.md:137 — 写 `~/.j-gui/` (Unix)（带破折号 ❌）
- ARCHITECTURE.md:159 — 写 `~/.jgui/`（无破折号 ✅）
- `src-tauri/src/commands/settings.rs:35` — 代码使用 `~/.jgui/`（无破折号）

## 证据

ARCHITECTURE.md 第 137 行：
> GUI 独有配置（主题/窗口/快捷键）：走 `%APPDATA%/j-gui/` 独立路径

在同一文档的第 159 行却是正确的：
> GUI 配置与附件由 `src-tauri/src/commands/settings.rs` 管理（`%APPDATA%/j-gui/` 或 `~/.jgui/`）。

代码实现使用的是 `.jgui`（无破折号）。

## 影响

文档第 137 行的错误路径可能误导开发者，文档内部也存在不一致。不直接影响代码行为。

## 建议

开 `cs-arch update`：将 ARCHITECTURE.md:137 的 `~/.j-gui/` 修正为 `~/.jgui/`。
