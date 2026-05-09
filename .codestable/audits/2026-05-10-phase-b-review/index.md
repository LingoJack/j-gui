---
doc_type: audit-index
slug: phase-b-review
status: active
created: 2026-05-10
scope: "Phase B 新/改代码：Rust 后端 (governance.rs/settings.rs/lib.rs) + 前端 (ipc.ts/6 个 settings 组件/atoms/测试)"
dimensions_scanned: [bug, security, arch-drift, maintainability]
total_findings: 28
---

# Phase B 代码审计 — 2026-05-10

## 范围

审计 Phase B 实现的所有新增/修改代码：

| 层 | 文件 | 说明 |
|---|---|---|
| Rust 后端 | `src-tauri/src/commands/governance.rs` | skills/hooks/MCP/chat-tools + scan_global_skills |
| Rust 后端 | `src-tauri/src/commands/settings.rs` | settings + system prompt 7 命令 |
| Rust 后端 | `src-tauri/src/lib.rs` | 命令注册 |
| Rust 后端 | `src-tauri/Cargo.toml` | 依赖 |
| 前端 | `src/lib/ipc.ts` | 全部 IPC wrappers |
| 前端 | `src/components/settings/AliasSettings.tsx` | 新增 |
| 前端 | `src/components/settings/HooksSettings.tsx` | 新增 |
| 前端 | `src/components/settings/YamlConfigSettings.tsx` | 新增 |
| 前端 | `src/components/settings/AgentSettings.tsx` | Skills/MCP 双源增强 |
| 前端 | `src/components/settings/ToolSettings.tsx` | BuiltinToolsSection |
| 前端 | `src/components/settings/SettingsPanel.tsx` | 新 tab 注册 |
| 前端 | `src/atoms/settings-tab.ts` | 类型扩展 |
| 前端 | `src/__tests__/*.test.ts(x)` | 测试文件 |

## 总评

Phase B 整体代码质量良好：所有功能均以 TDD 方式实现，前端 54/54 + 后端 57/57 测试通过，零回归。主要风险集中在两个区域：

1. **安全**：`copy_skill_to_workspace` 存在路径穿越漏洞（P0），需立即修复
2. **并发**：system prompt 命令存在 TOCTOU 竞态和 poisoned mutex 强制获取（P1）

前端侧无明显 P0 问题，主要是可维护性改进（大组件拆分、类型收紧、架构文档补齐）。

## 发现清单（交叉分类矩阵）

### Rust 后端 — 18 条

| # | 标题 | 性质 | 严重度 | 置信度 | 文件 | 建议 |
|---|---|---|---|---|---|---|
| B1 | TOCTOU race in all system prompt modification commands | bug | P1 | high | settings.rs:679-755 | cs-issue |
| B2 | save_system_prompts_config force-acquires poisoned mutex | bug | P1 | high | settings.rs:626-629 | cs-issue |
| B3 | Corrupted prompts config silently returns defaults without healing | bug | P2 | medium | settings.rs:603-615 | cs-issue |
| B4 | load_settings/get_settings reads without lock while update_settings writes | bug | P2 | medium | settings.rs:152-368 | cs-issue |
| B5 | settings_dir() fallback writes to CWD, risking data loss | bug | P2 | high | settings.rs:5-7 | cs-issue |
| S1 | Path traversal in copy_skill_to_workspace via workspace_slug/skill_slug | security | **P0** | high | governance.rs:427-433 | cs-issue |
| S2 | No input validation on source_dir in copy_skill_to_workspace | security | P1 | medium | governance.rs:436 | cs-issue |
| S3 | scan_global_skills follows symlinks without check | security | P2 | medium | governance.rs:376-410 | cs-issue |
| S4 | MCP_CONFIG_LOCK used to protect non-MCP agent_config data | security | P2 | high | governance.rs:12,332 | cs-refactor |
| A1 | Architecture docs list 6 governance commands; code has 8 (undocumented) | arch-drift | P1 | high | ARCHITECTURE.md:103-105 | cs-arch |
| A2 | System prompts stored under j_cli data dir, not GUI data dir | arch-drift | P2 | high | settings.rs:582-584 | cs-issue |
| A3 | MCP_CONFIG_LOCK protects two unrelated data domains | arch-drift | P2 | high | governance.rs:12,152,332 | cs-refactor |
| A4 | settings.rs writes under j_cli agent_data_dir mixing CLI/GUI | arch-drift | P2 | medium | settings.rs:569,582-584 | cs-refactor |
| M1 | update_settings: 165-line repetitive match block with 25 arms | maintainability | P1 | high | settings.rs:204-368 | cs-refactor |
| M2 | scan_skills_dir silently swallows directory read and per-entry I/O errors | maintainability | P2 | high | governance.rs:376-410 | cs-issue |
| M3 | get_tool_version uses string >= for semver, not proper semver parse | maintainability | P2 | high | settings.rs:514-524 | cs-issue |
| M4 | settings_dir() duplicates dirs crate with custom env var parsing | maintainability | P3 | high | settings.rs:21-34 | cs-refactor |
| M5 | scan_skills_dir hardcodes global skills paths as string literals | maintainability | P3 | medium | governance.rs:416-417 | cs-refactor |

