---
doc_type: audit-finding
audit: 2026-05-09-full-scope
finding_id: "arch-drift-17"
nature: arch-drift
severity: P2
confidence: high
suggested_action: cs-arch
status: open
---

# Finding 17：frontend-chat-ui.md "无 Markdown 渲染" 已过时

## 速答

`frontend-chat-ui.md` 的已知约束中写道"无 Markdown 渲染：当前 whitespace-pre-wrap 纯文本"，但 `MessageBubble.tsx` 已使用 `react-markdown` + `remarkGfm` + `rehypeHighlight` 进行完整的 Markdown 渲染。

## 关键证据

- `.codestable/architecture/frontend-chat-ui.md:117` — "无 Markdown 渲染：当前 whitespace-pre-wrap 纯文本，代码块/表格/列表无格式化"
- `src/components/chat/MessageBubble.tsx:2-4` — `import ReactMarkdown from "react-markdown"`、`import remarkGfm from "remark-gfm"`、`import rehypeHighlight from "rehype-highlight"`
- `src/components/chat/MessageBubble.tsx:53-70` — 完整的 Markdown 渲染 JSX，含 prose 样式、表格样式、代码高亮

此外文档中还提到"无消息操作：缺复制/删除/重新发送按钮"，但 `MessageBubble.tsx` 已有 Copy/Resend/Delete/Fork 按钮。

## 影响

架构文档的"已知约束"部分与代码实际能力不符，可能误导 feature-design 时的决策（例如认为 Markdown 渲染还未实现而计划重复开发）。

## 修复方向

用 `cs-arch update` 更新 `frontend-chat-ui.md` 的已知约束部分。

## 建议动作

`cs-arch`，更新架构文档。
