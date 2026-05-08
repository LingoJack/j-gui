---
doc_type: feature-ff-note
feature: finish-in-progress
date: 2026-05-08
requirement: ""
tags: [settings, config, alias, message-actions, yaml-config]
---

## 做了什么
收尾 roadmap 三项 in-progress 条目：YamlConfig 读写命令、设置对话框通用+别名 tab、消息删除/重发。

## 改了哪些
- `src-tauri/src/commands/config.rs:1-118` — 新增 `get_config`/`set_config` 命令，读写 j-cli YamlConfig（section → key-value）
- `src-tauri/src/commands/alias.rs` — 新建，`list_aliases`/`set_alias`/`remove_alias` 三命令，覆盖 path/inner_url/outer_url/script 四区
- `src-tauri/src/commands/mod.rs:1` — 注册 alias 模块
- `src-tauri/src/chat_engine.rs:138-175` — 新增 `delete_message(session_id, pair_index)`，JSONL 行级过滤重写
- `src-tauri/src/commands/chat.rs:41-44` — 新增 `delete_message` Tauri 命令
- `src-tauri/src/lib.rs:11-21` — 注册 6 个新命令（alias×3 + config×2 + delete_message）
- `src/lib/tauri.ts:57-125` — 新增 YamlConfigInfo/AliasEntry 类型 + 5 个 IPC 函数，移除旧 setConfig 重复定义
- `src/components/settings/SettingsDialog.tsx` — 重写为三 tab：通用（搜索引擎/日志模式/版本信息）+ 别名（CRUD 表单 + 列表）+ 模型（保留原逻辑）
- `src/components/chat/MessageBubble.tsx:7-9,59-75` — 新增 onDelete/onResend props + Trash2/RefreshCw 按钮
- `src/components/chat/ChatMessages.tsx:5-28` — 透传 onDelete/onResend 回调
- `src/components/chat/ChatView.tsx:12,186-199` — deleteMessage IPC 调用 + pair 级删除 + resend（截断后重发）

## 怎么验证的
- `cargo check` 零告警通过
- `bunx tsc --noEmit` 零错误通过
- 设置对话框三 tab 均可正常切换、表单交互完整

## 顺手发现
- 无
