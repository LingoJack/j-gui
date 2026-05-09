---
doc_type: audit-finding
audit: 2026-05-09-full-scope
finding_id: "maintainability-13"
nature: maintainability
severity: P1
confidence: medium
suggested_action: cs-refactor
status: open
---

# Finding 13：SettingsDialog.tsx 484 行，多 tab 混在一个组件

## 速答

`SettingsDialog` 在一个文件中包含 6 个 tab 的渲染逻辑：Models、General、Aliases、Skills、Hooks、MCP。Skills/Hooks/MCP 已拆分为独立子组件，但 Models/General/Aliases 的完整逻辑仍在主文件中。

## 关键证据

- `src/components/settings/SettingsDialog.tsx:1-484` — 484 行
- Models tab 逻辑（lines 97-128 + 213-284）：Provider CRUD、activeIndex、dirty 追踪、保存
- General tab 逻辑（lines 54-55 + 131-143 + 287-374）：YamlConfig 读写、主题/字体设置
- Alias tab 逻辑（lines 57-59 + 146-168 + 378-443）：alias 增删
- 6 个 tab 的导航和内容在同一个 JSX 中（lines 180-482）

Models/General/Alias 三个 tab 各有独立的状态和保存逻辑，但没有抽成独立组件。

## 影响

添加新 tab 或修改现有 tab 的行为需要理解 484 行的上下文。Tab 间的状态管理（dirty 追踪、确认离开提示）与单个 tab 的逻辑交织。

## 修复方向

将 ModelsTab、GeneralTab、AliasTab 各抽为独立组件，与已有的 SkillsTab/HooksTab/McpTab 模式一致。SettingsDialog 保留 tab 导航和 dirty 协调。

## 建议动作

`cs-refactor`，行为不变的结构优化。
