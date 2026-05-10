---
doc_type: audit-index
slug: full-codebase
status: active
created: 2026-05-10
scope: "全量：Rust 后端 13 files + 前端组件 13 files + IPC/类型/状态层 11 files ≈ 37 files"
dimensions_scanned: [bug, security, arch-drift, maintainability, performance]
total_findings: 55
---

# 全量代码审计 — 2026-05-10

## 范围

| 层 | 文件数 | 维度 |
|---|--------|------|
| Rust 命令+引擎 | 13 | bug/security/maintainability |
| 前端组件 | 13 | bug/security/maintainability/performance |
| IPC+类型+状态+hooks | 11 | bug/security/arch-drift/maintainability |

## 总评

代码量偏大（3 组件 >900 行），IPC 层与后端存在 ~100 命令未注册的空隙（架构漂移）。最关键的安全问题是 `files.rs` 路径穿越旁路和 Agent API Key 泄露到子进程环境。核心功能方面：`stop_generation` 是死代码、多条 IPC 调用的参数结构错误、`fetchModels` 和 `deleteMessage` 等功能不可用。

## 关键发现 (P0/P1)

| # | 严重度 | 性质 | 文件:行 | 发现 |
|---|--------|------|---------|------|
| 1 | **P0** | arch-drift | ipc.ts vs lib.rs | ~100 条 IPC 命令后端未注册——整个功能域静默 fallback |
| 2 | **P0** | bug | ipc.ts:198/223/236 | delete_message/generate_agent_title/update_agent_session_title 参数结构错误 |
| 3 | **P1** | bug | chat.rs:58-84 | stop_generation 完全死代码——从未被 send_message 检查 |
| 4 | **P1** | security | files.rs:15-26 | 附件目录不存在时路径穿越防护旁路 |
| 5 | **P1** | maintainability | chat_engine.rs:68-178 | send_message 110 行单体函数（5 职责） |
| 6 | **P1** | maintainability | governance.rs:142-206 | save_mcp_servers 100 行复杂合并逻辑 |
| 7 | **P1** | bug | agent_engine.rs:406-410 | 每次 tool_use 写临时调试文件（竞态+无清理） |
| 8 | **P1** | bug | chat_engine.rs:167 | total_tokens 恒为 0 |
| 9 | **P1** | security | agent_engine.rs:67-76 | API Key 泄露到子进程环境变量 |
| 10 | **P1** | maintainability | AgentView.tsx (1550 行) | 最胖组件——23 useCallback + 11 useEffect |
| 11 | **P1** | maintainability | LeftSidebar.tsx (1662 行) | 第二大组件——9+ useEffect |
| 12 | **P1** | maintainability | ipc.ts | 55 处 `any` 类型 + tryInvoke 静默失败 |

## 按严重度汇总

| 严重度 | 数量 | 说明 |
|--------|------|------|
| P0 | 2 | 100 未注册命令 + 3 IPC 参数错 |
| P1 | 10 | 死代码/安全/超大函数/类型缺失 |
| P2 | 30+ | 边界条件/重复代码/性能/魔法值 |
| P3 | ~10 | 命名/注释/死代码清理 |

## 下一步建议

1. **P0 立即**：对账 ipc.ts ↔ lib.rs（~100 未注册命令），修复 IPC 参数结构错误
2. **P1 本迭代**：激活 stop_generation 或移除、修复文件路径安全、拆分超大组件
3. **P2 backlog**：边界条件、重复代码、工具 ID 碰撞、幻数提取
4. **P3 择机**：命名规范、debug 残留清理、共享常量采用
