---
doc_type: feature-ff-note
feature: minimal-chat-chain
date: 2026-05-08
tags: [backend, chat-engine, frontend, chat-view, streaming]
---

## 做了什么
实现最小可用端到端 Chat 链路：后端 ChatEngine 封装 j-cli 的 `call_llm_stream_async`，通过 Tauri Channel 流式推送 ChatEvent；前端 ChatView（输入框 + 流式消息列表）接收并显示。

## 改了哪些
- `src-tauri/src/chat_engine.rs` — 新增 ChatEngine，封装 j-cli LLM 调用 + 会话持久化
- `src-tauri/src/commands/mod.rs` — 新增 commands 模块
- `src-tauri/src/commands/chat.rs` — 新增 send_message/list_sessions/create_session/delete_session 命令
- `src-tauri/src/lib.rs` — 注册 chat 命令，移除 greet
- `src/atoms/sessions.ts` — 新增 sessionsAtom/messagesAtom/streamingAtom
- `src/components/chat/ChatView.tsx` — 新增 Chat 主视图（Channel 流式接收 + Jotai 更新）
- `src/components/chat/ChatMessages.tsx` — 新增消息列表（user/assistant 气泡 + 流式光标）
- `src/components/chat/ChatInput.tsx` — 新增消息输入框（Enter 发送）
- `src/components/app-shell/MainArea.tsx` — 集成 ChatView
- `src/lib/tauri.ts` — ChatEvent 类型增加 error variant

## 怎么验证的
`cargo check` + `bunx tsc --noEmit` 均零错误；`bun run tauri dev` 启动成功，窗口显示三栏布局 + Chat 界面，输入消息后通过 Channel 接收流式 AI 回复并实时显示。

## 已知局限
- 仅使用 provider 列表第一个，暂不支持模型切换 UI
- 无 Markdown 渲染（纯文本 whitespace-pre-wrap）
- agent loop 在 spawn_blocking 中运行（非最优，后续应优化为原生 async）
- 会话列表 UI 仍为静态占位数据
