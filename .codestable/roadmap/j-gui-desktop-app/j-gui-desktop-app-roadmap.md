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
- Rust 后端：Config/Alias/Chat/System 四组 Tauri 命令 + Chat Engine 封装
- React 前端：三栏布局、Chat 视图（流式 Markdown 渲染）、Agent 视图（工具调用可视化）
- 配置管理、主题切换（暗/亮）、别名管理
- 构建打包（Tauri bundle）

### 明确不做
- 多语言支持（仅中文，英语翻译不在首版范围）
- 多窗口管理（仅单窗口 + 标签页）
- 插件系统（不支持第三方扩展）
- 云端同步（纯本地，不跨设备）
- 语音/图片输入
- j-cli 自身的安装/升级管理

## 3. 模块拆分（概设）

```
j-gui
├── Tauri Backend (src-tauri/)         Rust 后端
│   ├── commands/config.rs             Config 命令（读/写 YamlConfig, AgentConfig）
│   ├── commands/alias.rs              Alias 命令（增删查）
│   ├── commands/chat.rs               Chat 命令（会话 CRUD + 流式消息）
│   ├── commands/system.rs             System 命令（版本、主题）
│   └── chat_engine.rs                 Agent 引擎封装（j_cli 的中介层）
├── Frontend Shell (app-shell/)       三栏布局引擎
│   ├── AppShell.tsx                   主布局容器（左/中/右三栏）
│   ├── LeftSidebar.tsx                左侧栏（模式切换 + 会话列表）
│   └── RightSidePanel.tsx             右侧面板（Agent 文件浏览器）
├── Chat UI (chat/)                   聊天界面
│   ├── ChatView.tsx                   聊天主视图
│   ├── ChatMessages.tsx               流式消息列表
│   ├── ChatInput.tsx                  消息输入框
│   └── MessageBubble.tsx              单条消息气泡（Markdown 渲染）
├── Agent UI (agent/)                 Agent 界面
│   ├── AgentView.tsx                  Agent 主视图（含工具调用流）
│   ├── ToolCallDisplay.tsx            工具调用结果渲染
│   └── PermissionBanner.tsx           权限/审批横幅
├── Settings UI (settings/)           设置
│   └── SettingsDialog.tsx             标签式设置对话框
├── State (atoms/)                    Jotai 状态
│   ├── app-mode.ts                    当前模式（chat/agent）
│   ├── sessions.ts                    会话列表 + 当前会话
│   ├── config.ts                      App 配置
│   ├── streaming.ts                   流式状态
│   └── theme.ts                       主题
└── IPC Layer (lib/)                  前端通信封装
    └── tauri.ts                       Tauri invoke + event listen 封装
```

### Tauri Backend · 后端
- **职责**：暴露 Tauri 命令，封装 j-cli 能力，推送流式事件。不处理 UI 逻辑。
- **承载的子 feature**：backend-config-commands, backend-alias-commands, backend-chat-engine, backend-chat-commands, backend-system-commands
- **触碰的现有代码 / 模块**：全新，`src-tauri/` 下扩展

### Frontend Shell · 三栏布局
- **职责**：管理窗口布局（左侧栏折叠/展开、右侧面板显示/隐藏、主区域标签页）。不处理消息内容渲染。
- **承载的子 feature**：frontend-app-shell, frontend-left-sidebar, frontend-main-area
- **触碰的现有代码 / 模块**：全新，替换脚手架 `App.tsx`

### Chat UI · 聊天界面
- **职责**：消息列表渲染（流式 + Markdown + 代码高亮）、消息输入和发送。不处理 Agent 特有的工具调用渲染。
- **承载的子 feature**：frontend-chat-view, frontend-markdown
- **触碰的现有代码 / 模块**：全新

### Agent UI · Agent 界面
- **职责**：Agent 模式的工具调用可视化、权限审批、右侧文件浏览。复用 Chat UI 的消息渲染基础。
- **承载的子 feature**：frontend-agent-view, frontend-tool-call, frontend-permission, frontend-right-panel
- **触碰的现有代码 / 模块**：全新

