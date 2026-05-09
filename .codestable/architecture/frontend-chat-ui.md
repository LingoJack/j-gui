---
doc_type: architecture
slug: frontend-chat-ui
scope: j-gui 前端 Chat 界面——含 PromptEditorSidebar 的系统提示词编辑 + ChatInput 附件工具栏 + 并排模式 + 全局流式事件监听
summary: ChatView 接收 conversationId prop，通过 ConversationProvider 提供 per-conversation 上下文，使用本地 useState 管理消息、通过全局 streamingStatesAtom Map 处理流式状态、通过 ipc.ts 的 EventBus 消费流式事件，ChatInput 使用 TipTap 富文本编辑器并支持附件
status: current
last_reviewed: 2026-05-10
tags: [frontend, chat, streaming, jotai, tiptap, attachments, parallel]
depends_on: [frontend-ai-elements, frontend-ipc-layer]
implements: [j-gui-ai-interaction]
---

# Chat UI — 前端聊天界面

## 1. 定位与受众

ChatView 是 j-gui 主区域的 Chat 工作台，承载消息发送、流式接收、消息操作（复制/删除/重发/原地编辑）、上下文管理、模型与提示词选择、附件上传、并排模式切换与系统提示词编辑侧栏。它不再裸调 Tauri invoke，而是通过 `src/lib/ipc.ts` 的 EventBus 模式和 Jotai Map atoms 协调流式状态、错误与刷新信令。

**受众**：feature-design（了解 Chat 组件边界）、新人上手（理解流式更新机制与 per-conversation 状态管理）。

## 2. 结构与交互

```
App
└── ChatView(conversationId)
    └── ConversationProvider(conversationId)
        └── ChatViewInner
            ├── ChatHeader
            │   ├── 标题（可点击内联编辑）     → ipc.updateConversationTitle()
            │   ├── 置顶按钮                  → ipc.togglePinConversation()
            │   ├── SystemPromptSelector      → DropdownMenu + promptConfigAtom
            │   └── 并排模式切换               → useConversationParallelMode()
            ├── ChatMessages
            │   ├── Conversation (StickToBottom)
            │   │   ├── ScrollTopLoader       → 滚动到顶自动加载更多历史消息
            │   │   ├── ConversationContent
            │   │   │   ├── ChatMessageItem × N
            │   │   │   │   ├── Message (ai-elements 原语)
            │   │   │   │   ├── Reasoning (ReasoningTrigger + ReasoningContent)
            │   │   │   │   ├── MessageActions: CopyButton / MigrateToAgentButton / 重发 / 编辑 / 删除
            │   │   │   │   └── DeleteMessageDialog (确认弹窗)
            │   │   │   ├── ContextDivider (在 contextDividers 集合中的消息后显示)
            │   │   │   └── 流式临时消息 (smoothContent/smoothReasoning → Reasoning + MessageResponse)
            │   │   └── ScrollMinimap（带搜索的导航面板）
            │   └── ParallelChatMessages（并排模式替代布局）
            │       ├── 左列：用户消息
            │       └── 右列：助手回复
            ├── 错误提示 AlertBar (chatStreamErrorsAtom)
            ├── AgentRecommendBanner（suggest_agent_mode 工具结果）
            └── ChatInput
                ├── AttachmentPreview（pending 附件缩略图列表）
                ├── RichTextInput（TipTap 富文本编辑器）   → conversationDraftsAtom
                ├── Footer 工具栏
                │   ├── 左侧：附件按钮 / ModelSelector / ThinkingToggle / SpeechButton /
                │   │       ToolSelectorPopover / ContextSettingsPopover / ClearContextButton
                │   └── 右侧：SendButton 或 StopButton
                └── 拖放 / 粘贴文件支持
        └── PromptEditorSidebar（右侧弹出，CRUD 系统提示词）

全局：
  useGlobalChatListeners（顶层挂载）
    ├── onStreamChunk    → streamingStatesAtom[convId].content += delta
    ├── onStreamReasoning → streamingStatesAtom[convId].reasoning += delta
    ├── onStreamComplete  → streaming=false, 递增 chatMessageRefreshAtom, 异步生成标题
    ├── onStreamError     → streaming=false, 写入 chatStreamErrorsAtom
    └── onStreamToolActivity → streamingStatesAtom[convId].toolActivities push, detect suggest_agent_mode
```

