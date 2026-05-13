---
doc_type: audit-finding
slug: proma-ui-gap-02
severity: P1
category: arch-drift
confidence: high
recommended_action: cs-issue
---

# Finding 02

## 标题

设置导航移除了快捷键管理，但底层配置和提示文案仍宣称可用

## 证据

- 当前设置面板文件头直接写明“快捷键自定义”已删除：`src/components/settings/SettingsPanel.tsx:2-6`
- 当前设置导航和 `renderTabContent` 都没有 `shortcuts` 入口：`src/components/settings/SettingsPanel.tsx:34-49`、`src/components/settings/SettingsPanel.tsx:68-83`
- 设置 tab 类型里也没有 `shortcuts`：`src/atoms/settings-tab.ts:14-17`
- 但全局快捷键初始化已经在加载 `shortcutOverrides` 和 `sendWithCmdEnter`：`src/components/shortcuts/GlobalShortcuts.tsx:72-88`
- 提示文案仍明确写着“在设置 → 快捷键中可以自定义所有快捷键”：`src/lib/tips.ts:58`
- Proma 的设置导航和快捷键设置页是完整入口：`E:\Coding\AI\Proma\apps\electron\src\renderer\components\settings\SettingsPanel.tsx:93-97`、`E:\Coding\AI\Proma\apps\electron\src\renderer\components\settings\ShortcutSettings.tsx:244-540`

## 为什么是问题

这不是单纯“少一个页面”。它已经形成前后不一致：

- 数据层支持配置
- 文案宣称可配置
- UI 却不给入口

这种断裂会直接把产品打成“像 demo 而不是完整应用”。

## 建议

恢复 `shortcuts` 设置 tab，并直接复用现有 `shortcutOverrides` / `sendWithCmdEnter` 能力层，不要重做底层。
