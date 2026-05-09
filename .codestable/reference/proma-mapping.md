---
doc_type: reference
slug: proma-mapping
description: Proma (Electron) → j-gui (Tauri) 组件对照表，加速跨项目参考
---

# Proma → j-gui 组件对照

> 用于快速查找"Proma 里这个功能对应 j-gui 哪个模块"。当前目标是按 Proma 做 1:1 复刻；只有被明确列为不需要的功能，才允许在这里保留为不纳入项。

## 复刻基线

- 基线版本：Proma 当前远程版本
- 基线 commit：`d1d07e7`
- 对齐范围：用户可见的布局、导航、状态反馈、空态、错误态、入口与主交互
- 允许不同：内部实现、模块拆分、数据存储方式、依赖技术栈
- 不允许不同：把 Proma 已有的核心交互简化成占位、把明确存在的入口藏掉、把状态反馈降级成静态文字

逐屏验收清单见 `proma-parity-acceptance.md`。本文件负责组件/模块对照；验收时以逐屏清单为主。

## 判定规则

- `✅ done`：用户可见行为已对齐，且不需要靠文档备注才能理解
- `🟡 partial`：入口有了，但交互、状态或数据闭环还没追平
- `❌ missing`：Proma 有，j-gui 还没有
- `n/a`：Proma 有但已明确排除
- `? verify`：当前证据不足，需先补 explore 或实际验收

## 布局与框架

| Proma | j-gui | 状态 | 备注 |
|-------|-------|------|------|
| `app-shell/AppShell.tsx` | `app-shell/AppShell.tsx` | 🟡 partial | 三栏 flex 布局已在，窗口级状态/空态/切换体验仍需继续追平 |
| `app-shell/LeftSidebar.tsx` | `app-shell/LeftSidebar.tsx` | 🟡 partial | 已有折叠和模式切换，但导航组织、分组和细节交互还不完整 |
| `app-shell/NavigatorPanel.tsx` | `LeftSidebar.tsx` / `RightSidePanel.tsx` / roadmap #50 | 🟡 partial | Proma 多 workspace 管理不纳入首版；但 Agent Working/pinned、工作区能力提示、右侧面板显隐和拖动区域仍由 shell parity 承接 |
| `app-shell/ModeSwitcher.tsx` | `LeftSidebar.tsx` 内 ModeSwitch | ✅ done | Chat/Agent 滑动切换 |
| `app-shell/RightSidePanel.tsx` | `app-shell/RightSidePanel.tsx` | 🟡 partial | 已有侧栏，但 Proma 式工作区体验、入口和目录交互还未完全对齐 |
| `app-shell/SearchDialog.tsx` | `app-shell/SearchDialog.tsx` | 🟡 partial | 会话搜索入口已在，内容命中与结果体验还需继续补齐 |
| `tabs/MainArea.tsx` | `app-shell/MainArea.tsx` | 🟡 partial | 标签页框架已在，多标签细节仍需追平 |
| `tabs/TabSwitcher.tsx` | roadmap #28 | 🟡 partial | 快捷切换体验仍在补 |
| `tabs/TabCloseConfirmDialog.tsx` | roadmap #28 | 🟡 partial | 关闭确认仍在补 |

## Chat 界面

| Proma | j-gui | 状态 | 备注 |
|-------|-------|------|------|
| `chat/ChatView.tsx` | `chat/ChatView.tsx` | 🟡 partial | 主视图已在，体验细节还需继续补 |
| `chat/ChatHeader.tsx` | `ChatView.tsx` 内 ChatHeader | 🟡 partial | 标题 + 模型选择已在，但状态反馈与层级细节不完整 |
| `chat/ChatInput.tsx` | `chat/ChatInput.tsx` | 🟡 partial | 输入框已在，富文本和草稿等细节仍待补齐 |
| `chat/ChatMessages.tsx` | `chat/ChatMessages.tsx` | 🟡 partial | 消息列表已在，细节与状态展现还要继续追平 |
| `chat/ChatMessageItem.tsx` | `ChatMessages.tsx` 内 MessageBubble | 🟡 partial | 消息气泡已在，但交互精细度仍不足 |
| `chat/ModelSelector.tsx` | `ChatView.tsx` 内 `<select>` | ✅ done | 模型下拉 |
| `chat/CopyButton.tsx` | roadmap #22 / `frontend-message-actions` | 🟡 partial | 复制入口已有基础实现；是否达到 Proma 悬浮操作、反馈和可达性需 parity 验收 |
| `chat/DeleteMessageDialog.tsx` | roadmap #22 / `frontend-message-actions` | 🟡 partial | 删除链路已有基础实现；确认对话、危险态和 pair 删除体验需继续对齐 |
| `chat/ClearContextButton.tsx` | roadmap #23 / `frontend-context-bar` | 🟡 partial | 清空上下文入口已有；ContextDivider 与状态反馈仍按 parity 验收 |
| `chat/ContextSettingsPopover.tsx` | roadmap #23 / #39 | 🟡 partial | 上下文状态栏和分割线已有基础；Proma 式 popover/设置层级未完全证明 |
| `chat/SystemPromptSelector.tsx` | roadmap #24 / `backend-system-prompt` | 🟡 partial | 系统提示词读写已有；选择器视觉和导航位置需继续对齐 |
| `chat/ChatToolBlock.tsx` | roadmap #14 / #53 | 🟡 partial | Agent 工具基础渲染已有；Chat 工具块和 ToolSettings 仍需 #53 收口 |

