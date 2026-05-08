---
doc_type: feature-ff-note
feature: session-list
date: 2026-05-08
tags: [frontend, sessions, sidebar]
---

## 做了什么
LeftSidebar 会话列表替换静态占位数据，绑定 `list_sessions()` API，按日期分组（今天/昨天/更早），点击切换会话，悬停删除，新建会话自动刷新。

## 改了哪些
- `src/components/app-shell/LeftSidebar.tsx` — 重写会话列表逻辑：useEffect 轮询加载 + 日期分组 + 切换/删除/新建
- `src/atoms/sessions.ts` — SessionInfo.title 类型对齐 tauri.ts（增加 `| null`）

## 怎么验证的
tsc 零错误；cargo check 通过。
