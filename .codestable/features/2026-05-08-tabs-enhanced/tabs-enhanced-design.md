---
doc_type: feature-design
feature: 2026-05-08-tabs-enhanced
status: approved
summary: 标签页增强——流式关闭确认对话框 + 快捷键切换(Ctrl+Tab) + hover 预览
roadmap: j-gui-desktop-app
roadmap_item: frontend-tabs-enhanced
tags: [tabs, keyboard, ux]
---

# tabs-enhanced design

## 1. 范围

**做**: 关闭正在流式传输的 tab 时弹出确认对话框（替代 window.confirm）; Ctrl+Tab / Ctrl+Shift+Tab 切换标签; Tab hover 时 300ms 后显示消息预览浮层。

**不做**: 拖拽重排（首版复杂度高）、标签预览缩略图（需消息列表截图）

**推进**: 3 步独立——关闭确认、快捷键、hover 预览，可并行。

## 2. 验收

1. 流式传输中关闭标签 → 确认对话框弹出 → 确认后关闭 ✅
2. Ctrl+Tab → 切换到下一个标签 ✅
3. Ctrl+Shift+Tab → 切换到上一个标签 ✅
4. hover 标签 300ms → 浮层显示标签标题+消息数 ✅
