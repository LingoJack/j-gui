---
doc_type: audit-finding
audit: phase-b-review
dimension: security
date: 2026-05-10
---

# 安全隐患 — 4 项

## S1: Path traversal in copy_skill_to_workspace ⚠️ P0

- **严重度**: **P0** · **置信度**: high · **文件**: governance.rs:427-433
- **建议动作**: cs-issue

**证据**:
```rust
let target_base = home
    .join(".jgui").join("agent-workspaces")
    .join(&workspace_slug)   // 用户可控，无校验
    .join("skills")
    .join(&skill_slug);       // 用户可控，无校验
// ...
fs::create_dir_all(&target_base)?;
```

`workspace_slug` 和 `skill_slug` 直接来自前端用户输入，拼入文件路径前零校验。恶意输入如 `../../../tmp/evil` 可在用户有写权限的任意位置创建目录和 SKILL.md 文件。需对 slug 加严格校验（仅允许 `[a-z0-9-]+`）。

---

## S2: No input validation on source_dir in copy_skill_to_workspace

- **严重度**: P1 · **置信度**: medium · **文件**: governance.rs:436
- **建议动作**: cs-issue

```rust
let source_skill_md = PathBuf::from(&source_dir).join("SKILL.md");
fs::copy(&source_skill_md, &target_skill_md)?;
```

`source_dir` 无校验，可指向系统任意目录。虽仅读取 SKILL.md 文件，但无范围检查确认路径在期望的 skills 目录内。

---

## S3: scan_global_skills follows symlinks without check

- **严重度**: P2 · **置信度**: medium · **文件**: governance.rs:376-410
- **建议动作**: cs-issue

```rust
for entry in entries.flatten() {
    let path = entry.path();
    if !path.is_dir() { continue; }
    let skill_md = path.join("SKILL.md");
```

`entries.flatten()` 跟随符号链接，无 `fs::symlink_metadata` 检查。恶意 symlink 可指向任意目录。

---

## S4: MCP_CONFIG_LOCK used to protect non-MCP agent_config data

- **严重度**: P2 · **置信度**: high · **文件**: governance.rs:12,332
- **建议动作**: cs-refactor

`MCP_CONFIG_LOCK` 命名暗示保护 MCP 数据，但 `set_tool_enabled` 用它保护 `agent_config.json`。未来重构可能误删此锁。应拆分为独立命名的锁。
