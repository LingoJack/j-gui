---
doc_type: implementation-spec
slug: proma-parity-implementation-spec
status: active
created: 2026-05-09
last_reviewed: 2026-05-09
roadmap: j-gui-desktop-app
baseline_repo: E:\Coding\AI\Proma
baseline_commit: d1d07e7
related_acceptance: .codestable/reference/proma-parity-acceptance.md
related_matrix: proma-parity-matrix.yaml
---

# Proma 1:1 复刻实施规格

本文件把 `proma-parity-*` roadmap item 从“区域清单”落到实现规格。后续每条 feature design 必须把本文件当硬约束输入；如果实现阶段发现 Proma 基线或 j-gui 约束冲突，先回本文件和 `proma-parity-matrix.yaml` 更新，不在单个 feature 里绕开。

定位边界：本文件已经足够作为 1:1 复刻的实现输入，但不能作为“已经 1:1 完成”的证明。最终完成证明只能来自 #62 `proma-parity-evidence-pass` 收口的验收记录，包括手动步骤记录、关键交互录屏、DOM/组件状态记录、自动化检查和 Proma/j-gui 源码对照证据。

## 0. 判定口径

**1:1 不是逐字复制源码**。允许 j-gui 用 Tauri、Rust IPC、Jotai atom 和不同组件拆分实现；不允许用户可见的布局层级、入口位置、主交互、状态反馈、空态/错误态和快捷键路径明显弱于 Proma。

每个 parity item 只有在同时满足以下条件后才能从 `planned` 推进到 `done`：

- 实现证据：列出 j-gui 相关源码路径和协议/状态来源。
- 行为证据：在 `.codestable/acceptance/proma-parity/{YYYY-MM-DD}/` 写验收记录，并附截图/录屏或明确手动步骤结果。
- 对照证据：记录 Proma baseline `d1d07e7` 对应屏幕、组件源码和观察到的交互。
- 边界证据：排除项只能引用 `j-gui-proma-parity.md` 或本文件的“明确不做”，不能临时口头排除。

执行顺序：先进入实现和验收闭环，不继续无限补文档。P0 第一轮优先推进 #50、#51、#52、#54、#55、#57、#61；#62 只在 #50-#61 至少完成一轮实现验收后执行，用于收口证明，不用于替代前置实现。

## 1. 全局不变量

### 1.1 会话与标签隔离

- Chat 和 Agent 会话空间必须分离：列表、搜索、打开、消息回填都不能共用同一个“当前会话”而导致串话。
- Tab 是工作区主索引：切换 tab 必须同步 `type`、`sessionId`、当前模式、侧栏高亮、右侧面板状态。
- Agent 正在运行时，切换或关闭 tab 不能把输出写到另一个 tab；必须绑定 run/session/tab 三元组。

### 1.2 Proma 排除项边界

以下不做，但必须提供等价替代或明确空态：

- 多 workspace 管理不做；单工作区文件上下文必须做。
- 快捷键自定义页不做；内建快捷键必须做。
- Chat 附件/拖放不做；Agent 文件上下文和目录添加必须做。
- 应用内更新、语音、BotHub/IM、Tutorial、Proxy、MemOS 不做；Settings 里不得把这些作为计划中功能暗示给用户。
- MCP 不扩到 Chat 命令链路；slash MCP 选择只表示 Agent runtime 本次会话/本次消息可用的 MCP server 选择。

### 1.3 视觉基线

从 Proma 源码可确认的固定 UI 约束：

- App 顶部存在 titlebar drag region；交互控件必须使用等价 no-drag 区域，不能阻挡点击。
- 左侧栏有展开态和折叠态，Proma 展开态约 `280px`、折叠态约 `48px`；j-gui 可等价但不能退化成普通列表。
- Tab item 需要最小宽度、最大宽度、横向滚动、hover 预览和关闭保护。
- Settings 是轻遮罩居中浮窗，内部为 header + 左导航 + 右 ScrollArea，不是全屏表单。

### 1.4 Agent 输入选择器不变量

