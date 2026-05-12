---
doc_type: reference
slug: proma-parity-acceptance
description: Proma 1:1 复刻逐屏验收清单
baseline:
  repo: E:\Coding\AI\Proma
  commit: d1d07e7
  captured_at: 2026-05-09
related_requirement: j-gui-proma-parity
related_mapping: proma-mapping
---

# Proma 1:1 复刻验收清单

本清单定义“j-gui 是否已经追平 Proma”的验收口径。`roadmap items.yaml` 的 `done` 只说明实现链路闭环；是否达到 Proma 体验，以本清单和 `proma-mapping.md` 为准。

实施层输入位于 `.codestable/roadmap/j-gui-desktop-app/proma-parity-implementation-spec.md`，机器可读验收矩阵位于 `.codestable/roadmap/j-gui-desktop-app/proma-parity-matrix.yaml`。后续 `proma-parity-*` feature design 不允许只引用本清单摘要，必须读取对应实施规格章节。

当前文档完整性边界：规格、矩阵、映射和本清单足够支撑实现人员开工做 Proma 1:1 复刻；但不足以宣称 j-gui 已经完成 1:1。最终结论必须由 `.codestable/acceptance/proma-parity/{YYYY-MM-DD}/` 下的 #62 验收包给出。

## 基线

- Proma 基线仓库：`E:\Coding\AI\Proma`
- Proma 基线 commit：`d1d07e7`
- 基线来源：当前远程版本源码，已同步到本地
- 主要入口：`apps/electron/src/renderer/components/`
- 快捷键来源：`apps/electron/src/renderer/lib/shortcut-defaults.ts`
- 设置结构来源：`apps/electron/src/renderer/components/settings/SettingsPanel.tsx`

## 判定规则

- `Pass`：用户可见布局、入口、状态和主交互与 Proma 一致或有明确等价替代。
- `Partial`：入口存在，但交互、状态反馈、数据闭环或视觉层级未追平。
- `Fail`：Proma 有核心能力，j-gui 没有。
- `Excluded`：已在 `j-gui-proma-parity.md` 明确排除。
- `Blocked`：j-cli / Tauri / 后端协议暂时无法承接，但不能删除需求，必须回写 roadmap 观察项。

每条验收项必须有两类证据：

- 实现证据：j-gui 对应源码路径或 feature 文档。
- 行为证据：截图、录屏、手动验收记录或自动测试之一。
- 证据存放：`.codestable/acceptance/proma-parity/{YYYY-MM-DD}/`，文件名使用 `{screen}-{item}-{pass|partial|fail}.md`，截图或录屏放同目录。

截图不是唯一证据。截图难以获取时，可以使用以下替代证据，但必须写清步骤、预期、实际和 `Pass / Partial / Fail`：

- 手动验收记录：逐步描述用户操作、预期表现、实际表现和判定。
- 关键交互录屏：只覆盖难以用文字说明的 UI 行为，例如拖拽、切换、流式状态和中断响应。
- DOM/组件状态记录：记录 tab/session/mode/right panel/runtime picker 等关键状态是否随操作同步。
- 自动化检查：能测试的状态隔离、payload、错误态和快捷键路径必须用测试补充。
- 对照源码证据：标明 Proma 源文件、j-gui 实现点和等价/排除理由。

## 全局 Shell

来源：

- Proma：`apps/electron/src/renderer/components/app-shell/AppShell.tsx`
- Proma：`apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`
- Proma：`apps/electron/src/renderer/components/app-shell/RightSidePanel.tsx`
- Proma：`apps/electron/src/renderer/components/tabs/MainArea.tsx`
- Proma：`apps/electron/src/renderer/components/tabs/TabBar.tsx`
- j-gui：`src/components/app-shell/`

验收项：

