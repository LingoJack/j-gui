---
doc_type: feature-ff-note
feature: markdown-rendering
date: 2026-05-08
tags: [frontend, markdown, syntax-highlight]
---

## 做了什么
将 ChatMessages 的 `whitespace-pre-wrap` 纯文本替换为 react-markdown + rehype-highlight 代码高亮，支持 GFM 表格/列表/引用块/代码块。

## 改了哪些
- `src/components/chat/MessageBubble.tsx` — 新增 Markdown 渲染组件（react-markdown + remark-gfm + rehype-highlight + prose 样式）
- `src/components/chat/ChatMessages.tsx` — 简化，委托给 MessageBubble
- `src/index.css` — 新增 highlight.js 代码高亮主题（github-dark 风格，15 条规则）

## 怎么验证的
tsc 零错误；bun run tauri dev 启动正常，发送包含代码块/表格/列表的消息后 AI 回复正确渲染 Markdown 格式。
