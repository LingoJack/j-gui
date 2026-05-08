---
doc_type: audit-index
slug: business-logic-review
date: 2026-05-08
scope:
  - src-tauri/src/agent_engine.rs
  - src-tauri/src/chat_engine.rs
  - src-tauri/src/commands/agent.rs
  - src-tauri/src/commands/chat.rs
  - src-tauri/src/commands/config.rs
  - src-tauri/src/commands/system.rs
  - src-tauri/src/commands/alias.rs
  - src-tauri/src/lib.rs
  - src/components/chat/ChatView.tsx
  - src/components/agent/AgentView.tsx
  - src/components/agent/AgentMessages.tsx
  - src/components/agent/ToolCallDisplay.tsx
  - src/components/agent/PermissionBanner.tsx
  - src/components/app-shell/MainArea.tsx
  - src/components/app-shell/AppShell.tsx
  - src/lib/tauri.ts
  - src/atoms/sessions.ts
  - src/atoms/config.ts
dimensions: [bug, security, performance, maintainability]
status: resolved
---

# 业务逻辑流审计 — 2026-05-08

## 范围

扫 `src-tauri/src/`（Rust 后端）和 `src/` 核心组件（agent/chat views + atoms + IPC），聚焦**业务逻辑流**：Agent 子进程通信、Chat 流式传输、消息持久化、会话管理、配置同步。

## 总评

代码骨架整体合理，Agent 子进程 + Channel 流式的 IPC 模式选型正确。但 **Agent 模式的 Claude Code CLI 协议集成有实质性 gap**：`bypassPermissions` 模式下 ToolResult/PermissionRequest 两条事件路径是死代码，工具调用结果永远不会展示给用户。此外 **进程生命周期管理有挂死风险**（close 在 kill 前 join reader 线程），**Chat 取消语义仅前端生效不触及后端**（"新建"不停止消费 API credits）。整体：**业务流程主路径可走通，但边界/取消/工具流三个路径需要修复。**

## 发现清单

| # | 维度 | 严重度 | 置信度 | 简述 |
|---|------|--------|--------|------|
| F-01 | bug | P1 | high | `parse_sdk_line` 未处理 "user" 类型消息，ToolResult 事件永不被触发 |
| F-02 | bug | P1 | high | `AgentEngine.close()` join reader 线程早于 kill process，可无限挂死 |
| F-03 | bug | P1 | medium | Chat 模式下"新建"按钮不取消后端 streaming，持续消耗 API credits |
| F-04 | bug | P2 | medium | `delete_message` 存在 TOCTOU 竞态 |
| F-05 | security | P2 | low | API key 掩码逻辑对短 key（≤8 字符）错误覆盖为 "****" |
| F-06 | security | P2 | medium | `set_agent_config` 缺失 `activeIndex` 越界校验 |
| F-07 | performance | P1 | medium | Chat 流传输每调用占用整个 blocking thread |
| F-08 | maintainability | P1 | high | 大量死代码：ToolResult/PermissionRequest 事件 + PermissionBanner + respondAgentPermission |
| F-09 | maintainability | P2 | low | ChatView 和 AgentView 同时挂载，不按模式卸载 |
| F-10 | maintainability | P2 | low | `parse_sdk_line` 仅处理首个 content block，多 block 被静默丢弃 |

## 建议优先顺序

1. **P1 先修** — F-02（挂死风险）、F-01（工具流断裂）、F-03（API 浪费）、F-08（死代码清理）、F-07（线程池占用）
2. **P2 排后** — F-06（越界校验）、F-04（竞态）、F-05（短 key 掩码）、F-09、F-10

具体修哪个 → 路由到 `cs-issue`（bug）或 `cs-refactor`（maintainability/performance）。
