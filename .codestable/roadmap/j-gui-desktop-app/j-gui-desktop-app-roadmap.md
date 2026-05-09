---
doc_type: roadmap
slug: j-gui-desktop-app
status: active
created: 2026-05-08
last_reviewed: 2026-05-09
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

为 j-cli（Rust CLI AI 工具）开发 Tauri 桌面端。j-cli 已有完整的 AI Chat/Agent 能力、配置管理、会话存储等——但只在终端里跑。桌面端通过 Tauri v2 把 j-cli 包装成 GUI 应用，前端按 Proma（Electron AI Agent 桌面应用）当前远程版本做 1:1 复刻，除明确不需要的功能外保持 UI 和功能一致。

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
- 以 Proma 当前远程版本为 UI / 功能对照基线，逐项补齐可见差异

### 明确不做
- 多语言支持（仅中文，英语翻译不在首版范围）
- 多窗口管理（仅单窗口 + 标签页）
- 插件系统（不支持第三方扩展）
- 云端同步（纯本地，不跨设备）
- 语音/图片输入
- 会话内容全文搜索（首版只做标题搜索与结果回填）
- 聊天附件/文件直接拖入输入框
- j-cli 自身的安装/升级管理
- Proma 的 Workspace 管理、BotHub/多人协作、飞书/IM 集成、Tutorial 引导、Proxy 设置、应用内更新检查、MemOS 记忆

## 3. 复刻验收口径

Proma 复刻不是“功能点已经做了”，而是“用户看到、用到、感受到的行为已经对齐”。

验收分四层：

1. **布局层**：默认布局、导航层级、面板显隐、空态、错误态
2. **行为层**：会话切换、消息发送、Agent 中断、搜索回填、设置保存
3. **交互层**：按钮位置、标签切换、审批流、输入区反馈、内建快捷键
4. **治理层**：Skills / Hooks / MCP 的入口、列表、启停、范围边界

逐屏验收以 `.codestable/reference/proma-parity-acceptance.md` 为准；组件对照以 `.codestable/reference/proma-mapping.md` 为准；边界以 `.codestable/requirements/j-gui-proma-parity.md` 为准；差距证据以 `.codestable/compound/2026-05-08-explore-proma-gap-analysis.md` 为准；实施规格以本目录 `proma-parity-implementation-spec.md` 和 `proma-parity-matrix.yaml` 为准。

当前文档状态：已经足够作为 Proma 1:1 复刻的实现输入，不再继续无限补文档；但它不是最终完成证明。最终是否 1:1，只能由 #62 `proma-parity-evidence-pass` 汇总的手动验收记录、录屏、DOM/组件状态、自动化检查和源码对照证据判定。

## 4. 模块拆分（概设）

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

## 5. 模块间接口契约 / 共享协议

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

## 6. 子 feature 清单

> 状态口径：本节以 `j-gui-desktop-app-items.yaml` 为状态源。`done` 表示基础实现链路已闭环，不自动等于 Proma 视觉、交互和行为 1:1 追平；Proma 追平只看 `proma-parity-*` item 和 `proma-parity-acceptance.md` 的行为证据。

> 实施口径：#50-#62 不允许只按一句话描述开工。每条 feature design 必须读取 `proma-parity-implementation-spec.md` 的对应章节，并从 `proma-parity-matrix.yaml` 抽取 acceptance_points 作为验收输入。

### 已闭环 — 基础实现 + 设置补齐（done — 48 条）

**后端与 IPC**：#1 scaffold、#2 backend-config-commands、#3 backend-alias-commands、#4 backend-chat-engine、#5 backend-chat-commands、#6 backend-system-commands、#12 backend-agent-engine、#20 error-handling、#24 backend-system-prompt、#30 backend-streaming-cancel、#31 backend-agent-interrupts、#32 backend-agent-session-storage、#44 backend-agent-governance-commands、#45 backend-mcp-config-commands。

