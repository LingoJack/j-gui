---
doc_type: feature-design
feature: 2026-05-08-agent-session-navigation
status: approved
summary: Agent 模式下左侧栏/搜索列出+切换 Agent 会话，选中后回填历史消息到 agentMessagesAtom
roadmap: j-gui-desktop-app
roadmap_item: frontend-agent-session-navigation
requirement: j-gui-session-management
tags: [agent, session, navigation, sidebar, search]
---

# agent-session-navigation design

## 0. 术语

无新术语。

## 1. 范围与决策

**做什么**: LeftSidebar Agent 模式下列出 `listAgentSessions()` 结果；点击切换时调用 `getAgentSession(id)` 回填 `agentMessagesAtom`；SearchDialog 选中 Agent 会话时同样回填。新建 Agent 会话按钮。

**不做**: 会话 rename/pin/archive（归 #40 sidebar-collapsible），Agent resume 子进程上下文

**Proma 参考**: Agent 与 Chat 同等进入会话列表体系，类型图标区分（Bot vs MessageSquare）

**j-gui 取舍**: 复用现有 Chat 会话列表的日期分组和样式，以 Bot 图标区分

## 2. 核心变化

**名词层**: 无新类型——复用 `SessionInfo`，后端返回的 agent session 已含 `messageCount`/`updatedAt`。

**编排层**:
1. `LeftSidebar` 在 Agent 模式时调用 `listAgentSessions()` 而非 `listSessions()`
2. `handleSwitchSession` 在 Agent 模式时调用 `getAgentSession(id)`，将 AgentTimelineItem[] 转为 Message[] 回填 `agentMessagesAtom`
3. `handleNewSession` 在 Agent 模式时调用 `createAgentSession()`
4. `SearchDialog` 的 `onSelect` 在 Agent 模式时同样回填 agent 消息

**挂载点**: LeftSidebar 会话列表逻辑（1 处），SearchDialog onSelect 分支（1 处），AppShell handleSelectSession（1 处）

## 3. 验收契约

1. Agent 模式侧栏列出 agent 会话（Bot 图标）✅
2. 点击 Agent 会话 → `getAgentSession` 加载历史 → 消息显示在 AgentView ✅
3. Agent 模式"新建会话" → `createAgentSession` → 新空白 Agent 视图 ✅
4. SearchDialog 选中 agent 会话 → 切换到 Agent 模式 + 回填消息 ✅

## 4. 推进策略

1. LeftSidebar mode-aware 分流（chat/agent 调不同 list 命令）
2. 消息回填逻辑（AgentTimelineItem → Message 转换，保留 toolCall）
3. SearchDialog + AppShell mode-aware 选中处理
