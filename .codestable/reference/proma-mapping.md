---
doc_type: reference
slug: proma-mapping
description: Proma (Electron) → j-gui (Tauri) 组件对照表，加速跨项目参考
---

# Proma → j-gui 组件对照

> 用于快速查找"Proma 里这个功能对应 j-gui 哪个模块"。不保证 1:1 映射——架构差异导致部分 Proma 概念在 j-gui 中不存在。

## 布局与框架

| Proma | j-gui | 状态 | 备注 |
|-------|-------|------|------|
| `app-shell/AppShell.tsx` | `app-shell/AppShell.tsx` | ✅ done | 三栏 flex 布局 |
| `app-shell/LeftSidebar.tsx` | `app-shell/LeftSidebar.tsx` | ✅ done | 280px/48px 折叠 |
| `app-shell/NavigatorPanel.tsx` | （缺） | ❌ | Proma 的导航面板（工作区切换），j-gui 无需 |
| `app-shell/ModeSwitcher.tsx` | `LeftSidebar.tsx` 内 ModeSwitch | ✅ done | Chat/Agent 滑动切换 |
| `app-shell/RightSidePanel.tsx` | `app-shell/RightSidePanel.tsx` | 🟣 placeholder | 文件浏览器占位 |
| `app-shell/SearchDialog.tsx` | roadmap #24 | ❌ | 会话搜索 |
| `tabs/MainArea.tsx` | `app-shell/MainArea.tsx` | ✅ done | 标签页框架 |
| `tabs/TabSwitcher.tsx` | roadmap #27 | ❌ | 快捷键标签切换 |
| `tabs/TabCloseConfirmDialog.tsx` | roadmap #27 | ❌ | 关闭确认 |

## Chat 界面

| Proma | j-gui | 状态 | 备注 |
|-------|-------|------|------|
| `chat/ChatView.tsx` | `chat/ChatView.tsx` | ✅ done | 主视图 |
| `chat/ChatHeader.tsx` | `ChatView.tsx` 内 ChatHeader | ✅ done | 标题 + 模型选择 |
| `chat/ChatInput.tsx` | `chat/ChatInput.tsx` | ✅ done | 输入框 |
| `chat/ChatMessages.tsx` | `chat/ChatMessages.tsx` | ✅ done | 消息列表 |
| `chat/ChatMessageItem.tsx` | `ChatMessages.tsx` 内 MessageBubble | ✅ done | 消息气泡 |
| `chat/ModelSelector.tsx` | `ChatView.tsx` 内 `<select>` | ✅ done | 模型下拉 |
| `chat/CopyButton.tsx` | roadmap #21 | ❌ | 复制消息 |
| `chat/DeleteMessageDialog.tsx` | roadmap #21 | ❌ | 删除消息 |
| `chat/ClearContextButton.tsx` | roadmap #22 | ❌ | 清空上下文 |
| `chat/ContextSettingsPopover.tsx` | roadmap #22 | ❌ | 上下文设置 |
| `chat/SystemPromptSelector.tsx` | roadmap #23 | ❌ | 系统提示词 |
| `chat/ChatToolBlock.tsx` | roadmap #13 | ❌ | 工具调用渲染 |

## Agent 界面

| Proma | j-gui | 状态 | 备注 |
|-------|-------|------|------|
| `agent/AgentView.tsx` | roadmap #12 | ❌ | 需 j-agent crate |
| `agent/AgentHeader.tsx` | roadmap #12 | ❌ | |
| `agent/PermissionBanner.tsx` | roadmap #14 | ❌ | |
| `agent/PermissionModeSelector.tsx` | — | n/a | Proma 特有（SDK 权限模式） |
| `agent/ActiveTasksBar.tsx` | — | n/a | Proma 后台任务 |
| `agent/BackgroundTasksPanel.tsx` | — | n/a | Proma 后台任务 |
| `agent/AskUserBanner.tsx` | roadmap #14 | ❌ | |
| `agent/ExitPlanModeBanner.tsx` | roadmap #14 | ❌ | |
| `agent/WorkspaceSelector.tsx` | — | n/a | Proma 工作区概念，j-gui 无 |
| `agent/SidePanel.tsx` | `RightSidePanel.tsx` | 🟣 | 文件浏览 |

## 设置

| Proma | j-gui | 状态 | 备注 |
|-------|-------|------|------|
| `settings/SettingsDialog.tsx` | `settings/SettingsDialog.tsx` | ✅ done | 模态对话框 |
| `settings/ChannelSettings.tsx` | SettingsDialog 模型 tab | ✅ done | Provider 管理 |
| `settings/ChannelForm.tsx` | SettingsDialog 内联编辑 | ✅ done | Provider 表单 |
| `settings/GeneralSettings.tsx` | 通用 tab（占位） | 🟣 | |
| `settings/AppearanceSettings.tsx` | roadmap #28 | ❌ | 主题/字体 |
| `settings/AgentSettings.tsx` | roadmap #46 / #47 / #48 | ❌ | Proma 提供 Skills/MCP 设置参考；Hooks UI 为 j-gui 基于 j-cli TUI 的扩展 |
| `settings/ToolSettings.tsx` | — | n/a | j-cli 侧管理工具 |
| `settings/ShortcutSettings.tsx` | — | n/a | 首版不做 |
| `settings/MemorySettings.tsx` | — | n/a | Proma MemOS 集成 |
| `settings/PromptSettings.tsx` | roadmap #23 | ❌ | 系统提示词 |

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

以下 Proma 功能 j-gui 首版不实现：

| Proma 模块 | 原因 |
|------------|------|
| Workspace 管理 | j-gui 单工作区（~/.jdata/），无需多 workspace |
| Bot Hub / 多人协作 | j-gui 是个人工具 |
| 飞书/钉钉/微信集成 | j-gui 无 IM 集成需求 |
| 语音输入 | 首版范围外 |
| Tutorial / Onboarding | 首版范围外 |
| Proxy 设置 | 首版范围外 |
| 更新检查 | 首版范围外 |
| MemOS 记忆 | j-cli 无此概念 |
