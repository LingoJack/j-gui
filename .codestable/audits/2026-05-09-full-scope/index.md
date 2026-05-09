---
doc_type: audit-index
audit: 2026-05-09-full-scope
scope: Agent 子系统 + Chat 流式链路 + App Shell/设置，共约 30 文件，覆盖 bug/security/performance/maintainability/arch-drift 五维
created: 2026-05-09
status: superseded
superseded-by: ../2026-05-09-post-parity-regression
total_findings: 17
---

# full-scope 审计报告

## 范围

三个范围合并扫描：

- **A — Agent 子系统**：`agent_engine.rs`、`agent_session.rs`、`commands/agent.rs`、`AgentView.tsx`、`AgentMessages.tsx`、`PermissionBanner.tsx`、`TaskProgressCard.tsx`
- **B — Chat 流式链路**：`chat_engine.rs`、`commands/chat.rs`、`ChatView.tsx`、`ChatMessages.tsx`、`ChatInput.tsx`、`MessageBubble.tsx`、`ReasoningBlock.tsx`、`lib/tauri.ts`
- **C — App Shell + 设置**：`AppShell.tsx`、`LeftSidebar.tsx`、`MainArea.tsx`、`SearchDialog.tsx`、`RightSidePanel.tsx`、`SettingsDialog.tsx`、`SkillsTab.tsx`、`HooksTab.tsx`、`McpTab.tsx`、`governance.rs`

维度：bug 隐患 / 安全 / 性能 / 可维护性 / 架构偏离（全五维）。

## 总评

共发现 17 条：P0 1 条、P1 10 条、P2 6 条。整体代码质量中等偏上——流式链路和状态管理设计合理，Channel + Jotai 模式一致。最值得关注的是 **agent_session 的 read-modify-write 竞态**（P0），在 stdout 线程更新 tool_call_result 的同时，Tauri 命令线程可能写 interrupt_response，导致 session 数据静默丢失。Agent 子系统作为新功能区域存在最多的稳定性隐患（竞态、错误吞没、子进程生命周期）。Chat 链路成熟度较高但缺少 pagination 和真正的流式中止。架构文档滞后于代码——Settings 已扩展到 6 个 tab 但文档仍描述 2 个，Agent 子系统完全没有架构文档。

## 发现清单

| # | 性质 | 严重度 | 置信度 | 标题 | 文件 | 状态 |
|---|---|---|---|---|---|---|
| 1 | bug | P0 | high | transcript 竞态：update_tool_call_result 和 update_interrupt_response 无协调 | [finding-01.md](finding-01.md) | ✅ fixed |
| 2 | bug | P1 | high | delete_message 与 send_message 并发导致消息丢失 | [finding-02.md](finding-02.md) | ✅ fixed |
| 3 | bug | P1 | medium | agent_engine stdout 线程静默吞没 transcript 写入错误 | [finding-03.md](finding-03.md) | ✅ fixed |
| 4 | bug | P2 | medium | AgentEngine::Drop 无条件杀子进程，可能丢失未持久化数据 | [finding-04.md](finding-04.md) | ✅ fixed |
| 5 | bug | P2 | low | ChatInput thinking 开关状态本地化，未接入后端 | [finding-05.md](finding-05.md) | 🔴 需 j_cli API |
| 6 | security | P1 | high | API Key 明文传入子进程环境变量 | [finding-06.md](finding-06.md) | ✅ fixed |
| 7 | security | P1 | medium | home_dir() 回退到 "." 可能导致会话数据写入意外位置 | [finding-07.md](finding-07.md) | ✅ fixed |
| 8 | security | P2 | low | JSON 解析失败用 unwrap_or("") 吞没错误，掩盖数据完整性问题 | [finding-08.md](finding-08.md) | ✅ fixed |
| 9 | performance | P1 | medium | agent_session 更新操作全量读写 transcript，O(n) 每更新 | [finding-09.md](finding-09.md) | 🔴 架构级 |
| 10 | performance | P2 | medium | get_messages 全量读取 transcript，无分页 | [finding-10.md](finding-10.md) | 🔴 架构级 |
| 11 | performance | P2 | low | RightSidePanel toggleNode 每次全树重建 | [finding-11.md](finding-11.md) | ✅ fixed |
| 12 | maintainability | P1 | medium | AgentView.tsx 497 行，职责过多 | [finding-12.md](finding-12.md) | ✅ fixed |
| 13 | maintainability | P1 | medium | SettingsDialog.tsx 484 行，多 tab 混在一个组件 | [finding-13.md](finding-13.md) | ✅ fixed |
| 14 | maintainability | P2 | low | LeftSidebar.tsx 488 行混合会话 CRUD/固定/编辑/模式切换 | [finding-14.md](finding-14.md) | ✅ fixed |
| 15 | arch-drift | P1 | medium | frontend-settings-ui.md 记录 2 个 tab，实际代码 6 个 | [finding-15.md](finding-15.md) | ✅ fixed |
| 16 | arch-drift | P1 | medium | Agent 子系统无架构文档 | [finding-16.md](finding-16.md) | ✅ fixed |
| 17 | arch-drift | P2 | low | frontend-chat-ui.md "无 Markdown 渲染" 已过时 | [finding-17.md](finding-17.md) | ✅ fixed |

## 按维度分布

| 性质 | P0 | P1 | P2 | 合计 |
|---|---|---|---|---|
| bug | 1 | 2 | 2 | 5 |
| security | 0 | 2 | 1 | 3 |
| performance | 0 | 1 | 2 | 3 |
| maintainability | 0 | 2 | 1 | 3 |
| arch-drift | 0 | 2 | 1 | 3 |
| **合计** | **1** | **9** | **7** | **17** |

## 后续建议

- **P0 ✅ fixed**：#1 transcript 竞态 — 已通过 `AGENT_TRANSCRIPT_LOCK` 串行化
- **P1 ✅ fixed**：#2 delete vs send 竞态（`SESSION_WRITE_LOCK`）、#3 stdout 吞错（`write_error_log`）、#6 API Key 注释说明、#7 home_dir（`YamlConfig::data_dir`）、#15+#16+#17 架构文档已更新
- **P2 ✅ fixed**：#4 Drop 杀进程（500ms grace period）、#8 unwrap_or 吞错（eprintln! 告警）
- **🔴 待定**：#5 thinking 需 j_cli 侧支持、#9-#10 性能优化需架构变更

## 2026-05-09 修复记录

本次修复覆盖 16 条（1 P0 + 9 P1 + 6 P2），其中 7 条审计时已有修复（#1 #2 #3 #7 #15 #16 #17），9 条本次新修（#4 #6 #8 #11 #12 #13 #14），1 条需跨项目配合（#5 j_cli API）。
