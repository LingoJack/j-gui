---
doc_type: roadmap
slug: j-gui-v1
status: active
created: 2026-05-10
last_reviewed: 2026-05-10

# Roadmap 进度：Phase A 9/9 | Phase B 8/8 | Phase B+ 0/2 | Phase C 0/3 | Phase D 0/5 | Phase E 0/2 | Phase F 0/1

> **Phase A/B 完成口径**：基础链路已实现并通过测试，但存在前后端数据模型不兼容的端到端问题（详见 #27 说明）。
tags: [tauri, desktop, j-cli, chat, agent]
---

# j-gui v1 — Tauri 桌面 AI 客户端

## 项目定位

基于 Proma UI/UX 重构的 Tauri 桌面 AI 客户端，后端集成 j-cli 引擎。

- **Chat**: j-cli 流式对话引擎
- **Agent**: CC SDK CLI 子进程（当前）+ j-agent crate（计划，jcli 仓库已发布 `j-agent` crate）
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
| Governance (commands/governance.rs) | 8 | Skills/Hooks/MCP (j-cli 源 + 全局扫描 + 复制导入) |
| System (commands/system.rs) | 2 | 工作 |
| Alias (commands/alias.rs) | 3 | 工作 (j-cli) |

关键缺口:
- API Key 加密存储（#27 修复）
- 前端/后端 Channel 数据模型统一（#27 修复）
- Workspace Skills/MCP/Hooks 持久化命令未注册（#28 修复）
- Hooks UI 仅只读，需升级为可启停管理（#28 修复）
- `j-agent` crate 集成（jcli 仓库已发布，见 #22 agent-engine-jagent）

## 双源架构（Skills / MCP / Hooks）

详见 `ARCHITECTURE.md §2.7`。核心约束：

- **源 A (j-cli)**: Skills/MCP/Hooks 存储于 `~/.jdata/agent/`，已有 list/save 命令
- **源 B (CC SDK)**: Skills/MCP 存储于 `~/.jdata/agent/sdk-config/` + 工作区目录
- **全局 Skills**: `~/.claude/agents/skills/` 和 `~/.agent/skills/`（npx 安装），需 UI 扫描 + 导入
- **数据同源原则**: Chat/Agent 会话走 j-cli 原生路径；Provider 配置走 `agent_config.json`；GUI 独有配置走 `%APPDATA%/j-gui/`

## 子 Feature 清单

### Phase A: 可用 MVP (P0 — 全部完成 ✅)

1. ~~channel-management~~ ⚠️ — 渠道 CRUD + test_channel_direct + fetch_models。**后端通过测试，但前后端 Channel 类型不兼容导致端到端不可用**，由 #27 修复。
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
12. **hooks-ui** ⚠️ — Hooks 查看 UI（当前只读），后端已有 list_hooks。**启停管理由 #28 补全**
13. **mcp-dual-source-ui** — MCP Server 配置 UI：区分 j-cli 源 (`mcp_config.json`) 和 CC SDK 工作区源 (`mcp.json`)
14. **chat-tools-ui** — Chat Tools 管理 UI，后端已有 list/set_enabled
15. **system-prompt-ui** — System Prompt 编辑器，后端已有 get/set
16. **yaml-config-editor** — 全局 YamlConfig 查看/编辑 UI
17. **channel-provider-ui** — 渠道 Provider CRUD UI + 模型选择器 + 测试连接

### Phase B+: 数据模型修复 & 持久化补齐 (P0 阻塞)

从审计和实际使用中发现的问题，阻塞了基础功能的正常使用。

**27. channel-model-unify** — j-gui 自建 Channel 模型，解耦 jcli

- **现状**：前端 `Channel` 类型与 jcli `ModelProvider` 结构不兼容。j-gui 不应修改 jcli 代码。
- **方案**：j-gui 自建 `channels.json`（`~/.jgui/`），首次从 jcli 单向导入已有 provider，调用时 `Channel → ModelProvider` 动态映射。API Key 自加密存储。
- **不涉及 jcli 仓库**——仅改动 j-gui 的 channels.rs + chat_engine.rs + agent_engine.rs + 前端 IPC。

**28. governance-bidirectional-sync** — 治理命令补全 + 工作区 ↔ j-cli 双向同步

合并原 Phase C #18 `workspace-mcp`。

