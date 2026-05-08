---
doc_type: audit-index
slug: phase-abc-review
date: 2026-05-08
scope:
  - src-tauri/src/agent_session.rs
  - src-tauri/src/agent_engine.rs
  - src-tauri/src/commands/agent.rs
  - src/atoms/sessions.ts
  - src/atoms/tabs.ts
  - src/components/agent/AgentView.tsx
  - src/components/agent/PermissionBanner.tsx
  - src/components/agent/TaskProgressCard.tsx
  - src/components/app-shell/MainArea.tsx
  - src/components/app-shell/AppShell.tsx
  - src/components/app-shell/LeftSidebar.tsx
dimensions: [bug, performance, maintainability]
status: resolved
---

# Phase A+B+C 代码审查 — 2026-05-08

## 范围

扫 Phase A+B+C 新增/大改的 Agent 协议流 + 会话生命周期 + 前端状态核心文件（~11 个），聚焦 bug / performance / maintainability。

## 总评

整体架构方向正确——Agent 持久化、中断协议、多标签、会话导航的骨架已搭好，IPC 协议设计遵循了 gap 分析里的"先定协议再写组件"原则。发现集中在**细节健壮性**层面：列表扫描读全文件、消息转换函数存在内联修改、跨模式搜索隔离。无 P0 阻断性问题。

## 发现清单

| # | 维度 | 严重度 | 置信度 | 简述 |
|---|------|--------|--------|------|
| F-01 | maintainability | P1 | high | `timelineToMessages` mutates `last.content` — code fragile |
| F-02 | performance | P2 | medium | `list_agent_sessions` reads full transcript to count lines |
| F-03 | maintainability | P2 | low | `executeCloseTab` leaks streaming bypass surface |
| F-04 | bug | P2 | medium | Search shows only one mode's sessions at a time |
| F-05 | maintainability | P2 | medium | Shared atoms prevent per-tab conversation isolation |

## 建议优先顺序

1. **F-01 P1** — 消息转换函数 immutable 化（低风险高收益）
2. **F-02 P2** — BufReader 行数统计（影响列表性能但当前数据量小）
3. F-03/F-04/F-05 P2 — 按需排后，不阻塞 Phase D
