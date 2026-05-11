---
doc_type: lib-api-ref
entry: tauri-frontend-bridge
category: Frontend API
status: draft
source_files:
  - src/lib/ipc.ts
summary: 前端对 Tauri invoke、Channel 事件、事件总线和共享 payload 类型的统一桥接层参考。
last_reviewed: 2026-05-11
---

# tauri-frontend-bridge

## 概述

`src/lib/ipc.ts` 是前端当前的统一 IPC façade。它把后端 command 调用、`Channel` 流式桥接、前端事件总线和若干 fallback 行为集中在一个文件里，组件层通常不直接调用裸 `invoke()`。

当前桥接层至少覆盖这些能力：

- Chat 会话、消息和流式事件
- Agent 会话、运行时与中断响应
- settings / config / alias / system prompt
- hooks / skills / MCP / workspace capabilities
- 文件、目录、附件与预览
- system 辅助能力，例如 badge、外链、release 查询

## 公开表面

### 基础依赖

- `invoke`：所有命令调用入口。
- `Channel`：Chat / Agent 流式事件桥接入口。
- `emit()` / `onEvt()`：前端内部事件总线。
- `tryInvoke()`：带 fallback 的轻量封装。

### Chat 相关

- 会话：`listConversations()`、`createConversation()`、`deleteConversation()`、`togglePinConversation()`、`toggleArchiveConversation()`
- 消息：`getConversationMessages()`、`getRecentMessages()`、`deleteMessage()`、`truncateMessagesFrom()`、`updateContextDividers()`
- 搜索与标题：`searchConversationMessages()`、`generateTitle()`
- 流式：`sendMessage()`、`stopGeneration()`、`onStreamChunk()`、`onStreamComplete()`、`onStreamError()`

### Agent 相关

- 会话：`listAgentSessions()`、`createAgentSession()`、`deleteAgentSession()`、`toggleArchiveAgentSession()`、`togglePinAgentSession()`
- 运行时：`sendAgentMessage()`、`stopAgent()`、`queueAgentMessage()`
- 中断响应：`respondPermission()`、`respondAskUser()`、`respondExitPlanMode()`
- 工作区：`listAgentWorkspaces()` 以及 workspace capabilities / MCP / skills 相关函数

### Settings / Governance / Files 相关

- settings / config / alias / prompt / profile 相关函数
- `listSkills()`、`scanGlobalSkills()`、`copySkillToWorkspace()`
- `listHooks()`、`toggleHook()`
- `listMcpServers()` 与 workspace MCP 配置相关函数
- 文件、目录、附件、预览与打开相关函数

## 调用约定

### 参数命名

wrapper 层通常使用前端 camelCase 参数名，再交给 `invoke()`，例如：

- `conversationId`
- `sessionId`
- `workspaceSlug`
- `pairIndex`

### fallback 与缓存

- 一部分命令通过 `tryInvoke()` 包装，并在命令缺失时返回 fallback。
- `getSettings()`、`listAgentSessions()` 等少数字段带有内存缓存或 in-flight 去重。
- 业务状态仍主要放在 atoms、hooks 和视图层。

## 典型用法

### Chat 流式消息

```ts
import * as ipc from "@/lib/ipc";

const conv = await ipc.createConversation("新对话");

ipc.onStreamChunk((event) => {
  console.log(event.conversationId, event.content);
});

await ipc.sendMessage({
  conversationId: conv.id,
  message: "你好",
});
```

### Agent 响应中断

```ts
import * as ipc from "@/lib/ipc";

ipc.onPermissionRequest(async (event) => {
  await ipc.respondPermission({
    requestId: event.requestId,
    behavior: "allow",
    alwaysAllow: false,
  });
});
```

### 读取设置

```ts
import * as ipc from "@/lib/ipc";

const settings = await ipc.getSettings();
console.log(settings.themeMode);
```

## 关键边界

- 这层是统一入口，不是状态仓库。
- 该文件已从旧的 `tauri.ts` 演进为 `ipc.ts`，文档和引用路径都应以新文件为准。
- 一部分接口是“真实命令 + fallback”，调用成功不等于后端能力一定完整存在，查行为闭环时要继续追到 Rust command。
- 这是当前最活跃的前端边界之一；字段精确性以源码优先。

## 相关条目

- [src/lib/ipc.ts](/E:/Coding/AI/j-gui/src/lib/ipc.ts)
- [chat-commands](./chat-commands.md)
- [agent-commands](./agent-commands.md)
- [config-commands](./config-commands.md)
- [governance-commands](./governance-commands.md)
