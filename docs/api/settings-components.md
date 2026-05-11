---
doc_type: lib-api-ref
entry: settings-components
category: React Components
status: draft
source_files:
  - src/components/settings/SettingsDialog.tsx
  - src/components/settings/SettingsPanel.tsx
  - src/components/settings/GeneralSettings.tsx
  - src/components/settings/ChannelSettings.tsx
  - src/components/settings/PromptSettings.tsx
  - src/components/settings/AliasSettings.tsx
  - src/components/settings/HooksSettings.tsx
  - src/components/settings/YamlConfigSettings.tsx
  - src/components/settings/AgentSettings.tsx
  - src/components/settings/ToolSettings.tsx
  - src/components/settings/AppearanceSettings.tsx
  - src/components/settings/AboutSettings.tsx
  - src/components/settings/primitives/SettingsCard.tsx
  - src/components/settings/primitives/SettingsRow.tsx
  - src/components/settings/primitives/SettingsSection.tsx
summary: 设置浮窗、设置面板和当前各设置分区组件参考。
last_reviewed: 2026-05-11
---

# settings-components

## 概述

设置界面已经不是早期的 `SkillsTab` / `HooksTab` / `McpTab` 三页治理结构。当前实现由 `SettingsDialog` + `SettingsPanel` 组成，并在 `SettingsPanel` 内组织多个实际设置页。

当前主结构：

- `SettingsDialog`
- `SettingsPanel`
- `GeneralSettings`
- `ChannelSettings`
- `PromptSettings`
- `AliasSettings`
- `HooksSettings`
- `YamlConfigSettings`
- `AgentSettings`
- `ToolSettings`
- `AppearanceSettings`
- `AboutSettings`

## 组件参考

### `SettingsDialog`

文件：`src/components/settings/SettingsDialog.tsx`

职责：

- 作为设置浮窗外壳。
- 通过 `settingsOpenAtom` 控制开关。
- 用 `SettingsErrorBoundary` 包裹 `SettingsPanel`，避免设置页渲染错误直接打断整个工作台。

要点：

- 它本身不承载 tab 逻辑，tab 切换和内容编排在 `SettingsPanel`。

### `SettingsPanel`

文件：`src/components/settings/SettingsPanel.tsx`

职责：

- 提供顶部标题、左侧导航和右侧滚动内容区。
- 维护当前选中 tab。
- 处理关闭窗口或切换 tab 时的未保存确认。

当前 tab 结构：

- `general`
- `channels`
- `prompts`
- `alias`
- `hooks`
- `yaml`
- `agent`
- `tools`
- `appearance`
- `about`

要点：

- 当前实现总是包含 `agent` 与 `tools` 两个分区，不再按旧文档描述成独立治理页。
- 离开 `channels` 页时，如果表单未保存，会弹出确认框。

### `GeneralSettings`

文件：`src/components/settings/GeneralSettings.tsx`

职责：

- 承载通用偏好设置。

### `ChannelSettings`

文件：`src/components/settings/ChannelSettings.tsx`

职责：

- 管理模型渠道配置。

边界：

- 当前它是设置面板里唯一明确带“未保存状态保护”的分区。

### `PromptSettings`

文件：`src/components/settings/PromptSettings.tsx`

职责：

- 管理系统提示词及其相关配置入口。

### `AliasSettings`

文件：`src/components/settings/AliasSettings.tsx`

职责：

- 管理别名配置。

### `HooksSettings`

文件：`src/components/settings/HooksSettings.tsx`

职责：

- 展示当前 hooks。
- 按事件和来源筛选。
- 支持启用/禁用切换。

要点：

- 它已经不是只读展示页。

### `YamlConfigSettings`

文件：`src/components/settings/YamlConfigSettings.tsx`

职责：

- 承载 YAML 配置读写入口。

### `AgentSettings`

文件：`src/components/settings/AgentSettings.tsx`

职责：

- 管理当前工作区的 Agent 相关能力。
- 在同一页内切换 `Skills`、`MCP`、`内置工具` 三个子视图。

当前能力边界：

- `Skills`：工作区内 Skill 列表、详情、启停、删除，以及从其他工作区 / j-cli / 全局来源导入。
- `MCP`：工作区级 MCP 配置与 j-cli MCP 只读视图切换。
- `内置工具`：展示内置工具状态。

要点：

- 这里的 MCP 已经区分“工作区 MCP”和“j-cli MCP”两种来源。
- 页面支持“AI 配置”入口，通过新建 Agent 会话引导配置，而不是仅靠静态表单。

### `ToolSettings`

文件：`src/components/settings/ToolSettings.tsx`

职责：

- 管理 Chat 工具相关配置。

### `AppearanceSettings`

文件：`src/components/settings/AppearanceSettings.tsx`

职责：

- 管理外观相关设置。

### `AboutSettings`

文件：`src/components/settings/AboutSettings.tsx`

职责：

- 展示版本、项目信息和相关说明。

### `SettingsCard` / `SettingsRow` / `SettingsSection`

文件：

- `src/components/settings/primitives/SettingsCard.tsx`
- `src/components/settings/primitives/SettingsRow.tsx`
- `src/components/settings/primitives/SettingsSection.tsx`

职责：

- 作为设置页内部复用的基础布局原语。

说明：

- 旧文档中的 `SettingsToggle` 已不存在；当前开关交互直接复用通用 `Switch` 组件。

## 组件关系

```text
SettingsDialog
  -> SettingsPanel
     -> GeneralSettings
     -> ChannelSettings
     -> PromptSettings
     -> AliasSettings
     -> HooksSettings
     -> YamlConfigSettings
     -> AgentSettings
        -> Skills | MCP | Builtin Tools
     -> ToolSettings
     -> AppearanceSettings
     -> AboutSettings
```

## 关键边界

- 设置 UI 已经从旧的治理三页结构演化为多分区设置面板，旧组件名不再适用。
- `HooksSettings` 当前支持启停切换，不能再描述成只读页。
- `AgentSettings` 是工作区作用域，不等于全局 j-cli 配置总入口。
- `SettingsPanel` 的保存语义并不统一，至少 `channels` 页有显式未保存保护。

## 相关条目

- [src/components/settings/SettingsDialog.tsx](/E:/Coding/AI/j-gui/src/components/settings/SettingsDialog.tsx)
- [src/components/settings/SettingsPanel.tsx](/E:/Coding/AI/j-gui/src/components/settings/SettingsPanel.tsx)
- [src/components/settings/AgentSettings.tsx](/E:/Coding/AI/j-gui/src/components/settings/AgentSettings.tsx)
- [src/components/settings/HooksSettings.tsx](/E:/Coding/AI/j-gui/src/components/settings/HooksSettings.tsx)
- [src/components/settings/ToolSettings.tsx](/E:/Coding/AI/j-gui/src/components/settings/ToolSettings.tsx)
- [src/components/settings/YamlConfigSettings.tsx](/E:/Coding/AI/j-gui/src/components/settings/YamlConfigSettings.tsx)
- [frontend-settings-ui](/E:/Coding/AI/j-gui/.codestable/architecture/frontend-settings-ui.md)
- [governance-commands](./governance-commands.md)
