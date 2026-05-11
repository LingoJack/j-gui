---
doc_type: audit-finding
audit: 2026-05-11-frontend-backend-closure
finding_id: "bug-03"
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 03：内容搜索结果只会打开会话，不能定位到命中的消息

## 速答

共享类型里的内容搜索结果已经携带了 `messageId`，但 `SearchDialog` 在组装 `ContentResult` 时把这个锚点丢掉了，最后点击结果只会 `openSession(...)` 打开整个会话，无法落到真正命中的消息。

## 关键证据

- `packages/shared/src/types/chat.ts:144-160` — `MessageSearchResult` 包含 `messageId`。
- `packages/shared/src/types/agent.ts:633-649` — `AgentMessageSearchResult` 同样包含 `messageId`。
- `src/components/app-shell/SearchDialog.tsx:38-47` — 前端本地 `ContentResult` 结构没有 `messageId` 或任何锚点字段。
- `src/components/app-shell/SearchDialog.tsx:212-234` — 从 `MessageSearchResult` / `AgentMessageSearchResult` 映射到 `ContentResult` 时，只保留了 `session/conversation id + snippet`，显式丢弃了 `messageId`。
- `src/components/app-shell/SearchDialog.tsx:260-273` — 点击结果时仅调用 `openSession('chat'|'agent', result.id, title)`。
- `src/hooks/useOpenSession.ts:33-63` — `useOpenSession` 只负责切到目标会话/标签，没有任何“滚到某条消息”或“打开锚点”的参数入口。

## 影响

对用户来说，这会把“内容搜索”退化成“知道这段内容存在于这个会话里”。命中很多、会话很长时，搜索结果并不能真正完成“带我去那里”的闭环，价值会明显低于标题搜索。

## 修复方向

把 `messageId` 贯穿到 `ContentResult` 和 `openSession`/消息视图打开链路，至少支持首次打开后滚动并高亮命中消息。

## 建议动作

`cs-issue`，因为这是用户可直接感知的功能性缺失。
