---
doc_type: feature-design
feature: 2026-05-08-agent-context-tools
status: approved
summary: Agent 上下文工具——PermissionModeSelector 三模式切换 + @/# 引语法提示
roadmap: j-gui-desktop-app
roadmap_item: frontend-agent-context-tools
requirement: j-gui-ai-interaction
tags: [agent, context, permission-mode, ui]
---

# agent-context-tools design

## 0. 术语

| 术语 | 定义 |
|------|------|
| PermissionModeSelector | 三模式循环切换按钮：Auto(bypassPermissions) / Default(需审批) / Plan(仅计划) |
| ContextUsageBadge | 环形进度指示器显示 token 用量（本次不实现——依赖后端 token 统计事件） |

## 1. 范围与决策

**做什么**: AgentHeader 内新增 `PermissionModeSelector`；AgentInput placeholder 改为提示 @引用文件 / 调用 Skills / # 调用 MCP 的引语法

**不做**: ContextUsageBadge（需要后端/CLI 提供 token 统计事件——当前无数据源），流中再发送（interrupt 中断机制），AI 建议提示卡片

**Proma 参考**: 三种模式循环切换 + 不同图标 + 描述 tooltip + per-session 持久化

**j-gui 取舍**: 首版用简单下拉或循环按钮切换（不持久化 per-session），placeholder 改为带引语法的提示文字

## 2. 核心变化

**名词层**: 无新 IPC——复用已有的 `startAgent` 的 `permissionMode` 参数。

**编排层**:
1. AgentHeader 内新增模式切换（dropdown 或 segmented control）
2. 切换时更新本地 state，下次 `startAgent` 时传入对应 permissionMode
3. 三种模式：Auto（bypassPermissions—当前默认）/ Default（需审批，触发 interrupt）/ Plan（plan，留待 future）
4. 使用 SegmentedControl 样式（三个小按钮，当前选中高亮）
5. AgentInput placeholder 改为 "输入消息... (@引用文件 / 调用 Skills / # 调用 MCP, Enter 发送)"

**挂载点**: AgentView header 区（1 处），ChatInput placeholder（1 处）

## 3. 验收契约

1. AgentHeader 显示三模式切换控件 ✅
2. 选 Default → 下次 startAgent 传 permissionMode="default" ✅
3. 默认选中 Auto(bypassPermissions) ✅
4. Agent 输入框显示引语法提示 ✅

## 4. 推进策略

1. PermissionModeSelector 组件
2. AgentView 集成（state + startAgent 传参）
3. AgentInput placeholder 更新
