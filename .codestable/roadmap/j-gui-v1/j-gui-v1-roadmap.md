---
doc_type: roadmap
slug: j-gui-v1
status: active
created: 2026-05-10
last_reviewed: 2026-05-10
tags: [tauri, desktop, j-cli, chat, agent]
---

# j-gui v1 — Tauri 桌面 AI 客户端

## 项目定位

基于 Proma UI/UX 重构的 Tauri 桌面 AI 客户端，后端集成 j-cli 引擎。

- **Chat**: j-cli 流式对话引擎
- **Agent**: CC SDK CLI + j-agent (jcli 仓库)
- **UI**: Proma React 前端 (致谢: [Proma](https://github.com/ErlichLiu/Proma), Apache-2.0)

## 后端能力现状

51 个已注册 Tauri 命令，按模块分布:

| 模块 | 命令数 | 状态 |
|---|---|---|
| Agent (commands/agent.rs) | 12 | CC SDK CLI + 标题/权限 |
| Chat (commands/chat.rs) | 8 | 工作 (j-cli) + stop_generation |
| Channels (commands/channels.rs) | 6 | 工作 (CRUD + 测试 + 模型) |
| Config (commands/config.rs) | 7 | 工作 (j-cli) |
| Settings (commands/settings.rs) | 8 | 工作 (GUI配置 + 工作区 + 环境检测) |
| Files (commands/files.rs) | 4 | 工作 (对话框 + 附件) |
| Governance (commands/governance.rs) | 6 | 基础 (Skills/Hooks/MCP — 仅 j-cli 源) |
| System (commands/system.rs) | 2 | 工作 |
| Alias (commands/alias.rs) | 3 | 工作 (j-cli) |

关键缺口:
- API Key 加密存储
- j-agent 集成 (jcli 仓库 j-agent crate)
- 全局 Skills 发现 (`~/.claude/agents/skills/` + `~/.agent/skills/`)
- CC SDK 源 Skills/MCP/Hooks 与 j-cli 源的 UI 区分

## 双源架构（Skills / MCP / Hooks）

详见 `ARCHITECTURE.md §2.7`。核心约束：

- **源 A (j-cli)**: Skills/MCP/Hooks 存储于 `~/.jdata/agent/`，已有 list/save 命令
- **源 B (CC SDK)**: Skills/MCP 存储于 `~/.jdata/agent/sdk-config/` + 工作区目录
- **全局 Skills**: `~/.claude/agents/skills/` 和 `~/.agent/skills/`（npx 安装），需 UI 扫描 + 导入
- **数据同源原则**: Chat/Agent 会话走 j-cli 原生路径；Provider 配置走 `agent_config.json`；GUI 独有配置走 `%APPDATA%/j-gui/`

## 子 Feature 清单

### Phase A: 可用 MVP (P0 — 全部完成 ✅)

1. ~~channel-management~~ ✅ — 渠道 CRUD + test_channel_direct + fetch_models
2. ~~stop-generation~~ ✅ — Chat/Agent 中断生成 (STOPPED_SESSIONS)
3. ~~agent-title~~ ✅ — generate_agent_title + update_agent_session_title
4. ~~agent-permissions~~ ✅ — respond_permission + respond_ask_user
5. ~~file-dialog~~ ✅ — open_file_dialog + save/read_attachment + list_directory
6. ~~conversation-title~~ ✅ — update_conversation_title 对接到 Rust
7. ~~git-node-detection~~ ✅
8. ~~workspace-crud~~ ✅
9. ~~timestamp-fix~~ ✅

### Phase B: j-cli 功能对齐 + 双源 Skills (P1)

10. **alias-ui** — Alias 管理 UI tab，后端已有 list/set/remove
11. **skills-dual-source-ui** — Skills 管理 UI：列出 j-cli Skills + CC SDK Workspace Skills + 扫描 `~/.claude/agents/skills/` 和 `~/.agent/skills/` 全局 Skills，支持导入到工作区
12. **hooks-ui** — Hooks 管理 UI，后端已有 list_hooks
13. **mcp-dual-source-ui** — MCP Server 配置 UI：区分 j-cli 源 (`mcp_config.json`) 和 CC SDK 工作区源 (`mcp.json`)
14. **chat-tools-ui** — Chat Tools 管理 UI，后端已有 list/set_enabled
15. **system-prompt-ui** — System Prompt 编辑器，后端已有 get/set
16. **yaml-config-editor** — 全局 YamlConfig 查看/编辑 UI
17. **channel-provider-ui** — 渠道 Provider CRUD UI + 模型选择器 + 测试连接

### Phase C: 体验追平 (P2)

18. **workspace-mcp** — 工作区 MCP 读写持久化
19. **message-persistence** — Chat 消息 JSONL (对接 j-cli session)
20. **session-archive** — 会话归档/搜索
21. **error-toast** — 统一错误提示 + 边界处理

### Phase D: 发布就绪 (P3)

22. **file-browser** — 文件树操作 (open/delete/rename)
23. **branding-cleanup** — @proma/* 包名重命名为 @jgui/*
24. **readme-docs** — README 完善 + 用户指南
25. **build-packaging** — Tauri bundle (Windows/macOS/Linux)
26. **tdd-coverage** — 测试覆盖达标 (前端 vitest + 后端 cargo test)

## 架构决策

- **Chat 后端**: j-cli 直接调用 (`call_llm_stream_async`)
- **Agent 后端**: CC SDK CLI 子进程 (当前) + j-agent crate (计划)
- **IPC**: Tauri `invoke()` + `Channel<T>` (流式) + EventBus (事件分发)
- **存储**: Chat/Agent 会话走 j-cli 路径 (`~/.jdata/`)；GUI 配置走 `%APPDATA%/j-gui/` (Windows) / `~/.j-gui/` (Unix)
- **状态**: Jotai atoms，前端不引入 React Router
- **Skills/MCP/Hooks**: j-cli 源和 CC SDK 源各自独立路径，UI 区分展示，全局 Skills 只读导入

## 观察项

- j-cli `SkillSource` 枚举当前只有 `User | Project`，全局 Skills 导入需扩展 `Global` 变体
- CC SDK MCP 工作区配置 (`mcp.json`) 与 j-cli MCP 配置 (`mcp_config.json`) 格式可能不同，需确认序列化兼容

## 变更日志

- 2026-05-10 (Phase B 完成): Phase B 8 项全部 TDD 实现——alias-ui / skills-dual-source-ui (含 scan_global_skills + copy_skill_to_workspace) / hooks-ui / mcp-dual-source-ui / chat-tools-ui (BuiltinToolsSection + list_chat_tools/set_tool_enabled) / system-prompt-ui (后端 7 命令注册 + j-cli 默认内容首读加载) / yaml-config-editor / channel-provider-ui（已有）。后端 57/57 + 前端 54/54 测试通过，cargo check 零新告警。
- 2026-05-10 (更新): Phase A 全部完成 (9/9)；命令数 38→51；新增双源架构约束；Skills/MCP/Hooks 条目更新为 dual-source 版本；补充全局 Skills 路径

## 致谢

本项目前端 UI 基于 [Proma](https://github.com/ErlichLiu/Proma) (Apache-2.0) 重构。
Proma 原作者: ErlichLiu，感谢其出色的开源工作。
