---
doc_type: audit-finding
audit: 2026-05-09-full-scope
finding_id: "arch-drift-15"
nature: arch-drift
severity: P1
confidence: high
suggested_action: cs-arch
status: open
---

# Finding 15：frontend-settings-ui.md 记录 2 个 tab，实际代码 6 个

## 速答

`.codestable/architecture/frontend-settings-ui.md` 描述 SettingsDialog 有"模型"和"通用"两个 tab（"通用 tab 占位"），但实际代码已扩展为 6 个 tab：Models、General、Aliases、Skills、Hooks、MCP。架构文档严重滞后于代码。

## 关键证据

- `.codestable/architecture/frontend-settings-ui.md:23-36` — 组件结构图仅列出"模型"和"通用"两个 tab
- `.codestable/architecture/frontend-settings-ui.md:111-114` — 已知约束："通用 tab 占位"、"无别名 tab"、"无外观 tab"
- `src/components/settings/SettingsDialog.tsx:22-29` — `TABS` 数组定义 6 个 tab
- `src/components/settings/SkillsTab.tsx`、`HooksTab.tsx`、`McpTab.tsx` — 三个新 tab 组件已实现

Settings UI 从 2 个 tab 扩展到 6 个的过程中，架构文档从未更新。

## 影响

新开发者读架构文档会认为设置只有模型和通用两个 tab，不知道 Skills/Hooks/MCP 的存在和配置方式。feature-design 时可能基于错误信息做决策。

## 修复方向

用 `cs-arch update` 刷新 `frontend-settings-ui.md`，补上 4 个新 tab 的描述和代码锚点。

## 建议动作

`cs-arch`，更新架构文档使其反映当前代码结构。
