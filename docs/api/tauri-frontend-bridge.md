---
doc_type: lib-api-ref
entry: tauri-frontend-bridge
category: Frontend API
status: draft
source_files:
  - src/lib/tauri.ts
summary: 前端对 Tauri invoke、Channel 事件和共享 payload 类型的统一桥接层参考。
last_reviewed: 2026-05-09
---

# tauri-frontend-bridge

## 概述

`src/lib/tauri.ts` 是前端唯一的 Tauri IPC façade。它把后端 command、流式 `Channel` 事件和前后端共享的数据结构集中在一个文件里，组件层不直接调用裸 `invoke()`。

当前桥接层覆盖六组能力：

- Chat 会话与流式消息
- Agent 运行、审批与会话
- Agent / YAML / system prompt 配置
- Alias
- Governance（Skills / Hooks / MCP）
- System（版本、主题事件）

## 公开表面

### 基础依赖

- `invoke`：所有命令调用入口
- `Channel`：Chat / Agent 流式事件通道
- `listen`：订阅 `theme-changed` 这类全局事件

### Chat 相关

- `type ChatEvent`
- `sendMessage(sessionId, content, onEvent)`
- `listSessions()`
- `createSession()`
- `deleteSession(sessionId)`
- `getSessionMessages(sessionId)`
- `deleteMessage(sessionId, pairIndex)`
- `clearSession(sessionId)`

### Config / Alias 相关

- `type YamlConfigInfo`
- `getConfig()`
- `setConfig(section, key, value)`
- `type AliasEntry`
- `listAliases()`
- `setAlias(section, name, value)`
- `removeAlias(section, name)`
- `type ProviderInfo`
- `type AgentConfigInfo`
- `getAgentConfig()`
- `setAgentConfig(config)`
- `setActiveProvider(index)`
- `getSystemPrompt()`
- `setSystemPrompt(prompt)`

### Agent 相关

- `type AgentEvent`
- `startAgent(onEvent, permissionMode?, sessionId?)`
- `sendAgentMessage(content)`
- `respondAgentInterrupt(interruptId, allowed)`
- `stopAgent()`
- `type ToolCallSnapshot`
- `type InterruptSnapshot`
- `type AgentTimelineItem`
- `type AgentSessionInfo`
- `createAgentSession()`
- `listAgentSessions()`
- `getAgentSession(sessionId)`
- `deleteAgentSession(sessionId)`

### Governance 相关

- `type SkillInfo`
- `type HookInfo`
- `type McpServerConfig`
- `listSkills()`
- `listHooks()`
- `listMcpServers()`
- `saveMcpServers(servers)`

### System 相关

- `setTheme(theme)`
- `getVersion()`
- `onThemeChanged(callback)`

## 共享类型

### `ChatEvent`

只有三种事件：

- `chunk`：`{ index, content }`
- `done`：`{ totalTokens }`
- `error`：`{ message }`

这组类型只描述聊天流，不含工具调用、中断或取消状态。

### `SessionInfo`

- `id`
- `title?`
- `messageCount`
- `updatedAt`

用于 Chat 会话列表。

### `MessageInfo`

- `role`
- `content`

用于 Chat 会话详情。

### `AgentEvent`

只有六种事件：

- `assistantContent`
- `toolUse`
- `toolResult`
- `interrupt`
- `done`
- `error`

字段名已经与后端 `camelCase` 序列化对齐，组件层直接按事件名分派。

### `AgentTimelineItem`

- `id`
- `kind`
- `content?`
- `toolCall?`
- `interrupt?`
- `createdAt`

这是 Agent 会话恢复时的时间线条目，不是实时流事件。

### `ProviderInfo` / `AgentConfigInfo`

`ProviderInfo`：

- `name`
- `apiBase`
- `apiKey`
- `model`
- `supportsVision`

`AgentConfigInfo`：

- `providers`
- `activeIndex`
- `theme`

### `HookInfo`

- `name?`
- `event`
- `source`
- `hookType`
- `label`
- `timeout?`
- `onError?`
- `uniqueId`

### `McpServerConfig`

- `name`
- `transport`
- `command?`
- `args?`
- `url?`
- `env?`
- `disabled`

## 调用约定

### 参数命名

wrapper 层统一使用前端 camelCase 参数名，再交给 `invoke()`：

- `sessionId`
- `pairIndex`
- `activeIndex`
- `permissionMode`
- `interruptId`

### `null` 透传

`startAgent()` 会把可选参数显式转成 `null`：

```ts
return invoke("start_agent", {
  onEvent,
  permissionMode: permissionMode ?? null,
  sessionId: sessionId ?? null,
});
```

这意味着前端用“省略或 `undefined`”表达可空输入，Rust 侧收到的是 `Option<T>`。

### 直接封装，不做业务判断

桥接层大部分函数只是轻量 `invoke()` 封装：

- 不缓存结果
- 不重试
- 不做错误翻译
- 不做 UI 状态同步

业务状态管理放在 atoms 和组件层。

## 典型用法

### Chat 流式消息

```ts
import { Channel } from "@tauri-apps/api/core";
import { createSession, sendMessage, type ChatEvent } from "@/lib/tauri";

const sessionId = await createSession();
const channel = new Channel<ChatEvent>();

channel.onmessage = (event) => {
  if (event.event === "chunk") {
    console.log(event.data.content);
  }
};

await sendMessage(sessionId, "你好", channel);
```

### Agent 启动与审批

```ts
import { Channel } from "@tauri-apps/api/core";
import { startAgent, respondAgentInterrupt, type AgentEvent } from "@/lib/tauri";

const channel = new Channel<AgentEvent>();

channel.onmessage = async (event) => {
  if (event.event === "interrupt") {
    await respondAgentInterrupt(event.data.interruptId, true);
  }
};

await startAgent(channel, "default");
```

### 订阅主题变更

```ts
import { onThemeChanged } from "@/lib/tauri";

const unlisten = await onThemeChanged((theme) => {
  console.log(theme);
});
```

## 关键边界

- 这层是统一入口，不是状态仓库；消息、tab、sidebar、toast 都不在这里维护。
- Chat 和 Agent 各自有独立事件模型，不能混用 `ChatEvent` 与 `AgentEvent`。
- `startAgent()` 的 `sessionId` 是可空输入，但 `sendAgentMessage()` 不接受 `sessionId`，它依赖当前已经启动的后端引擎。
- `onThemeChanged()` 是事件订阅，不会主动读取当前 theme；当前值仍需通过配置链路加载。
- `McpServerConfig.transport`、`HookInfo.event` 等字段当前都按普通字符串暴露，前端不能假设源码外的枚举值。

## 相关条目

- [src/lib/tauri.ts](/E:/Coding/AI/j-gui/src/lib/tauri.ts)
- [chat-commands](./chat-commands.md)
- [agent-commands](./agent-commands.md)
- [config-commands](./config-commands.md)
- [governance-commands](./governance-commands.md)
