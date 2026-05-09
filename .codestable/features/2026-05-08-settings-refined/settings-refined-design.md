---
doc_type: feature-design
feature: 2026-05-08-settings-refined
status: approved
summary: 设置重构——左侧导航+右侧内容布局 + UI 原语组件 + 未保存保护
roadmap: j-gui-desktop-app
roadmap_item: frontend-settings-refined
tags: [settings, navigation, primitives]
---

# settings-refined design

## 1. 范围

**做**: SettingsDialog 改为左侧 160px 导航 + 右侧内容布局；抽 SettingsCard/Row/Section/Toggle 原语；provider 表单编辑时有未保存变更离开确认（AlertDialog）；settingsTabAtom 记忆上次 tab

**不做**: 新增 MCP/Skills/Hooks tab（归 #46-#48）

**推进**: 2 步——布局重构+原语组件 + 未保存保护

## 2. 验收
1. 设置对话框左侧显示导航列表（模型/通用/别名），点击切换右侧内容 ✅
2. SettingsCard/SettingsRow/SettingsSection 原语组件可用 ✅
3. 编辑 provider 后切换 tab → 弹出"未保存的更改"确认对话框 ✅
