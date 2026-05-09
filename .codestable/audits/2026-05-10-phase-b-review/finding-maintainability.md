---
doc_type: audit-finding
audit: phase-b-review
dimension: maintainability
date: 2026-05-10
---

# 可维护性 — 10 项

## M1: update_settings: 165-line repetitive match block with 25 arms

- **严重度**: P1 · **置信度**: high · **文件**: settings.rs:204-368
- **建议动作**: cs-refactor

每个 match arm 模式完全相同：检查值类型 → 赋值给 struct 字段。25 个 arm 机械重复，新增 GuiSettings 字段容易漏加。`_ => { /* silently ignore */ }` 让前端拼写错误也静默接受，调试困难。建议用 serde merge 替代整个 match block。

---

## M2: scan_skills_dir silently swallows errors

- **严重度**: P2 · **置信度**: high · **文件**: governance.rs:376-410
- **建议动作**: cs-issue

```rust
let entries = match fs::read_dir(&dir) {
    Ok(e) => e,
    Err(_) => return skills,  // 权限拒绝 → 空列表，无日志
};
for entry in entries.flatten() {  // per-entry I/O 错误被吞
```

两级错误吞没。应至少用 `j_cli::util::log::write_error_log()` 记录错误。

---

## M3: get_tool_version uses string >= for semver

- **严重度**: P2 · **置信度**: high · **文件**: settings.rs:514-524
- **建议动作**: cs-issue

```rust
v >= "18.0.0"  // 字典序比较，非 semver
```

"9.0.0" 会被错误判定为 >= "18.0.0"，"100.0.0" 会被判定为 < "22.0.0"。巧合下当前值能正常工作，但脆弱。应用 `semver::Version::parse`。

---

## M4: settings_dir() duplicates dirs crate

- **严重度**: P3 · **置信度**: high · **文件**: settings.rs:21-34
- **建议动作**: cs-refactor

Cargo.toml 已有 `dirs = "5"`（governance.rs 用 `dirs::home_dir()`），但 settings.rs 和 files.rs 绕过它用自定义 `dirs_next()` 解析 env var。手写版本缺少 Linux fallback（$HOME 未设置时 dirs crate 有 `getpwuid_r` 回退）。应用 `dirs::data_dir()`。

---

## M5: Global skills paths hardcoded as string literals

- **严重度**: P3 · **置信度**: medium · **文件**: governance.rs:416-417
- **建议动作**: cs-refactor

```rust
skills.extend(scan_skills_dir(&home, ".claude/agents/skills"));
skills.extend(scan_skills_dir(&home, ".agent/skills"));
```

路径在代码和架构文档中重复出现。应定义为常量数组。

---

## F6: AgentSettings.tsx is 1486 lines

- **严重度**: P2 · **置信度**: high · **文件**: AgentSettings.tsx
- **建议动作**: cs-refactor

15+ 子组件、22 个 state 变量、3 个独立子 tab 混在一个文件。应抽取 SkillListPanel / SkillDetailPanel / BuiltinAgentTools 为独立文件。

---

## F7: Test duplicates helper functions instead of importing

- **严重度**: P2 · **置信度**: high · **文件**: skills-dual-source.test.ts:8-28
- **建议动作**: cs-refactor

`getSkillSourceType`、`getSkillSourceBadge`、`externalSkillSlug` 从 AgentSettings.tsx 逐字复制到测试文件。源文件修改时测试不会捕获回归。应导出并在测试中 import。

---

## F8: `any` type for jCliMcpServers state

- **严重度**: P2 · **置信度**: medium · **文件**: AgentSettings.tsx:177
- **建议动作**: cs-refactor

```tsx
const [jCliMcpServers, setJCliMcpServers] = React.useState<any[]>([])
```

JCliMcpViewProps 已定义确切 shape，ipc.listMcpServers() 返回已知类型。组件内另有 3 处 `any` 类型状态。

---

## F9: WebSearchSettings / NanoBananaSettings share ~150 lines of boilerplate

- **严重度**: P3 · **置信度**: medium · **文件**: ToolSettings.tsx
- **建议动作**: cs-refactor

handleBlurSave、handleToggle、handleTest、loading state、test result rendering 完全重复。抽取 `useToolCredentials(toolId: string)` hook 可消除 ~80 行。

---

## F10: mcp-dual-source.test.tsx overrides global setup mock

- **严重度**: P3 · **置信度**: low · **文件**: mcp-dual-source.test.tsx:81-87
- **建议动作**: cs-refactor

测试文件用 `vi.mock` 覆盖 setup.ts 的全局 mock，依赖 Vitest 闭包捕获行为。应使用 `vi.mocked()` 操作全局 mock（如 skills-dual-source.test.ts 的模式）。
