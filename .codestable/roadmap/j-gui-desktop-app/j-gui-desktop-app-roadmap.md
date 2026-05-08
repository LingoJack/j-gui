---
doc_type: roadmap
slug: j-gui-desktop-app
status: active
created: 2026-05-08
last_reviewed: 2026-05-08
tags: [tauri, desktop, ai-chat, agent]
related_requirements:
  - j-gui-ai-interaction
  - j-gui-session-management
  - j-gui-personalization
related_architecture:
  - ARCHITECTURE
---

# j-gui Tauri 桌面应用开发

## 1. 背景

为 j-cli（Rust CLI AI 工具）开发 Tauri 桌面端。j-cli 已有完整的 AI Chat/Agent 能力、配置管理、会话存储等——但只在终端里跑。桌面端通过 Tauri v2 把 j-cli 包装成 GUI 应用，前端模仿 Proma（Electron AI Agent 桌面应用）的三栏布局设计。

后端以 Rust crate 依赖方式集成 j-cli（`j_cli = { path = "../../j" }`），不复用 WS remote 协议。前端 React + TypeScript + Vite + Tailwind + Jotai。

## 2. 范围与明确不做

### 本 roadmap 覆盖
- Tauri v2 项目脚手架搭建
- Rust 后端：Config/Alias/Chat/Agent/System 命令 + Chat/Agent Engine 封装
- React 前端：三栏布局、Chat 视图（流式 Markdown + 富文本增强输入 + Thinking 块 + 消息精细操作）、Agent 视图（工具调用 + 任务进度聚合 + 中断审批 UI + Context 指示器）
- 配置管理、主题切换、别名管理、Agent 配置治理（MCP/Skills/Hooks，其中 MCP 仅限 Agent runtime）
- Agent 会话存储/导航、Agent 中断协议
- 搜索增强（标题搜索体验补强 + 结果回填 + 高亮 + IME）、设置重构（多 tab + UI 原语库）、侧栏折叠动画、右侧面板文件树
- 构建打包（Tauri bundle）

### 明确不做
- 多语言支持（仅中文，英语翻译不在首版范围）
- 多窗口管理（仅单窗口 + 标签页）
- 插件系统（不支持第三方扩展）
- 云端同步（纯本地，不跨设备）
- 语音/图片输入
- 会话内容全文搜索（首版只做标题搜索与结果回填）
- 聊天附件/文件直接拖入输入框
- j-cli 自身的安装/升级管理
- Proma 的 Workspace 管理、BotHub/多人协作、飞书/IM 集成、Tutorial 引导、Proxy 设置、MemOS 记忆

## 3. 模块拆分（概设）

```
j-gui
├── Tauri Backend (src-tauri/)         Rust 后端
│   ├── commands/config.rs             Config 命令（读/写 YamlConfig, AgentConfig, SystemPrompt）
│   ├── commands/alias.rs              Alias 命令（增删查）
│   ├── commands/chat.rs               Chat 命令（会话 CRUD + 流式消息）
│   ├── commands/agent.rs              Agent 命令（start/send/stop + 中断回传）
│   ├── commands/system.rs             System 命令（版本、主题）
│   ├── chat_engine.rs                 Chat Engine（j_cli 的中介层、流式取消）
│   └── agent_engine.rs                Agent Engine（Claude CLI 子进程管理、SDK 协议解析）
├── Frontend Shell (app-shell/)       三栏布局引擎
│   ├── AppShell.tsx                   主布局容器（左/中/右三栏）
│   ├── LeftSidebar.tsx                左侧栏（折叠/展开 + 模式切换 + 会话列表 + Archive）
│   ├── MainArea.tsx                   主区域（标签页框架 + TabBar + TabContent）
│   ├── RightSidePanel.tsx             右侧面板（递归文件树 + 面包屑）
│   └── SearchDialog.tsx              会话搜索（标题搜索 + 结果回填 + 快捷键/IME）
├── Chat UI (chat/)                   聊天界面
│   ├── ChatView.tsx                   聊天主视图 + ChatHeader
│   ├── ChatMessages.tsx               流式消息列表 + ScrollMinimap
│   ├── ChatInput.tsx                  富文本增强输入 + 工具栏 + 草稿持久化
│   ├── MessageBubble.tsx              单条消息气泡（Markdown + 操作栏）
│   ├── ReasoningBlock.tsx             Thinking/推理可折叠块
│   └── ContextDivider.tsx             上下文清空分割线
├── Agent UI (agent/)                 Agent 界面
│   ├── AgentView.tsx                  Agent 主视图（流式 + 审批中断 + 任务进度）
│   ├── AgentMessages.tsx              Agent 消息列表（turn 分组）
│   ├── ToolCallDisplay.tsx            工具调用结果渲染
│   ├── TaskProgressCard.tsx           任务进度聚合卡 + BackgroundTasksPanel
│   ├── ContextUsageBadge.tsx          Context 用量环形指示器 + PermissionModeSelector
│   ├── PermissionBanner.tsx           工具权限审批横幅
│   ├── AskUserBanner.tsx              AskUser 问答交互
│   └── ExitPlanModeBanner.tsx         计划模式审批
├── Settings UI (settings/)           设置
│   ├── SettingsDialog.tsx             浮动 Dialog + 左侧导航 + 右侧内容
│   ├── tabs/                          Settings tabs（Prompts / Appearance / Tools / Skills / Hooks / MCP）
│   └── primitives/                    Settings UI 原语组件库
├── State (atoms/)                    Jotai 状态
│   ├── app-mode.ts                    当前模式（chat/agent）
│   ├── sessions.ts                    会话列表 + Chat/Agent 消息 atoms
│   ├── config.ts                      App 配置
│   ├── theme.ts                       主题
│   └── sidebar.ts                     侧栏 + 右面板状态
└── IPC Layer (lib/)                  前端通信封装
    └── tauri.ts                       Tauri invoke + Channel + Event 封装
```

