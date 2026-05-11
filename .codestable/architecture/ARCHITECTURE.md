---
doc_type: architecture
slug: ARCHITECTURE
scope: j-gui 系统架构总入口
summary: 当前总入口，覆盖 AppShell（减薄为纯布局容器）、多标签页系统（tabs/）、新原子体系（agent-atoms/chat-atoms/tab-atoms 等）、后端命令与 governance 层、前端 ipc EventBus 与全局事件监听
status: current
last_reviewed: 2026-05-10
tags: [tauri, react, desktop, chat, agent, settings, tabs]
depends_on: []
implements: []
---
# j-gui 架构总入口

> 状态：前端有显著重构——AppShell 已减薄为纯布局容器，多标签页系统独立为 `tabs/` 模块，Jotai 原子体系全面拆分，Chat/Agent 视图通过 `ConversationProvider` / `AgentSessionProvider` 隔离状态，全局事件监听统一到 `useGlobalChatListeners` / `useGlobalAgentListeners`，设置面板重构为 10 标签组件体系，消息渲染基于 `@proma/shared` SDK 类型系统。
> 最后更新：2026-05-10

## 1. 定位与受众

j-gui 是 Tauri v2 桌面应用。前端是 React + TypeScript + Vite，后端是 Rust + Tauri command 层。`src/main.tsx:1-10` 挂载 App，`AppShell` 是极简布局容器，实际业务由各子系统独立承担。

这份文档只记现状，不写未来规划。

**受众**：feature-design（理解模块边界）、issue-analyze（定位代码）、新人上手（理解当前结构）。

## 2. 架构总览

### 2.1 入口与组件树

```
src/main.tsx
  └─ GlobalShortcuts (return null, 顶层挂载)
  └─ AppShell (纯布局容器, ~57 行)
       ├─ titlebar-drag-region (z-50, 窗口拖动)
       ├─ LeftSidebar (~1800 行)
       │    ├─ ModeSwitcher (agent/chat)
       │    ├─ WorkspaceSelector (agent only)
       │    ├─ 新对话/新会话
       │    ├─ Chat: 置顶 + 日期分组列表
       │    ├─ Agent: 双区可拖拽布局 (Working + 最近)
       │    └─ 搜索/设置入口 / UserAvatar
       ├─ MainArea (flex-1)
       │    └─ TabBar + TabContent
       │         ├─ TabBar (Chrome 风格多标签, 拖拽重排)
       │         ├─ ChatView(conversationId) — wrapped in ConversationProvider
       │         ├─ AgentView(sessionId) — wrapped in AgentSessionProvider
       │         └─ SettingsDialog (浮窗, Radix Dialog)
       └─ RightSidePanel (agent only)
            └─ SidePanel (会话文件 + 工作区文件 + FileBrowser)
```

全局浮窗（通过原子控制渲染，不在组件树固定位置）：
- `SearchDialog` — `searchDialogOpenAtom`，LeftSidebar 内挂载
- `SettingsDialog` — `settingsOpenAtom`，MainArea 内挂载
- `TabCloseConfirmDialog` — `pendingCloseTabIdAtom`，TabBar 内挂载

### 2.2 前端状态（Jotai 原子体系）

原子已彻底拆分，不再有老的 `config.ts`/`sessions.ts`/`sidebar.ts`/`tabs.ts`/`toast.ts`/`ui.ts`。按领域拆分为：