- `/` 触发 Agent runtime picker：分组展示命令、已导入 Skills、MCP server、Hooks/运行上下文提示；支持键盘上下/Enter/Esc、搜索过滤、空态和错误态。
- `@` 触发文件 mention picker：只负责文件/目录引用，不混入 Skills/MCP。
- 选择 Skill 后，输入区插入可见 chip 或等价 token，并在发送 payload 中携带 skill id/name；禁用 skill 不出现在选择器。
- 选择 MCP server 后，输入区插入可见 chip 或等价 token，并在启动/发送 Agent payload 中携带 server id；禁用或配置错误的 server 显示不可选原因。
- Hooks 不作为用户手动调用的工具执行；picker 中只展示会影响当前 Agent runtime 的 hook/context 状态，支持查看来源和启停状态。
- Chat 输入区 `/` 只能打开 Chat Tools 或 Chat 命令，不允许把 MCP/Agent Skills 暗示为 Chat 能力。

### 1.5 Agent 无回应状态机

Agent 发送后必须进入可观察状态机：

1. `starting`：已调用 `startAgent` 或复用已启动 engine，输入区禁用或显示等待状态。
2. `waiting_first_event`：消息已发送，等待首个 assistant/tool/interrupt/error 事件。
3. `streaming`：收到内容或工具事件。
4. `idle_done`：收到 done 且有有效输出。
5. `empty_done`：收到 done 但没有有效输出，显示“本次没有返回内容”和重试入口。
6. `timeout`：启动或首包超过阈值，显示超时、重试、停止。
7. `disconnected`：Channel/子进程异常结束，显示错误和重试。

阈值在 feature design 中可按实现调整，但必须可配置为测试用短阈值；不能无限显示“正在思考”。

## 2. #50 proma-parity-shell-sidebar

**Proma 源**：

- `components/app-shell/AppShell.tsx`
- `components/app-shell/LeftSidebar.tsx`
- `components/app-shell/ModeSwitcher.tsx`
- `components/app-shell/NavigatorPanel.tsx`
- `components/app-shell/RightSidePanel.tsx`

**j-gui 承接点**：

- `src/components/app-shell/AppShell.tsx`
- `src/components/app-shell/LeftSidebar.tsx`
- `src/components/app-shell/RightSidePanel.tsx`
- `src/atoms/sidebar.ts`
- `src/atoms/tabs.ts`

### 必须实现

- 左侧栏展开/折叠两态完整：图标模式、新建、搜索、设置、模式切换、当前会话高亮均可达。
- Chat 模式和 Agent 模式的侧栏内容必须不同：Agent 模式有 Working / pinned 或等价区，不能直接复用 Chat 会话列表。
- 会话分组必须至少覆盖置顶、今天/昨天/更早、归档/返回活动列表；没有归档后端时必须显示禁用/空态说明，不能藏入口。
- Agent 未查看完成状态必须有可见标记，切换到该 Agent 会话后清除。
- 右侧面板只在 Agent 有会话上下文时显示；打开/关闭状态必须跟随 tab/session，不是全局单布尔造成串面板。
- titlebar drag/no-drag 区域必须可验收：拖动窗口不遮挡 tab、按钮、输入区、侧栏操作。

### 验收步骤

1. 新建 Chat tab 与 Agent tab，反复切换，侧栏高亮、mode switch、session list 不串。
2. 折叠侧栏后，新建/搜索/设置/模式切换仍可用且有 tooltip 或等价反馈。
3. Agent 输出完成但未打开时，侧栏出现未查看完成标记；打开后标记消失。
4. 在 Agent tab 打开右侧面板，切到 Chat tab 面板隐藏；切回 Agent tab 面板恢复。
5. 在窗口顶部、tab 空白区拖动窗口；点击按钮、输入框、tab close 不触发拖动。

## 3. #51 proma-parity-tabs-workspace

**Proma 源**：

- `components/tabs/MainArea.tsx`
- `components/tabs/TabBar.tsx`
- `components/tabs/TabBarItem.tsx`
- `components/tabs/TabPreviewPanel.tsx`
- `components/tabs/TabCloseConfirmDialog.tsx`
- `components/tabs/TabSwitcher.tsx`
- `components/tabs/TabErrorBoundary.tsx`

**j-gui 承接点**：