### Settings UI · 设置
- **职责**：标签式设置对话框（通用/模型/别名），通过 Tauri 命令读写配置。不处理配置的持久化逻辑（由后端负责）。
- **承载的子 feature**：settings-dialog, theme-integration
- **触碰的现有代码 / 模块**：全新

### State · 状态管理
- **职责**：Jotai atoms 定义，每个 atom 订阅对应 Tauri 事件。不包含 UI 组件。
- **承载的子 feature**：随各 UI feature 同步产出（不是独立 feature）
- **触碰的现有代码 / 模块**：全新

### IPC Layer · 通信封装
- **职责**：封装 `@tauri-apps/api/core` 的 `invoke()` + `Channel` 和 `@tauri-apps/api/event` 的 `listen()`，提供类型安全的调用接口。不包含业务逻辑。
- **承载的子 feature**：随 scaffold 产出基础封装，后续 feature 扩展
- **触碰的现有代码 / 模块**：全新

## 4. 模块间接口契约 / 共享协议

### 4.1 Tauri Commands（Frontend → Backend）

**方向**：React 前端 → Rust 后端
**形式**：Tauri `invoke()` 调用

```rust
// === Config ===
#[tauri::command]
fn get_config() -> Result<YamlConfig, String>;
#[tauri::command]
fn set_config(key: String, value: serde_json::Value) -> Result<(), String>;
#[tauri::command]
fn get_agent_config() -> Result<AgentConfig, String>;
#[tauri::command]
fn set_agent_config(config: AgentConfig) -> Result<(), String>;

// === Alias ===
#[tauri::command]
fn list_aliases() -> Result<Vec<AliasEntry>, String>;
#[tauri::command]
fn set_alias(name: String, value: String) -> Result<(), String>;
#[tauri::command]
fn remove_alias(name: String) -> Result<(), String>;

// === Chat ===
#[tauri::command]
async fn send_message(
    session_id: String,
    content: String,
    on_event: Channel<ChatEvent>,  // 流式结果通过 Channel 推送
) -> Result<(), String>;

#[tauri::command]
fn list_sessions() -> Result<Vec<SessionInfo>, String>;
#[tauri::command]
fn create_session() -> Result<String, String>;  // 返回新 session_id
#[tauri::command]
fn switch_session(session_id: String) -> Result<(), String>;
#[tauri::command]
fn delete_session(session_id: String) -> Result<(), String>;

// === System ===
#[tauri::command]
fn get_version() -> Result<String, String>;
#[tauri::command]
fn set_theme(app: tauri::AppHandle, theme: String) -> Result<(), String>;  // "dark" | "light"
// → 主题变更通过全局 Event "theme-changed" 通知前端
```

**约束**：
- 所有命令错误返回 `String`（人类可读的错误描述）
- `send_message` 是 async——Rust 端不阻塞 Tauri 主线程
- `send_message` 返回时 Channel 自动关闭，无需单独 `cancel_stream` 命令——取消通过 drop Channel 或内部 cancellation token 实现

### 4.2 Tauri Channels — 流式推送（Backend → Frontend）

**方向**：Rust 后端 → React 前端
**形式**：Tauri `Channel<T>` — 官方推荐的流式数据机制

> 依据：Tauri v2 文档明确 "The event system is not suitable for low-latency or high-throughput scenarios; for streaming data, the channels section offers an optimized implementation."

```
// Rust 端 —— ChatEvent 枚举（serde tag = "event", content = "data"）
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
enum ChatEvent {
    Chunk { index: u32, content: String },
    ToolCall { tool_name: String, tool_input: String },
    ToolResult { tool_name: String, tool_output: String, success: bool },
    Done { total_tokens: u32 },
}
```

```
// TypeScript 端 —— 对应联合类型
type ChatEvent =
  | { event: 'chunk'; data: { index: number; content: string } }
  | { event: 'toolCall'; data: { toolName: string; toolInput: string } }
  | { event: 'toolResult'; data: { toolName: string; toolOutput: string; success: boolean } }
  | { event: 'done'; data: { totalTokens: number } };
```