### Tauri Backend · 后端
- **职责**：暴露 Tauri 命令，封装 j-cli 能力，管理 Agent 子进程生命周期，推送流式事件，并把 Agent 治理配置（Skills/Hooks/MCP）整理成可消费的 GUI 契约。不处理 UI 逻辑。
- **作用域提醒**：`MCP` 配置只进入 Agent runtime，不挂到当前 Chat 命令链路；Chat 侧不因为有 Settings MCP tab 就追加 MCP 契约。
- **承载的子 feature**：#1-#6（scaffold/config/alias/chat-engine/chat-commands/system-commands）、#31-#32（agent-interrupts/agent-session-storage）、#44-#45（agent-governance-commands/mcp-config-commands）

### Frontend Shell · 三栏布局
- **职责**：管理窗口布局（左侧栏折叠动画/图标模式、右侧面板显隐、主区域标签页）、会话搜索（标题搜索、结果回填、键盘/IME 体验）。不处理消息内容渲染。
- **承载的子 feature**：#7-#9（app-shell/sidebar/main-area）、#25 search、#40 sidebar-collapsible、#41 search-enhanced、#43 right-panel-tree

### Chat UI · 聊天界面
- **职责**：消息列表渲染（流式 + Markdown + 代码高亮）、富文本增强输入、草稿持久化、Thinking 推理块、消息精细操作（Fork/Rewind/Copy）。不处理 Agent 特有的工具调用渲染。
- **承载的子 feature**：#10-#11（chat-view/markdown）、#37-#39（input-enhanced/reasoning-block/message-polish）

### Agent UI · Agent 界面
- **职责**：Agent 模式的工具调用可视化、任务进度聚合、中断审批交互、Context 用量指示、权限模式选择、Agent 输入增强。复用 Chat UI 的消息渲染基础。
- **承载的子 feature**：#12-#13（agent-view/tool-call）、#34-#36（interrupt-ui/task-progress/context-tools）

### Settings UI · 设置
- **职责**：多 tab 设置对话框（导航+内容布局），Settings UI 原语组件库，以及 Agent 治理页（Skills/Hooks/MCP）。不处理配置的持久化逻辑（由后端负责）。
- **作用域提醒**：MCP tab 的配置对象属于 Agent runtime，不对当前 Chat 模式声明“也支持 MCP”。
- **承载的子 feature**：#18 settings-dialog、#42 settings-refined、#46-#48（skills-ui/hooks-ui/mcp-ui）

### State · 状态管理
- **职责**：Jotai atoms 定义。不包含 UI 组件。
- **承载的子 feature**：随各 UI feature 同步产出（不是独立 feature）