| 原子文件 | 核心内容 | 关键类型/atom |
|----------|---------|---------------|
| `src/atoms/agent-atoms.ts` | Agent 会话、消息、流式、中断、workspace、任务 | `AgentEvent`, `ToolActivity`, `AgentState`, `streamingStatesMap` |
| `src/atoms/chat-atoms.ts` | 对话列表、消息、流式状态、并行模式 | `Conversation`, `ConversationStreamState`, `streamingStatesAtom` |
| `src/atoms/tab-atoms.ts` | 多标签页管理 | `TabItem`, `tabsAtom`, `activeTabIdAtom`, `openTab/closeTab` |
| `src/atoms/sidebar-atoms.ts` | 侧栏视图模式与状态 | `sidebarOpenAtom`, `sidebarViewModeAtom` |
| `src/atoms/settings-tab.ts` | 设置标签页 | `settingsTabAtom`, `settingsOpenAtom`, `channelFormDirtyAtom` |
| `src/atoms/search-atoms.ts` | 搜索状态 | `searchDialogOpenAtom` 等 |
| `src/atoms/notifications.ts` | 通知系统（替换 toast） | |
| `src/atoms/app-mode.ts` | 主模式 | `appModeAtom: 'chat' \| 'agent'` |
| `src/atoms/theme.ts` | 主题 | `themeAtom` |
| `src/atoms/ui-preferences.ts` | UI 偏好 | 字体大小等 |
| `src/atoms/user-profile.ts` | 用户档案 | |
| `src/atoms/chat-tool-atoms.ts` | Chat 工具启停 | |
| `src/atoms/system-prompt-atoms.ts` | 系统提示词管理 | |
| `src/atoms/draft-session-atoms.ts` | 草稿会话 | |
| `src/atoms/working-atoms.ts` | Working 状态 | |
| `src/atoms/shortcut-atoms.ts` | 快捷键配置 | |
| `src/atoms/environment.ts` | 环境信息 | |

关键原子设计模式：
- **`{{type}}StatesAtom`** 为 `Map<conversationId/sessionId, State>`，支持多标签流式状态隔离
- 消息原子为派生 atom（由 `chatMessagesRefreshAtom` / `agentMessageRefreshAtom` 版本号驱动主动刷新）
- **per-tab 隔离**：tab 切换通过 `tabsAtom` + `activeTabIdAtom` 派生，不共享消息状态

### 2.3 后端命令与引擎

后端入口 `src-tauri/src/lib.rs` 注册所有命令，当前共有 **82 个 Tauri 命令**（`generate_handler![]`）。

#### 内核 Trait 抽象层（`src-tauri/src/kernel/`）

2026-05-10 新增的 kernel trait 层将 j-cli 依赖与 Tauri 命令层解耦，支持命令单元测试：

| Trait | 文件 | 方法数 | 说明 |
|-------|------|--------|------|
| `ChatKernel` | `kernel/chat.rs` | 11 | Chat 流式 + 会话 CRUD + 固定/归档 |
| `ConfigKernel` | `kernel/config.rs` | 18 | Channel CRUD + Alias + SystemPrompt + YamlConfig + 主题/系统 |
| `GovernanceKernel` | `kernel/governance.rs` | 21 | Skills/Hooks/MCP CRUD + 工作区管理 + CC SDK 导入 |

所有 trait 均标注 `Send + Sync`，`ConfigKernel` 和 `GovernanceKernel` 通过 `#[mockall::automock]` 支持 mock 测试。

**实现**：`kernel/adapter.rs` 中的 `JcliAdapter` 是三个 trait 的唯一实现。所有 `j_cli::` 导入**仅限 adapter.rs**（及 `commands/governance.rs` 中少量遗留导入）。命令层通过 `Arc<dyn ChatKernel>` / `Arc<dyn ConfigKernel>` / `Arc<dyn GovernanceKernel>` 调用，不直接依赖 j_cli。

**测试模式**：每个命令文件采用 `_impl` 函数签名——`fn foo_impl(kernel: &dyn ConfigKernel, ...)` 接收 trait 引用，Tauri `#[tauri::command]` 函数仅做薄入口（提取 managed state 后委托 `_impl`）。这使得业务逻辑可在单元测试中通过 mock/mockall 注入测试，无需启动 Tauri 运行时。

**Chat 引擎**（`src-tauri/src/commands/chat.rs` + `src-tauri/src/chat_engine.rs`）：
- `send_message` — 流式 LLM 调用，`std::thread::spawn + tokio::block_on` 线程模型
- `stop_generation` — 生成中止（`STOPPED_SESSIONS` 全局标记）
- `list_sessions` / `create_session` / `delete_session` / `get_session_messages` / `delete_message` / `clear_session` / `toggle_pin_conversation` / `toggle_archive_conversation`
- 10 个 Chat 命令，通过 `ChatKernel` trait 访问 jcli 存储
- 详见 [backend-chat-engine](./backend-chat-engine.md)

