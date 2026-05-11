---
doc_type: audit-finding
audit: 2026-05-11-roadmap-completeness
finding_id: "01"
severity: P1
category: bug
confidence: high
suggested_action: cs-issue
files: [src/lib/ipc.ts]
---

# Finding 01: ipc.ts 中 4 个 Agent 会话操作是 TODO 占位符

## 位置

`src/lib/ipc.ts:229-231, 466`

## 证据

```typescript
// src/lib/ipc.ts:229-231
export const togglePinAgentSession = (_id: string) => { warnOnce('toggle_pin_agent_session'); return Promise.resolve(false) } // TODO: backend command not yet registered
export const toggleManualWorkingAgentSession = (_id: string) => { warnOnce('toggle_manual_working_agent_session'); return Promise.resolve(false) } // TODO: backend command not yet registered
export const toggleArchiveAgentSession = (_id: string) => { warnOnce('toggle_archive_agent_session'); return Promise.resolve(false) } // TODO: backend command not yet registered

// src/lib/ipc.ts:466
export const deleteCustomChatTool = (id: string) => tryInvoke('delete_custom_chat_tool', { id }, false) // TODO: backend command not yet registered
```

## 分析

这 4 个函数是存根——它们不调用任何后端命令，直接返回 `false`。调用方（如 `LeftSidebar.tsx:641,693`）调用这些函数后，操作静默失败——用户点击 pin/archive 没有效果，且不显示任何错误。

对比 Chat 端的 `togglePinConversation` 和 `toggleArchiveConversation` 已有完整的后端命令 + IPC wrapper。Agent 会话的对应功能缺失。

## 影响

- Roadmap #20 (session-archive) 标记为 done，但 Agent 端的 pin/archive 实际未实现
- Roadmap #14 (chat-tools-ui) 的 `deleteCustomChatTool` 同样未实现后端
- 用户点击操作无反馈，造成功能可用的假象

## 建议

开 `cs-issue`：实现 `toggle_pin_agent_session`、`toggle_archive_agent_session` 后端命令，补全前端 IPC wrapper。