### 数据流（发送消息）

```
ChatInput.handleSend()
  │
  ├─ (内容提纯 + 附件已通过 handleSend 前的 saveAttachment IPC 保存到磁盘)
  │
  └─ ChatView.handleSend(content, { attachments?, ... })
       │
       ├─ 清除 chatStreamErrorsAtom[conversationId]
       ├─ 首条消息 → registerPendingTitle()（流式完成后异步生成标题）
       ├─ 保存等待附件到磁盘（saveAttachment IPC）
       │
       ├─ 设置 streamingStatesAtom[conversationId] = { streaming: true, content: '', reasoning: '', model, toolActivities: [], startedAt: now }
       ├─ 乐观更新：messages += { id: temp-*, role: 'user', content, attachments }
       │
       └─ ipc.sendMessage(input)
            ├─ new Channel<ChatEvent>() inside ipc.ts
            ├─ invoke('send_message', { sessionId, content, channel })
            ├─ channel.onmessage → emit('stream:chunk') / emit('stream:complete') / emit('stream:error')
            └─ no direct ChatView Channel management
```

### 数据流（流式接收——全局监听）

```
  Rust 后端 → Tauri Channel.onmessage
       │
       └─ ipc.ts EventBus emit('stream:*')
            │
            └─ useGlobalChatListeners (顶层 useEffect, store.set)
                 │
                 ├─ chunk:     streamingStatesAtom[convId].content += event.delta
                 ├─ reasoning: streamingStatesAtom[convId].reasoning += event.delta
                 ├─ complete:  streaming=false, chatMessageRefreshAtom[convId]++
                 │             → ChatView useEffect 检测 refreshVersion 变化 → 重新加载消息
                 │             → pendingTitles 消费 → generateTitle IPC → 更新标题
                 ├─ error:     streaming=false, chatStreamErrorsAtom[convId]=event.error
                 │             → ChatView 显示 error AlertBar
                 └─ tool-activity:
                        streamingStatesAtom[convId].toolActivities push
                        → ChatMessages 中 ChatToolActivityIndicator 渲染工具活动
                        → 检测 suggest_agent_mode 结果 → AgentRecommendBanner
```

### 组件文件一览

