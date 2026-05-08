---
doc_type: audit-finding
audit: phase-abc-review
id: F-05
nature: maintainability
severity: P2
confidence: medium
recommendation: cs-refactor
---

# F-05: 共享 atoms 阻止同类型多标签会话隔离

## 位置

`src/atoms/sessions.ts:30-34`, `src/components/app-shell/MainArea.tsx:295-305`

## 证据

```typescript
// sessions.ts — 全局共享
export const chatMessagesAtom = atom<Message[]>([]);
export const agentMessagesAtom = atom<Message[]>([]);

// MainArea.tsx — 两个 Chat tab 共享同一个 ChatView
{mode === "chat" ? <ChatView /> : <AgentView />}
```

ChatView 和 AgentView 各自读写全局 `chatMessagesAtom` / `agentMessagesAtom`。打开两个 Chat 标签 → 两者共享同一套消息状态 → 切换标签时消息被另一个标签覆盖。

## 影响

- 当前功能正常（依赖 AppShell 的 `useEffect` 在切换 activeTab 时自动调用 `getSessionMessages` 重新加载）
- 但不能真正"并行打开两个 Chat 对话"——切换标签时会有一瞬间显示旧内容再刷新
- 架构上阻止了未来的 per-tab 消息独立展示

## 修复建议

需要 per-tab 消息隔离——`messagesMapAtom: Record<tabId, Message[]>` 或类似结构。这是一个架构级改进，建议在 Phase D/E 之后作为独立重构处理。