### IPC Layer · 通信封装
- **职责**：封装 `@tauri-apps/api` 的 `invoke()` + `Channel` + `listen()`，类型安全。不包含业务逻辑。
- **承载的子 feature**：随 scaffold 产出基础封装，后续 feature 扩展

## 4. 模块间接口契约 / 共享协议

### 4.1 Tauri Commands（Frontend → Backend）

**方向**：React 前端 → Rust 后端
**形式**：Tauri `invoke()` 调用

```rust
// === Config ===
#[tauri::command]
fn get_config() -> Result<YamlConfigInfo, String>;
#[tauri::command]
fn set_config(section: String, key: String, value: String) -> Result<(), String>;
#[tauri::command]
fn get_agent_config() -> Result<AgentConfigInfo, String>;
#[tauri::command]
fn set_agent_config(config: AgentConfigInfo) -> Result<(), String>;
#[tauri::command]
fn set_active_provider(index: usize) -> Result<(), String>;
#[tauri::command]
fn get_system_prompt() -> Result<Option<String>, String>;
#[tauri::command]
fn set_system_prompt(prompt: String) -> Result<(), String>;

// === Alias ===
#[tauri::command]
fn list_aliases() -> Result<Vec<AliasEntry>, String>;
#[tauri::command]
fn set_alias(section: String, name: String, value: String) -> Result<(), String>;
#[tauri::command]
fn remove_alias(section: String, name: String) -> Result<(), String>;

// === Chat ===
#[tauri::command]
async fn send_message(
    session_id: String,
    content: String,
    on_event: Channel<ChatEvent>,
) -> Result<(), String>;
#[tauri::command]
fn list_sessions() -> Result<Vec<SessionInfo>, String>;
#[tauri::command]
fn create_session() -> Result<String, String>;
#[tauri::command]
fn delete_session(session_id: String) -> Result<(), String>;
#[tauri::command]
fn get_session_messages(session_id: String) -> Result<Vec<MessageInfo>, String>;
#[tauri::command]
fn delete_message(session_id: String, pair_index: usize) -> Result<(), String>;
#[tauri::command]
fn clear_session(session_id: String) -> Result<(), String>;

// === Agent ===
#[tauri::command]
fn start_agent(
    session_id: String,
    permission_mode: String,
    on_event: Channel<AgentEvent>,
) -> Result<(), String>;
#[tauri::command]
fn send_agent_message(content: String) -> Result<(), String>;
#[tauri::command]
fn stop_agent() -> Result<(), String>;
// ↓ 计划新增（#31 backend-agent-interrupts）
#[tauri::command]
fn respond_agent_interrupt(
    interrupt_id: String,
    response: InterruptResponse
) -> Result<(), String>;
// InterruptResponse 按 interrupt kind 分型：
//   PermissionResponse { decision: "approve" | "approve_always" | "deny" }
//   AskUserResponse { answers: [{ question_id, selected_options, custom_text? }] }
//   PlanResponse { decision: "approve_and_run" | "approve_with_manual_permissions" | "reject" | "feedback", feedback?: String }
// ↓ 计划新增（#32 backend-agent-session-storage）
#[tauri::command]
fn create_agent_session() -> Result<String, String>;
#[tauri::command]
fn list_agent_sessions() -> Result<Vec<SessionInfo>, String>;
#[tauri::command]
fn get_agent_session(session_id: String) -> Result<Vec<AgentTimelineItem>, String>;
#[tauri::command]
fn delete_agent_session(session_id: String) -> Result<(), String>;

// === System ===
#[tauri::command]
fn get_version() -> Result<String, String>;
#[tauri::command]
fn set_theme(app: tauri::AppHandle, theme: String) -> Result<(), String>;
// → 主题变更通过全局 Event "theme-changed" 通知前端
```

**约束**：
- 所有命令错误返回 `String`（人类可读的错误描述）
- `send_message` 和 `start_agent` 是 async——Rust 端不阻塞 Tauri 主线程
- `send_message` 返回时 Channel 自动关闭，取消通过 drop Channel 实现
- Agent 命令通过 `AgentState(Arc<Mutex<Option<AgentEngine>>>)` 管理子进程生命周期，并在引擎状态里绑定当前 `session_id`
- `respond_agent_interrupt` 的 `InterruptResponse` 必须保留按中断种类分型的表达能力，不能把 permission / ask_user / plan 三类回传压扁成同一个窄枚举

