---
doc_type: audit-finding
audit: 2026-05-09-post-parity-regression
finding_id: "bug-06"
nature: bug
severity: P2
confidence: medium
suggested_action: cs-issue
status: open
---

# Finding 06：Chat 模式下草稿切换 tab 后不恢复

## 速答

`ChatInput.tsx:38-42` 的 `useEffect` 监听 `draft` prop 变化来恢复草稿。但 `draft` 在切换 tab 时通过 `chatDraftsAtom` 恢复，而 `chatDraftsAtom` 的内容只在 `handleSend` 中被 `setDrafts((prev) => ({ ...prev, [activeTabId]: "" }))` 清空，不在用户输入时写入。`onDraftChange` 回调在 `ChatView.tsx:264-270` 中被传入，但 `handleDraftChange` 只在 `ChatView` 中有实现。

## 关键证据

- `ChatInput.tsx:38-42` — `useEffect` 依赖 `draft` prop，切换 tab 时 `draft` 变化来恢复
- `ChatInput.tsx:163` — `onDraftChange?.(val)` 只在文本变化时调用，但初始化时 `draft` 恢复可能被覆盖
- `ChatInput.tsx:26` — `const [text, setText] = useState(draft ?? "");` — `useState` 只在首次渲染时用 `draft` 初始化，后续 `draft` prop 变化靠 `useEffect` 同步
- `ChatInput.tsx:39-40` — `if (draft !== undefined) { setText(draft ?? ""); }` — 如果 `draft` 是 `undefined`（未定义），不会重置 `text`

## 影响

切换 tab 再切换回来后，之前 tab 编辑的草稿不会恢复，或恢复后被新的输入覆盖。低优先级但影响日常使用体验。

## 修复方向

1. 确保 `useEffect` 中的 `draft` 比较能正确检测到切换
2. 确认 `onDraftChange` 在 `ChatView` 和 `AgentView` 中都能正确持久化草稿