- `src/components/app-shell/MainArea.tsx`
- `src/atoms/tabs.ts`
- `src/components/ui/ErrorBoundary.tsx`

### 必须实现

- Tab 结构携带 `type`、`sessionId`、`title`、运行状态和预览摘要；不能只靠全局 mode 渲染。
- Chat/Agent tab 都能打开、关闭、切换；切换时同步当前 mode 和会话空间。
- Hover 预览在非活动 tab 上延迟出现，内容至少包含标题、最近消息/工具摘要、会话类型。
- 关闭流式 Chat 或运行中的 Agent tab 必须弹确认；确认后停止对应流或 Agent，再关闭。
- Tab 支持横向溢出滚动和拖拽重排；重排不能改变 active tab 或 session 绑定。
- 单 tab 崩溃只显示该 tab 错误态，不能拖垮整个 shell。
- 无 tab 时显示 Welcome/空态，并提供新建 Chat/Agent 入口。

### 验收步骤

1. 同时打开两个 Chat 和两个 Agent tab，逐个发送消息，切换后消息不串。
2. Hover 非活动 tab 300ms 左右显示预览，移出后消失。
3. 拖拽 tab 重排后 active tab、session title、消息仍绑定原 tab。
4. 运行中关闭 Agent tab，弹确认；取消不关闭，确认后停止 Agent 并关闭。
5. 触发一个 tab 的 ErrorBoundary，其他 tab 仍可切换和发送。

## 4. #52 proma-parity-chat-experience

**Proma 源**：

- `components/chat/ChatView.tsx`
- `components/chat/ChatHeader.tsx`
- `components/chat/ChatInput.tsx`
- `components/chat/ChatMessages.tsx`
- `components/chat/ChatMessageItem.tsx`
- `components/chat/AgentRecommendBanner.tsx`
- `components/chat/MigrateToAgentButton.tsx`
- `components/ai-elements/rich-text-input.tsx`
- `components/ai-elements/reasoning.tsx`
- `components/ai-elements/context-divider.tsx`
- `components/ai-elements/scroll-minimap.tsx`

**j-gui 承接点**：

- `src/components/chat/ChatView.tsx`
- `src/components/chat/ChatInput.tsx`
- `src/components/chat/ChatMessages.tsx`
- `src/components/chat/MessageBubble.tsx`
- `src/components/chat/ReasoningBlock.tsx`
- `src/atoms/sessions.ts`

### 必须实现

- ChatHeader 显示标题、模型/Provider、系统提示词入口、上下文状态、清上下文入口。
- 输入区支持多行、发送/停止、草稿按 session 持久、工具栏左右分区、禁用态、空输入态。
- 如果不引入 TipTap，textarea 也必须提供 Proma 等价的快捷键、toolbar、draft、focus、placeholder 和状态反馈；否则只能判 Partial。
- Thinking/reasoning 必须作为可折叠块渲染，流式和历史消息都能展示。
- 消息操作至少包括复制、删除确认、重新发送/回退、编辑或等价重发。
- ContextDivider 在清上下文后可见并跟随历史消息保存。
- ScrollMinimap 或等价长对话定位机制必须可见，不可只靠浏览器滚动条。
- Agent 推荐/迁移入口必须有明确触发条件和入口；不要求复制 Proma 的 migrate 后端，但要能从 Chat 创建 Agent 任务或说明不可迁移的原因。

### 验收步骤

1. 输入草稿后切换 tab/session 再回来，草稿恢复。
2. 流式回复时停止按钮可用，停止后不会继续写入消息。
3. 清上下文后消息流中出现 divider，重启或切换会话后仍可见。
4. 长对话滚动时可通过 minimap/等价控件定位上下文段。
5. 触发 Agent 推荐入口后，可从当前 Chat 创建或打开 Agent 会话，且原 Chat 内容不被破坏。

## 5. #53 proma-parity-chat-tools

**Proma 源**：

- `components/chat/ChatToolActivityIndicator.tsx`
- `components/chat/ChatToolBlock.tsx`
- `components/settings/ToolSettings.tsx`
- `atoms/chat-tool-atoms.ts`

**j-gui 承接点**：

