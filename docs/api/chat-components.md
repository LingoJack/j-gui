---
doc_type: lib-api-ref
entry: chat-components
category: React Components
status: draft
source_files:
  - src/components/chat/ChatView.tsx
  - src/components/chat/ChatInput.tsx
  - src/components/chat/ChatMessages.tsx
  - src/components/chat/MessageBubble.tsx
  - src/components/chat/ReasoningBlock.tsx
summary: Chat 主视图、输入框、消息列表、消息气泡和思考块组件参考。
last_reviewed: 2026-05-09
---

# chat-components

## 概述

这组组件构成 j-gui 当前 Chat 模式的主要可见 UI 面：

- `ChatView`
- `ChatInput`
- `ChatMessages`
- `MessageBubble`
- `ReasoningBlock`

它们共同承接：

- Chat 会话发送与流式接收
- provider 切换
- 系统提示词编辑
- 消息渲染、复制、重发、删除、分叉
- reasoning 内容折叠展示

当前这组组件也不是通用组件库，而是工作台内部聊天组件。

## 组件参考

### `ChatView`

文件：`src/components/chat/ChatView.tsx`

职责：

- Chat 页面总编排
- 发送消息和消费 `ChatEvent`
- 管理 provider 选择、系统提示词、主题切换、清空上下文
- 渲染 `ChatMessages` 和 `ChatInput`

主要依赖：

- `sendMessage`
- `createSession`
- `deleteMessage`
- `clearSession`
- `setActiveProvider`
- `getAgentConfig`
- `getSystemPrompt`
- `setSystemPrompt`
- `setTheme`
- `getVersion`
- `chatMessages*` / `chatStreaming*` / `chatDraftsAtom`
- `currentSessionIdAtom`
- `chatSessionsAtom`
- `sessionTitleOverridesAtom`

主要可见结构：

- 顶部 header
- 系统提示词按钮与弹出层
- provider 选择器
- token 计数
- 清空 / 新建 / 主题切换按钮
- `ChatMessages`
- `ChatInput`

关键行为：

- 无 session 时先 `createSession()`
- 发送前先追加 user message 和空 assistant message
- 通过 `Channel<ChatEvent>` 把 chunk 追加到指定 assistant message
- `done` / `error` 时结束当前 tab 的流式状态
- 支持清空上下文、删除消息对、重发和从某条 assistant 回复处分叉

主要输入：

- 无显式 props

主要输出：

- 通过 atoms 更新当前 Chat tab 状态
- 通过 Tauri wrapper 调后端

边界：

- token 数是按字符数粗略估算，不是后端真实 token 统计
- `fork` 通过清空当前 session 后重发实现，不是独立后端 fork API
- 主题切换直接调用 `setTheme` 并同步 `documentElement`

### `ChatInput`

文件：`src/components/chat/ChatInput.tsx`

职责：

- 提供多行输入框、thinking toggle 和发送按钮

props：

- `onSend`
- `disabled?`
- `sendDisabled?`
- `placeholder?`
- `draft?`
- `onDraftChange?`

行为：

- `Enter` 发送，`Shift+Enter` 换行
- 外部 `draft` 变化时同步本地 `text`
- 本地维护 `thinking` 按钮状态，但当前只影响 UI，不向上透传

### `ChatMessages`

文件：`src/components/chat/ChatMessages.tsx`

职责：

- 渲染当前 Chat tab 的消息区
- 空态时显示“输入消息开始对话”
- 处理 fork 分隔线展示
- 为每条消息注入删除 / 重发 / 分叉回调

props：

- `onDelete?`
- `onResend?`
- `onFork?`
- `forkIndex?`

行为：

- `messages.length === 0 && !streaming` 时显示空态
- `forkIndex === i` 时在对应位置上方插入“上下文已清空”分隔线
- 分叉时会回溯到前一条 user message

### `MessageBubble`

文件：`src/components/chat/MessageBubble.tsx`

职责：

- 渲染单条聊天消息
- 支持 Markdown、代码高亮、reasoning 块和消息操作按钮

props：

- `message`
- `index`
- `onDelete?`
- `onResend?`
- `onFork?`

行为：

- user / assistant 用不同头像和标签
- 自动识别 `【思考】 ... \n---\n` 前缀，把 reasoning 与正文拆开
- 正文走 `ReactMarkdown + remarkGfm + rehypeHighlight`
- hover 时显示复制 / 重发 / 分叉 / 删除按钮
- `message.isStreaming` 时显示闪烁光标

### `ReasoningBlock`

文件：`src/components/chat/ReasoningBlock.tsx`

职责：

- 渲染可折叠的思考过程块

props：

- `content`

行为：

- 默认展开
- 只负责展示 reasoning 纯文本，不做 Markdown 渲染

## 组件关系

```text
ChatView
  -> ChatMessages
     -> MessageBubble
        -> ReasoningBlock?
  -> ChatInput
```

## 关键边界

- 这组组件强依赖当前 Chat atoms 和 `src/lib/tauri.ts`，不是脱离工作台可独立复用的聊天 UI 套件。
- `ChatMessages` 自己不消费流事件，流事件消费全部由 `ChatView` 完成。
- `MessageBubble` 的 reasoning 识别依赖固定文本协议 `【思考】` + `\n---\n`。
- `ChatInput` 的 thinking 开关当前只是视觉状态，不会影响后端请求参数。
- `ChatView` 的“删除消息”按 pair 维度工作，因为后端 `delete_message` 也是按消息对删除。

## 相关条目

- [src/components/chat/ChatView.tsx](/E:/Coding/AI/j-gui/src/components/chat/ChatView.tsx)
- [src/components/chat/ChatInput.tsx](/E:/Coding/AI/j-gui/src/components/chat/ChatInput.tsx)
- [src/components/chat/ChatMessages.tsx](/E:/Coding/AI/j-gui/src/components/chat/ChatMessages.tsx)
- [src/components/chat/MessageBubble.tsx](/E:/Coding/AI/j-gui/src/components/chat/MessageBubble.tsx)
- [src/components/chat/ReasoningBlock.tsx](/E:/Coding/AI/j-gui/src/components/chat/ReasoningBlock.tsx)
- [frontend-chat-ui](/E:/Coding/AI/j-gui/.codestable/architecture/frontend-chat-ui.md)