## Agent 界面

| Proma | j-gui | 状态 | 备注 |
|-------|-------|------|------|
| `agent/AgentView.tsx` | `agent/AgentView.tsx` | 🟡 partial | 基础流式链路有了，但审批、任务与会话组织还没完全追平 |
| `agent/AgentHeader.tsx` | `AgentView.tsx` 内 header | 🟡 partial | 头部基础在，交互层还需补齐 |
| `agent/PermissionBanner.tsx` | roadmap #34 | ❌ missing | 当前没有真正的 permission 中断 UI 分支 |
| `agent/PermissionModeSelector.tsx` | roadmap #36 / #56 | 🟡 partial | 权限模式选择已纳入 j-gui Agent 体验；需证明与启动参数、状态反馈和 Proma 交互一致 |
| `agent/ActiveTasksBar.tsx` | roadmap #35 / #56 | ❌ missing | 独立顶部任务条未实现；当前任务体验口径收束到 TaskProgressCard / BackgroundTasksPanel，并由 #56 判定是否需要等价补齐 |
| `agent/BackgroundTasksPanel.tsx` | roadmap #35 / #56 | 🟡 partial | 任务聚合基础已纳入；Proma 式后台任务面板与 ActiveTasksBar 的等价关系仍需 #56 parity 证据 |
| `agent/AskUserBanner.tsx` | roadmap #34 | ❌ missing | 当前没有 ask-user 中断 UI 分支 |
| `agent/ExitPlanModeBanner.tsx` | roadmap #34 | ❌ missing | 当前没有 plan-mode 中断 UI 分支 |
| `agent/WorkspaceSelector.tsx` | — | n/a | Proma 工作区概念，j-gui 无 |
| `agent/SidePanel.tsx` | `RightSidePanel.tsx` | 🟡 partial | 文件浏览已有入口，工作区体验还要继续补 |

## 设置

| Proma | j-gui | 状态 | 备注 |
|-------|-------|------|------|
| `settings/SettingsDialog.tsx` | `settings/SettingsDialog.tsx` | 🟡 partial | 模态框在，导航和治理层还要继续补 |
| `settings/ChannelSettings.tsx` | SettingsDialog 模型 tab | 🟡 partial | Provider 管理已在，细节还需继续追平 |
| `settings/ChannelForm.tsx` | SettingsDialog 内联编辑 | 🟡 partial | Provider 表单已在，交互还需继续追平 |
| `settings/GeneralSettings.tsx` | 通用 tab（占位） | 🟡 partial | 目前还是骨架 |
| `settings/AppearanceSettings.tsx` | roadmap #29 | 🟡 partial | 主题/字体有基础，但未必达到 Proma 水平 |
| `settings/AgentSettings.tsx` | roadmap #46 / #47 / #48 | 🟡 partial | Skills/MCP/Hooks 已纳入，但还不是完整治理面 |
| `settings/ToolSettings.tsx` | roadmap #49 | ❌ missing | Chat 工具列表、启停和配置入口需补齐 |
| `settings/ShortcutSettings.tsx` | — | n/a | 首版不做快捷键自定义；内建快捷键仍需按 Proma 核心路径对齐 |
| `settings/MemorySettings.tsx` | — | n/a | Proma MemOS 集成 |
| `settings/PromptSettings.tsx` | roadmap #24 / #59 | 🟡 partial | 系统提示词后端和入口已有；Settings 内 Prompt tab 的层级和视觉需继续对齐 |

## 状态管理（Atoms）

| Proma Atom | j-gui Atom | 状态 |
|------------|-----------|------|
| `app-mode.ts` | `atoms/app-mode.ts` | ✅ done |
| `sidebar-atoms.ts` | `atoms/sidebar.ts` | ✅ done |
| `chat-atoms.ts` | `atoms/sessions.ts` | ✅ done |
| `agent-atoms.ts` | — | ❌ |
| `tab-atoms.ts` | — | ❌（useState 管理） |
| `settings-tab.ts` | — | ❌（useState 管理） |
| `theme.ts` | — | ❌ |
| `search-atoms.ts` | — | ❌ |
| `notifications.ts` | — | ❌ |

## 明确不纳入

以下条目不是“暂时没做”，而是当前复刻边界外的功能。

以下 Proma 功能 j-gui 首版不实现：

| Proma 模块 | 原因 |
|------------|------|
| Workspace 管理 | j-gui 单工作区（~/.jdata/），无需多 workspace |
| Bot Hub / 多人协作 | j-gui 是个人工具 |
| 飞书/钉钉/微信集成 | j-gui 无 IM 集成需求 |
| 语音输入 | 首版范围外 |
| Tutorial / Onboarding | 首版范围外 |
| Proxy 设置 | 首版范围外 |
| 应用内更新检查 | 首版范围外；构建打包只负责产物，不提供 GUI 更新检查 |
| MemOS 记忆 | j-cli 无此概念 |