- `src/components/chat/ChatMessages.tsx`
- `src/components/chat/MessageBubble.tsx`
- `src/components/settings/SettingsDialog.tsx`
- `src/lib/tauri.ts`
- `src-tauri/src/commands/chat.rs`

### 必须实现

- Settings 中出现 Chat Tools / ToolSettings 入口，即使首版工具为空也要有空态和错误态。
- 工具列表包含名称、说明、启停状态、配置入口、保存反馈。
- Chat 消息区能渲染工具活动：start/running/result/error 四态，不退化成纯 JSON。
- 工具配置失败、凭证缺失、工具禁用时，发送入口和消息区都要有清晰反馈。

### 验收步骤

1. 打开 Settings → Chat Tools，空工具时有说明；有工具时能启停。
2. 禁用工具后 Chat 输入区或工具选择入口不再显示该工具。
3. 模拟工具执行中/成功/失败事件，消息区显示分型块。
4. 配置保存失败时显示错误，不静默失败。

## 6. #54 proma-parity-agent-interrupts

**Proma 源**：

- `components/agent/PermissionBanner.tsx`
- `components/agent/AskUserBanner.tsx`
- `components/agent/ExitPlanModeBanner.tsx`
- `components/agent/AgentView.tsx`

**j-gui 承接点**：

- `src/components/agent/AgentView.tsx`
- `src/components/agent/PermissionBanner.tsx`
- `src/lib/tauri.ts`
- `src-tauri/src/agent_engine.rs`
- `src-tauri/src/commands/agent.rs`

### 必须实现

- `AgentEvent::Interrupt` 必须分型：`permission`、`ask_user`、`plan`。
- Permission UI 显示工具名、风险提示、输入预览、允许、拒绝、总是允许或等价持久允许。
- AskUser UI 支持问题、选项、自定义输入、提交和取消。
- ExitPlanMode UI 支持批准执行、手动权限批准、拒绝、反馈。
- 每类 UI 都必须通过 `respond_agent_interrupt` 回传对应结构，不能压成单个 bool。
- 中断期间输入区和 stop 状态要明确；响应失败需要可见错误。

### 验收步骤

1. 模拟 permission interrupt，点击允许/拒绝/总是允许，后端收到正确 response kind。
2. 模拟 ask_user interrupt，选择选项并输入自定义文本，提交后继续 Agent。
3. 模拟 plan interrupt，反馈文本回传后保留计划上下文。
4. 响应失败时 banner 保持可操作并显示错误。

## 7. #55 proma-parity-agent-tool-renderers

**Proma 源**：

- `components/agent/SDKMessageRenderer.tsx`
- `components/agent/ContentBlock.tsx`
- `components/agent/tool-result-renderers/`
- `components/agent/tool-utils.ts`

**j-gui 承接点**：

- `src/components/agent/ToolCallDisplay.tsx`
- `src/components/agent/AgentMessages.tsx`
- `src-tauri/src/agent_engine.rs`

### 必须实现

- 工具调用按类型渲染：read、write、edit、bash、grep/search、glob、web-fetch、web-search、default。
- 每类至少有 header、状态图标、输入摘要、结果摘要、展开详情、错误态。
- 文件路径使用可读 chip；搜索结果按文件/行分组；bash 显示命令、退出状态、stdout/stderr。
- 大结果默认折叠并显示数量/摘要，不把整段 JSON 直接摊开。
- 历史消息恢复后仍能按类型渲染，不只对流式新消息生效。

### 验收步骤

1. 用 fixture 或真实 Agent 触发 read/write/edit/bash/search 五类工具。
2. 每类工具 result 展示摘要和可展开详情。
3. 错误 result 显示红色/警告态和错误信息。
4. 切换会话再回来，工具渲染不退化。

## 8. #56 proma-parity-agent-task-context

**Proma 源**：

- `components/agent/TaskProgressCard.tsx`
- `components/agent/ActiveTasksBar.tsx`
- `components/agent/BackgroundTasksPanel.tsx`
- `components/agent/ContextUsageBadge.tsx`
- `components/agent/PermissionModeSelector.tsx`
- `components/agent/MentionList.tsx`
- `components/agent/mention-suggestions.tsx`
- `components/agent/mention-popup-utils.ts`

**j-gui 承接点**：

