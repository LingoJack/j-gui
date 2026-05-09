---
doc_type: audit-finding
audit: 2026-05-09-post-parity-regression
finding_id: "bug-01"
nature: bug
severity: P0
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 01：Chat 发送消息无回复，Channel 事件未渲染

## 速答

Chat 模式发送消息后，Channel `onmessage` 不触发，消息停留在"正在思考"空状态。在 `ChatView.tsx:144-240` 的 `Channel<ChatEvent>` 事件分派中，`runId` 的变更检查或 `streamingByTabRef` 状态可能阻止了事件到达。

## 关键证据

- `ChatView.tsx:141-142` — `chatRunIdByTabRef.current[activeTabId] = runId`，每次 send 递增 runId
- `ChatView.tsx:146` — `if (chatRunIdByTabRef.current[activeTabId] !== runId) return;` — 如果 `activeTabId` 与 Channel 创建时不一致，事件被丢弃
- `ChatView.tsx:147` — `if (!streamingByTabRef.current[activeTabId]) return;` — 如果 streaming 标志被误重置，事件被丢弃
- `ChatInput.tsx:90-97` — `handleSend` 在 `onSend(trimmed)` 后不等待完成就 `setText("")`，可能导致状态竞态

## 影响

Chat 完全不可用——用户输入消息后看不到任何回复，应用失去核心功能。

## 修复方向

1. 检查 `ChatView.tsx:136-139` 中 `setStreamingByTab` 与 `streamingByTabRef` 的同步时序——`setStreamingByTab` 是异步 Jotai 更新，`streamingByTabRef.current = true` 是同步 ref 更新。Channel 创建在 ref 更新之后但可能在 atom 更新之前，如果其他组件读 atom 发现仍为 false 并重置 ref，会导致 Channel 事件被 `if (!streamingByTabRef.current[activeTabId]) return;` 拦截。
2. 添加 Channel `onmessage` 执行日志（console.log）确认事件是否抵达前端。
3. 移除 runId 检查或使用更稳健的 race-condition 防止机制。