| 文件 | 职责 | 行数 |
|------|------|------|
| `src/components/chat/ChatView.tsx` | 主视图——编排 send/stop/truncate/delete/resend/inlineEdit/clearContext，接收 conversationId prop，本地 useState 管理消息 | 639 |
| `src/components/chat/ChatInput.tsx` | 输入区——TipTap 富文本编辑器、附件管理（拖放/粘贴/文件对话框）、Footer 工具栏（模型/思考/工具/上下文/清除/语音/发送/停止） | 364 |
| `src/components/chat/ChatMessages.tsx` | 消息列表——Conversation(StickToBottom) + ScrollTopLoader + ContextDividers + 流式临时消息 + ScrollMinimap + ParallelChatMessages 分支 | 431 |
| `src/components/chat/ChatMessageItem.tsx` | 单条消息——ai-elements Message 原语、Reasoning 折叠、Markdown、操作按钮（复制/迁移到Agent/重发/编辑/删除）、删除确认弹窗 | 286 |
| `src/components/chat/ChatHeader.tsx` | 对话头部——标题内联编辑、置顶、并排模式、SystemPromptSelector | 152 |
| `src/components/chat/ParallelChatMessages.tsx` | 并排模式——两列 StickToBottom 独立滚动、按 ContextDivider 分段 | 416 |
| `src/components/chat/ChatToolActivityIndicator.tsx` | 工具活动合并渲染——将 start/result 事件合并后以 ChatToolBlock 列表展示 | 69 |
| `src/components/chat/ChatToolBlock.tsx` | 工具调用块——语义化短语行 + 图标 + 点击展开 ToolResultRenderer | 91 |
| `src/components/chat/InlineEditForm.tsx` | 消息原地编辑——textarea + 附件保留/新增/删除 + 拖放支持 | 264 |
| `src/components/chat/DeleteMessageDialog.tsx` | 删除确认弹窗——AlertDialog 带黄色警告 | 63 |
| `src/components/chat/MigrateToAgentButton.tsx` | 迁移到 Agent 模式按钮——常驻 assistant 消息操作栏 | 114 |
| `src/components/chat/CopyButton.tsx` | 复制按钮——CopyIcon/CheckIcon 状态切换 | 42 |
| `src/components/chat/AgentRecommendBanner.tsx` | Agent 推荐横幅——suggest_agent_mode 工具结果展示 + 迁移流程 | 162 |
| `src/components/chat/SystemPromptSelector.tsx` | 系统提示词下拉选择器——DropdownMenu + 选择/标记默认/跳转到编辑侧栏 | 96 |
| `src/components/chat/PromptEditorSidebar.tsx` | 提示词编辑侧栏——列表/编辑/新建/删除/设为默认/追加设置 | 303 |
| `src/components/chat/ToolSelectorPopover.tsx` | 工具选择弹出层——开关列表 + 跳转设置 | 155 |
| `src/components/chat/ContextSettingsPopover.tsx` | 上下文长度设置弹出层——Slider (0/5/10/15/20/∞) | 110 |
| `src/components/chat/ClearContextButton.tsx` | 清除上下文按钮——Eraser 图标 + 快捷键提示 | 55 |
| `src/components/chat/ModelSelector.tsx` | 模型选择 Dialog——搜索/分组/键盘导航/持久化 per-conversation | 347 |
| `src/components/chat/UserAvatar.tsx` | 用户头像组件 | - |
| `src/components/chat/AttachmentPreviewItem.tsx` | 附件缩略图项 | - |
| `src/components/ai-elements/message.tsx` | 消息原语——Message/MessageHeader/MessageContent/MessageActions/MessageResponse/UserMessageContent/MessageLoading/MessageStopped/StreamingIndicator/MessageAttachments | >400 |
| `src/components/ai-elements/conversation.tsx` | 对话容器原语——Conversation(StickToBottom)/ConversationContent/ConversationScrollButton | 100+ |
| `src/components/ai-elements/reasoning.tsx` | 推理折叠——Collapsible + 自动折叠 + 思考计时 + Markdown + KaTeX | 247 |
| `src/components/ai-elements/context-divider.tsx` | 上下文分隔线——虚线 + "清除上下文" + 删除按钮 | 58 |
| `src/components/ai-elements/scroll-minimap.tsx` | 消息迷你地图——横杠指示 + 搜索面板 + 可拖拽滚动条 | 455 |
| `src/hooks/useGlobalChatListeners.ts` | 全局流式事件监听——将 stream:* 事件写入 Jotai atoms + 异步标题生成 | 211 |
| `src/hooks/useConversationSettings.ts` | per-conversation 设置 hooks——模型/上下文长度/思考/并排/提示词 | 125 |
| `src/lib/ipc.ts` | IPC 封装——invoke + EventBus（emit/onEvt）+ Channel 在内部创建 | 716 |
| `src/atoms/chat-atoms.ts` | Chat 状态 atoms——conversationsAtom/streamingStatesAtom/chatDraftsAtom/chatMessageRefreshAtom/chatStreamErrorsAtom/ pendingAgentRecommendationAtom/channelsAtom/conversation*Atoms | 268 |
| `src/atoms/system-prompt-atoms.ts` | 系统提示词 atoms——promptConfigAtom/selectedPromptIdAtom/conversationPromptIdAtom/resolveSystemMessage | 108 |
| `src/atoms/chat-tool-atoms.ts` | 工具 atoms——chatToolsAtom/activeToolIdsAtom/hasActiveToolsAtom | 30 |
| `src/atoms/draft-session-atoms.ts` | 草稿会话 atoms——draftSessionIdsAtom（Chat + Agent 共用） | 12 |
| `src/contexts/session-context.tsx` | ConversationProvider——通过 React Context 提供 conversationId | - |

