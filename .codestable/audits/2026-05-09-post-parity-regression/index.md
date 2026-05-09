---
doc_type: audit-index
audit: 2026-05-09-post-parity-regression
scope: Chat 发送流、Tab 关闭、Agent 工具调用显示、Agent 停止按钮 — 约 8 个文件，覆盖 bug/security/arch-drift 三维
created: 2026-05-09
status: active
total_findings: 7
---

# Post-Parity 回归审计

## 范围

用户反馈 4 个严重问题，锁定以下模块扫描：

- **Chat 发送流**：`ChatView.tsx`、`ChatInput.tsx`、`tauri.ts`、`chat_engine.rs`、`commands/chat.rs`
- **Tab 关闭**：`MainArea.tsx`、`tabs.ts`
- **Agent 工具调用与停止**：`agent_engine.rs`、`useAgentEngine.ts`、`AgentView.tsx`、`ChatInput.tsx`
- 全五维：bug / security / performance / maintainability / arch-drift

## 总评

共发现 7 条：P0 3 条、P1 3 条、P2 1 条。近期并行 Agent 交付引入了多处严重回归——最核心的是 **Chat 发送无回复**（P0）和 **Agent 模式被动触发工具调用**（P0），这两条直接导致应用不可用。Tab 关闭流程的设计缺陷（最后 tab 自动补位）让无 tab 状态永远不可达。

## 发现清单

| # | 性质 | 严重度 | 置信度 | 标题 | 文件 | 状态 |
|---|---|---|---|---|---|---|
| 1 | bug | P0 | high | Chat 发送消息无回复，Channel 事件未渲染 | `ChatView.tsx:242`、`ChatInput.tsx:90` | open |
| 2 | bug | P0 | high | Agent 在被通知环境下自动使用 j-gui 项目目录执行工具调用 | `agent_engine.rs:57-78` | open |
| 3 | bug | P1 | high | 最后 tab 关闭后自动创建新 tab，无 tab 状态永远不可达 | `MainArea.tsx:120-134` | open |
| 4 | bug | P1 | high | Agent 无独立停止按钮，只能通过关 tab 停止 | `ChatInput.tsx`、`AgentView.tsx` | open |
| 5 | bug | P1 | medium | parse_sdk_line 对未知消息类型静默丢弃，不产生 Error 事件 | `agent_engine.rs:362-365` | open |
| 6 | bug | P2 | medium | Chat 模式草稿切换 tab 后不恢复 | `ChatInput.tsx:38-42` | open |
| 7 | arch-drift | P1 | high | Agent 恢复使用的 stream-json 协议解析过于脆弱，缺少输入消毒 | `agent_engine.rs:331-406` | open |

## 按维度分布

| 性质 | P0 | P1 | P2 | 合计 |
|---|---|---|---|---|
| bug | 2 | 3 | 1 | 6 |
| arch-drift | 0 | 1 | 0 | 1 |
| **合计** | **2** | **4** | **1** | **7** |

## 下一步建议

- **P0 立刻开 `cs-issue`**：#1 Chat 发送无回复、#2 Agent 被动工具调用
- **P1 本轮修**：#3 Tab 关闭逻辑、#4 停止按钮、#5 解析错误事件 + #7 架构偏移
- **P2 有空再看**：#6 草稿恢复
