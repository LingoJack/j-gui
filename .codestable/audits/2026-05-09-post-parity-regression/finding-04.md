---
doc_type: audit-finding
audit: 2026-05-09-post-parity-regression
finding_id: "bug-04"
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 04：Agent 无独立停止按钮，只能通过关 tab 停止

## 速答

Agent View 没有独立的"停止"按钮。用户启动 Agent 后，唯一的停止方式是关掉整个 tab（通过 X 按钮→确认对话框→stopAgent）。作为对比，Chat 模式虽然也没有显式停止按钮，但 Channel drop 会触发流式中止。Agent 模式的 stopAgent 只被 `MainArea.tsx:87-95` 的 tab 切换 useEffect 和 executeCloseTab 调用。

## 关键证据

- `AgentView.tsx` 全文 — 没有输出区停止按钮；`ChatInput` 的 `sendDisabled={streaming}` 只禁用发送按钮
- `useAgentEngine.ts:218-228` — `stopEngine()` 只用于 session 切换和组件卸载
- `MainArea.tsx:87-95` — 切换 tab 时如果离开的是 Agent tab，调用 `stopAgent()`
- `MainArea.tsx:116-118` — `executeCloseTab` 中如果关闭的是 Agent tab，调用 `stopAgent()`

## 影响

用户有流式输出了想停止，只能关 tab（丢失上下文）或切 tab（自动停但同样丢失上下文）。没有轻量级的"停止当前 Agent 但不销毁上下文"的能力。

## 修复方向

1. 在 AgentView 的 ChatInput 旁添加停止按钮，streaming 时发送按钮隐藏、停止按钮显示
2. 停止后保留已输出内容和工具结果（不销毁 timeline）
3. 键盘快捷键 `Ctrl+Shift+Backspace` 已支持停止（需要验证是否作用于 Agent）
