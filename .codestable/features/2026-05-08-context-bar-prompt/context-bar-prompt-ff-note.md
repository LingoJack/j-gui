---
doc_type: feature-ff-note
feature: context-bar-prompt
date: 2026-05-08
requirement: j-gui-ai-interaction
tags: [system-prompt, context-bar, token-count, chat-header]
---

## 做了什么
ChatHeader 新增三个组件：系统提示词弹窗编辑器（Pencil 图标 → 弹出 textarea 编辑 system_prompt.md）、token 用量徽章（字符数/3.5 估算）、清空上下文按钮（后端 append SessionEvent::Clear）。

## 改了哪些
- `src-tauri/src/commands/config.rs:1,122-135` — 新增 `get_system_prompt`/`set_system_prompt` 命令，直接复用 j-cli 的 load/save_system_prompt
- `src-tauri/src/commands/chat.rs:1,47-56` — 新增 `clear_session` 命令，append SessionEvent::Clear + session_id 校验
- `src-tauri/src/chat_engine.rs:43` — validate_session_id 改为 pub 供 clear_session 复用
- `src-tauri/src/lib.rs:21,26-27` — 注册 3 个新命令
- `src/lib/tauri.ts:107-122` — 新增 getSystemPrompt/setSystemPrompt/clearSession IPC 函数
- `src/components/chat/ChatView.tsx` — 完整重写 header 区：系统提示词弹窗 + token 徽章 + 清空按钮 + 保留新建/模型选择/主题切换

## 怎么验证的
- `cargo check` 零告警通过
- `bunx tsc --noEmit` 零错误通过
- UI 交互：弹窗打开/编辑/保存、清空上下文调用后端 Clear 事件

## 顺手发现
- 无