**Agent 引擎**（`src-tauri/src/commands/agent.rs` + `src-tauri/src/agent_engine.rs` + `src-tauri/src/agent_session.rs`）：
- claude CLI 子进程 + stream-json 协议
- 12 个命令：`start_agent`, `create_agent_session`, `list_agent_sessions`, `get_agent_session`, `delete_agent_session`, `respond_agent_interrupt`, `send_agent_message`, `stop_agent`, `generate_agent_title`, `update_agent_session_title`, `respond_permission`, `respond_ask_user`
- 中断路由按 `kind` 分派（permission / ask_user / plan）
- 会话持久化在 `~/.jdata/agent/sessions/{id}/`，使用 `AGENT_TRANSCRIPT_LOCK` 串行化
- 详见 [backend-agent-engine](./backend-agent-engine.md)

**Governance 命令**（`src-tauri/src/commands/governance.rs`，当前 **21 个命令**）：
- 基础：`list_skills`, `list_hooks`, `list_mcp_servers`, `save_mcp_servers`, `list_chat_tools`, `set_tool_enabled`
- 全局扫描：`scan_global_skills`, `copy_skill_to_workspace`
- 启停管理：`toggle_hook`
- 工作区管理：`read_skill_content`, `write_skill_content`, `toggle_workspace_skill`, `delete_workspace_skill`, `get_workspace_skills`, `get_workspace_skills_dir`, `get_other_workspace_skills`, `import_skill_from_workspace`, `get_workspace_mcp_config`, `save_workspace_mcp_config`
- CC SDK 互操作：`import_cc_sdk_hooks`, `import_cc_sdk_mcp`
- 双源架构：j-cli 原生配置 + CC SDK 工作区配置，前端 UI 通过 `GovernanceKernel` trait 统一访问

**其他命令**（按模块）：
- `channels.rs`（6 命令：Channel CRUD + test_channel_direct + fetch_models）
- `files.rs`（6 命令：文件对话框 + 附件读写 + 目录列表 + delete/rename）
- `settings.rs`（15 命令：GUI 设置 + 用户档案 + Agent 工作区 + 环境检测 + SystemPrompt CRUD）
- `config.rs`（7 命令：agent_config / yaml_config / system_prompt 读写 + set_active_provider）
- `system.rs`（2 命令：版本与主题）
- `alias.rs`（3 命令：别名读写）

**测试覆盖**：Rust **136 测试**（kernel traits + adapter + commands） + 前端 **54 测试**（7 文件）。

**数据目录**：GUI 配置与附件存 `%APPDATA%/j-gui/` (Windows) / `~/.jgui/` (Unix)；Chat/Agent 会话存 `~/.jdata/`（j-cli constants）。

### 2.4 前端 IPC 层与全局事件监听

`src/lib/ipc.ts` 是 IPC façade，封装所有 `invoke()`、`Channel<T>` 创建与事件分发。与旧版 `src/lib/tauri.ts`（已移除）不同，ipc.ts 引入 EventBus 模式：

- `sendMessage()` 内部创建 `Channel<T>`，流式事件（chunk/reasoning/tool-activity/done/error）通过内存 EventBus 分发
- `useGlobalChatListeners`（`src/hooks/useGlobalChatListeners.ts`）在根级注册事件监听，写入 `streamingStatesAtom`
- `useGlobalAgentListeners`（`src/hooks/useGlobalAgentListeners.ts`）同理处理 Agent 流式事件
- 组件层面（ChatView/AgentView）不再直接管理 Channel 生命周期

`src/lib/shortcut-registry.ts` 注册全局快捷键，`src/components/shortcuts/GlobalShortcuts.tsx` 在 `main.tsx` 顶层挂载。

### 2.5 状态与持久化

UI 内存状态由上述 Jotai atoms 管理。持久化分三层：

1. **Chat 会话**：通过 `ChatEngine` → j_cli storage，落到 `~/.jdata/sessions/{id}/transcript.jsonl`
2. **Agent 会话**：通过 `agent_session.rs` → meta.json + transcript.jsonl，`~/.jdata/agent/sessions/{id}/`
3. **配置**：`agent_config.json` 由 SettingsDialog（ChannelConfig）读写

