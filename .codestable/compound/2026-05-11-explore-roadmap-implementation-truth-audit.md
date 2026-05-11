---
doc_type: explore
type: question
date: 2026-05-11
slug: roadmap-implementation-truth-audit
topic: 当前 roadmap 的 done 状态与实际实现闭环程度是否一致
scope: .codestable/roadmap/j-gui-desktop-app、相关 architecture/docs/api 与 src/src-tauri 的对应实现
keywords: [roadmap, done, drift, agent, chat, settings, parity]
status: active
confidence: high
---

# j-gui roadmap 实现真实性审查

## 问题与范围

问题：当前 roadmap 中大量 `done` 是否真的对应“代码已闭环”，还是存在占位、半实现、文档过度乐观、前后端契约未接通等情况。

范围：以 `.codestable/roadmap/j-gui-desktop-app/j-gui-desktop-app-items.yaml` 为主，对照 `src/`、`src-tauri/`、`.codestable/architecture/`、`docs/api/` 的当前实现，不做代码修改。

## 速答

**当前 roadmap 的主要问题不是“虚报完成”，而是“把不同层级的完成混在了一种 done 里”。**

按代码现状看，至少存在三种被统一写成 `done` 的情况：

1. **真实闭环 done**：UI、命令、状态、最小交互都能对上。
2. **UI done / 协议未闭环**：界面、状态和文档已经写到位，但后端命令、事件协议或 replay 能力没有接通。
3. **文档 done / 实现仍在过渡**：architecture、API 文档和 roadmap 已经描述成完成态，但真实代码还依赖旧路径、fallback 或兼容层。

本次审查看到的高优先级失真点，主要集中在：

- Agent 审批中断链路
- Agent 历史会话回放与会话工作台链路
- Chat Tools / ToolSettings 能力链路
- Chat 增强输入参数与后端最小命令之间的落差

## 关键证据

1. `backend-agent-interrupts` 与 `frontend-agent-interrupt-ui` 在 roadmap 里都已标记 `done`，但前端仍走旧的 `respond_permission / respond_ask_user`，而后端新的统一入口是 `respond_agent_interrupt`。证据：[items.yaml](/E:/Coding/AI/j-gui/.codestable/roadmap/j-gui-desktop-app/j-gui-desktop-app-items.yaml:246)、[src/lib/ipc.ts](/E:/Coding/AI/j-gui/src/lib/ipc.ts:357)、[src-tauri/src/commands/agent.rs](/E:/Coding/AI/j-gui/src-tauri/src/commands/agent.rs:108)。
2. `backend-agent-session-storage` 与 `frontend-agent-session-navigation` 已标记 `done`，但 Agent 历史会话回放实际仍缺少 SDK replay / fork / rewind / move 等对应后端命令。证据：[items.yaml](/E:/Coding/AI/j-gui/.codestable/roadmap/j-gui-desktop-app/j-gui-desktop-app-items.yaml:254)、[src-tauri/src/agent_session.rs](/E:/Coding/AI/j-gui/src-tauri/src/agent_session.rs:200)、[src/components/agent/MoveSessionDialog.tsx](/E:/Coding/AI/j-gui/src/components/agent/MoveSessionDialog.tsx:60)。
3. `frontend-settings-chat-tools-ui` 已标记 `done`，但前端工具设置和聊天工具选择器依赖的命令，后端并没有完整注册。证据：[items.yaml](/E:/Coding/AI/j-gui/.codestable/roadmap/j-gui-desktop-app/j-gui-desktop-app-items.yaml:391)、[src/components/settings/ToolSettings.tsx](/E:/Coding/AI/j-gui/src/components/settings/ToolSettings.tsx:35)、[src-tauri/src/lib.rs](/E:/Coding/AI/j-gui/src-tauri/src/lib.rs:90)。
4. Chat 前端已组织 `thinkingEnabled / enabledToolIds / attachments / systemMessage` 等输入字段，但 Chat 后端命令只接 `session_id + content + on_event`，说明这条能力链并未真正落地。证据：[src/components/chat/ChatView.tsx](/E:/Coding/AI/j-gui/src/components/chat/ChatView.tsx:309)、[src-tauri/src/commands/chat.rs](/E:/Coding/AI/j-gui/src-tauri/src/commands/chat.rs:8)。
5. 文档层已发生漂移，说明 roadmap 的“done”判断已经受文档超前影响。证据：[docs/api/settings-components.md](/E:/Coding/AI/j-gui/docs/api/settings-components.md:7)、[docs/api/app-shell-components.md](/E:/Coding/AI/j-gui/docs/api/app-shell-components.md:45)、[.codestable/compound/2026-05-08-explore-progress-audit.md](/E:/Coding/AI/j-gui/.codestable/compound/2026-05-08-explore-progress-audit.md:1)。

## 细节展开

### 1. Agent 审批与中断链路：done 过于乐观

roadmap 中这组条目被写成已完成：

- `backend-agent-interrupts`
- `frontend-agent-interrupt-ui`

但真实代码里存在两个明显问题：

