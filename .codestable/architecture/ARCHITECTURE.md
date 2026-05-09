---
doc_type: architecture
slug: ARCHITECTURE
scope: j-gui 系统架构总入口
summary: 当前总入口，覆盖 AppShell、Chat/Agent 工作台、Settings、Jotai 状态与 Tauri IPC 总线
status: current
last_reviewed: 2026-05-09
tags: [tauri, react, desktop, chat, agent, settings]
depends_on: []
implements: []
---
# j-gui 架构总入口

> 状态：当前不是脚手架。应用入口已经落在 `AppShell`，负责把 Chat / Agent / Settings / Search / Toast 组合成一个桌面工作台。
> 最后更新：2026-05-09

## 1. 定位与受众

j-gui 是 Tauri v2 桌面应用。前端是 React + TypeScript + Vite，后端是 Rust + Tauri command 层。`src/main.tsx` 只负责挂载，`src/App.tsx` 直接返回 `AppShell`，真正的总入口在 `src/components/app-shell/AppShell.tsx:32-208`。

这份文档只记现状，不写未来规划。它的作用是让读者先看懂当前系统长什么样，再按子文档钻到具体子系统里。

**受众**：feature-design（理解模块边界）、issue-analyze（定位代码）、新人上手（理解当前结构）。

## 2. 结构与交互

### 2.1 入口链路

```
src/main.tsx
  └─ App
      └─ AppShell
          ├─ LeftSidebar
          ├─ MainArea
          │   ├─ WelcomePage
          │   ├─ ChatView
          │   └─ AgentView
          ├─ RightSidePanel
          ├─ SettingsDialog
          ├─ SearchDialog
          └─ ToastContainer
```

- `src/main.tsx:1-10` 只做 React 根挂载
- `src/App.tsx:1-5` 不再承载业务，只是把壳组件作为应用根节点
- `src/components/app-shell/AppShell.tsx:32-208` 负责加载主题、配置、会话列表，并组合左侧栏、主区、右侧面板、设置与搜索
- `src/components/app-shell/MainArea.tsx:1-303` 负责标签页编排、空状态、默认 chat tab、错误边界和当前内容切换
- `src/components/app-shell/LeftSidebar.tsx:72-487` 负责 tab / 会话切换、侧边栏折叠、新建会话与设置入口
- `src/components/app-shell/RightSidePanel.tsx:117-220` 只在 agent 标签页且面板打开时出现
- `src/components/settings/SettingsDialog.tsx:46-483` 集中管理模型、通用、别名、Skills、Hooks、MCP
- `src/lib/tauri.ts:1-273` 是前端唯一的 IPC façade，封装所有 `invoke()` 和 `Channel<T>`

### 2.2 前端状态

当前 UI 状态主要由 Jotai atoms 承载，按“布局 / 标签页 / 会话 / 配置 / 主题 / 通知”分层：

- `src/atoms/app-mode.ts:1-5` 定义当前主模式，值域是 `chat | agent`
- `src/atoms/tabs.ts:1-17` 维护标签页数组、当前标签页和 active tab 解析
- `src/atoms/sidebar.ts:1-4` 控制左侧栏和右侧面板是否展开
- `src/atoms/theme.ts:1-3` 保存应用主题
- `src/atoms/config.ts:1-26` 保存 provider 配置和当前激活 provider
- `src/atoms/sessions.ts:1-190` 保存 chat / agent 会话列表、消息列表、流式状态、草稿、标题覆盖和 timeline 转消息映射
- `src/atoms/toast.ts:1-19` 提供全局 toast 入口

`AppShell` 启动时会拉取 `agentConfigAtom`、chat 会话列表、agent 会话列表，并把主题同步到 `documentElement`；`MainArea` 在没有 tab 时会创建默认 chat tab，并在没有 provider 时回退到 `WelcomePage` (`src/components/app-shell/MainArea.tsx:19-182`)。

### 2.3 后端命令与引擎

后端入口在 `src-tauri/src/lib.rs:10-52`。这里只负责把命令、插件和共享状态组装进 Tauri builder，不承载业务本身。

- `src-tauri/src/lib.rs:17-49` 注册了 chat、agent、alias、config、system、governance 这几组命令
- `src-tauri/src/commands/mod.rs` 按领域拆分命令模块
- `src-tauri/src/commands/chat.rs:4-50` 只是 `ChatEngine` 的命令包装
- `src-tauri/src/chat_engine.rs:1-206` 承担 chat 会话读取、写入、流式事件和 session 管理
- `src-tauri/src/commands/agent.rs` 与 `src-tauri/src/agent_engine.rs:1-572` 共同承担 agent 运行、Claude CLI 流、审批中断和事件转换
- `src-tauri/src/agent_session.rs:1-250` 管理 agent timeline 与 interrupt / tool 结果的持久化
- `src-tauri/src/commands/config.rs:1-163` 负责 agent config、provider 切换、通用配置和 system prompt
- `src-tauri/src/commands/system.rs:1-17` 处理版本与主题
- `src-tauri/src/commands/alias.rs:1-42` 处理 alias 读写
- `src-tauri/src/commands/governance.rs:1-207` 处理 Skills、Hooks、MCP 配置的读取与保存

`src/lib/tauri.ts:1-273` 是前端对这些命令的类型化入口。它把 chat、agent、config、alias、system、governance 的 `invoke()` 统一收口，也把 `ChatEvent` / `AgentEvent` / 各类配置结构放在一个地方定义，避免组件层到处散落后端签名。

### 2.4 状态与持久化

