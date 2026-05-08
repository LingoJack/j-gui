---
doc_type: feature-design
feature: 2026-05-08-agent-task-progress
status: approved
summary: Agent 任务进度聚合——TaskProgressCard 将 TaskCreate/TaskUpdate/TodoWrite 工具调用聚合成单张进度卡
roadmap: j-gui-desktop-app
roadmap_item: frontend-agent-task-progress
requirement: j-gui-ai-interaction
tags: [agent, task, progress, ui]
---

# agent-task-progress design

## 0. 术语

| 术语 | 定义 |
|------|------|
| TaskProgressCard | 聚合 TaskCreate/TaskUpdate/TodoWrite 工具调用为一张进度卡，显示任务列表 + 进度条 + 状态图标 |

## 1. 范围与决策

**做什么**: 新建 `TaskProgressCard.tsx`，监听 agentMessagesAtom 中的 toolCall 消息，过滤 TaskCreate/TaskUpdate/TodoWrite 三类特定工具名，聚合为任务列表展示。超过 8 项可折叠。

**不做**: BackgroundTasksPanel（水平运行中任务条）——首版只做进度卡，水平条后置

**Proma 参考**: 聚合展示 + 进度条 completed/total + 每行状态图标（Circle/ Loader2/ CheckCircle2）

**j-gui 取舍**: 首版在 AgentMessages 顶部渲染一张聚合卡（而非 Proma 的动态更新卡），工具消息仍然在下方平铺显示

## 2. 核心变化

**名词层**: 无新 IPC 类型。从已有 Message.toolCall 中按 tool_name 过滤。

**编排层**:
1. 新建 `TaskProgressCard.tsx`，在 AgentMessages 顶部渲染
2. 从 agentMessagesAtom 中提取所有 toolCall 消息，过滤 `toolName ∈ {"TaskCreate", "TaskUpdate", "TodoWrite"}`
3. 按 toolCall.status 聚合统计：pending(Circle) / in_progress(Loader2) / done(CheckCircle2)
4. 渲染：ListTodo 图标 + "任务进度" 标题 + 进度条 (done/total) + 任务列表（每行 icon + 摘要文字）
5. 超过 8 项时默认折叠（只显示进度条），点击展开

**挂载点**: TaskProgressCard 组件（1 处），AgentMessages 集成（1 处）

## 3. 验收契约

1. 有 task 工具调用时 AgentMessages 顶部显示 TaskProgressCard ✅
2. 进度条反映 done/total 比例 ✅
3. 无 task 工具调用时不显示 ✅
4. 超过 8 项可折叠/展开 ✅

## 4. 推进策略

1. TaskProgressCard 组件（接收 toolCall 消息数组）
2. AgentMessages 集成（过滤 + 传参）