- 前端仍在使用旧的 `respondPermission` / `respondAskUser` 调用，[src/lib/ipc.ts](/E:/Coding/AI/j-gui/src/lib/ipc.ts:357)
- Rust 侧真正统一后的入口是 `respond_agent_interrupt`，同时 `respond_permission` / `respond_ask_user` 的参数名是 `request`，[src-tauri/src/commands/agent.rs](/E:/Coding/AI/j-gui/src-tauri/src/commands/agent.rs:349)

这说明当前状态更准确的描述应该是：

- UI 交互面存在
- 后端统一协议存在
- **前后端没有完全切到同一条协议**

所以它不是“没做”，但也不能算“完整闭环 done”。

### 2. Agent 会话存储与回放：持久化做了，工作台闭环没做完

roadmap 把 Agent 会话存储和导航写成 done，这个结论只在“目录、meta、timeline 持久化已存在”的层面成立。

真实后端已经有：

- `create / list / get / delete / pin / archive` 一类基础会话存储能力，[src-tauri/src/agent_session.rs](/E:/Coding/AI/j-gui/src-tauri/src/agent_session.rs:98)

但工作台真正需要的几条路径并没有同等级闭环：

- 历史会话以 SDK message 形式回放
- 从现有会话 fork
- rewind 到某一步
- 在工作区间迁移会话

所以这组条目更像：

- **存储层 done**
- **工作台 replay / manipulation 层未 done**

### 3. Chat Tools：设置页存在，不等于能力链已完成

roadmap 把 `frontend-settings-chat-tools-ui` 写成 `done`，但检查代码后，前端的实际依赖明显比后端注册的命令更多。

前端存在：

- `ToolSettings`
- `ToolSelectorPopover`
- ChatInput 中的 tool 入口

但后端注册侧并没有覆盖这些 UI 所依赖的完整命令集合，尤其是工具读取、状态更新、自定义工具删除等链路并不完整。

这类条目更准确的状态应该是：

- **Settings UI done**
- **真实工具治理能力部分缺失**

### 4. Chat 增强能力：前端领先于后端

ChatView 目前已经按“增强版 Chat 请求”组织数据结构：

- `thinkingEnabled`
- `enabledToolIds`
- `attachments`
- `systemMessage`

见 [src/components/chat/ChatView.tsx](/E:/Coding/AI/j-gui/src/components/chat/ChatView.tsx:309)。

但 Rust 后端 `send_message` 仍只接收最小三元组：

- `session_id`
- `content`
- `on_event`

见 [src-tauri/src/commands/chat.rs](/E:/Coding/AI/j-gui/src-tauri/src/commands/chat.rs:8)。

这意味着 roadmap 里若把 Chat 增强能力整体理解成“已经完工”，那就偏乐观了。当前更接近：

- **输入结构和 UI 已准备**
- **后端仍是最小模型调用链**

### 5. 文档不全与文档超前，已经在影响 roadmap 判断

本仓库当前最明显的工程问题之一，不是没有文档，而是：

- 一部分文档比代码旧
- 一部分 roadmap / architecture 比实际实现更乐观

例如：

- `docs/api/settings-components.md` 仍引用旧组件名或不存在的文件入口，[docs/api/settings-components.md](/E:/Coding/AI/j-gui/docs/api/settings-components.md:7)
- `docs/api/app-shell-components.md` 仍把初始化职责挂在 `AppShell`，[docs/api/app-shell-components.md](/E:/Coding/AI/j-gui/docs/api/app-shell-components.md:45)

这说明 roadmap 的 `done` 已经不能只看文档产物，而必须回到代码核对。

## 未决问题

- roadmap 后续是否要引入比 `done / planned` 更细的状态，比如区分 `ui-done`、`protocol-pending`、`backend-pending`。
- 是否要把 Chat 与 Agent 的“最小闭环完成”标准分别写清，避免以后再次把“有界面”误写成“已闭环”。
- `docs/api` 是否继续承担“当前态参考”的职责，还是只保留 `.codestable/architecture` 为可信入口。

## 后续建议

建议下一步先做一次 roadmap 状态去泡沫，把当前 `done` 条目按“真实闭环 / UI 完成但协议未闭环 / 文档已写但实现未闭环”重新分类后，再决定要不要继续推进 parity 文档或 acceptance。

## 相关文档

- [j-gui-desktop-app-items.yaml](/E:/Coding/AI/j-gui/.codestable/roadmap/j-gui-desktop-app/j-gui-desktop-app-items.yaml)
- [src/lib/ipc.ts](/E:/Coding/AI/j-gui/src/lib/ipc.ts)
- [src/components/chat/ChatView.tsx](/E:/Coding/AI/j-gui/src/components/chat/ChatView.tsx)
- [src/components/settings/ToolSettings.tsx](/E:/Coding/AI/j-gui/src/components/settings/ToolSettings.tsx)
- [src-tauri/src/commands/agent.rs](/E:/Coding/AI/j-gui/src-tauri/src/commands/agent.rs)
- [src-tauri/src/commands/chat.rs](/E:/Coding/AI/j-gui/src-tauri/src/commands/chat.rs)
- [src-tauri/src/agent_session.rs](/E:/Coding/AI/j-gui/src-tauri/src/agent_session.rs)
- [docs/api/settings-components.md](/E:/Coding/AI/j-gui/docs/api/settings-components.md)
- [docs/api/app-shell-components.md](/E:/Coding/AI/j-gui/docs/api/app-shell-components.md)