**Shell / 状态 / 导航**：#7 frontend-app-shell、#8 frontend-left-sidebar、#9 frontend-main-area、#16 frontend-right-panel、#17 theme-integration、#18 settings-dialog、#21 frontend-session-list、#25 frontend-search、#26 frontend-toast、#27 frontend-welcome、#28 frontend-tabs-enhanced、#29 frontend-appearance、#40 frontend-sidebar-collapsible、#41 frontend-search-enhanced、#42 frontend-settings-refined、#43 frontend-right-panel-tree。

**Chat UI**：#10 frontend-chat-view、#11 frontend-markdown、#22 frontend-message-actions、#23 frontend-context-bar、#37 frontend-chat-input-enhanced、#38 frontend-chat-reasoning-block、#39 frontend-chat-message-polish。

**Agent UI**：#13 frontend-agent-view、#14 frontend-tool-call、#33 frontend-agent-session-navigation、#34 frontend-agent-interrupt-ui、#35 frontend-agent-task-progress、#36 frontend-agent-context-tools。

**Settings / 治理 UI 与打包**：#19 build-packaging、#46 frontend-settings-skills-ui、#47 frontend-settings-hooks-ui、#48 frontend-settings-mcp-ui、#49 frontend-settings-chat-tools-ui。

### 待实现 — 基础补齐（planned — 1 条）

49. **frontend-settings-chat-tools-ui** — Chat 工具 UI：Settings 中新增 Chat Tools / ToolSettings 入口，展示可用 Chat 工具、启停状态、配置入口、空态与错误态。

### 已完成 — Proma 1:1 复刻验收（done — 12 条）

50. **proma-parity-shell-sidebar** ✅ 51. **proma-parity-tabs-workspace** ✅ 52. **proma-parity-chat-experience** ✅
53. **proma-parity-chat-tools** ✅ 54. **proma-parity-agent-interrupts** ✅ 55. **proma-parity-agent-tool-renderers** ✅
56. **proma-parity-agent-task-context** ✅ 57. **proma-parity-agent-file-context** ✅ 58. **proma-parity-search-navigation** ✅
59. **proma-parity-settings-console** ✅ 60. **proma-parity-core-shortcuts** ✅ 61. **proma-parity-agent-session-workbench** ✅

### 待收口 — 证据汇总（in-progress — 1 条）

62. **proma-parity-evidence-pass** — Proma parity 证据收口：Proma 基线截图/录屏、j-gui 对照截图/录屏、逐项验收记录（前置 12 条已全部完成）

> 已 drop：原 #15 `frontend-permission` 被 #34 `frontend-agent-interrupt-ui` 取代（后者覆盖全部三种中断 Banner）

## 7. 排期与依赖图

```
Phase A: 基础补齐
  49 frontend-settings-chat-tools-ui  ── 依赖 42

Phase P: Proma parity 追平（按验收清单收口；依赖的基础 item 已完成或在 Phase A 补齐）
  50 proma-parity-shell-sidebar       ── 依赖 40+43
  51 proma-parity-tabs-workspace      ── 依赖 9+28
  52 proma-parity-chat-experience     ── 依赖 37+38+39
  53 proma-parity-chat-tools          ── 依赖 49
  54 proma-parity-agent-interrupts    ── 依赖 31+34
  55 proma-parity-agent-tool-renderers ── 依赖 14
  56 proma-parity-agent-task-context  ── 依赖 35+36
  57 proma-parity-agent-file-context  ── 依赖 36+37+43
  58 proma-parity-search-navigation   ── 依赖 25+41
  59 proma-parity-settings-console    ── 依赖 42+46+47+48+49
  60 proma-parity-core-shortcuts      ── 依赖 8+9+10+13+18+23+25+30+37
  61 proma-parity-agent-session-workbench ── 依赖 32+33+43
  62 proma-parity-evidence-pass       ── 依赖 50+51+52+53+54+55+56+57+58+59+60+61
```

**依赖图 DAG 校验**：无循环依赖——基础补齐先完成 #49，Proma parity item 再按区域并行收口，最终由 #62 汇总证据。