**约束**：
- 每个 `invoke('send_message')` 调用新建一个 `Channel<ChatEvent>` 实例传入
- Channel 绑定到单次 command 调用，command 返回时自动关闭——无需按 `session_id` 路由
- `Chunk` 事件的 `index` 从 0 严格递增，前端用以检测丢包
- Agent 模式下，`Chunk` 和 `ToolCall`/`ToolResult` 可交错推送
- `Done` 在所有 chunk 和 tool 事件之后推送，恰一次
- 取消通过 component unmount 或手动 drop Channel 引用实现

### 4.3 Tauri Events — 全局通知（非流式场景）

**方向**：Rust 后端 → React 前端
**形式**：`app_handle.emit()` + 前端 `listen()`

适用于低频率、非流式全局通知：

```
event: theme-changed
payload: "dark" | "light"
// 主题切换时推送一次
```

**约束**：
- Events 仅用于跨组件的全局通知（主题、配置变更广播等），**不用于 Chat 流式**
- Payload 始终为 JSON，无编译期类型检查
- 前端 `listen()` 返回 `unlisten` 函数，组件卸载时必须调用清理

### 4.4 前端状态（Jotai Atoms → Components）

**方向**：Jotai atoms → React 组件
**形式**：原子化状态订阅

```typescript
// src/atoms/app-mode.ts
appModeAtom: Atom<'chat' | 'agent'>

// src/atoms/sessions.ts
sessionsAtom: Atom<Session[]>
currentSessionIdAtom: Atom<string | null>
currentSessionAtom: Atom<Session | null>  // derived

// src/atoms/config.ts
configAtom: Atom<AppConfig>

// src/atoms/streaming.ts
streamingAtom: Atom<{ active: boolean, sessionId: string | null }>

// src/atoms/theme.ts
themeAtom: Atom<'dark' | 'light'>
sidebarOpenAtom: Atom<boolean>
rightPanelOpenAtom: Atom<boolean>
```

**约束**：
- Chat 流式通过 `Channel.onmessage` 回调更新 atoms（不通过 Events）
- 全局通知（如 `theme-changed`）通过 `listen()` 订阅，在 atom 的 `onMount` 中注册
- 流式更新通过 atom setter 批量合并，每 16ms 最多触发一次 React 重渲染
- atoms 目录不引入任何 UI 依赖（React 组件 / CSS）

### 4.4 共享数据结构

```rust
// Rust 端（src-tauri/src/）

struct SessionInfo {
    id: String,
    title: String,
    created_at: String,     // ISO8601
    updated_at: String,     // ISO8601
    message_count: u32,
    mode: String,           // "chat" | "agent"
}

struct AliasEntry {
    name: String,
    value: String,
}

// YamlConfig 和 AgentConfig 由 j_cli 定义，j-gui 直接复用
// use j_cli::config::YamlConfig;
// use j_cli::agent::AgentConfig;
```

```typescript
// TypeScript 端（src/）

interface SessionInfo {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  mode: 'chat' | 'agent';
}

interface AliasEntry {
  name: string;
  value: string;
}

// Message 类型按需在各 feature 中定义
```

**约束**：
- Rust 端使用 `serde` 的 `Serialize`/`Deserialize`，字段名 `snake_case`
- TypeScript 端字段名 `camelCase`，Tauri 自动转换
- 数据目录统一使用 `j_cli::constants` 定义的 `~/.jdata/` 路径

## 5. 子 feature 清单

1. **scaffold** — 项目脚手架：Tauri v2 + React + Vite + TypeScript 初始化，Tailwind v4 + Jotai + shadcn/ui 安装，`j_cli` path dependency 配置，验证 `cargo tauri dev` 启动成功
   - 所属模块：Tauri Backend + Frontend Shell（全局基础）
   - 依赖：无
   - 状态：planned
   - 对应 feature：未启动

2. **backend-config-commands** — Config 命令：`get_config`, `set_config`, `get_agent_config`, `set_agent_config`，读写 j-cli 的 YAML/JSON 配置
   - 所属模块：Tauri Backend (commands/config.rs)
   - 依赖：scaffold
   - 状态：planned
   - 对应 feature：未启动

