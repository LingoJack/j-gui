---
doc_type: trick
type: technique
slug: agent-mode-review-checklist
topic: 审查 Tauri + React Agent 模式时，先沿协议契约、状态归属、模式切换生命周期三条线收敛问题
language: typescript
framework: tauri
tags: [agent-mode, review, tauri, react, jotai, claude-code, workflow]
status: active
---

# Agent 模式审查清单

## 适用场景

- 现象看起来像“发了消息但 agent 不回复”
- Chat / Agent 双模式切换后界面不对或对话丢失
- 流式回复期间，输入框、发送按钮、工具卡片行为不符合预期

## 做法

### 1. 先审协议契约，不要先怀疑 UI

先把“前端发送一条消息”到“后端收到有效 assistant 事件”这条链路走通：

- Claude CLI 是否用对 headless 协议：`--input-format stream-json`、`--output-format stream-json`、`--verbose`
- stdout 事件解析是否把合法的 `system` / `user` / `stream_event` 当错误吞掉
- Rust 发给前端的事件名是否和前端 `switch(msg.event)` 完全一致

项目内代码锚点：

- [agent_engine.rs](/E:/Coding/AI/j-gui/src-tauri/src/agent_engine.rs:55)
- [tauri.ts](/E:/Coding/AI/j-gui/src/lib/tauri.ts:133)
- [AgentView.tsx](/E:/Coding/AI/j-gui/src/components/agent/AgentView.tsx:45)

### 2. 再审状态归属，先问“这份状态到底属于谁”

双模式界面最容易出的错不是渲染，而是**错误地共用状态**。审查时先把状态按归属分组：

- Chat 专属：`currentSessionId`、chat 消息列表、chat streaming
- Agent 专属：agent 消息列表、agent streaming、agent 进程绑定
- 全局共享：主题、provider 配置、侧边栏显隐

如果 chat 和 agent 共用同一份 `messages` / `streaming` atom，切模式时就很容易出现：

- 切到 chat 没换界面
- 切回 agent 对话不见
- 一边 streaming，另一边输入框被错误禁用

项目内代码锚点：

- [sessions.ts](/E:/Coding/AI/j-gui/src/atoms/sessions.ts:1)
- [ChatView.tsx](/E:/Coding/AI/j-gui/src/components/chat/ChatView.tsx:5)
- [AgentView.tsx](/E:/Coding/AI/j-gui/src/components/agent/AgentView.tsx:10)

### 3. 再审模式切换生命周期，确认切换时有没有把上下文卸掉

如果 agent 会话上下文绑在组件实例上，模式切换时就不能简单卸载组件再重建。要么：

- 让 view 常驻，只做显隐切换

要么：

- 把 agent 引擎状态上提到组件外的持久层

这次仓库里采用的是前者：`MainArea` 同时挂着 `ChatView` 和 `AgentView`，切模式只 `hidden`，不卸载 `AgentView`。

项目内代码锚点：

- [MainArea.tsx](/E:/Coding/AI/j-gui/src/components/app-shell/MainArea.tsx:46)

### 4. 最后审交互语义，不要把“不能发”误写成“不能点”

输入组件里至少分清两个概念：

- `disabled`：输入框本身不可编辑
- `sendDisabled`：允许继续输入，但暂时不能发送

流式回复时，很多时候正确语义是“可以继续打字准备下一条，但当前这条还没结束前不能发送”。如果直接把 `<textarea disabled={streaming}>` 绑死，用户会以为界面卡住了。

项目内代码锚点：

- [ChatInput.tsx](/E:/Coding/AI/j-gui/src/components/chat/ChatInput.tsx:4)
- [AgentView.tsx](/E:/Coding/AI/j-gui/src/components/agent/AgentView.tsx:181)

## 为什么有效

这类问题表面都像“agent 没回复”，但根因往往分散在三层：

1. 协议层：消息根本没进入有效 turn
2. 状态层：消息到了，但被错误状态覆盖或切模式时丢了
3. 交互层：其实有回复，只是输入/切换行为让用户误判为挂死

按“协议契约 → 状态归属 → 生命周期 → 交互语义”的顺序查，比从 UI 表象乱翻组件快得多。

## 示例

这次 j-gui 里的真实修复点：

- `src-tauri/src/agent_engine.rs`
  - 启动参数补上 `--input-format stream-json`
  - 事件序列化改成 camelCase
  - `assistant` 一条消息里的多个 content block 全部转发，而不是只吃第一个
- `src/atoms/sessions.ts`
  - 从一套共享 `messages/streaming` 改成 chat / agent 两套独立 atom
- `src/components/app-shell/MainArea.tsx`
  - Chat / Agent view 常驻，只切显隐
- `src/components/chat/ChatInput.tsx`
  - 区分 `disabled` 和 `sendDisabled`

## 已知坑

- 看到“切模式后消息没了”时，先查共享 atom，不要先怪路由或渲染
- 看到“发了没回复”时，先查 CLI 输入输出协议，不要先改提示词或 provider
- 子代理审查结果也要回到需求本身复核；例如“输入框仍可编辑”在某些场景是故障，在这次验收标准里反而是目标

## 相关文档

- [2026-05-08-trick-claude-code-cli-protocol.md](./2026-05-08-trick-claude-code-cli-protocol.md)
- [2026-05-08-trick-jotai-event-integration.md](./2026-05-08-trick-jotai-event-integration.md)
- [2026-05-08-decision-agent-sdk-strategy.md](./2026-05-08-decision-agent-sdk-strategy.md)
