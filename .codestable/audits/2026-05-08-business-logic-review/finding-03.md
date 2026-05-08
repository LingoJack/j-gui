---
doc_type: audit-finding
audit: business-logic-review
id: F-03
nature: bug
severity: P1
confidence: medium
recommendation: cs-issue
---

# F-03: Chat 模式"新建"不停止后端 streaming — API credits 持续消耗

## 位置

`src/components/chat/ChatView.tsx:287-296` — "新建"按钮 onClick

## 证据

```tsx
// ChatView.tsx:287-296
<button
  onClick={() => {
    setMessages([]);
    setSessionId(null);
    setStreaming(false);
    streamingRef.current = false;  // 仅前端跳过后续事件
  }}
  ...
>
  新建
</button>
```

`streamingRef.current = false` 仅让 `onEvent.onmessage` 回调忽略后续 chunk：

```tsx
// ChatView.tsx:100-101
onEvent.onmessage = (msg) => {
  if (!streamingRef.current) return;  // 静默丢弃
  ...
};
```

但后端 `call_llm_stream_async` **不知道**前端已放弃——Channel 未被 drop（仍在 `handleSend` 的 async 作用域内存活），`on_event.send()` 继续成功，HTTP 流继续消费。

## 影响

- 用户以为点了"新建"就停止了，实际后端仍在调用 LLM
- **消耗 API 额度**（每次可能在浪费数百 tokens 的完整响应）
- 对比 Agent 模式：`AgentEngine.close()` 会 kill 子进程，Agent 模式能真停止

## 根因

Chat 模式依赖 `call_llm_stream_async`，其 callback 通过 `on_event.send().is_err()` 检测取消。但取消只发生在 Channel 被 drop 时——即在 `handleSend` 的 `sendMessage` 调用返回并清理作用域时。而 `sendMessage` 是阻塞在 `spawn_blocking` 上的，不会提前返回。

## 修复建议

两种方向：
1. **Channel drop 方案**：把 Channel 存到 ref，点击"新建"时替换 ref 中的 Channel（旧的被 drop → `send()` 失败 → `cancelled = true`）
2. **session-id 轮转方案**：每次"新建"生成新 session_id，后端通过某种带外信号（如 abort handle）通知取消

## 修复记录 (2026-05-08)

**已实施**（方案 1）：

- `ChatView.tsx:49`: 新增 `channelRef = useRef<Channel<ChatEvent> | null>(null)`
- `ChatView.tsx:101`: `handleSend` 中 `channelRef.current = onEvent` 存储当前 Channel
- `ChatView.tsx:290`: "新建" onClick 首行 `channelRef.current = null` —— 丢弃旧 Channel 使后端 `on_event.send().is_err()` 为 true，触发 `cancelled = true`

**验证**：bun run test 15 passed ✅ | TypeScript tsc --noEmit 0 error ✅