- `src/components/agent/TaskProgressCard.tsx`
- `src/components/agent/AgentMessages.tsx`
- `src/components/agent/AgentView.tsx`
- `src/components/chat/ChatInput.tsx`
- `src/components/settings/SkillsTab.tsx`
- `src/components/settings/McpTab.tsx`
- `src/components/settings/HooksTab.tsx`
- `src-tauri/src/agent_engine.rs`
- `src-tauri/src/commands/governance.rs`

### 必须实现

- TaskProgressCard 聚合 Task/Todo 类工具，显示总数、完成数、当前项、失败项、折叠详情。
- BackgroundTasksPanel 或等价后台任务面板显示跨 tab/session 的运行中 Agent。
- ActiveTasksBar 可以合并到后台任务面板，但必须有顶部或侧栏入口显示当前运行任务数量。
- ContextUsageBadge 必须来自真实 token/context 来源；没有真实来源时显示“未知/不可用”，不能伪造百分比。
- PermissionModeSelector 与 Agent 启动参数绑定，切换后持久到 session 或明确只影响本次运行。
- Agent 输入区 `/` 必须打开 runtime picker，分组展示 command、Skills、MCP server、Hooks/context 状态。
- Picker 数据来自 Settings 治理命令和当前 Agent runtime 状态：禁用项不应作为可选项；配置错误项可展示但不可选并说明原因。
- 选择 skill/MCP 后必须在输入区有 chip/token，并随发送或启动请求传给 Agent runtime；取消选择后 payload 不再携带。
- Picker 必须支持键盘：`/` 打开，输入过滤，上下移动，Enter 选择，Esc 关闭；IME 输入不应误触发选择。
- MCP 选择不得影响 Chat 模式；Chat 中只出现 Chat Tools 入口。

### 验收步骤

1. 触发多个 todo/task 工具调用，TaskProgressCard 聚合而不是重复散落工具块。
2. 开两个 Agent tab，其中一个后台运行，用户能在侧栏或面板看到运行状态。
3. ContextUsageBadge 在有统计时显示百分比/状态，在无统计时显示不可用说明。
4. 切换 permission mode 后发送任务，后端启动参数反映该 mode。
5. 在 Agent 输入区输入 `/`，出现 runtime picker；Skills/MCP/Hooks 分组、空态、错误态可见。
6. 选择一个启用 skill 和一个 MCP server 后发送消息，payload 中可追踪到对应 id；禁用项不会被发送。
7. 在 Chat 输入区输入 `/`，不会出现 Agent MCP/Skills 选择。

## 9. #57 proma-parity-agent-file-context

**Proma 源**：

- `components/agent/SidePanel.tsx`
- `components/file-browser/FileBrowser.tsx`
- `components/file-browser/FileDropZone.tsx`
- `components/file-browser/file-mention-suggestion.tsx`
- `components/file-browser/FileMentionList.tsx`
- `components/file-browser/FileTypeIcon.tsx`
- `components/agent/mention-suggestions.tsx`

**j-gui 承接点**：

- `src/components/app-shell/RightSidePanel.tsx`
- `src/components/agent/AgentView.tsx`
- `src/components/chat/ChatInput.tsx`
- `src/atoms/sidebar.ts`
- `src/lib/tauri.ts`

### 必须实现

- 单工作区文件树支持递归目录、懒加载、文件类型图标、错误态、刷新。
- 用户可以通过 UI 添加目录上下文；多 workspace 不做，但“添加文件夹/工作区”必须有等价入口。
- 输入区支持 `@` 文件 mention suggestion，选择后变成 chip 或等价 token；文件 mention 与 `/` runtime picker 是两个入口，不能混成一个不可预测弹层。
- 右侧 SidePanel 与 AgentHeader 按 session 绑定，文件变化提示能唤醒或标记面板。
- 文件添加到聊天/Agent 输入时，发送 payload 必须保留路径或可读内容引用；失败要显示错误。
- DropZone 作为首版排除项不要求，但不能影响目录添加按钮。

### 验收步骤

