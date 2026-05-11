---
doc_type: audit-finding
audit: 2026-05-11-roadmap-completeness
finding_id: "04"
severity: P1
category: bug
confidence: medium
suggested_action: cs-issue
files: [src/hooks/useCloseTab.tsx, src/hooks/useGlobalAgentListeners.ts, src/atoms/agent-atoms.ts]
---

# Finding 04: Map 流式状态在标签页关闭时内存泄漏

## 位置

- `src/hooks/useCloseTab.tsx:61-74` — 仅清理 6 个 Map atom
- `src/hooks/useGlobalAgentListeners.ts:571-586` — STREAM_COMPLETE 不删除键
- `src/atoms/agent-atoms.ts:264,272,876,896,902,909,916,943` — 泄漏的 Map atom

## 证据

`useCloseTab.tsx` 在关闭标签页时只清理了 6 个 Map atom（conversationModels、contextLength、thinkingEnabled、parallelMode、promptId、sidePanelOpen）。但以下 Map atom 未被清理：

- `agentStreamingStatesAtom` — 流式状态
- `liveMessagesMapAtom` — 实时消息
- `agentStreamErrorsAtom` / `chatStreamErrorsAtom` — 流错误
- `agentSessionDraftsAtom` / `agentSessionDraftHtmlAtom` — 草稿
- `agentAttachedDirectoriesMapAtom` / `workspaceAttachedDirectoriesMapAtom` — 附件目录
- `agentPromptSuggestionsAtom` — 提示建议
- `agentPermissionModeMapAtom` — 权限模式
- `conversationDraftsAtom` — Chat 草稿

这些 Map 的条目在 `running === false` 且 AgentView 重新渲染后被清理（`AgentView.tsx:395-401,643-647`）。但如果流在后台标签页完成，且标签页在用户查看之前就被关闭，这些条目将永久残留在 Map 中。

## 影响

长时间运行 + 大量创建/关闭标签页的场景下，内存持续增长。每个泄漏条目包含完整消息内容、工具调用历史和流式状态。

## 建议

开 `cs-issue`：
1. 在 `useCloseTab` 中增加所有 per-session Map atom 的清理
2. 将清理逻辑提取为共享工具函数，消除 `LeftSidebar.tsx:266-281` 和 `useCloseTab.tsx:61-74` 的清理集合不一致问题
