---
doc_type: feature-design
feature: 2026-05-08-sidebar-collapsible
status: approved
summary: 侧栏增强——折叠态图标模式完善 + 会话 Pin/Rename 操作
roadmap: j-gui-desktop-app
roadmap_item: frontend-sidebar-collapsible
tags: [sidebar, collapse, pin, rename]
---

# sidebar-collapsible design

## 1. 范围

**做**: 折叠态(48px)只显示展开按钮+新建+头像+设置齿轮，隐藏模式切换和会话列表；会话 Pin 切换（悬浮星标按钮）；双击标题或悬浮编辑按钮重命名会话（window.prompt 或内联编辑）

**不做**: Archive 独立视图（需后端 archive 命令），拖拽重排工作区

**推进**: 2 步——折叠态图标模式 + 会话 Pin/Rename

## 2. 验收
1. 折叠态仅显示竖向图标列（展开/新建/头像/设置）✅
2. 会话项悬浮显示 Pin 星标按钮 → 点击切换置顶 ✅
3. 双击会话标题 → prompt 编辑 → 确认后更新标题 ✅