### 前端 TypeScript — 10 条

| # | 标题 | 性质 | 严重度 | 置信度 | 文件 | 建议 |
|---|---|---|---|---|---|---|
| F1 | Race condition in loadOtherWorkspaces on rapid dialog open/close | bug | P1 | high | AgentSettings.tsx:228-230 | cs-issue |
| F2 | Debounce timeout not cleaned up on PromptSettings unmount | bug | P2 | high | PromptSettings.tsx:115-132 | cs-issue |
| F3 | IPC fallback shape mismatch for getWorkspaceMcpConfig | bug | P2 | medium | ipc.ts:347-348 | cs-issue |
| F4 | Architecture doc missing 3 settings tabs (alias/hooks/yaml) | arch-drift | P2 | high | frontend-settings-ui.md | cs-arch |
| F5 | Architecture doc line counts stale for AgentSettings/ToolSettings | arch-drift | P2 | high | frontend-settings-ui.md | cs-arch |
| F6 | AgentSettings.tsx is 1486 lines, exceeding recommended size | maintainability | P2 | high | AgentSettings.tsx | cs-refactor |
| F7 | Test duplicates helper functions instead of importing from source | maintainability | P2 | high | skills-dual-source.test.ts:8-28 | cs-refactor |
| F8 | `any` type used for jCliMcpServers state despite known shape | maintainability | P2 | medium | AgentSettings.tsx:177 | cs-refactor |
| F9 | WebSearchSettings and NanoBananaSettings share ~150 lines of boilerplate | maintainability | P3 | medium | ToolSettings.tsx | cs-refactor |
| F10 | mcp-dual-source.test.tsx overrides global setup mock | maintainability | P3 | low | mcp-dual-source.test.tsx:81-87 | cs-refactor |

## 按严重度汇总

| 严重度 | 数量 | 建议 |
|---|---|---|
| **P0** | 1 | 立即修 — `cs-issue` 开 issue |
| **P1** | 6 | 下个迭代修 — `cs-issue` / `cs-refactor` |
| **P2** | 17 | 排入 backlog — 择机处理 |
| **P3** | 4 | 有空再看 |

## 按性质汇总

| 性质 | 数量 | 占比 |
|---|---|---|
| bug | 8 | 29% |
| security | 4 | 14% |
| arch-drift | 6 | 21% |
| maintainability | 10 | 36% |

## 下一步优先级建议

1. **立即 (P0)**: S1 路径穿越 — `cs-issue fix-agent-path-traversal`
2. **本迭代 (P1)**: B1 TOCTOU + B2 poisoned mutex + S2 source_dir 校验 + M1 update_settings 重构 + F1 loadOtherWorkspaces 竞态 + A1 架构文档更新
3. **Backlog (P2)**: 17 条，按 Bug > Security > Arch-drift > Maintainability 顺序处置
4. **可选 (P3)**: 4 条，择机处理

cs-audit 只发现不定修。选择任一发现后路由到对应 `cs-issue` 或 `cs-refactor`。