1. 在右侧面板展开多级目录，刷新后仍正确显示。
2. 通过按钮添加一个本地目录，文件树出现该目录。
3. 在 Agent 输入框输入 `@`，出现文件 suggestion；选择后发送，消息中保留文件引用。
4. 切换 Agent tab，右侧面板打开状态和目录上下文不串。
5. 同一输入区内 `/` 打开 runtime picker，`@` 打开文件 picker，两者互不抢焦点。

## 10. #58 proma-parity-search-navigation

**Proma 源**：

- `components/app-shell/SearchDialog.tsx`
- `atoms/search-atoms.ts`
- `hooks/useOpenSession.ts`

**j-gui 承接点**：

- `src/components/app-shell/SearchDialog.tsx`
- `src/components/app-shell/LeftSidebar.tsx`
- `src/atoms/sessions.ts`
- `src/atoms/tabs.ts`

### 必须实现

- 侧栏入口和全局快捷键打开同一个 SearchDialog。
- 搜索范围覆盖 Chat 标题和 Agent 标题；内容全文搜索首版排除。
- 输入中文 IME composition 时不误触发上下移动/Enter 跳转。
- 结果高亮标题命中；显示 mode 图标、更新时间、归档标识。
- Enter 打开结果时必须创建或激活对应 Chat/Agent tab，并回填消息。
- 搜索结果打开后侧栏高亮、mode、right panel 状态同步。

### 验收步骤

1. `Ctrl+F` 和侧栏搜索按钮都打开同一搜索面板。
2. 中文输入法组合输入时，不发生逐字跳转。
3. 搜索 Chat 和 Agent 标题，各自打开正确 tab。
4. 打开归档结果时有归档标识和恢复/只读策略说明。

## 11. #59 proma-parity-settings-console

**Proma 源**：

- `components/settings/SettingsDialog.tsx`
- `components/settings/SettingsPanel.tsx`
- `components/settings/primitives/`
- `components/settings/ChannelSettings.tsx`
- `components/settings/PromptSettings.tsx`
- `components/settings/AgentSettings.tsx`
- `components/settings/ToolSettings.tsx`
- `components/settings/McpServerForm.tsx`

**j-gui 承接点**：

- `src/components/settings/SettingsDialog.tsx`
- `src/components/settings/primitives/`
- `src/components/settings/SkillsTab.tsx`
- `src/components/settings/HooksTab.tsx`
- `src/components/settings/McpTab.tsx`
- `src-tauri/src/commands/config.rs`
- `src-tauri/src/commands/governance.rs`

### 必须实现

- Dialog 外观为轻遮罩居中浮窗，固定最大尺寸，内部 header + 左导航 + 右内容 ScrollArea。
- 左导航包含通用、模型配置、提示词、Agent 配置、Chat 工具、外观、关于；排除项不显示或显示“首版不支持”说明，不能混成可配置功能。
- Agent 配置里 Skills/Hooks/MCP 有列表、启停、来源、空态、错误态、保存反馈。
- Provider/channel 表单有未保存保护，切 tab/关闭时确认。
- Settings primitives 统一使用，避免每个 tab 自己写样式。
- ToolSettings 不做 marketplace，但必须有本地工具列表、启停和配置入口。

### 验收步骤

1. 打开设置，视觉层级和 Proma SettingsPanel 对齐：左导航、右滚动、关闭按钮。
2. 修改 Provider 未保存时切 tab，出现确认；取消后留在当前 tab。
3. Skills/Hooks/MCP tab 在有数据、空数据、错误时都有明确 UI。
4. Chat Tools tab 能展示工具启停和配置入口。

## 12. #60 proma-parity-core-shortcuts

**Proma 源**：

- `lib/shortcut-defaults.ts`
- `components/shortcuts/GlobalShortcuts.tsx`
- `components/settings/ShortcutSettings.tsx`

**j-gui 承接点**：

- `src/components/app-shell/AppShell.tsx`
- `src/components/app-shell/MainArea.tsx`
- `src/components/chat/ChatInput.tsx`
- `src/components/agent/AgentView.tsx`

### 必须实现

内建快捷键必须覆盖：

