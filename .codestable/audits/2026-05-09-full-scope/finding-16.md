---
doc_type: audit-finding
audit: 2026-05-09-full-scope
finding_id: "arch-drift-16"
nature: arch-drift
severity: P1
confidence: high
suggested_action: cs-arch
status: open
---

# Finding 16：Agent 子系统无架构文档

## 速答

Agent 子系统（`agent_engine.rs`、`agent_session.rs`、`commands/agent.rs`、`AgentView.tsx` 等 7 个文件）是最近几个 Phase 的核心交付，但 `.codestable/architecture/` 中没有对应的架构文档。

## 关键证据

- `.codestable/architecture/` 目录现有 4 个文档：`ARCHITECTURE.md`、`backend-chat-engine.md`、`frontend-chat-ui.md`、`frontend-settings-ui.md`
- `.codestable/architecture/ARCHITECTURE.md:77-81` — 子系统表仅列出 ChatEngine、Chat UI、Settings UI 三个
- `src-tauri/src/agent_engine.rs` — 557 行核心引擎代码无架构对照文档
- `src-tauri/src/agent_session.rs` — 240 行会话持久化模块无架构文档

Agent 子系统与 ChatEngine 完全不同：前者用 Claude CLI 子进程 + stream-json 协议，后者用 j_cli 的 call_llm_stream_async。Agent 有自己的 session 存储格式、事件类型、中断协议。这些设计决策没有落成架构文档。

## 影响

新开发者无法从文档了解 Agent 子系统的工作原理、数据流和设计决策。代码审计和 feature design 缺少文档参照。违反 CodeStable 体系的"架构文档只记现状"原则。

## 修复方向

用 `cs-arch backfill` 创建 `backend-agent-engine.md` 和 `frontend-agent-ui.md` 两份架构文档。

## 建议动作

`cs-arch`，补建架构文档。