3. **backend-alias-commands** — Alias 命令：`list_aliases`, `set_alias`, `remove_alias`
   - 所属模块：Tauri Backend (commands/alias.rs)
   - 依赖：scaffold
   - 状态：planned
   - 对应 feature：未启动

4. **backend-chat-engine** — Chat Engine：封装 j-cli 的 `agent_handle`, `session_mgr`, `tool_executor` 为 `ChatEngine` 结构体，提供 `new`, `send_message`, `cancel`, `list_sessions`, `create_session`, `switch_session`, `delete_session` 方法
   - 所属模块：Tauri Backend (chat_engine.rs)
   - 依赖：scaffold
   - 状态：planned
   - 对应 feature：未启动

5. **backend-chat-commands** — Chat 命令：`send_message`（流式事件推送）、`cancel_stream`、`list_sessions`, `create_session`, `switch_session`, `delete_session`，依赖 `ChatEngine`
   - 所属模块：Tauri Backend (commands/chat.rs)
   - 依赖：backend-chat-engine
   - 状态：planned
   - 对应 feature：未启动

6. **backend-system-commands** — System 命令：`get_version`, `set_theme`
   - 所属模块：Tauri Backend (commands/system.rs)
   - 依赖：scaffold
   - 状态：planned
   - 对应 feature：未启动

7. **frontend-app-shell** — 三栏布局：AppShell（左/中/右三栏容器）、响应式折叠、右侧面板显隐控制
   - 所属模块：Frontend Shell (app-shell/)
   - 依赖：scaffold
   - 状态：planned
   - 对应 feature：未启动

8. **frontend-left-sidebar** — 左侧栏：ModeSwitch（Chat/Agent 滑动切换）、SessionList（按日期分组、置顶/右键菜单）、Settings 入口、版本号
   - 所属模块：Frontend Shell (app-shell/LeftSidebar.tsx)
   - 依赖：frontend-app-shell
   - 状态：planned
   - 对应 feature：未启动

9. **frontend-main-area** — 主区域标签页：TabBar（标题/关闭/切换）、TabContent 容器，支持多标签并行
   - 所属模块：Frontend Shell (app-shell/ 内的 MainArea)
   - 依赖：frontend-app-shell
   - 状态：planned
   - 对应 feature：未启动

10. **frontend-chat-view** — Chat 视图：ChatHeader（标题/模型选择/清空上下文）、ChatMessages（流式消息列表）、ChatInput（文本输入/发送），绑定后端 Chat 命令和事件
    - 所属模块：Chat UI (chat/)
    - 依赖：frontend-main-area, backend-chat-commands
    - 状态：planned
    - 对应 feature：未启动

11. **frontend-markdown** — Markdown 渲染：react-markdown + rehype-highlight + remark-gfm + Shiki 代码高亮，在 MessageBubble 中使用
    - 所属模块：Chat UI (chat/MessageBubble.tsx)
    - 依赖：frontend-chat-view
    - 状态：planned
    - 对应 feature：未启动

12. **frontend-agent-view** — Agent 视图：AgentHeader、消息流（含工具调用气泡）、AgentInput，复用 Chat 的消息渲染基础
    - 所属模块：Agent UI (agent/)
    - 依赖：frontend-chat-view
    - 状态：planned
    - 对应 feature：未启动

13. **frontend-tool-call** — 工具调用显示：Bash/Read/Write/Edit 等工具的执行输入/输出渲染，折叠/展开、状态图标
    - 所属模块：Agent UI (agent/ToolCallDisplay.tsx)
    - 依赖：frontend-agent-view
    - 状态：planned
    - 对应 feature：未启动

14. **frontend-permission** — 权限审批：Agent 模式下 plan/ask/tool 三种审批横幅，确认/拒绝按钮，超时处理
    - 所属模块：Agent UI (agent/PermissionBanner.tsx)
    - 依赖：frontend-agent-view
    - 状态：planned
    - 对应 feature：未启动