| 项 | 必须一致 | 当前判定 |
|---|---|---|
| 主布局 | 左侧栏、中间标签工作区、Agent 右侧面板的三栏布局；背景、圆角、阴影和面板层级不能退化成普通表单页 | Partial |
| 左侧栏 | Chat / Agent 模式切换、搜索入口、新建入口、设置入口、会话列表、折叠态图标模式 | Partial |
| 会话分组 | 今天 / 昨天 / 更早分组，按更新时间排序；当前会话高亮；删除/重命名/置顶入口可达 | Partial |
| Agent 侧栏增强 | Working / pinned 区域、Agent 工作状态、未查看完成状态、工作区能力提示 | Fail |
| 右侧面板 | Agent 模式按会话显示文件/工作区面板，可打开/关闭，有文件变化提示 | Partial |
| 窗口拖动区域 | 顶部拖动区域不遮挡可点击控件，输入区和按钮必须 `titlebar-no-drag` 等价处理 | Partial |

验收补充：

- 只实现一个全局 `mode` 开关不算追平，必须按 tab/session 同步 Chat/Agent 状态。
- 右侧面板不能只是静态目录列表，至少要支持递归浏览、当前路径反馈和打开入口。

## Tabs 工作区

来源：

- Proma：`apps/electron/src/renderer/components/tabs/MainArea.tsx`
- Proma：`apps/electron/src/renderer/components/tabs/TabBar.tsx`
- Proma：`apps/electron/src/renderer/components/tabs/TabBarItem.tsx`
- Proma：`apps/electron/src/renderer/components/tabs/TabPreviewPanel.tsx`
- Proma：`apps/electron/src/renderer/components/tabs/TabCloseConfirmDialog.tsx`
- j-gui：`src/components/app-shell/MainArea.tsx`

验收项：

| 项 | 必须一致 | 当前判定 |
|---|---|---|
| 多标签 | Chat 和 Agent 都能作为 tab 打开；切换 tab 时同步当前 mode、session 和侧栏状态 | Partial |
| 标签关闭 | 支持关闭当前 tab；流式或 Agent 运行中必须有确认或停止保护 | Partial |
| 标签预览 | hover 后显示预览面板，延迟、淡出和跨 tab 切换体验接近 Proma | Fail |
| 拖拽重排 | 支持横向拖拽重排，溢出时可横向滚动 | Fail |
| 错误隔离 | 单个 tab 崩溃不能拖垮整个工作区 | Partial |
| 欢迎页 | 无 tab 时显示 Proma 式欢迎/空态，而不是空白页 | Partial |

验收补充：

- `Ctrl/Cmd+W` 关闭 tab、`Ctrl/Cmd+N` 新建会话、模式切换快捷键应按内建快捷键对齐。
- 快捷键自定义设置页首版排除，但内建快捷键本身不能排除。

## Chat

来源：

- Proma：`apps/electron/src/renderer/components/chat/ChatView.tsx`
- Proma：`apps/electron/src/renderer/components/chat/ChatHeader.tsx`
- Proma：`apps/electron/src/renderer/components/chat/ChatInput.tsx`
- Proma：`apps/electron/src/renderer/components/chat/ChatMessages.tsx`
- Proma：`apps/electron/src/renderer/components/chat/ChatMessageItem.tsx`
- Proma：`apps/electron/src/renderer/components/ai-elements/rich-text-input.tsx`
- Proma：`apps/electron/src/renderer/components/ai-elements/reasoning.tsx`
- Proma：`apps/electron/src/renderer/components/ai-elements/context-divider.tsx`
- j-gui：`src/components/chat/`

验收项：

| 项 | 必须一致 | 当前判定 |
|---|---|---|
| ChatHeader | 标题、模型选择、系统提示词、上下文状态和清空上下文入口位置清晰 | Partial |
| 输入区 | Rich text 输入、草稿持久化、发送/停止、工具栏左右分布、禁用态和空态反馈 | Partial |
| 附件入口 | 文件选择、拖放、附件预览、发送后清理 | Excluded |
| Thinking | Thinking 开关、推理块折叠/展开、流式 reasoning 展示 | Partial |
| 消息渲染 | Markdown、代码块、复制、删除、编辑/重发、上下文分割线、滚动行为 | Partial |
| 工具调用 | Chat 工具活动提示和工具块渲染 | Fail |
| Agent 推荐 | Chat 中可出现迁移到 Agent 的推荐/入口 | Fail |

