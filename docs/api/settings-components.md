---
doc_type: lib-api-ref
entry: settings-components
category: React Components
status: draft
source_files:
  - src/components/settings/SettingsDialog.tsx
  - src/components/settings/SkillsTab.tsx
  - src/components/settings/HooksTab.tsx
  - src/components/settings/McpTab.tsx
  - src/components/settings/primitives/SettingsCard.tsx
  - src/components/settings/primitives/SettingsRow.tsx
  - src/components/settings/primitives/SettingsSection.tsx
  - src/components/settings/primitives/SettingsToggle.tsx
summary: 设置对话框、Skills/Hooks/MCP 标签页和设置原子组件参考。
last_reviewed: 2026-05-09
---

# settings-components

## 概述

这组组件构成 j-gui 当前设置界面的主要可见 UI 面：

- `SettingsDialog`
- `SkillsTab`
- `HooksTab`
- `McpTab`
- `SettingsCard`
- `SettingsRow`
- `SettingsSection`
- `SettingsToggle`

它们共同承接：

- 模型 provider 配置
- 通用配置与主题/字体偏好
- alias 管理
- Skills / Hooks / MCP 列表与部分治理操作

当前这些组件也是工作台内部设置组件，不是独立设计系统。

## 组件参考

### `SettingsDialog`

文件：`src/components/settings/SettingsDialog.tsx`

props：

- `open`
- `onClose`

职责：

- 设置对话框总编排
- 管理左侧 tab 导航
- 管理 models/general/aliases/skills/hooks/mcp 六个分区

主要依赖：

- `agentConfigAtom`
- `getAgentConfig`
- `setAgentConfig`
- `getConfig`
- `setConfig`
- `setTheme`
- `listAliases`
- `setAlias`
- `removeAlias`
- `SkillsTab`
- `HooksTab`
- `McpTab`

主要本地状态：

- `tab`
- `draft`
- `activeIndex`
- `dirty`
- `generalConfig`
- `aliases`
- `aliasDraft`
- `aliasDirty`

关键行为：

- 打开时同时加载模型配置、通用配置和 alias 列表
- 在 `models` tab 离开或关闭时，会对未保存修改做确认
- `models` tab 通过本地 draft 编辑 provider，点击保存后统一提交
- `general` tab 中大多数字段通过 `onBlur` 或 `onChange` 即时写回
- `aliases` tab 支持新增和删除 alias
- `skills/hooks/mcp` tab 交给子组件负责具体展示

边界：

- footer 里的“保存”按钮只在 `models` tab 出现
- 当前没有“统一保存全部 tabs”的机制
- `general` tab 的字体大小是直接操作 `document.documentElement.style.fontSize`

### `SkillsTab`

文件：`src/components/settings/SkillsTab.tsx`

职责：

- 展示已加载 Skills 列表

主要依赖：

- `listSkills`

行为：

- 挂载时加载 skills
- loading 时显示 spinner
- 无数据时显示 Skills 路径提示
- 有数据时用 `SettingsCard` 渲染每条 skill

### `HooksTab`

文件：`src/components/settings/HooksTab.tsx`

职责：

- 展示已加载 Hooks 列表

主要依赖：

- `listHooks`

行为：

- 挂载时加载 hooks
- 通过 `EVENT_LABELS` 把 hook 事件名转成中文标签
- 展示 `name/label`、`event`、`source`、`hookType`、`timeout`、`onError`

### `McpTab`

文件：`src/components/settings/McpTab.tsx`

职责：

- 展示当前 MCP server 列表
- 支持启用/禁用和删除

主要依赖：

- `listMcpServers`
- `saveMcpServers`

行为：

- 挂载时加载 server 列表
- toggle 时立即本地更新并保存
- delete 时立即本地更新并保存
- 无数据时提示配置文件位置

边界：

- 当前只支持开关和删除，不支持新增或编辑 server 表单

### `SettingsCard`

文件：`src/components/settings/primitives/SettingsCard.tsx`

职责：

- 提供设置项卡片容器

用途：

- 作为 models/general/aliases/skills/hooks/mcp 各处的基础包裹层

### `SettingsRow`

文件：`src/components/settings/primitives/SettingsRow.tsx`

职责：

- 提供左 label、右内容的行级布局

用途：

- 主要用于 general tab

### `SettingsSection`

文件：`src/components/settings/primitives/SettingsSection.tsx`

职责：

- 提供带标题的设置分节

用途：

- 包裹 general/skills/hooks/mcp 等局部区域

### `SettingsToggle`

文件：`src/components/settings/primitives/SettingsToggle.tsx`

职责：

- 提供启用/禁用开关 UI

用途：

- 当前主要用于 `McpTab`

## 组件关系

```text
SettingsDialog
  -> SettingsSection
  -> SettingsCard
  -> SettingsRow
  -> SkillsTab
  -> HooksTab
  -> McpTab
     -> SettingsToggle
```

## 关键边界

- 这组组件直接绑定当前 Tauri wrapper 和全局配置状态，不是脱离应用上下文可复用的通用设置框架。
- `SettingsDialog` 内不同 tab 的保存语义并不统一：models 走显式保存，general/alias/mcp 多数是即时写回。
- `SkillsTab` 和 `HooksTab` 当前是只读展示；`McpTab` 只有局部治理能力。
- `SettingsCard` / `SettingsRow` / `SettingsSection` / `SettingsToggle` 是当前内部原子组件，不是完整 design system 抽象。

## 相关条目

- [src/components/settings/SettingsDialog.tsx](/E:/Coding/AI/j-gui/src/components/settings/SettingsDialog.tsx)
- [src/components/settings/SkillsTab.tsx](/E:/Coding/AI/j-gui/src/components/settings/SkillsTab.tsx)
- [src/components/settings/HooksTab.tsx](/E:/Coding/AI/j-gui/src/components/settings/HooksTab.tsx)
- [src/components/settings/McpTab.tsx](/E:/Coding/AI/j-gui/src/components/settings/McpTab.tsx)
- [frontend-settings-ui](/E:/Coding/AI/j-gui/.codestable/architecture/frontend-settings-ui.md)
- [governance-commands](./governance-commands.md)