### 4.2 Tauri Channels — 流式推送（Backend → Frontend）

**方向**：Rust 后端 → React 前端
**形式**：Tauri `Channel<T>`

```
// Chat 流式事件
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
enum ChatEvent {
    Chunk { index: u32, content: String },
    Done { total_tokens: u32 },
    Error { message: String },
}

// Agent 流式事件
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
enum AgentEvent {
    AssistantContent { text: String },
    ToolUse { tool_id: String, tool_name: String, tool_input: String },
    ToolResult { tool_id: String, content: String },
    Done { total_tokens: u32 },
    Error { message: String },
}
// ↓ 计划新增（#31 backend-agent-interrupts）
// + Interrupt { interrupt_id: String, kind: String, ... }
//   kind ∈ { "permission", "ask_user", "plan" }
```

**约束**：
- Channel 绑定到单次 command 调用，command 返回时自动关闭
- Agent `Interrupt` 事件需携带足够信息让前端渲染对应 Banner（工具名、输入预览、问题列表、计划选项）
- Agent `ToolResult` 事件（由 parse_sdk_line 解析 "user" 类型消息产出）在 `bypassPermissions` 模式下不触发——仅在非 bypass 模式使用

### 4.3 Tauri Events — 全局通知

```
event: theme-changed
payload: "dark" | "light" | "{j_cli_theme_name}"
```

**约束**：Events 仅用于跨组件的全局通知（主题变更广播），不用于 Chat/Agent 流式。

### 4.4 前端状态（Jotai Atoms → Components）

```typescript
// src/atoms/app-mode.ts
appModeAtom: Atom<'chat' | 'agent'>

// src/atoms/sessions.ts
sessionsAtom: Atom<SessionInfo[]>
currentSessionIdAtom: Atom<string | null>
chatMessagesAtom: Atom<Message[]>      // Chat 模式消息
chatStreamingAtom: Atom<boolean>
agentMessagesAtom: Atom<Message[]>     // Agent 模式消息
agentStreamingAtom: Atom<boolean>

// src/atoms/config.ts
agentConfigAtom: Atom<AgentConfigInfo>

// src/atoms/theme.ts
themeAtom: Atom<string>

// src/atoms/sidebar.ts
sidebarOpenAtom: Atom<boolean>         // 左侧栏展开/折叠（新增）
sidebarCollapsedAtom: Atom<boolean>    // 图标模式（#40 新增）
rightPanelOpenAtom: Atom<boolean>

// src/atoms/settings.ts（#42 新增）
settingsTabAtom: Atom<string>          // 上次打开的设置 tab
```

**约束**：
- atoms 目录不引入任何 UI 依赖（React 组件 / CSS）
- 新增 atoms 从各自 feature 的 design 阶段产出，不在 roadmap 层硬性规定

### 4.4 共享数据结构

```rust
// Rust 端
struct SessionInfo {
    id: String,
    title: Option<String>,
    message_count: usize,
    updated_at: u64,  // unix timestamp millis
}
// Chat 与 Agent 各自通过独立命令返回本空间的 SessionInfo；该结构本身不携带 mode 字段

struct AliasEntry {
    section: String,  // "path" | "inner_url" | "outer_url" | "script"
    name: String,
    value: String,
}

struct AgentTimelineItem {  // #32 新增
    id: String,
    kind: String,      // "user_message" | "assistant_message" | "tool_call" | "interrupt" | "error"
    content: Option<String>,
    tool_call: Option<ToolCallInfo>,
    interrupt: Option<InterruptSnapshot>,
    created_at: u64,
}

enum InterruptResponse {  // #31 新增
    Permission { decision: PermissionDecision },
    AskUser { answers: Vec<AskUserAnswer> },
    Plan { decision: PlanDecision, feedback: Option<String> },
}

enum PermissionDecision {
    Approve,
    ApproveAlways,
    Deny,
}

struct AskUserAnswer {
    question_id: String,
    selected_options: Vec<String>,
    custom_text: Option<String>,
}

enum PlanDecision {
    ApproveAndRun,
    ApproveWithManualPermissions,
    Reject,
    Feedback,
}
```

## 5. 子 feature 清单

### 已闭环（done — 29 条）