## 3. 数据与状态

### 核心状态模型

消息数据存储在 Rust 后端（j-cli 磁盘持久化），前端通过 IPC 按需加载。前端不持有完整消息列表的全局副本，仅有当前对话的本地副本。

#### 消息结构（ChatMessage from @proma/shared）

```typescript
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;          // Unix timestamp ms
  attachments?: FileAttachment[];
  model?: string;             // assistant 消息的模型 ID
  reasoning?: string;         // 思考过程文本
  toolActivities?: ChatToolActivity[];
  error?: string;             // 错误消息（assistant 消息生成失败时）
  stopped?: boolean;          // 用户手动停止生成
}
```

#### 流式状态（ConversationStreamState in chat-atoms.ts:40-49）

```typescript
interface ConversationStreamState {
  streaming: boolean;
  content: string;            // 累积消息内容
  reasoning: string;          // 累积推理内容
  model?: string;             // 发送时快照的模型
  toolActivities: ChatToolActivity[];  // 累积工具活动列表
  startedAt?: number;         // 流式开始时间戳
}
```

全局 `streamingStatesAtom` 是 `Map<string, ConversationStreamState>`，以 conversationId 为 key。

### 状态原子

| Atom | 文件:行 | 类型 | 用途 |
|------|---------|------|------|
| `conversationsAtom` | `chat-atoms.ts:31` | `ConversationMeta[]` | 会话列表（侧边栏 + 标题渲染） |
| `currentConversationIdAtom` | `chat-atoms.ts:34` | `string \| null` | 当前激活的对话 ID |
| `currentMessagesAtom` | `chat-atoms.ts:37` | `ChatMessage[]` | 当前对话的消息列表（向后兼容） |
| `streamingStatesAtom` | `chat-atoms.ts:56` | `Map<string, ConversationStreamState>` | **全局流式状态**——所有对话的流式进度 |
| `streamingConversationIdsAtom` | `chat-atoms.ts:62` | `Set<string>` | 派生——正在流式的对话 ID 集合（侧边栏呼吸点） |
| `chatStreamErrorsAtom` | `chat-atoms.ts:178` | `Map<string, string>` | 对话级流式错误 |
| `chatMessageRefreshAtom` | `chat-atoms.ts:233` | `Map<string, number>` | 版本号——流式完成后递增，触发 ChatView 重新加载消息 |
| `selectedModelAtom` | `chat-atoms.ts:127` | `SelectedModel \| null` | 全局默认模型（localStorage 持久化） |
| `contextLengthAtom` | `chat-atoms.ts:142` | `ContextLengthValue` | 全局默认上下文长度 |
| `thinkingEnabledAtom` | `chat-atoms.ts:150` | `boolean` | 全局默认思考模式 |
| `parallelModeAtom` | `chat-atoms.ts:148` | `boolean` | 并排模式全局开关 |
| `conversationDraftsAtom` | `chat-atoms.ts:191` | `Map<string, string>` | 对话输入框草稿 |
| `channelsAtom` | `chat-atoms.ts:13` | `Channel[]` | 渠道/模型列表 |
| `pendingAgentRecommendationAtom` | `chat-atoms.ts:248` | `AgentRecommendation \| null` | Agent 推荐数据 |
| `chatPendingMessageAtom` | `chat-atoms.ts:226` | `ChatPendingMessage \| null` | 快速任务待发送消息 |
| `conversationModelsAtom` | `chat-atoms.ts:254` | `Map<string, SelectedModel \| null>` | per-conversation 模型选择 |
| `conversationContextLengthAtom` | `chat-atoms.ts:257` | `Map<string, ContextLengthValue>` | per-conversation 上下文长度 |
| `conversationThinkingEnabledAtom` | `chat-atoms.ts:260` | `Map<string, boolean>` | per-conversation 思考模式 |
| `conversationParallelModeAtom` | `chat-atoms.ts:263` | `Map<string, boolean>` | per-conversation 并排模式 |
| `promptConfigAtom` | `system-prompt-atoms.ts:23` | `SystemPromptConfig` | 系统提示词配置 |
| `selectedPromptIdAtom` | `system-prompt-atoms.ts:30` | `string` | 选中的提示词 ID（localStorage） |
| `conversationPromptIdAtom` | `system-prompt-atoms.ts:81` | `Map<string, string>` | per-conversation 提示词 ID |
| `promptSidebarOpenAtom` | `system-prompt-atoms.ts:20` | `boolean` | 提示词编辑侧栏开关 |
| `chatToolsAtom` | `chat-tool-atoms.ts:13` | `ChatToolInfo[]` | 工具列表 |
| `activeToolIdsAtom` | `chat-tool-atoms.ts:20` | `string[]` | 派生——实际启用的工具 ID |
| `draftSessionIdsAtom` | `draft-session-atoms.ts:12` | `Set<string>` | 草稿会话 ID 集合 |
| `userProfileAtom` | `user-profile` | `UserProfile` | 用户名 + 头像 |

