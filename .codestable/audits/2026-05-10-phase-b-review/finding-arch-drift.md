---
doc_type: audit-finding
audit: phase-b-review
dimension: arch-drift
date: 2026-05-10
---

# 架构偏离 — 6 项

## A1: Architecture docs list 6 governance commands; code has 8

- **严重度**: P1 · **置信度**: high · **文件**: ARCHITECTURE.md:103-105, backend-agent-engine.md:59-69
- **建议动作**: cs-arch (update)

ARCHITECTURE.md 列出 6 条 governance 命令，文件行号标为 "1-351"。实际代码 514 行，新增 `scan_global_skills` 和 `copy_skill_to_workspace` 两条命令。ARCHITECTURE.md §2.7 对全局 Agent Skills 仍写 "j-gui 待实现"，但已实现。需更新为 8 条命令并改 "待实现" 为 "已实现"。

---

## A2: System prompts stored under j_cli data dir, not GUI data dir

- **严重度**: P2 · **置信度**: high · **文件**: settings.rs:582-584
- **建议动作**: cs-issue

```rust
agent_data_dir().join("gui").join("system_prompts.json")
// → ~/.jdata/agent/data/gui/system_prompts.json
```

ARCHITECTURE.md 规定 GUI 配置存储在 `%APPDATA%/j-gui/` 或 `~/.j-gui/`。System prompts 作为 GUI 功能存储在 j_cli 数据目录下，违反数据同源原则。

---

## A3: MCP_CONFIG_LOCK protects two unrelated data domains

- **严重度**: P2 · **置信度**: high · **文件**: governance.rs:12,152,332
- **建议动作**: cs-refactor

单一锁保护 `mcp_config.json` 和 `agent_config.json` 两个无关文件，造成不必要竞争。应拆分为各自域名的锁。

---

## A4: settings.rs imports from j_cli::command::chat::storage

- **严重度**: P2 · **置信度**: medium · **文件**: settings.rs:569
- **建议动作**: cs-refactor

```rust
use j_cli::command::chat::storage::{agent_data_dir, load_system_prompt};
```

GUI 设置模块耦合到 j_cli 的 chat::storage 模块内部实现。应通过 j_cli 公共 API 抽象或使用 j-gui 自身的数据目录。

---

## F4: Architecture doc missing 3 settings tabs (alias/hooks/yaml)

- **严重度**: P2 · **置信度**: high · **文件**: frontend-settings-ui.md
- **建议动作**: cs-arch (update)

SettingsTab 类型和 SettingsPanel 的 BASE_TABS 已包含 `alias`/`hooks`/`yaml` 三个 tab，对应的 AliasSettings/HooksSettings/YamlConfigSettings 组件也已存在，但架构文档的 LeftNav 列表、SettingsTab 类型、组件层级均未提及。

---

## F5: Architecture doc line counts stale

- **严重度**: P2 · **置信度**: high · **文件**: frontend-settings-ui.md
- **建议动作**: cs-arch (update)

文档记录 AgentSettings ~1222 行，实际 1486 行；ToolSettings ~479 行，实际 560 行；McpServerForm ~439 行，实际 ~460 行。Section 2.2 缺少三个新 tab 组件的数据流描述。
