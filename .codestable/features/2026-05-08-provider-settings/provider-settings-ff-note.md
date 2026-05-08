---
doc_type: feature-ff-note
feature: provider-settings
date: 2026-05-08
tags: [backend, config, frontend, settings, provider]
---

## 做了什么
实现模型提供方配置管理：后端读写 j-cli 的 `agent_config.json`，前端 SettingsDialog（模型 tab 增删改 + 选中切换）+ ChatHeader 下拉模型选择器。

## 改了哪些
- `src-tauri/src/commands/config.rs` — 新增 get_agent_config/set_agent_config/set_active_provider 命令
- `src-tauri/src/commands/mod.rs` — 注册 config 模块
- `src-tauri/src/chat_engine.rs` — send_message 改用 active_index 选 provider（替换 first()）
- `src-tauri/src/lib.rs` — 注册 3 个 config 命令
- `src/atoms/config.ts` — 新增 agentConfigAtom/activeProviderAtom
- `src/components/settings/SettingsDialog.tsx` — 新增设置对话框（模型 tab：provider 列表 + 增删改 + 选中切换）
- `src/components/chat/ChatView.tsx` — ChatHeader 新增模型选择下拉
- `src/components/app-shell/AppShell.tsx` — 集成 SettingsDialog
- `src/components/app-shell/LeftSidebar.tsx` — 设置按钮打开 SettingsDialog
- `src/lib/tauri.ts` — 新增 getAgentConfig/setAgentConfig/setActiveProvider + 类型定义

## 怎么验证的
cargo check + tsc 零错误；bun run tauri dev 启动正常，设置按钮打开 SettingsDialog，可添加/编辑/删除 provider，选择后 ChatHeader 模型下拉同步切换，配置保存到 ~/.jdata/agent/data/agent_config.json。