| ID | Windows | 行为 |
|---|---|---|
| open-settings | Ctrl+, | 打开设置 |
| new-session | Ctrl+N | 当前 mode 新建 Chat/Agent 会话和 tab |
| toggle-sidebar | Ctrl+B | 展开/折叠左侧栏 |
| toggle-mode | Ctrl+Shift+M | Chat/Agent 模式切换，并创建/激活对应 tab |
| global-search | Ctrl+F | 打开 SearchDialog |
| focus-input | Ctrl+L | 聚焦当前 tab 输入框 |
| clear-context | Ctrl+K | 清当前 Chat/Agent 上下文；无上下文时提示 |
| stop-generation | Ctrl+Shift+Backspace | 停止当前 Chat 流或 Agent |
| close-tab | Ctrl+W | 关闭当前 tab，运行中走确认 |

### 验收步骤

1. 每个快捷键在当前窗口内触发正确行为，输入框中不会误吞除编辑快捷键外的组合。
2. 运行中 `Ctrl+W` 不直接关 tab，必须走确认。
3. `Ctrl+N` 在 Chat/Agent mode 下创建对应类型，不强制回 Chat。
4. 排除的 global 快捷键不显示为可用能力。

## 13. #61 proma-parity-agent-session-workbench

**Proma 源**：

- `components/agent/AgentHeader.tsx`
- `components/agent/AgentView.tsx`
- `components/agent/AgentMessages.tsx`
- `components/app-shell/LeftSidebar.tsx`
- `components/app-shell/SearchDialog.tsx`

**j-gui 承接点**：

- `src/components/agent/AgentView.tsx`
- `src/components/agent/AgentMessages.tsx`
- `src/components/app-shell/LeftSidebar.tsx`
- `src/components/app-shell/SearchDialog.tsx`
- `src-tauri/src/agent_session.rs`
- `src-tauri/src/commands/agent.rs`
- `src/lib/tauri.ts`

### 必须实现

- AgentHeader 支持标题展示和编辑，保存后侧栏、tab、搜索结果同步。
- AgentHeader 有右侧文件面板按钮和文件变化提示。
- Agent 会话 create/list/get/delete/search 与 Chat 会话命令隔离。
- 切换 Agent 会话回填 Agent timeline，包括 user、assistant、tool、interrupt、error。
- Chat 会话绝不能出现在 Agent 列表；Agent 会话也不能出现在 Chat 列表。
- 生成标题必须来自会话主题或首条用户消息摘要，不能是随机 id 片段。
- Agent 发送后必须按 1.5 状态机显示 starting、waiting、streaming、done、empty_done、timeout、disconnected；不能无期限无反馈。
- start/send 失败、首包超时、done 空内容、Channel 断开都必须有可见错误或空态，并提供重试/停止入口。

### 验收步骤

1. 创建 Chat 会话和 Agent 会话，两个列表互不串。
2. Agent 模式发送消息后切到另一个 Agent，再切回，timeline 完整恢复。
3. 编辑 Agent 标题，tab、侧栏、搜索结果同步更新。
4. 搜索 Agent 标题打开结果，回填对应 Agent timeline。
5. 新建会话标题根据主题生成，不出现纯随机串。
6. 模拟 Agent start 超时，UI 在阈值后显示超时、停止和重试。
7. 模拟 send 后 done 但无内容，UI 显示空返回状态，不停留在 streaming。
8. 模拟 Channel 断开，UI 显示 disconnected 错误并允许重试。

## 14. #62 proma-parity-evidence-pass

**输入**：#50-#61 全部完成。

**必须产出**：

- `.codestable/acceptance/proma-parity/{YYYY-MM-DD}/index.md`
- 每个 parity item 至少一份 `{slug}-{pass|partial|fail}.md`
- Proma baseline 截图/录屏或源码观察记录。
- j-gui 对照截图/录屏或手动验收记录。
- 未完成项必须回写 `proma-mapping.md` 和 `proma-parity-acceptance.md`，不能只在验收报告里提。

**最终通过条件**：

- #50-#61 没有 `Fail`。
- `Partial` 只能用于明确排除或等价替代，且有文档理由。
- 用户反馈的 7 个问题全部有 Pass 证据：会话切换、Agent 回复/no-response 处理、标题生成、UI 完整度、slash skills/MCP runtime 选择、Settings 治理、位置/视觉与 Proma 一致性。
