---
doc_type: feature-ff-note
feature: message-actions
date: 2026-05-08
tags: [frontend, chat, copy, ux]
---

## 做了什么
MessageBubble 增加复制按钮——hover 时显示，点击复制整条消息纯文本内容到剪贴板，复制后图标变为绿色对勾 1.5s。

## 改了哪些
- `src/components/chat/MessageBubble.tsx` — 新增复制按钮（navigator.clipboard.writeText + copied state + hover 显示）

## 怎么验证的
tsc 零错误。