验收补充：

- 首版明确不做“聊天附件/文件直接拖入输入框”，因此附件入口不作为首版失败项。
- 如果保留 textarea，也必须达到 Proma 输入区的状态反馈和快捷键体验；否则判定为 Partial。

## Agent

来源：

- Proma：`apps/electron/src/renderer/components/agent/AgentView.tsx`
- Proma：`apps/electron/src/renderer/components/agent/AgentHeader.tsx`
- Proma：`apps/electron/src/renderer/components/agent/AgentMessages.tsx`
- Proma：`apps/electron/src/renderer/components/agent/PermissionBanner.tsx`
- Proma：`apps/electron/src/renderer/components/agent/AskUserBanner.tsx`
- Proma：`apps/electron/src/renderer/components/agent/ExitPlanModeBanner.tsx`
- Proma：`apps/electron/src/renderer/components/agent/PermissionModeSelector.tsx`
- Proma：`apps/electron/src/renderer/components/agent/TaskProgressCard.tsx`
- Proma：`apps/electron/src/renderer/components/agent/ContextUsageBadge.tsx`
- Proma：`apps/electron/src/renderer/components/agent/SidePanel.tsx`
- Proma：`apps/electron/src/renderer/components/agent/tool-result-renderers/`
- j-gui：`src/components/agent/`

验收项：

| 项 | 必须一致 | 当前判定 |
|---|---|---|
| AgentHeader | 标题编辑、右侧文件面板开关、文件变化提示 | Partial |
| Agent 输入区 | Rich text 输入、附件/目录入口、模型选择、权限模式、计划模式、停止按钮 | Partial |
| slash runtime 选择 | `/` 打开 Agent runtime picker，分组展示命令、已导入 Skills、MCP server、Hooks/context 状态；支持键盘选择、过滤、空态、错误态，选择后形成 chip/token 并随 Agent payload 发送 | Fail |
| 权限审批 | PermissionBanner 显示工具名、风险提示、输入预览、允许/拒绝/总是允许类操作 | Fail |
| AskUser | AskUserBanner 支持问题、选项、自定义输入和回传 | Fail |
| ExitPlanMode | 计划模式审批、反馈、批准后执行 | Fail |
| 工具调用 | 按工具类型渲染 read/write/edit/bash/search 等结果，不只是 JSON 文本 | Partial |
| 任务进度 | TaskProgressCard 聚合任务列表和进度，BackgroundTasksPanel 展示后台任务 | Partial |
| Context 用量 | ContextUsageBadge 展示上下文状态，并和真实 token/上下文来源绑定 | Fail |
| 会话恢复 | Agent 会话可保存、切换、搜索、回填；不把 Chat 会话串到 Agent 里 | Partial |
| 无回应处理 | start/send 首包超时、done 空内容、Channel 断开时必须显示 timeout/empty/disconnected 状态并提供停止或重试 | Fail |
| 多 Workspace 管理 | WorkspaceSelector 多工作区切换 | Excluded |
| 单工作区文件上下文 | 目录添加、文件 mention、右侧 SidePanel 联动 | Fail |

验收补充：

- Proma 的多 Workspace 管理首版排除；单工作区下的文件浏览、目录添加和文件 mention 不排除，必须由 j-gui 的单工作区模型等价承接。
- Agent 审批链路只要没有可回传协议，就不能从 Fail 提升为 Partial。
- slash runtime 选择只作用于 Agent runtime；Chat 输入区不得宣称 MCP/Agent Skills 可用。
- Agent 无回应不能靠“日志里有错误”通过验收，必须有用户可见状态和重试/停止路径。

