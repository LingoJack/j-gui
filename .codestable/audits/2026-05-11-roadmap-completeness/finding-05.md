---
doc_type: audit-finding
audit: 2026-05-11-roadmap-completeness
finding_id: "05"
severity: P1
category: bug
confidence: high
suggested_action: cs-issue
files: [src/lib/ipc.ts, src-tauri/src/commands/agent.rs]
---

# Finding 05: Agent 会话 pin/archive 功能缺失

## 位置

- `src/lib/ipc.ts:229,231` — 前端存根
- `src/components/app-shell/LeftSidebar.tsx:641,693` — 调用方
- `src-tauri/src/commands/chat.rs:67,72` — Chat 端的对应实现（作为对比）

## 证据

Roadmap #20 (session-archive) 标记为 `done`，notes 写"register toggle_pin / toggle_archive commands"。但：

**Chat 端（完整 ✅）：**
- 后端：`toggle_pin_conversation` (chat.rs:67)、`toggle_archive_conversation` (chat.rs:72)
- 前端：`ipc.ts:163-164` — 正常 IPC wrapper

**Agent 端（缺 ❌）：**
- 后端：无 `toggle_pin_agent_session` / `toggle_archive_agent_session` 命令
- 前端：`ipc.ts:229,231` — TODO 存根，`Promise.resolve(false)`
- 调用方 `LeftSidebar.tsx:641,693` 调用这些存根 → 操作静默失败

## 影响

- Roadmap 进度报告不准确——#20 实际只完成了 Chat 端
- Agent 会话无法固定/归档，用户点击无响应

## 建议

开 `cs-issue`：参考 Chat 端的 `toggle_pin_conversation` 实现，为 Agent 会话添加对应的后端命令 + 前端 IPC wrapper。