1. **scaffold** — 项目脚手架 ✅
2. **backend-config-commands** — Config 命令 ✅
3. **backend-alias-commands** — Alias 命令 ✅
4. **backend-chat-engine** — Chat Engine ✅
5. **backend-chat-commands** — Chat 命令 ✅
6. **backend-system-commands** — System 命令 ✅
7. **frontend-app-shell** — 三栏布局 ✅
8. **frontend-left-sidebar** — 左侧栏 ✅
10. **frontend-chat-view** — Chat 视图 ⭐ 最小闭环 ✅
11. **frontend-markdown** — Markdown 渲染 ✅
12. **backend-agent-engine** — Agent Engine ✅
13. **frontend-agent-view** — Agent 视图 ✅
14. **frontend-tool-call** — 工具调用显示 ✅
17. **theme-integration** — 主题集成 ✅
18. **settings-dialog** — 设置对话框 ✅
20. **error-handling** — 统一错误处理 ✅
21. **frontend-session-list** — 会话列表对接 ✅
22. **frontend-message-actions** — 消息操作 ✅
23. **frontend-context-bar** — 上下文状态栏 ✅
24. **backend-system-prompt** — 系统提示词 ✅
26. **frontend-toast** — Toast 通知 ✅
27. **frontend-welcome** — 欢迎页 ✅
29. **frontend-appearance** — 外观设置 ✅
30. **backend-streaming-cancel** — 流式取消 ✅

### 进行中（in-progress — 4 条）

9. **frontend-main-area** — 主区域标签页：当前只有固定 default tab 壳，多标签打开/关闭/切换未实现
16. **frontend-right-panel** — 右侧面板：顶层目录读取完成，缺打开入口/递归树/文件动作
25. **frontend-search** — 会话搜索：键盘导航完成，结果只设 sessionId 不回填消息
28. **frontend-tabs-enhanced** — 标签页增强：ErrorBoundary 完成，缺切换/确认/预览

### 待实现 — Agent 闭环（planned — 3 条）

31. **backend-agent-interrupts** — Agent 中断协议：解析 ask/plan/permission 事件 + respond_agent_interrupt 命令；回传协议需覆盖 always-allow / ask-user answers / plan 四种分支
32. **backend-agent-session-storage** — Agent 会话存储：create/list/get/delete 命令；resume 语义首版限定为“重开 transcript 并继续 GUI 线程”，不承诺恢复底层 Claude 子进程状态
33. **frontend-agent-session-navigation** — Agent 会话导航：LeftSidebar/Search 在 Agent 模式调用独立 Agent 会话命令列出+切换+回填

### 待实现 — Agent UI 组件（planned — 3 条）

34. **frontend-agent-interrupt-ui** — 中断审批 UI：PermissionBanner + AskUserBanner + ExitPlanModeBanner（取代原 #15 frontend-permission）
35. **frontend-agent-task-progress** — 任务进度聚合：TaskProgressCard + BackgroundTasksPanel
36. **frontend-agent-context-tools** — Context 用量环 + 权限模式选择器 + @/# 引语法提示

### 待实现 — Chat UI 精细度（planned — 3 条）

37. **frontend-chat-input-enhanced** — 富文本输入：TipTap 编辑器 + 工具栏 + 草稿持久化（首版不做附件/拖放）
38. **frontend-chat-reasoning-block** — Thinking 推理块：Reasoning 可折叠组件
39. **frontend-chat-message-polish** — 消息精细操作：Fork/Rewind + ContextDivider + ScrollMinimap

### 待实现 — Shell 增强（planned — 4 条）

40. **frontend-sidebar-collapsible** — 侧栏折叠动画 + 图标模式 + Pin/Archive
41. **frontend-search-enhanced** — 标题搜索体验补强 + 高亮 + IME
42. **frontend-settings-refined** — 设置重构：多 tab 导航 + UI 原语库 + 未保存保护
43. **frontend-right-panel-tree** — 递归文件树 + 面包屑 + 入口按钮

### 待实现 — Settings / Agent 治理（planned — 5 条）