**数据目录**：Chat/Agent 会话由 j_cli 管理（`~/.jdata/`），GUI 配置与附件由 `src-tauri/src/commands/settings.rs` 管理（`%APPDATA%/j-gui/` 或 `~/.jgui/`）。

### 2.6 `@proma/shared` 类型系统

前后端共享 `@proma/shared` 包（`node_modules/@proma/shared/`），定义核心类型：
- `ChatMessage`, `ChatSendInput`, `FileAttachment` — Chat 消息模型
- `AgentEvent`, `AgentSessionMeta`, `SDKMessage` — Agent 事件与消息
- `PermissionRequest`, `AskUserRequest`, `ExitPlanModeRequest` — 中断请求类型
- `PromaPermissionMode`, `ThinkingConfig`, `TaskUsage` — 配置类型

### 2.7 Skills / MCP / Hooks 双源架构

j-gui 的 Agent 治理能力（Skills、MCP Server、Hooks）来自**两个独立后端**，各自有独立的存储路径和加载机制。前端 UI 通过 Governance 命令统一访问。

#### 源 A：j-cli（`src-tauri/src/commands/governance.rs`）

| 资源 | 用户级路径 | 项目级路径 | 命令 |
|------|-----------|-----------|------|
| Skills | `~/.jdata/agent/skills/` | `.jcli/skills/` | `list_skills` |
| MCP | `~/.jdata/agent/mcp_config.json` | — | `list_mcp_servers`, `save_mcp_servers` |
| Hooks | `~/.jdata/agent/hooks/` | `.jcli/hooks/` | `list_hooks` |

证据: `j_cli::constants::DATA_DIR = ".jdata"` → `skill.rs:52,58` `governance.rs:124-127` `hook/definition.rs:305,312`

#### 源 B：CC SDK（Claude Code SDK CLI）

| 资源 | 路径 | 说明 |
|------|------|------|
| SDK 配置 | `~/.jdata/agent/sdk-config/` (隔离自 `~/.claude/`) | `CLAUDE_CONFIG_DIR` 环境变量指向此处 |
| Workspace MCP | `~/.jdata/agent/workspaces/{slug}/mcp.json` | 每个 Agent 工作区独立 MCP 配置 |
| Workspace Skills | `~/.jdata/agent/workspaces/{slug}/skills/` | 工作区 Skills 目录 |
| 默认 Skills 模板 | `~/.jdata/agent/default-skills/` | 新工作区从这里复制 Skills 种子 |

证据: Proma `config-paths.ts:294-314,361-369,550-559` `agent-workspace-manager.ts:152-153`

#### 全局 Agent Skills（`.agent/` 和 `.claude/` 目录）

Claude Code 生态中，`npx skills add` 或 `npx @anthropic-ai/agent-skills` 会将 Skills 安装到 `~/.claude/agents/skills/` 或 `~/.agent/skills/`。这是 Vercel、Anthropic 等提供的开箱即用 Agent Skills。

**Proma 当前做法**：Proma **不会**自动加载这些目录的 Skills。`agent-prompt-builder.ts:256` 明确说明：
> "npx skills add 等外部命令安装到 .agents/skills/ 不会被加载，需手动 mv 到此目录"

**j-gui 已实现**：`scan_global_skills` 命令扫描 `~/.claude/agents/skills/` 和 `~/.agent/skills/` 作为**只读的全局 Skills 源**，在 Agent 设置 UI 中列出，`copy_skill_to_workspace` 命令允许用户导入到当前工作区。j-cli 的 `SkillSource` 枚举当前只有 `User | Project`，需扩展 `Global` 变体。

#### 数据同源原则

- **Chat/Agent 会话数据**：走 j-cli 原生路径（`~/.jdata/sessions/`、`~/.jdata/agent/sessions/`），保证与 j-cli CLI 的数据同步
- **Provider 配置**：读写 j-cli 的 `agent_config.json`（`load_agent_config / save_agent_config`）
- **GUI 独有配置**（主题/窗口/快捷键）：走 `%APPDATA%/j-gui/` 独立路径

## 3. 子系统

