---
doc_type: feature-design
feature: 2026-05-08-agent-interrupt-ui
status: approved
summary: Agent 工具审批 UI——PermissionBanner 组件，收到 Interrupt 事件时在消息区和输入框之间显示审批卡片
roadmap: j-gui-desktop-app
roadmap_item: frontend-agent-interrupt-ui
requirement: j-gui-ai-interaction
tags: [agent, interrupt, permission, ui, banner]
---

# agent-interrupt-ui design

## 0. 术语

| 术语 | 定义 |
|------|------|
| PermissionBanner | 工具审批横幅卡片，显示工具名+危险等级+输入预览+Allow/Deny 按钮 |

## 1. 范围与决策

**做什么**: 新建 `PermissionBanner.tsx`（或直接重命名从 git history 恢复并增强）；AgentView 监听 `interrupt` 事件 → 渲染 PermissionBanner；用户 Allow/Deny → 调用 `respondAgentInterrupt()`；键盘 Enter = Allow, Esc = Deny。

**不做**: AskUserBanner / ExitPlanModeBanner（CLI headless 协议未确认），always_allow 持久化

**Proma 参考**: 内联卡片在消息和输入框之间 + 危险等级色标（safe=绿/normal=default/dangerous=琥珀色）+ 键盘快捷操作

**j-gui 取舍**: 首版只做 permission 类中断，单卡片无队列

## 2. 核心变化

**名词层**: Interrupt 事件已由 #31 定义（`{ interruptId, kind, toolName, toolInput }`），本 feature 消费。

**编排层**:
1. 新建 `PermissionBanner.tsx` — props: `{ toolName, toolInput, onAllow, onDeny }`
2. 视觉：橙色边框 (`border-orange-500/30`)，AlertTriangle 图标，工具名 badge，输入预览（JSON 美化，max 300 字符），绿色 Allow + 红色 Deny 按钮
3. AgentView 新增 `interruptState` state（`{ interruptId, toolName, toolInput } | null`）
4. `case "interrupt":` → 设置 interruptState → 渲染 PermissionBanner 于消息列表和输入框之间
5. Allow → `respondAgentInterrupt(id, true)` + 清除 interruptState
6. Deny → `respondAgentInterrupt(id, false)` + 清除 interruptState
7. Enter key handler → Allow, Escape key handler → Deny

**挂载点**: PermissionBanner 组件（1 处），AgentView interruptState + 事件分发（1 处）

## 3. 验收契约

1. permission_mode=default 时发送消息触发 tool_use → PermissionBanner 出现 ✅
2. 点击 Allow → banner 消失 → CLI 继续执行 ✅
3. 点击 Deny → banner 消失 → CLI 拒绝工具 ✅
4. 按键 Enter = Allow, Esc = Deny ✅
5. permission_mode=bypass 时无 banner（已有行为）✅

## 4. 推进策略

1. PermissionBanner 组件（纯 UI）
2. AgentView interruptState + 渲染集成
3. 键盘快捷键