15. **frontend-right-panel** — 右侧面板：工作区文件浏览器（仅 Agent 模式显示），列出当前工作目录文件
    - 所属模块：Frontend Shell (app-shell/RightSidePanel.tsx)
    - 依赖：frontend-agent-view
    - 状态：planned
    - 对应 feature：未启动

16. **theme-integration** — 主题集成：j-cli 主题 → CSS 变量映射，暗/亮切换，全局即时生效
    - 所属模块：Settings UI + State
    - 依赖：frontend-app-shell, backend-system-commands
    - 状态：planned
    - 对应 feature：未启动

17. **settings-dialog** — 设置对话框：标签式界面（通用/模型/别名），配置读写绑定后端 Config/Alias 命令
    - 所属模块：Settings UI (settings/SettingsDialog.tsx)
    - 依赖：backend-config-commands, backend-alias-commands, frontend-app-shell
    - 状态：planned
    - 对应 feature：未启动

18. **build-packaging** — 构建打包：Tauri build 配置（图标/安装包/更新检查 URL），验证 `cargo tauri build` 产出可安装包
    - 所属模块：Tauri Backend（全局配置）
    - 依赖：所有 backend + frontend feature
    - 状态：planned
    - 对应 feature：未启动

19. **error-handling** — 统一错误处理：前端错误提示组件（Toast）、后端错误序列化规范、网络/超时重试策略
    - 所属模块：跨模块
    - 依赖：backend-chat-commands, frontend-chat-view
    - 状态：planned
    - 对应 feature：未启动

20. **frontend-session-list** — 会话列表对接：LeftSidebar 的 SessionList 绑定 `list_sessions()` 命令，按日期分组，点击切换会话，右键置顶/删除
    - 所属模块：Frontend Shell (app-shell/LeftSidebar.tsx)
    - 依赖：frontend-left-sidebar, backend-chat-commands
    - 状态：planned
    - 对应 feature：未启动
    - 备注：替换当前静态 placeholderSessions

21. **frontend-message-actions** — 消息操作：复制消息内容按钮（CopyButton）、删除消息、重新发送
    - 所属模块：Chat UI (chat/)
    - 依赖：frontend-chat-view
    - 状态：planned
    - 对应 feature：未启动
    - 备注：Proma 参考——CopyButton.tsx, DeleteMessageDialog.tsx

22. **frontend-context-bar** — 上下文状态栏：ChatHeader 显示当前上下文 token 用量（ContextUsageBadge）、清空上下文按钮（ClearContextButton）、compact 触发
    - 所属模块：Chat UI (chat/)
    - 依赖：frontend-chat-view
    - 状态：planned
    - 对应 feature：未启动
    - 备注：Proma 参考——ContextUsageBadge.tsx, ClearContextButton.tsx, ContextSettingsPopover.tsx

23. **backend-system-prompt** — 系统提示词管理：`get_system_prompt` / `set_system_prompt` 命令，读写 j-cli 的 `system_prompt` 字段，前端 ChatHeader 下拉选择或编辑
    - 所属模块：Tauri Backend (commands/config.rs) + Chat UI
    - 依赖：backend-config-commands
    - 状态：planned
    - 对应 feature：未启动
    - 备注：Proma 参考——SystemPromptSelector.tsx

24. **frontend-search** — 会话搜索：SearchDialog（快捷键唤起），按标题模糊搜索会话，选中跳转
    - 所属模块：Frontend Shell (app-shell/SearchDialog.tsx)
    - 依赖：frontend-left-sidebar, backend-chat-commands
    - 状态：planned
    - 对应 feature：未启动
    - 备注：Proma 参考——SearchDialog.tsx, search-atoms.ts

25. **frontend-toast** — Toast 通知系统：统一错误提示（网络超时/API 错误/配置缺失），非阻塞式弹出，自动消失
    - 所属模块：跨模块
    - 依赖：scaffold
    - 状态：planned
    - 对应 feature：未启动
    - 备注：与 #19 error-handling 互补——Toast 是 UI 层，error-handling 偏后端序列化

26. **frontend-welcome** — 欢迎页：首次启动（无配置时）显示引导页——配置 Provider 的快速入口 + 项目简介
    - 所属模块：Frontend Shell
    - 依赖：frontend-app-shell
    - 状态：planned
    - 对应 feature：未启动