| 子系统 | 文档 | 说明 |
|--------|------|------|
| ChatEngine（后端） | [backend-chat-engine](./backend-chat-engine.md) | Chat 后端引擎、流式事件和会话持久化，含生成中止机制 |
| AgentEngine（后端） | [backend-agent-engine](./backend-agent-engine.md) | claude CLI、Agent 事件流、中断路由（3 种 kind）、timeline 持久化、governance 命令 |
| AppShell（前端外壳） | [frontend-app-shell](./frontend-app-shell.md) | 极简布局容器、多标签页系统（tabs/）、左侧栏、右侧面板、搜索、全局快捷键 |
| Agent UI（前端） | [frontend-agent-ui](./frontend-agent-ui.md) | AgentView、SDKMessageRenderer、3 个审批横幅、任务进度、侧面板 |
| Chat UI（前端） | [frontend-chat-ui](./frontend-chat-ui.md) | ChatView（prop-based）、ConversationProvider、ai-elements 渲染、TipTap 输入框、附件系统 |
| Settings UI（前端） | [frontend-settings-ui](./frontend-settings-ui.md) | 10 标签对话框、Channel CRUD、Agent 工作区、MCP 严格启用模式 |

## 4. 关键架构变化（自 2026-05-09 以来）

| 维度 | 旧 | 新 |
|------|----|----|
| AppShell | 会话加载/标题推导/快捷键都在 AppShell | 纯布局容器（57 行），功能剥离到各子模块 |
| Atoms | 单体 `sessions.ts`/`config.ts`/`tabs.ts`/`sidebar.ts`/`toast.ts`/`ui.ts` | 按领域拆分为 ~20 个独立原子文件 |
| Tab 系统 | 内联在 MainArea | 独立 `tabs/` 模块 + `tab-atoms.ts` 纯函数操作 |
| IPC 层 | `src/lib/tauri.ts` 直接 invoke + Channel | `src/lib/ipc.ts` EventBus + 全局事件监听 |
| Chat 消息 | 单体 per-tab atoms | prop-based `conversationId` + `ConversationProvider` + localStorage streamingStatesMap |
| Agent 事件 | AgentView 内联 Channel 管理 | 全局 `useGlobalAgentListeners` + agent-atoms |
| 设置 | 6 标签（内联 Models/General/Aliases） | 10 标签（提取组件，Alias/Hooks/YAML/Channel/MCP/Agent 配置深化） |
| 消息渲染 | MessageBubble + 文本协议推理 | ai-elements 原语 + Reasoning 组件 + SDKMessage 渲染 |
| 输入框 | 简单 textarea | TipTap 富文本 + 附件/语音/工具选择/快捷设置 |
| 状态模型 | `Message { role, content, isStreaming }` | `ChatMessage`（@proma/shared）含 reasoning/attachments/toolActivities |

## 5. 代码锚点

| 想看什么 | 从哪看 |
|----------|--------|
| 应用根入口 | `src/main.tsx:1-10` |
| 布局容器 | `src/components/app-shell/AppShell.tsx:24-57` |
| 多标签页系统 | `src/atoms/tab-atoms.ts` + `src/components/tabs/` |
| 左侧栏 | `src/components/app-shell/LeftSidebar.tsx:158-1356` |
| 右侧面板 | `src/components/app-shell/RightSidePanel.tsx` + `SidePanel.tsx` |
| 搜索浮窗 | `src/components/app-shell/SearchDialog.tsx` |
| Chat 视图 | `src/components/chat/ChatView.tsx` + `src/components/chat/ChatMessages.tsx` |
| Agent 视图 | `src/components/agent/AgentView.tsx` + `src/components/agent/AgentMessages.tsx` |
| 设置对话框 | `src/components/settings/SettingsDialog.tsx` + `SettingsPanel.tsx` |
| 前端 IPC | `src/lib/ipc.ts` |
| 全局快捷键 | `src/lib/shortcut-registry.ts` + `src/components/shortcuts/GlobalShortcuts.tsx` |
| Chat 原子 | `src/atoms/chat-atoms.ts` |
| Agent 原子 | `src/atoms/agent-atoms.ts` |
| 前端 ai-elements | `src/components/ai-elements/` |
| Tauri 总注册 | `src-tauri/src/lib.rs:10-52` |
| Kernel Trait 层 | `src-tauri/src/kernel/`（chat.rs / config.rs / governance.rs / adapter.rs / error.rs / types.rs） |
| Chat 命令层 | `src-tauri/src/commands/chat.rs:1-85` |
| Chat 引擎 | `src-tauri/src/chat_engine.rs:1-250` |
| Agent 命令与引擎 | `src-tauri/src/commands/agent.rs:1-350`、`agent_engine.rs:1-730`、`agent_session.rs:1-270` |
| Governance 命令 | `src-tauri/src/commands/governance.rs:1-900+`（21 命令 + _impl 模式） |
| Config / channels / system / alias | `src-tauri/src/commands/config.rs`、`channels.rs`、`system.rs`、`alias.rs` |
| Files / settings | `src-tauri/src/commands/files.rs`、`settings.rs` |