**P0 执行顺序**：先做 #50、#51、#52、#54、#55、#57、#61，覆盖用户当前反馈的会话隔离、Agent 无回应、标题/会话工作台、UI 完整度、Agent 审批、工具渲染和文件上下文问题；#53、#56、#58、#59、#60 随后补齐 P1；#62 只做最终证据收口，不替代任何前置实现。

**最小闭环**：#49 完成后，Settings 不再缺 Chat Tools 入口。P0 第一轮完成后，用户反馈的七个核心差距必须都有实现和行为证据。Phase P 完成后，Proma 对齐从“基础实现可用”升级为“逐屏验收有证据的 1:1 复刻”。

## 8. 接口契约要点（新 feature 的跨模块约束）

以下接口在 Phase B 实现前必须先定下来，各 feature-design 以此为硬约束：

| 接口 | 提供方 | 消费方 | 关键约束 |
|------|--------|--------|---------|
| `start_agent` | #31/#32 agent_engine | #33/#34/#36 agent-ui | 启动参数必须显式绑定 `session_id` 和 `permission_mode`，避免后续会话持久化与权限模式接入再改签名 |
| `AgentEvent::Interrupt` | #31 agent_engine | #34 interrupt-ui | `kind` 字段值固定为 `permission`/`ask_user`/`plan`，携带渲染所需完整数据 |
| `respond_agent_interrupt` | #31 commands/agent | #34 interrupt-ui | stdin 写入格式与 Claude CLI 协议对齐；且响应体必须区分 permission / ask_user / plan，不得压扁为仅 approve/deny/feedback 三值 |
| `get_agent_session` | #32 commands/agent | #33 session-navigation | 返回 `Vec<AgentTimelineItem>`，保留 tool_call / interrupt 等 Agent 专属信息，不能退化成纯文本消息数组 |
| `Channel<AgentEvent>` 新增变体 | #31 agent_engine | #34-#36 agent-ui | 新增变体不破坏已有 `assistantContent`/`toolUse`/`toolResult`/`done`/`error` 路径 |

## 9. 观察项

- `.codestable/architecture/ARCHITECTURE.md` 随 feature acceptance 逐步回写模块详情
- `requirements/` 下 `j-gui-ai-interaction`、`j-gui-session-management`、`j-gui-personalization` 已升级为 `current`；`j-gui-proma-parity` 仍为 `draft`
- 前端未引入 React Router——标签页切换通过 Jotai atoms 管理
- **Proma 对齐现状**：当前更准确的定位是"Chat 优先桌面壳 + 可流式的 Agent 预览"；目标口径已经升级为按 Proma 当前远程版本做 1:1 复刻，详见 `requirements/j-gui-proma-parity.md`
- **Agent parity 差距**：Agent 会话存储、审批协议和基础 UI 组件已有实现链路，但是否达到 Proma 的 AgentHeader、会话恢复、审批回传、任务进度、Context 环体验，仍以 #54/#56/#61 的行为证据为准，并由 #62 最终收口
- **Agent 模式策略已定**：首版使用 Claude Agent SDK（CLI 子进程），j-cli Agent Loop 通过 `AgentBackend` trait 预留接口。详见 `compound/2026-05-08-decision-agent-sdk-strategy.md`
- **Proma 经验吸收边界**：首版吸收 Proma 的状态拆分、协议分型、交互阈值经验，但不因此扩大产品范围到“内容全文搜索”或“聊天附件拖入”
- **Agent 治理范围已纳入首版**：`MCP 配置 UI`、`Skills UI`、`Hooks UI` 进入 Settings 规划；其中 Skills/Hooks 优先复用 j-cli 现有语义并按 Proma 当前远程版本的组织方式对齐，MCP 按 Proma/Claude Agent SDK 的 Agent 侧做法对齐，但明确不扩到当前 Chat 路径
- **Agent runtime 选择范围**：slash runtime 选择只在 Agent 输入区生效，覆盖已导入 Skills、MCP server、Hooks/运行上下文提示和文件 mention；Chat 输入区只允许 Chat Tools，不把 MCP 宣称为 Chat 能力
- **Architecture docs 仍需扩展**：当前已有 `backend-chat-engine.md`、`frontend-chat-ui.md`、`frontend-settings-ui.md` 等子系统文档，但覆盖面还不完整，后续实现时继续通过 `cs-arch backfill` 补齐
- Proma 复刻排除项：以下 Proma 模块暂不纳入首版——Workspace 管理、BotHub/多人协作、飞书/IM 集成、Tutorial 引导、Proxy 设置、快捷键自定义、语音输入、应用内更新检查、MemOS 记忆
- roadmap items.yaml 的 `done` 表示对应实现链路已闭环，不自动等于“Proma 体验 100% 对齐”；对齐程度请以 `proma-mapping.md` 的状态列为准
- Proma 1:1 复刻的执行层使用 `proma-parity-*` item 追踪；这些 item 只能在 `proma-parity-acceptance.md` 对应验收项有行为证据后标 done
- Proma parity 的可实现规格已拆到 `proma-parity-implementation-spec.md`，机器可读验收矩阵在 `proma-parity-matrix.yaml`