## Search

来源：

- Proma：`apps/electron/src/renderer/components/app-shell/SearchDialog.tsx`
- Proma：`apps/electron/src/renderer/atoms/search-atoms.ts`
- Proma：`apps/electron/src/renderer/hooks/useOpenSession.ts`
- j-gui：`src/components/app-shell/SearchDialog.tsx`

验收项：

| 项 | 必须一致 | 当前判定 |
|---|---|---|
| 唤起方式 | 全局搜索快捷键和侧栏搜索入口都能打开同一个搜索面板 | Partial |
| 搜索范围 | Chat 标题、Agent 标题、Chat/Agent 消息内容搜索都可用 | Partial |
| 高亮 | 标题命中部分高亮；内容 snippet 高亮 | Partial |
| IME | 中文输入法 composition 不抖动，不逐字误触发跳转 | Partial |
| 键盘导航 | 上下箭头、Enter、Esc、清空 query 行为完整 | Partial |
| 打开结果 | 选中结果必须打开对应 Chat/Agent tab 并回填内容，不只设置 session id | Partial |
| 归档标识 | 归档会话搜索结果有明确标记 | Fail |

验收补充：

- 当前搜索验收不再把“内容搜索排除”当作豁免项；重点核对的是后端命令是否真实存在、结果是否带消息锚点，以及 Chat/Agent 两侧是否同口径。

## Settings

来源：

- Proma：`apps/electron/src/renderer/components/settings/SettingsDialog.tsx`
- Proma：`apps/electron/src/renderer/components/settings/SettingsPanel.tsx`
- Proma：`apps/electron/src/renderer/components/settings/primitives/`
- Proma：`apps/electron/src/renderer/components/settings/AgentSettings.tsx`
- Proma：`apps/electron/src/renderer/components/settings/ToolSettings.tsx`
- Proma：`apps/electron/src/renderer/components/settings/ShortcutSettings.tsx`
- Proma：`apps/electron/src/renderer/components/settings/McpServerForm.tsx`
- j-gui：`src/components/settings/`

Proma 设置导航基线：

- 通用设置
- 模型配置
- 提示词管理
- 代理设置
- Agent 配置（Agent 模式）
- Chat 工具
- 语音输入
- 远程连接
- Proma 教程
- 快捷键管理
- 数据迁移
- 外观设置
- 关于/更新

验收项：

| 项 | 必须一致 | 当前判定 |
|---|---|---|
| Dialog 外观 | 轻遮罩、居中浮窗、固定最大尺寸、圆角、左导航、右内容 | Partial |
| 设置导航 | 左侧 tab 列表、图标、当前 tab 高亮，Agent 模式插入 Agent 配置 | Partial |
| 脏状态保护 | 模型配置等未保存变更切 tab/关闭时有确认 | Partial |
| UI 原语 | SettingsRow/Card/Input/Select/Toggle 等复用，避免每个 tab 自己写样式 | Partial |
| 模型配置 | Provider/channel 列表、表单、启用状态、校验和保存反馈 | Partial |
| 提示词管理 | 系统提示词/提示词选择和编辑入口 | Partial |
| Agent 配置 | Skills / Hooks / MCP 的列表、启停、来源、空态、错误态 | Partial |
| Chat 工具 | 工具列表、启停和配置入口 | Fail |
| 快捷键管理 | 自定义快捷键设置页 | Excluded |
| 关于/更新 | 版本信息可有；应用内更新检查首版排除 | Excluded |
| 语音输入 | 设置页和语音浮窗 | Excluded |
| 远程连接 / IM | BotHub、飞书、钉钉、微信等 | Excluded |
| 代理设置 | Proxy 设置 | Excluded |
| 数据迁移 | Proma 数据迁移入口 | Excluded |
| 教程 | Tutorial / Onboarding | Excluded |