### 消息加载机制

1. **首次加载**：ChatView 挂载时调用 `ipc.getRecentMessages(conversationId, 10)`，取最近 10 条消息（`ChatView.tsx:146-166`）。超出 10 条的聊天可以通过 ScrollTopLoader 滚动到顶自动加载全部。
2. **流式完成刷新**：`useGlobalChatListeners` 在 stream:complete 时递增 `chatMessageRefreshAtom[conversationId]`。ChatView 的 `useEffect` 检测 `refreshVersion` 变化后重新调用 `getRecentMessages`，用持久化消息替换临时流式气泡（`ChatView.tsx:146-166`）。
3. **版本号驱动**：`chatMessageRefreshAtom` 是 `Map<string, number>`，每次流式完成/错误时递增。同时清除 streaming=false 的过渡状态（`ChatView.tsx:157-163`）。

### 上下文分隔线

- 存储在 Rust 后端，通过 `conversation.contextDividers` 数组管理（`ChatView.tsx:168-175`）。
- 切换开关：最后一条消息的 ContextDivider 按 toggle（`ChatView.tsx:521-540`）。
- 可删除任意分隔线（`ChatView.tsx:543-549`）。
- 删除消息时自动同步：`syncContextDividers` 过滤掉已删除消息的分隔线（`ChatView.tsx:193-205`）。
- 在 ChatMessages 中根据 `dividerSet` 在对应消息后渲染 `ContextDivider` 组件。

### 流式事件协议（ipc.ts EventBus）

ipc.ts 的 `sendMessage()` 内部创建 `Channel<any>`，将 Rust 事件转换为 EventBus 事件：

| Rust Channel 事件 | EventBus 事件 | 字段 |
|---|---|---|
| chunk | `stream:chunk` | `{ conversationId, delta, index }` |
| (无直接事件) | `stream:reasoning` | `{ conversationId, delta }` |
| done | `stream:complete` | `{ conversationId, totalTokens }` |
| error | `stream:error` | `{ conversationId, error }` |
| (tool_use/result 包裹) | `stream:tool-activity` | `{ conversationId, activity }` |

注意：推理内容（reasoning）和普通内容（content）通过不同的 EventBus 事件分开传输，前端分别累积。

### 发送参数（ChatSendInput）

```typescript
interface ChatSendInput {
  conversationId: string;
  userMessage: string;
  messageHistory: [];       // 后端从磁盘读取，前端不传
  channelId: string;
  modelId: string;
  contextLength: ContextLengthValue;
  contextDividers: string[];
  attachments?: FileAttachment[];
  thinkingEnabled?: true;   // 仅 true 时传
  systemMessage?: string;   // 解析后的系统提示词
  enabledToolIds?: string[]; // 启用工具 ID 列表
}
```

## 4. 关键决策