当前状态分成两类：UI 内存状态和 j_cli 侧持久化状态。

- UI 内存状态由 Jotai atoms 管理，尤其是 tabs、消息、草稿、主题、侧栏和右侧面板
- chat 会话持久化通过 `ChatEngine` 对接 j_cli storage，实际会落到 `~/.jdata/sessions/{id}/transcript.jsonl` 一类路径（由 j_cli 管理）
- agent 会话持久化由 `agent_session.rs` 管理，实际目录是 `~/.jdata/agent/sessions/{id}/`
- agent provider 配置和 system prompt 走 j_cli 的 agent config 存储，`SettingsDialog` 只是编辑面
- `src-tauri/src/commands/config.rs:27-163` 对 provider API key 做脱敏读出、保留旧值写回，并把当前 active provider 写回同一份配置
- `src-tauri/src/commands/system.rs:11-17` 会把 theme 写回配置并发出 `theme-changed`
- `src/components/settings/SettingsDialog.tsx:63-121` 是当前模型配置保存链路
- `src/components/chat/ChatView.tsx:68-177` 是当前 chat 消息与流式状态的前端写入点
- `src/components/agent/AgentView.tsx:35-220` 是当前 agent 消息、审批和面板状态的前端写入点

## 3. 子系统

| 子系统 | 文档 | 说明 |
|--------|------|------|
| ChatEngine（后端） | [backend-chat-engine](./backend-chat-engine.md) | 只展开 chat 后端引擎、流式事件和会话持久化 |
| AgentEngine（后端） | [backend-agent-engine](./backend-agent-engine.md) | 只展开 claude CLI、Agent 事件流、interrupt 和 timeline 持久化 |
| Chat UI（前端） | [frontend-chat-ui](./frontend-chat-ui.md) | 只展开 chat 组件、流式展示和 chat atoms |
| Agent UI（前端） | [frontend-agent-ui](./frontend-agent-ui.md) | 只展开 AgentView、审批横幅、任务进度和工具调用渲染 |
| AppShell（前端外壳） | [frontend-app-shell](./frontend-app-shell.md) | 只展开工作台外壳、tab 编排、搜索和左右面板 |
| Settings UI（前端） | [frontend-settings-ui](./frontend-settings-ui.md) | 只展开设置对话框、provider 配置和读写链路 |

这些子文档不重复总入口层面的 AppShell、标签页、全局状态和命令总线细节；它们只负责把各自子系统展开。

## 4. 代码锚点

| 想看什么 | 从哪看 |
|----------|--------|
| 应用根入口 | `src/main.tsx:1-10`、`src/App.tsx:1-5` |
| 工作台总入口 | `src/components/app-shell/AppShell.tsx:32-208` |
| 主区域编排 | `src/components/app-shell/MainArea.tsx:1-303` |
| 左侧栏与会话切换 | `src/components/app-shell/LeftSidebar.tsx:72-487` |
| 右侧面板 | `src/components/app-shell/RightSidePanel.tsx:117-220` |
| 设置对话框 | `src/components/settings/SettingsDialog.tsx:46-483` |
| 前端 IPC façade | `src/lib/tauri.ts:1-273` |
| 前端状态 atoms | `src/atoms/app-mode.ts:1-5`、`src/atoms/tabs.ts:1-17`、`src/atoms/sidebar.ts:1-4`、`src/atoms/theme.ts:1-3`、`src/atoms/config.ts:1-26`、`src/atoms/sessions.ts:1-190`、`src/atoms/toast.ts:1-19` |
| Tauri 总注册 | `src-tauri/src/lib.rs:10-52` |
| Chat 命令层 | `src-tauri/src/commands/chat.rs:4-50` |
| Chat 引擎 | `src-tauri/src/chat_engine.rs:1-206` |
| Agent 命令与引擎 | `src-tauri/src/commands/agent.rs`、`src-tauri/src/agent_engine.rs:1-572`、`src-tauri/src/agent_session.rs:1-250` |
| Config / system / alias / governance 命令 | `src-tauri/src/commands/config.rs:1-163`、`src-tauri/src/commands/system.rs:1-17`、`src-tauri/src/commands/alias.rs:1-42`、`src-tauri/src/commands/governance.rs:1-207` |

## 5. 关键约束

- 前端的状态编排已经从单一 `useState` 演示变成多个 Jotai atoms，`tabs` / `sessions` / `theme` / `sidebar` 是当前布局与会话的核心状态面
- chat 和 agent 共享同一套工作台，但分别使用独立的消息状态、会话持久化和事件模型
- `src/lib/tauri.ts` 不是临时 helper，而是前端与后端命令签名的单一入口
- `SettingsDialog` 当前已经不只是模型配置，它还承载通用配置、别名、Skills、Hooks 和 MCP
- `backend-chat-engine.md`、`backend-agent-engine.md`、`frontend-chat-ui.md`、`frontend-agent-ui.md`、`frontend-app-shell.md`、`frontend-settings-ui.md` 已经是细化文档，`ARCHITECTURE.md` 只保留总入口与跨子系统关系

## 6. 相关文档

- `backend-chat-engine.md` — chat 后端引擎现状
- `backend-agent-engine.md` — agent 后端引擎与 session 持久化现状
- `frontend-chat-ui.md` — chat 前端界面现状
- `frontend-agent-ui.md` — agent 前端界面与审批流现状
- `frontend-app-shell.md` — 工作台外壳与 tab/search/sidepanel 现状
- `frontend-settings-ui.md` — 设置界面与配置现状
- `.codestable/attention.md` — 本项目长期注意事项入口
