---
doc_type: audit-index
slug: phase-bplus-review
status: active
created: 2026-05-10
scope: "#27 channel-model-unify + #28 governance-bidirectional-sync — Rust 后端 (kernel/ + commands/) + 前端 (ipc.ts + HooksSettings + ChannelSettings)"
dimensions_scanned: [bug, security, arch-drift, maintainability]
total_findings: 19
---

# Phase B+ 代码审计 — #27 + #28

## 范围

| 层 | 文件 | 说明 |
|---|------|------|
| Rust | `kernel/types.rs` | KernelProvider 扩展 + 新 DTO |
| Rust | `kernel/config.rs` / `kernel/governance.rs` | trait 新方法 |
| Rust | `kernel/adapter.rs` | 格式迁移 + 新 impl |
| Rust | `commands/channels.rs` | Channel 命令适配 |
| Rust | `commands/governance.rs` | 12 新治理命令 |
| Rust | `commands/config.rs` | set_agent_config 适配 |
| Rust | `lib.rs` | 命令注册 |
| 前端 | `ipc.ts` | toggleHook + fetchModels + listChannels |
| 前端 | `HooksSettings.tsx` | 启停 UI 升级 |
| 前端 | `ChannelSettings.tsx` / `ChannelForm.tsx` | Channel 类型对齐 |
| 前端 | `AgentSettings.tsx` | MCP 配置提示 |

## 发现清单

| # | 标题 | 性质 | 严重度 | 文件:行 | 建议 |
|---|---|---|---|---|---|
| 1 | `set_agent_config_impl` 空 UUID + 零时间戳 | bug | **P1** | config.rs:130-149 | cs-issue |
| 2 | `fetchModels` 参数结构不匹配（input 包裹错误） | bug | **P1** | ipc.ts:152 | cs-issue |
| 3 | MCP 凭据通过 AI 配置提示泄露给 LLM | security | **P1** | AgentSettings.tsx:168-202 | cs-issue |
| 4 | Channel.models 类型前后端不匹配（String vs ChannelModel[]） | arch-drift | **P1** | ipc.ts:122 / channels.rs:22 | cs-issue |
| 5 | `j_cli::` 导入在 adapter 外（governance.rs） | arch-drift | **P1** | governance.rs:1,115 | cs-issue |
| 6 | `save_mcp_servers` 锁前读文件（TOCTOU） | bug | P2 | governance.rs:143-206 | cs-issue |
| 7 | `list_mcp_servers`/`list_chat_tools` 读路径缺锁 | bug | P2 | governance.rs:121-139 | cs-issue |
| 8 | 对象 URL 未 revoke（内存泄漏） | bug | P2 | ipc.ts:523,525 | cs-issue |
| 9 | 适配器 workspace 方法 path traversal（slug 未验证） | security | P2 | adapter.rs:703-833 | cs-issue |
| 10 | 掩码键检测误报（索引越界时） | security | P2 | config.rs:125-132 | cs-issue |
| 11 | 6 个治理命令绕过适配器（不一致模式） | arch-drift | P2 | governance.rs vs adapter.rs | cs-refactor |
| 12 | `agent_config.json` 双写路径（覆盖风险） | arch-drift | P2 | adapter.rs:188/362 | cs-refactor |
| 13 | `parse_skill_frontmatter` 冒号值截断 | bug | P2 | governance.rs:393 | cs-issue |
| 14 | 重复 `mask_key`/`mask_api_key` | maintainability | P2 | config.rs:211 / channels.rs:90 | cs-refactor |
| 15 | 重复 `parse_skill_frontmatter` | maintainability | P2 | governance.rs:378 / adapter.rs:560 | cs-refactor |
| 16 | 治理命令手动类型映射样板 | maintainability | P2 | governance.rs (4 类型对) | cs-refactor |
| 17 | 幻数（15s 超时 / 200 chars 截断） | maintainability | P2 | channels.rs:153,167,191 | cs-refactor |
| 18 | AgentSettings 953 行超限 | maintainability | P3 | AgentSettings.tsx | cs-refactor |
| 19 | IPC 64 处 `any` 类型 | maintainability | P3 | ipc.ts | cs-refactor |

## 汇总

| 严重度 | 数量 | 建议 |
|--------|------|------|
| **P1** | 5 | 立即修——3 bug + 1 security + 2 arch-drift |
| **P2** | 12 | 排入 backlog |
| **P3** | 2 | 择机处理 |

| 性质 | 数量 |
|------|------|
| bug | 5 |
| security | 3 |
| arch-drift | 4 |
| maintainability | 7 |

## 优先级建议

1. **P1 立即**：#1 空 UUID（频道管理不可用）+ #2 fetchModels 参数错（获取模型按钮无效）+ #4 models 类型不匹配（UI 显示 undefined）
2. **P1 安全**：#3 MCP 凭据泄露
3. **P2 下迭代**：12 条按 bug > security > arch-drift > maintainability 顺序