- **conversationId prop + ConversationProvider**：ChatView 不再依赖全局单例 atom，通过 React Context 提供 per-conversation ID。当前为单屏使用，Context 模式允许后续扩展为多实例场景。
- **本地 useState 管理消息**：消息列表不存储在 Jotai 全局状态中，而是每个 ChatView 实例的本地 state。流式状态和刷新信令则通过全局 Map atoms 协调。
- **全局流式事件监听器**：`useGlobalChatListeners` 在应用顶层挂载一次，不从属于任何 ChatView 实例。确保 tab 切换或页面导航时不丢失事件。使用 `useStore()` 直接操作 atoms（非 hooks 模式）。
- **事件总线而非直接 Channel**：ipc.ts 内部创建 `Channel<T>`，将 stream 事件路由到 EventBus（`emit/onEvt`）。ChatView 不直接管理 Channel，避免 Channel 生命周期与组件挂载耦合。
- **版本号驱动的消息刷新**：流式完成后递增 `chatMessageRefreshAtom` 版本号，ChatView 通过 useEffect 检测变化后重新加载消息，替代手动追加消息的方式。
- **平滑流式输出**：使用 `useSmoothStream` (`@proma/ui`) 将高频流式更新转为逐字渲染，配合防闪烁守卫避免过渡气泡闪烁（`ChatMessages.tsx:188-204`）。
- **过渡动画控制**：流式完成后经过 `transitioningCooldown`（150ms）再恢复 `resize="smooth"`，避免中间高度变化触发平滑滚动动画（`ChatMessages.tsx:215-233`）。
- **淡入控制**：切换对话时 opacity-0 → 双 rAF 后 opacity-100，避免 "先看到顶部消息再跳到底部" 的闪烁（`ChatMessages.tsx:239-271`）。
- **per-conversation 设置 hooks**：`useConversationModel`/`useConversationContextLength`/`useConversationThinkingEnabled`/`useConversationParallelMode`/`useConversationPromptId` 从 Map atoms 中按 conversationId 读写，缺省时使用全局默认值。
- **ModelSelector 搜索 + 分组 + 持久化**：Dialog + Command 风格搜索，按渠道分组，选择后自动持久化到 per-conversation Map 和 localStorage 全局默认值，同时异步写入会话元数据。
- **ChatInput TipTap 富文本编辑器**：替代原生 textarea，支持内联格式（当工具可用时），`sendWithCmdEnter` 配置项来自全局设置。
- **附件工作流完整前端实现**：拖放/粘贴/文件对话框 → 临时 `pendingAttachmentData`（base64 + blob URL）→ 发送时 `saveAttachment` IPC 保存到磁盘 → attachments 随 `ChatSendInput` 发送。`__pendingAttachmentData` 挂载在 `window` 上。
- **Thinking 按钮接通后端**：切换 per-conversation `thinkingEnabledAtom`，`ChatSendInput.thinkingEnabled` 传值，不同于旧版本仅维护本地视觉状态。
- **Streaming 错误与已停止标记**：stream:error 时写入 `chatStreamErrorsAtom` 显示 AlertBar；点击停止或快捷键 `jgui:stop-generation` 触发 `handleStop`（仅标记 streaming=false，不清除内容）。
- **标题异步生成**：首条消息发送时通过 `registerPendingTitle()` 注册，流式完成后 `useGlobalChatListeners` 调用 `generateTitle` IPC，更新 conversation + tab 标题。
- **Separate Reasoning channel**：内容与推理在流式事件层面分开传输，前端分别累积，Reasoning 组件使用 Collapsible + 思考计时 + 自动折叠。
- **并排模式**：通过 ChatHeader 按钮或 hook 切换，ChatMessages 检测 `parallelMode` 后渲染 ParallelChatMessages 替代标准消息列表。按 ContextDivider 分段。
- **ScrollMinimap**：横杠指示 + 悬停面板 + 搜索 + 可拖拽滚动条。在 Conversation（StickToBottom）内使用。`tabMinimapCacheAtom` 缓存 minimap 数据供 Tab hover 预览。
- **useSmoothStream 防闪烁**：ChatMessages 用原始 streamingContent/reasoning 作为守卫，避免 useSmoothStream 内部旧值导致过渡气泡与持久化消息同时闪现。
- **流式完成协议**：stream:complete/Done 时 streaming=false 但保留 content/reasoning 作为过渡气泡，等 ChatView 消息加载完成（新 refreshVersion 触发 useEffect）后再从 streamingStatesAtom 中清除 key。确保无空档期。