## 6. 变更日志

- `2026-05-10T1`：全量重写——AppShell 减薄为布局容器、原子体系拆分、多标签页独立模块、ipc EventBus + 全局事件监听、设置 10 标签组件化、@proma/shared 类型系统、AiElements 渲染原语、Agent 中断三型路由。同步 6 份子文档。
- `2026-05-10T2`：更新 2.3 节——写入 kernel trait 抽象层（ChatKernel/ConfigKernel/GovernanceKernel）、82 命令按模块分拆计数、j_cli 导入隔离约束、`_impl` 测试模式、136 Rust 测试、governance 21 命令详情。更新 section 5/7 锚点与约束。

## 7. 关键约束

- **前端状态完全由 Jotai atoms 承载**，组件树无路由、无顶层 Context Provider（除 AppShellProvider），所有跨组件通信通过原子完成
- **流式事件统一走全局监听**：ChatView/AgentView 不再自己创建 Channel，而是通过 `useGlobalChatListeners` / `useGlobalAgentListeners` 在根级接收
- **Chat 和 Agent 共享同一套工作台**，但使用完全独立的原子文件（`chat-atoms.ts` / `agent-atoms.ts`）和事件监听器
- **per-tab 隔离**：多标签页通过 `tabsAtom` + `activeTabIdAtom` 实现，消息/流式状态通过 `Map<tabId, State>` 派生
- **设置面板**已从单体大文件拆分为 7 个标签组件 + 原语库，Channel 配置支持自动保存（debounce）+ 测试连接 + 拉取模型
- **Agent 审批**有三种 kind（permission / ask_user / plan），分别由三个独立 Banner 处理
- **后端 Agent 引擎**已移除 `-p` flag（单次模式），支持多轮 memory；`respond_interrupt` 签名改为 `content: &str`
- **生成中止**：Chat 端新增 `stop_generation()` + `STOPPED_SESSIONS` 全局状态，通过 STOPPED_SESSIONS 标志 + Channel drop 双重取消机制实现
- **Kernel trait 隔离**：`ChatKernel` / `ConfigKernel` / `GovernanceKernel` 三个 trait 定义在 `kernel/` 下，`JcliAdapter` 是唯一实现。Tauri 命令层**不得直接导入 `j_cli::`**——所有 j-cli 依赖通过 trait 接口访问。`governance.rs` 中的少量遗留直接导入将在后续解耦
- **`_impl` 测试模式**：每个 Tauri 命令的纯逻辑层放在 `fn foo_impl(kernel: &dyn Trait, ...)` 中，Tauri `#[tauri::command]` 函数仅做 managed state 提取和委托。这使得业务逻辑可以脱离 Tauri 运行时在纯 Rust 单元测试中验证

## 8. 相关文档

- [backend-chat-engine](./backend-chat-engine.md) — Chat 后端引擎现状
- [backend-agent-engine](./backend-agent-engine.md) — Agent 后端引擎与 session 持久化现状
- [frontend-chat-ui](./frontend-chat-ui.md) — Chat 前端界面现状
- [frontend-agent-ui](./frontend-agent-ui.md) — Agent 前端界面与审批流现状
- [frontend-app-shell](./frontend-app-shell.md) — 工作台外壳与 tab/search/sidepanel 现状
- [frontend-settings-ui](./frontend-settings-ui.md) — 设置界面与配置现状
- `.codestable/attention.md` — 本项目长期注意事项入口