验收补充：

- 排除的 tab 不要求出现，但不能在其他文档里又把它当 planned 功能。
- Skills / Hooks / MCP 是 j-gui 自己必须补齐的 Agent 治理面；不能因为 Proma 原名不同就降级成静态说明。

## File Browser / 工作上下文

来源：

- Proma：`apps/electron/src/renderer/components/file-browser/FileBrowser.tsx`
- Proma：`apps/electron/src/renderer/components/file-browser/FileDropZone.tsx`
- Proma：`apps/electron/src/renderer/components/file-browser/file-mention-suggestion.tsx`
- Proma：`apps/electron/src/renderer/components/agent/SidePanel.tsx`
- Proma：`apps/electron/src/renderer/components/agent/WorkspaceSelector.tsx`
- j-gui：`src/components/app-shell/RightSidePanel.tsx`

验收项：

| 项 | 必须一致 | 当前判定 |
|---|---|---|
| 文件树 | 递归目录、文件类型图标、懒加载、错误态 | Partial |
| 目录添加 | 用户能通过 UI 添加工作目录或目录上下文 | Fail |
| 文件 mention | 输入区支持文件路径 suggestion / chip | Fail |
| DropZone | 拖放文件或目录的反馈 | Excluded |
| WorkspaceSelector | 多 workspace 切换 | Excluded |

验收补充：

- 多 workspace 管理排除，但“文件浏览器能添加文件夹（工作区）”是用户明确反馈的差距，必须由 j-gui 的单工作区模型给出等价 UI。

## Shortcuts

来源：

- Proma：`apps/electron/src/renderer/lib/shortcut-defaults.ts`
- Proma：`apps/electron/src/renderer/components/shortcuts/GlobalShortcuts.tsx`
- Proma：`apps/electron/src/renderer/components/settings/ShortcutSettings.tsx`
- j-gui：`src/components/`

首版必须保留的内建快捷键：