## 5. 代码锚点

| 想看什么 | 从哪看 |
|----------|--------|
| ChatView 完整逻辑 | `src/components/chat/ChatView.tsx:69-639` |
| send 流程 | `src/components/chat/ChatView.tsx:208-348` |
| stop 生成 | `src/components/chat/ChatView.tsx:410-430` |
| truncate + resend | `src/components/chat/ChatView.tsx:371-464` |
| inline edit | `src/components/chat/ChatView.tsx:467-518` |
| 删除消息 | `src/components/chat/ChatView.tsx:433-447` |
| 清除上下文 toggle | `src/components/chat/ChatView.tsx:521-540` |
| 加载更多历史 | `src/components/chat/ChatView.tsx:552-556` |
| 组件树渲染 | `src/components/chat/ChatView.tsx:558-638` |
| ChatInput 完整实现 | `src/components/chat/ChatInput.tsx:62-364` |
| 附件添加/移除 | `src/components/chat/ChatInput.tsx:94-171` |
| 拖放文件 | `src/components/chat/ChatInput.tsx:186-208` |
| Footer 工具栏 | `src/components/chat/ChatInput.tsx:270-361` |
| ChatHeader 标题编辑 | `src/components/chat/ChatHeader.tsx:68-152` |
| ChatMessages 消息列表 | `src/components/chat/ChatMessages.tsx:164-431` |
| ScrollTopLoader | `src/components/chat/ChatMessages.tsx:71-114` |
| 流式过渡控制 + 淡入 | `src/components/chat/ChatMessages.tsx:215-271` |
| ChatMessageItem 单条消息 | `src/components/chat/ChatMessageItem.tsx:99-286` |
| MessageBubble 操作按钮 | `src/components/chat/ChatMessageItem.tsx:234-274` |
| 原地编辑表单 | `src/components/chat/InlineEditForm.tsx:57-264` |
| 并排模式布局 | `src/components/chat/ParallelChatMessages.tsx:240-416` |
| ChatToolBlock | `src/components/chat/ChatToolBlock.tsx:30-91` |
| 工具活动合并渲染 | `src/components/chat/ChatToolActivityIndicator.tsx:21-69` |
| Agent 推荐横幅 + 迁移流程 | `src/components/chat/AgentRecommendBanner.tsx:35-162` |
| 全局流式事件监听 | `src/hooks/useGlobalChatListeners.ts:41-211` |
| 标题异步生成 | `src/hooks/useGlobalChatListeners.ts:117-139` |
| per-conversation hooks | `src/hooks/useConversationSettings.ts:60-125` |
| IPC sendMessage Channel 封装 | `src/lib/ipc.ts:172-195` |
| IPC EventBus emit | `src/lib/ipc.ts:46-52` |
| 流式状态 atoms | `src/atoms/chat-atoms.ts:39-106` |
| 消息结构 | `@proma/shared` ChatMessage type |
| streamingStatesAtom Map | `src/atoms/chat-atoms.ts:56` |
| per-conversation Map atoms | `src/atoms/chat-atoms.ts:253-263` |
| 系统提示词 atoms + resolveSystemMessage | `src/atoms/system-prompt-atoms.ts:23-108` |
| PromptEditorSidebar CRUD | `src/components/chat/PromptEditorSidebar.tsx:30-222` |
| ModelSelector 搜索 + 分组 | `src/components/chat/ModelSelector.tsx:84-347` |
| ToolSelectorPopover | `src/components/chat/ToolSelectorPopover.tsx:43-155` |
| ContextSettingsPopover | `src/components/chat/ContextSettingsPopover.tsx:47-110` |
| 删除确认弹窗 | `src/components/chat/DeleteMessageDialog.tsx:30-63` |
| MigrateToAgentButton | `src/components/chat/MigrateToAgentButton.tsx:33-114` |
| Reasoning 组件 | `src/components/ai-elements/reasoning.tsx:75-247` |
| ContextDivider | `src/components/ai-elements/context-divider.tsx:20-58` |
| ScrollMinimap | `src/components/ai-elements/scroll-minimap.tsx:70-455` |
| ai-elements message 原语 | `src/components/ai-elements/message.tsx` |
| ai-elements conversation 原语 | `src/components/ai-elements/conversation.tsx` |
| draftSessionIdsAtom | `src/atoms/draft-session-atoms.ts:12` |

