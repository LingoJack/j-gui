---
doc_type: audit-finding
audit: 2026-05-11-roadmap-completeness
finding_id: "07"
severity: P1
category: arch-drift
confidence: high
suggested_action: cs-arch
files: [.codestable/architecture/ARCHITECTURE.md, src-tauri/src/kernel/config.rs, src-tauri/src/kernel/governance.rs]
---

# Finding 07: ARCHITECTURE.md trait 方法数与代码不一致

## 位置

- ARCHITECTURE.md:96 — ConfigKernel "14 个方法"
- ARCHITECTURE.md:98 — GovernanceKernel "18 个方法"
- `src-tauri/src/kernel/config.rs:13-73` — 实际 18 个方法
- `src-tauri/src/kernel/governance.rs:11-110` — 实际 21 个方法

## 证据

**ConfigKernel：文档 14，实际 18**

缺失的 4 个方法：`load_theme_name`、`version`、`data_dir`、`set_theme`（位于 `// -- Active index / theme --` 和 `// -- System --` 注释块下）。

**GovernanceKernel：文档 18，实际 21**

差异方法：`import_cc_sdk_hooks`、`import_cc_sdk_mcp` 等 CC SDK 互操作方法在文档编写后添加，文档未同步更新。

## ChatKernel 验证通过 ✅

文档 11 方法 = 代码 11 方法。

## 建议

开 `cs-arch update`：更新 ARCHITECTURE.md 第 96/98 行的 trait 方法计数为当前实际值。