44. **backend-agent-governance-commands** — Skills/Hooks 治理命令：把 j-cli 的 `load_all_skills()` / `HookManager::list_hooks()` 与 `AgentConfig.disabled_skills` / `disabled_hooks` 暴露为稳定 IPC 契约；Skills UI 可参考 Proma 的实际组织方式，但语义仍以仓库真实能力为准
45. **backend-mcp-config-commands** — MCP 配置命令：参考 Proma/Claude Agent SDK 实际做法定义 Agent 侧 MCP server 配置数据源、标准化结构与校验口径；明确不接入当前 Chat 命令链路
46. **frontend-settings-skills-ui** — Skills UI：Settings 中新增 Skills tab，展示已加载 skill 的名称/描述/来源/覆盖关系，支持单项启停和批量启停
47. **frontend-settings-hooks-ui** — Hooks UI：Settings 中新增 Hooks tab，展示 hook source/event/type/label 摘要，支持按唯一 id 启停和空态说明
48. **frontend-settings-mcp-ui** — MCP 配置 UI：Settings 中新增 MCP tab，展示 Agent 侧 server 列表、transport/command/env 摘要、启停开关与基础编辑入口；不向当前 Chat 模式宣称 MCP 生效

### 待实现 — 收尾（planned — 1 条）

19. **build-packaging** — 构建打包

> 已 drop：原 #15 `frontend-permission` 被 #34 `frontend-agent-interrupt-ui` 取代（后者覆盖全部三种中断 Banner）

## 6. 排期与依赖图

```
Phase A: 收尾 in-progress（先修现状偏差）
  9  frontend-main-area        ⬜ → 多标签打开/关闭/切换
  16 frontend-right-panel      ⬜ → 基本文件树完善

Phase B: Agent / 配置后端（解锁 Agent UI 与治理 UI）
  31 backend-agent-interrupts   ──── 前置依赖
  32 backend-agent-session-storage ── 前置依赖
  44 backend-agent-governance-commands ── 依赖 2
  45 backend-mcp-config-commands       ── 依赖 2

Phase C: Agent 前端（可并行）
  33 frontend-agent-session-navigation ── 依赖 31+32
  34 frontend-agent-interrupt-ui       ── 依赖 31
  35 frontend-agent-task-progress      ── 依赖 13
  36 frontend-agent-context-tools      ── 依赖 13

Phase D: Chat UI 精细度（可并行）
  37 frontend-chat-input-enhanced     ── 依赖 10
  38 frontend-chat-reasoning-block    ── 依赖 11
  39 frontend-chat-message-polish     ── 依赖 10

Phase E: Shell / Settings 增强（可并行）
  25 frontend-search                  ⬜ 先完成回填消息
  40 frontend-sidebar-collapsible     ── 依赖 8
  41 frontend-search-enhanced         ── 依赖 25
  42 frontend-settings-refined        ── 依赖 18
  43 frontend-right-panel-tree        ── 依赖 16
  46 frontend-settings-skills-ui      ── 依赖 42+44
  47 frontend-settings-hooks-ui       ── 依赖 42+44
  48 frontend-settings-mcp-ui         ── 依赖 42+45

Phase F: 收尾
  28 frontend-tabs-enhanced           ⬜
  19 build-packaging
```

**依赖图 DAG 校验**：无循环依赖——Phase A→B→C 串行，D/E 内部可并行，F 收尾。

**最小闭环**：Phase A 完成后，用户至少有可用的多标签工作区。Phase B+C 完成后 Agent 从"纯流式预览"升级为"可恢复、可审批的 Agent 工作台"。Phase D 完成后 Chat 体验与 Proma 对齐。Phase E 补齐后，设置页从“基础 provider/theme 表单”升级为“可治理 Agent 能力边界的控制台”。

## 7. 接口契约要点（新 feature 的跨模块约束）

以下接口在 Phase B 实现前必须先定下来，各 feature-design 以此为硬约束：

| 接口 | 提供方 | 消费方 | 关键约束 |
|------|--------|--------|---------|
| `start_agent` | #31/#32 agent_engine | #33/#34/#36 agent-ui | 启动参数必须显式绑定 `session_id` 和 `permission_mode`，避免后续会话持久化与权限模式接入再改签名 |
| `AgentEvent::Interrupt` | #31 agent_engine | #34 interrupt-ui | `kind` 字段值固定为 `permission`/`ask_user`/`plan`，携带渲染所需完整数据 |
| `respond_agent_interrupt` | #31 commands/agent | #34 interrupt-ui | stdin 写入格式与 Claude CLI 协议对齐；且响应体必须区分 permission / ask_user / plan，不得压扁为仅 approve/deny/feedback 三值 |
| `get_agent_session` | #32 commands/agent | #33 session-navigation | 返回 `Vec<AgentTimelineItem>`，保留 tool_call / interrupt 等 Agent 专属信息，不能退化成纯文本消息数组 |
| `Channel<AgentEvent>` 新增变体 | #31 agent_engine | #34-#36 agent-ui | 新增变体不破坏已有 `assistantContent`/`toolUse`/`toolResult`/`done`/`error` 路径 |