27. **frontend-tabs-enhanced** — 标签页增强：TabSwitcher（快捷键切换）、关闭确认对话框、标签页预览缩略图、错误边界
    - 所属模块：Frontend Shell (MainArea)
    - 依赖：frontend-main-area
    - 状态：planned
    - 对应 feature：未启动
    - 备注：Proma 参考——TabSwitcher.tsx, TabCloseConfirmDialog.tsx, TabErrorBoundary.tsx

28. **frontend-appearance** — 外观设置：主题切换（暗/亮）、字体大小调节、代码块主题选择
    - 所属模块：Settings UI (settings/AppearanceSettings.tsx)
    - 依赖：theme-integration, settings-dialog
    - 状态：planned
    - 对应 feature：未启动

29. **backend-streaming-cancel** — 流式取消：前端 unmount 时通过 Channel drop 触发后端中止 LLM 调用，不浪费 token
    - 所属模块：Tauri Backend (chat_engine.rs)
    - 依赖：backend-chat-engine
    - 状态：planned
    - 对应 feature：未启动
    - 备注：当前 Channel send 错误被 `let _ =` 吞掉，需改为检查并返回/中断

**最小闭环**：第 10 条 `frontend-chat-view` 做完后，用户可以在桌面窗口里输入消息、看到 AI 流式回复（纯文本 Chat 模式端到端跑通）。

## 6. 排期思路

按**后端 → 前端 → Agent → 完善**四层递进：

1. **scaffold** 打底——项目跑不起来后面全堵住
2. **后端命令**（config/alias/chat-engine/chat/system）并行推进——Config/Alias/System 各自独立，Chat 依赖 ChatEngine
3. **前端核心**（app-shell → sidebar/main-area → chat-view → markdown）串行推进——布局先行、内容后填
4. **Agent 模式**（agent-view → tool-call/permission/right-panel）依赖 Chat 视图的消息渲染基础
5. **收尾**（theme/settings/build/error）并行推进——彼此独立

最小闭环选 `frontend-chat-view` 而非 `scaffold`——因为 scaffold 做完看不出任何产品价值，Chat 对话跑通才是第一个可演示里程碑。

后端 ChatEngine + ChatCommands 和前端 ChatView 之间有严格的跨进程接口依赖（Tauri Events 协议），这是整个项目风险最高的接口——第 4.2 节的 event payload 字段定了就不要随便改。

## 7. 观察项

- `ARCHITECTURE.md` 随 feature acceptance 逐步回写模块详情
- `requirements/` 下 `j-gui-ai-interaction` + `j-gui-personalization` 已升级为 `current`，`j-gui-session-management` 仍为 `draft`
- 前端未引入 React Router——标签页切换通过 Jotai atoms 管理
- **Agent 模式策略已定**：首版使用 Claude Agent SDK（CLI 子进程），参考 Proma 的 `claude-agent-adapter.ts`。j-cli Agent Loop 通过 `AgentBackend` trait 预留接口，等 `j-agent` crate 就绪后补。详见 `compound/2026-05-08-decision-agent-sdk-strategy.md`
- **j-cli Agent 耦合**：`MainAgentHandle::spawn()` 无法直接在 j-gui 中使用（`ChatApp` 53 个 pub 字段，`ToolRegistry` 依赖 TUI `ask_tx` 通道，`StreamMsg` 含 UI 状态）。Agent 模式需先在 j-cli 侧抽取 `j-agent` crate。详见 `compound/2026-05-08-explore-j-cli-agent-coupling.md`
- Proma 参考：以下 Proma 模块暂不纳入首版——语音输入、飞书/钉钉集成、Bot Hub、MCP 配置 UI、Workspace 管理、Teams 协作、Tutorial 引导、Proxy 设置、快捷键自定义

## 变更日志

- 2026-05-08：基于 Proma 源码审计新增 10 条子 feature（#20-#29），补充 Chat 交互细节、会话搜索、欢迎页、Toast、系统提示词等