- **Skills 持久化**：注册 `write_skill_content` / `read_skill_content` / `toggle_workspace_skill` / `delete_workspace_skill` / `import_skill_from_workspace` / `update_skill_from_source` / `get_workspace_skills` / `get_workspace_skills_dir` / `get_other_workspace_skills`
- **MCP 持久化**：注册 `save_workspace_mcp_config` / `get_workspace_mcp_config`
- **Hooks 升级**：从只读升级为可管理——注册 `toggle_hook` / `list_hooks_with_status`，UI 增加启停开关 + 按事件/来源筛选
- **单向导入**：j-gui 读取 jcli Skill/Hook/MCP 数据作为"源 A"（只读展示），j-gui 自有工作区存储作为"源 B"（可读写）。写操作仅写 j-gui 自有存储，不写回 jcli 配置

### Phase C: 体验追平 (P2)

19. **message-persistence** — Chat 消息 JSONL (对接 j-cli session)
20. **session-archive** — 会话归档/搜索
21. **error-toast** — 统一错误提示 + 边界处理

### Phase D: 发布就绪 (P3)

22. **file-browser** — 文件树操作 (open/delete/rename)
23. **branding-cleanup** — @proma/* 包名重命名为 @jgui/*
24. **readme-docs** — README 完善 + 用户指南
25. **build-packaging** — Tauri bundle (Windows/macOS/Linux)，首版需三个平台全部验证通过
26. **tdd-coverage** — 测试覆盖达标 + Rust 编码规约合规收口

- **后端测试补全**（2026-05-10 扫描）：51 个测试仅覆盖 helpers/解析器，4 个文件零测试（config/alias/chat/system），所有 Tauri 命令无直接测试。需补：P0 零测试文件基础测试 + P1 命令单元测试 + P2 集成测试。详见 `.codestable/compound/2026-05-10-explore-backend-test-coverage.md`
- **Rust 编码规约合规**：90 pub item 缺 `///` 文档 + 6 处长路径引用 + 9 处魔法值提取 + 1 处 `.clone()` 优化 + clippy `#![deny(clippy::all)]` 门禁

### Phase E: 内核解耦 & Agent 升级 (P2)

j-gui 当前与 jcli 重度耦合：22 个导入点跨越 10 个内部模块。必须在功能继续堆积前建立 trait 抽象层——每多一个 feature，解耦难度成倍增加。

**30. kernel-trait-abstraction** — jcli 公开 API 抽象层 ⭐ 优先于 #27

- **现状**：j-gui 直接导入 jcli 内部模块（22 处），无抽象层，无 semver 缓冲。
- **目标**：定义 trait 族 → 写适配器（包装现有 jcli 调用）→ j-gui 剩余模块迁移到 trait。ChatKernel / ConfigKernel / GovernanceKernel / SessionKernel，覆盖：Chat 流式调用、会话 CRUD、Provider 配置读写、Skills/Hooks/MCP 查询与启停、Alias CRUD、System Prompt 读写、YamlConfig 访问。
- **收益**：后续 #27/#28 及其他 feature 全部基于 trait 实现，不再引入新的 jcli 内部导入；可 mock 测试。
- **不依赖** #27——先抽象，再在上面建 Channel 模型。

### Phase E: Agent 引擎升级 (P2)

jcli 仓库已发布 `j-agent` crate，当前 j-gui 的 Agent 模式通过 CC SDK CLI 子进程运行。集成 j-agent crate 可获得：原生 Rust 控制、无子进程开销、完整的 `AgentBackend` trait 实现、更细粒度的中断/工具/流式控制。

### Phase E: Agent 引擎升级 (P2)

jcli 仓库已发布 `j-agent` crate，当前 j-gui 的 Agent 模式通过 CC SDK CLI 子进程运行。集成 j-agent crate 可获得：原生 Rust 控制、无子进程开销、完整的 `AgentBackend` trait 实现、更细粒度的中断/工具/流式控制。

### Phase F: 移动端远程连接 (P4 远期)

**决策**：Tauri v2 支持 Android/iOS 原生编译。移动端在 j-gui monorepo 内，用 Tauri mobile 构建原生 App——桌面端作为 WS 服务端，移动端作为 WS 客户端（不需要 jcli，纯远程遥控器）。

**31. remote-mobile-access** — 桌面远程服务 + 移动端 Tauri App

- **现状**：jcli `command::chat::remote` 提供 WS bridge 能力，j-gui 未集成。Tauri v2 已支持 Android/iOS 构建
- **目标**：
  - **桌面端**：设置页"远程访问"tab——启动/停止 WS 服务、局域网地址+二维码、PIN 码确认、连接设备列表
  - **移动端**：`src-mobile/` Tauri mobile App——React WebView 复用现有 UI 组件，Rust 层仅做轻量 WS 客户端（不依赖 jcli），通过局域网连接桌面端操作 Chat/Agent。`packages/shared` 类型跨桌面/移动端共享
- **分发**：Android APK + iOS IPA（通过 Tauri bundler），不需要应用商店
- **安全**：仅局域网可访问、PIN 码 + Token 双重确认、超时自动断开
- **依赖**：#30 kernel-trait-abstraction（远程服务通过 trait 调用内核）

---

**29. agent-engine-jagent** — 替换 CC SDK CLI 子进程为 j-agent crate

- **现状**：`AgentEngine` 通过 `std::process::Command` 启动 Claude CLI 子进程，stdin/stdout JSON 行协议通信。`AgentBackend` trait 已预留但仅 CLI 实现。
- **目标**：新增 `JAgentBackend` 实现 `AgentBackend` trait，直接调用 `j-agent` crate API。支持：流式 Agent Loop、工具审批/回传、中断处理（Permission/AskUser/Plan）、会话 resume。
- **依赖**：#27 channel-model-unify（j-agent 需要完整的 provider 配置）
- **回退**：保留 CLI 实现，通过 `AgentBackend` trait 切换（开发期可并行，稳定后 CLI 实现标 deprecated）

## 架构决策

- **Chat 后端**: j-cli 直接调用 (`call_llm_stream_async`)
- **Agent 后端**: CC SDK CLI 子进程 (当前) + j-agent crate (计划)
- **IPC**: Tauri `invoke()` + `Channel<T>` (流式) + EventBus (事件分发)
- **存储**：Chat/Agent 会话走 jcl i 路径 (`~/.jdata/`)；j-gui 自有配置（Channel、工作区 Skills/MCP）走 `%APPDATA%/j-gui/` (Windows) / `~/.jgui/` (Unix)
- **jcli 解耦**：j-gui 不修改 jcli 源代码，但写入 jcli 数据目录（`~/.jdata/`）以保持 CLI/GUI 数据同步。GUI 独有配置走 `~/.jgui/`。详见 `.codestable/compound/2026-05-10-decision-jgui-jcli-decouple.md`
- **状态**: Jotai atoms，前端不引入 React Router
- **Skills/MCP/Hooks**: j-cli 源和 CC SDK 源各自独立路径，UI 区分展示，全局 Skills 只读导入
- **Rust 编码规约**：强制遵守 `.codestable/compound/2026-05-08-decision-rust-coding-conventions.md`（CLAUDE.md 已内联关键规则）

## 观察项

- j-cli `SkillSource` 枚举当前只有 `User | Project`，全局 Skills 导入需扩展 `Global` 变体
- CC SDK MCP 工作区配置 (`mcp.json`) 与 j-cli MCP 配置 (`mcp_config.json`) 格式可能不同，需确认序列化兼容
- **Rust 编码规约合规**（2026-05-10 全量扫描 7 文件 3000 行，已入 Phase D #26）：
  - P0（0 项）：unwrap/expect 仅测试用、命名全部合规、枚举无 `_ =>` 通配 ✅
  - P1（96 项）：90 个 pub item 缺 `///` 文档、6 处长路径引用未用 `use`（governance.rs:89-90/124, config.rs:81, agent.rs:238, settings.rs:552, channels.rs:238）
  - P2（10 项）：9 处魔法值（settings.rs 版本号/URL、channels.rs 超时秒数/token、agent.rs 标题长度/default、alias.rs sections）、1 处不必要 `.clone()`（config.rs:66）
  - 违规详情见 `.codestable/audits/2026-05-10-phase-b-review/finding-maintainability.md` M4/M5 和本次 convention scan

## 变更日志

- 2026-05-10 (Phase B+ 审计补丁): 基于审计和实际使用发现的问题新增 Phase B+（2 条）—— #27 `channel-model-unify`（前后端 Channel 数据模型不兼容） + #28 `governance-bidirectional-sync`（Skills/MCP/Hooks 持久化命令补全 + 双向同步）。Phase A #1 标 ⚠️（端到端不可用），Phase B #12 标 ⚠️（待升级为可管理），Phase C #18 合并入 #28。Governance 命令数 6→8。
- 2026-05-10 (Phase B 完成): Phase B 8 项全部 TDD 实现。后端 57/57 + 前端 54/54 测试通过。
- 2026-05-10 (更新): Phase A 全部完成 (9/9)；命令数 38→51；新增双源架构约束

## 致谢

本项目前端 UI 基于 [Proma](https://github.com/ErlichLiu/Proma) (Apache-2.0) 重构。
Proma 原作者: ErlichLiu，感谢其出色的开源工作。
