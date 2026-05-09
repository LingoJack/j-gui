---
doc_type: audit-finding
audit: 2026-05-09-full-scope
finding_id: "bug-05"
nature: bug
severity: P2
confidence: low
suggested_action: cs-issue
status: open
---

# Finding 05：ChatInput thinking 开关状态本地化，未接入后端

## 速答

`ChatInput.tsx` 的 `thinking` 状态（Brain 按钮）是纯本地 `useState`，切换后不传递给 `onSend`，也不影响 `sendMessage` 调用。按钮有视觉反馈但功能未连线。

## 关键证据

- `src/components/chat/ChatInput.tsx:15` — `const [thinking, setThinking] = useState(false);`
- `src/components/chat/ChatInput.tsx:25-31` — `handleSend` 调用 `onSend(trimmed)` 时不传递 thinking 状态
- `src/components/chat/ChatView.tsx:88` — `handleSend` 签名是 `async (content: string)` 不接受 thinking 参数
- `src-tauri/src/chat_engine.rs:56-124` — `send_message` 不接受任何 thinking/reasoning 参数

thinking toggle 与后端之间没有任何数据通路。

## 影响

用户点击 Brain 按钮看到视觉变化，但实际请求不会启用 extended thinking。属于"看起来能用但实际不行"的假功能。

## 修复方向

将 thinking 参数加入 `sendMessage` 的 IPC 调用，并在 `chat_engine.rs` 中传递给 `call_llm_stream_async`（需 j_cli 支持该参数）。

## 建议动作

`cs-issue`，因为涉及功能未连通。