## 6. 已知约束

- **token 计数无前端估算**：旧版 `estimateTokens()` 字符数粗估已移除。后端提供真实 token 计数，但前端无独立估算。
- **分叉通过后端 truncate 实现**：`truncateMessagesFrom()` IPC 调用后端删除指定消息及后续全部消息，然后前端重发。历史分支不会保留为独立树结构。
- **新建对话独立创建**：通过 `createConversation` IPC 创建新永久会话（写入磁盘），而非旧版的"清空当前 tab + 解绑 session"。
- **Message 操作总是调用后端 IPC**：删除和截断都通过后端持久化操作，不再是纯前端数组操作。但删除提供"重新加载"而非"乐观 update"。
- **附件临时缓存挂载在 window**：`window.__pendingAttachmentData` 是 Map<string, string>，非 Jotai atom，便于在组件间传递 base64 数据而不触发重渲染。
- **流式完成时刷新整个消息列表**：使用 `getRecentMessages` 重新加载而非增量追加，简化一致性问题但增加一次网络往返。
- **消息删除按单条而非 pair**：删除 API 接收 single messageId，后端删除单条消息。不像旧版依赖 user/assistant 成对排列。
- **并行模式依赖 `useSmoothStream` 守卫**：ParallelChatMessages 中的流式内容也使用 `smoothContent` 来自 ChatMessages，绕过平滑渲染。
- **并发发送保护**：`handleSend` 依赖 `isStreaming` 屏障（ChatInput.canSend = !streaming），但无队列机制。`handleStop` 在快捷键和按钮间共享 `handleStop` 闭包。
- **快速任务待发送消息**：`chatPendingMessageAtom` 作为全局注入点，ChatView 的 useEffect 中通过 `queueMicrotask` 延迟发送，避免 setState 竞态。

## 7. 变更日志

- `2026-05-10`：全面重写——ChatView 基于 conversationId prop + ConversationProvider 架构；ChatInput 使用 TipTap + 附件 + Footer 工具栏；ChatMessageItem 替代 MessageBubble；流式通过全局 useGlobalChatListeners + streamingStatesAtom Map 驱动；新增 ParallelChatMessages / InlineEditForm / PromptEditorSidebar / ToolSelectorPopover 等组件；新增加附件工作流；删除 token 计数估算。
- `2026-05-09`：同步 Chat 头部控制区、Markdown/Reasoning 渲染、消息操作、draft 恢复、标题派生和现有约束，移除已过时的"纯文本/无操作/单行输入"描述。

## 8. 相关文档

- `compound/2026-05-08-decision-j-gui-ui-architecture.md` — UI 整体架构
- `compound/2026-05-08-decision-j-gui-ipc-dataflow.md` — Channel 协议 + EventBus 模式
- `compound/2026-05-08-trick-jotai-event-integration.md` — Jotai + EventBus 集成模式
- `docs/api/chat-components.md` — Chat 组件参考层
- `requirements/j-gui-ai-interaction.md` — 承载的能力需求
- `architecture/frontend-ipc-layer.md` — IPC 封装与 EventBus
- `architecture/frontend-ai-elements.md` — ai-elements 原语库