## 8. 观察项

- `.codestable/architecture/ARCHITECTURE.md` 随 feature acceptance 逐步回写模块详情
- `requirements/` 下 `j-gui-ai-interaction` + `j-gui-personalization` 已升级为 `current`，`j-gui-session-management` 仍为 `draft`
- 前端未引入 React Router——标签页切换通过 Jotai atoms 管理
- **Proma 对齐现状**：当前更准确的定位是"Chat 优先桌面壳 + 可流式的 Agent 预览"，详见 `compound/2026-05-08-explore-proma-gap-analysis.md`
- **Agent 核心差距**：会话仍是内存态，审批/中断缺协议，Agent UI 组件（权限审批/任务进度/Context 环）空白
- **Agent 模式策略已定**：首版使用 Claude Agent SDK（CLI 子进程），j-cli Agent Loop 通过 `AgentBackend` trait 预留接口。详见 `compound/2026-05-08-decision-agent-sdk-strategy.md`
- **Proma 经验吸收边界**：首版吸收 Proma 的状态拆分、协议分型、交互阈值经验，但不因此扩大产品范围到“内容全文搜索”或“聊天附件拖入”
- **Agent 治理范围已纳入首版**：`MCP 配置 UI`、`Skills UI`、`Hooks UI` 进入 Settings 规划；其中 Skills/Hooks 优先复用 j-cli 现有语义并参考 Proma 的实际组织方式，MCP 参考 Proma/Claude Agent SDK 的 Agent 侧做法，但明确不扩到当前 Chat 路径
- **Architecture docs 仍需扩展**：当前已有 `backend-chat-engine.md`、`frontend-chat-ui.md`、`frontend-settings-ui.md` 等子系统文档，但覆盖面还不完整，后续实现时继续通过 `cs-arch backfill` 补齐
- Proma 参考：以下 Proma 模块暂不纳入首版——Workspace 管理、BotHub/多人协作、飞书/IM 集成、Tutorial 引导、Proxy 设置、快捷键自定义、语音输入、MemOS 记忆

## 变更日志

- 2026-05-08：基于 Proma 源码审计新增 10 条子 feature（#20-#29），补充 Chat 交互细节、会话搜索、欢迎页、Toast、系统提示词等
- 2026-05-08：基于当前代码与 Proma 再审视，回调 5 条被高估的状态（main-area / permission / right-panel / search / tabs-enhanced），并新增 3 条 Agent 闭环条目（#31-#33）
- 2026-05-08（本次）：基于 Proma UI 深度调研新增 10 条 UI 追平 feature（#34-#43），按 Agent 审批 UI / 任务进度 / Context 工具 / Chat 输入增强 / 推理块 / 消息精细操作 / 侧栏折叠 / 搜索增强 / 设置重构 / 文件树 拆分，drop 原 #15 frontend-permission（被 #34 取代），新增 `respond_agent_interrupt`/`list_agent_sessions`/`search_transcripts` 命令契约
- 2026-05-08（本次补充）：根据 `explore-proma-gap-analysis` 收紧 Proma 经验吸收边界，移除首版 roadmap 中与 requirement 冲突的“内容全文搜索”“聊天附件拖入”，并把 `start_agent(session_id, permission_mode, ...)`、`get_agent_session -> AgentTimelineItem[]` 固化为 design 前硬约束
- 2026-05-08（本次再补充）：根据最新范围确认，把 `MCP 配置 UI`、`Skills UI`、`Hooks UI` 正式纳入首版，并补齐后端治理契约条目（#44-#45）与对应设置页 UI 条目（#46-#48）
- 2026-05-08（本次范围澄清）：把 `MCP` 明确限定在 Agent runtime，允许 `Skills/MCP` 参考 Proma 的实际做法，但不把当前 j-cli Chat 路径扩写成“支持 MCP”