| ID | Windows | 作用 | 首版要求 |
|---|---|---|---|
| `open-settings` | `Ctrl+,` | 打开设置 | Must |
| `new-session` | `Ctrl+N` | 当前模式新建 Chat/Agent | Must |
| `toggle-sidebar` | `Ctrl+B` | 切换侧边栏 | Must |
| `toggle-mode` | `Ctrl+Shift+M` | Chat/Agent 模式切换 | Must |
| `global-search` | `Ctrl+F` | 全局搜索 | Must |
| `focus-input` | `Ctrl+L` | 聚焦输入框 | Must |
| `clear-context` | `Ctrl+K` | 清除上下文 | Must |
| `stop-generation` | `Ctrl+Shift+Backspace` | 停止当前响应/Agent | Must |
| `close-tab` | `Ctrl+W` | 关闭当前 tab | Must |
| `quick-task` | `Alt+Space` | 快速任务 | Excluded |
| `show-main-window` | `Ctrl+Shift+P` | 显示主窗口 | Excluded |
| `voice-dictation` | `Ctrl+`` | 语音输入 | Excluded |

验收补充：

- 快捷键自定义设置页首版排除。
- 内建快捷键不可排除，除非对应功能本身在 req 边界里明确排除。

## 明确排除

这些不是“漏做”，而是首版边界外：

- 多 workspace 管理
- BotHub / 多人协作 / 远程连接
- 飞书 / 钉钉 / 微信集成
- Tutorial / Onboarding
- Proxy 设置
- 语音输入
- 应用内更新检查
- 快捷键自定义
- MemOS 记忆
- 多窗口
- Quick Task 浮窗

## Roadmap 拆解映射

以下条目是从本验收清单拆出来的 Proma parity 专用执行层。旧 roadmap item 的 `done` 只说明基础实现已完成；这些 `proma-parity-*` item 才用于追踪“是否达到 Proma 1:1 体验”。

| 验收区域 | 主要缺口 | Roadmap item | 优先级 |
|---|---|---|---|
| 全局 Shell / 左侧栏 | Agent Working / pinned 区域、未查看完成状态、工作区能力提示、折叠态细节、右侧面板显隐、窗口拖动/非拖动区域 | `proma-parity-shell-sidebar` | P0 |
| Tabs 工作区 | 预览面板、拖拽重排、关闭确认、错误隔离、横向滚动体验、欢迎页/空态 | `proma-parity-tabs-workspace` | P0 |
| Chat 输入与消息 | RichText 输入、工具栏布局、Thinking、ContextDivider、ScrollMinimap、Agent 推荐入口 | `proma-parity-chat-experience` | P0 |
| Chat 工具 | Chat 工具活动提示、工具块渲染、Settings ToolSettings 入口 | `proma-parity-chat-tools` | P1 |
| Agent 审批 | Permission / AskUser / ExitPlanMode 三类中断 UI 和回传闭环 | `proma-parity-agent-interrupts` | P0 |
| Agent 工具展示 | read/write/edit/bash/search 等工具结果分型渲染，不退化成 JSON 文本 | `proma-parity-agent-tool-renderers` | P0 |
| Agent 任务、上下文与 runtime 选择 | TaskProgressCard、BackgroundTasksPanel、ContextUsageBadge、真实 token / context 来源、slash skills/MCP runtime picker | `proma-parity-agent-task-context` | P1 |
| Agent 单工作区文件上下文 | 文件树、目录添加、文件 mention、slash 文件选择、SidePanel 联动、单工作区等价替代 | `proma-parity-agent-file-context` | P0 |
| Agent 会话工作台 | AgentHeader 标题编辑、右侧文件面板按钮/文件变化提示、会话保存/切换/搜索/回填、Chat/Agent 会话隔离、无回应状态处理 | `proma-parity-agent-session-workbench` | P0 |
| Search | 标题搜索、高亮、IME、键盘导航、打开结果回填、归档标识 | `proma-parity-search-navigation` | P1 |
| Settings | Dialog 外观、左导航、脏状态保护、UI 原语、Provider/Prompt/Agent/Chat Tools tab | `proma-parity-settings-console` | P1 |
| Shortcuts | 内建快捷键：设置、新建、侧栏、模式切换、搜索、聚焦、清上下文、停止、关 tab | `proma-parity-core-shortcuts` | P1 |
| 验收证据 | Proma 基线截图/录屏、j-gui 对照截图/录屏、逐项验收记录 | `proma-parity-evidence-pass` | P0 |

依赖原则：

- `proma-parity-evidence-pass` 是最终收口项，依赖所有 P0/P1 parity item。
- `proma-parity-agent-interrupts` 依赖后端中断协议；没有回传协议时不能只做 UI。
- `proma-parity-agent-file-context` 不恢复 Proma 多 workspace 管理，但必须提供单工作区下的目录添加和文件 mention。
- `proma-parity-chat-tools` 不扩大到 marketplace，只追平本地 Chat 工具列表、启停、配置入口和消息区工具展示。
- `proma-parity-agent-session-workbench` 专门承接 AgentHeader 和会话恢复，不能由“Agent 基础流式链路可用”替代。
- `proma-parity-agent-task-context` 同时承接 slash skills/MCP runtime 选择；MCP 仍限定在 Agent runtime。

## 验收流程

1. 对照 Proma 基线 commit `d1d07e7` 打开同一屏。
2. 按本清单逐项记录 `Pass / Partial / Fail / Excluded / Blocked`。
3. 每个 `Partial / Fail / Blocked` 必须回写 `proma-mapping.md`。
4. 如果需要实现，必须有 roadmap item 或 feature design 承接。
5. 如果决定不做，必须回写 `j-gui-proma-parity.md` 的边界。
6. 最终验收报告必须附上 j-gui 截图/录屏或手动验收记录，不能只引用代码。