## 变更日志

- 2026-05-08：基于 Proma 源码审计新增 10 条子 feature（#20-#29），补充 Chat 交互细节、会话搜索、欢迎页、Toast、系统提示词等
- 2026-05-08：基于当前代码与 Proma 再审视，回调 5 条被高估的状态（main-area / permission / right-panel / search / tabs-enhanced），并新增 3 条 Agent 闭环条目（#31-#33）
- 2026-05-08（本次）：基于 Proma UI 深度调研新增 10 条 UI 追平 feature（#34-#43），按 Agent 审批 UI / 任务进度 / Context 工具 / Chat 输入增强 / 推理块 / 消息精细操作 / 侧栏折叠 / 搜索增强 / 设置重构 / 文件树 拆分，drop 原 #15 frontend-permission（被 #34 取代），新增 `respond_agent_interrupt` / `list_agent_sessions` 命令契约
- 2026-05-08（本次补充）：根据 `explore-proma-gap-analysis` 收紧 Proma 经验吸收边界，移除首版 roadmap 中与 requirement 冲突的“内容全文搜索”“聊天附件拖入”，并把 `start_agent(session_id, permission_mode, ...)`、`get_agent_session -> AgentTimelineItem[]` 固化为 design 前硬约束
- 2026-05-08（本次再补充）：根据最新范围确认，把 `MCP 配置 UI`、`Skills UI`、`Hooks UI` 正式纳入首版，并补齐后端治理契约条目（#44-#45）与对应设置页 UI 条目（#46-#48）
- 2026-05-08（本次范围澄清）：把 `MCP` 明确限定在 Agent runtime，允许 `Skills/MCP` 按 Proma 当前远程版本的实际做法对齐，但不把当前 j-cli Chat 路径扩写成“支持 MCP”
- 2026-05-09：把 `proma-parity-acceptance.md` 的 Partial / Fail 项拆成 13 条 `proma-parity-*` 执行 item，并新增最终证据收口项 `proma-parity-evidence-pass`
- 2026-05-09（本次修正）：同步 `items.yaml` 当前状态，明确 47 条基础实现已闭环、#49 与 13 条 Proma parity item 待完成；补入 AgentHeader/会话恢复、右侧面板/窗口拖动、欢迎页、文件树和快捷键依赖覆盖
- 2026-05-09（实施规格）：新增 `proma-parity-implementation-spec.md` 与 `proma-parity-matrix.yaml`，把 #50-#62 拆到源文件、承接点、必须实现状态/交互和证据要求
- 2026-05-09（实施规格审查修正）：补齐 slash skills/MCP runtime 选择路径和 Agent no-response/timeout/retry 验收，避免用户反馈项只停留在最终证据摘要
