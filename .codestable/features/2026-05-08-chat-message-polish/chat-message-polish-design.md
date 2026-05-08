---
doc_type: feature-design
feature: 2026-05-08-chat-message-polish
status: approved
summary: 消息精细操作——Fork/Rewind 按钮 + ContextDivider 分割线
roadmap: j-gui-desktop-app
roadmap_item: frontend-chat-message-polish
tags: [chat, message, fork, context]
---

# chat-message-polish design

## 1. 范围

**做**: MessageBubble 加 Fork(回退重发) 按钮；ChatMessages 在 Clear 事件处渲染 ContextDivider 分割线；ScrollMinimap 右侧消息位置缩略图

**不做**: Copy 按钮已有（复用），ScrollMinimap 过于复杂（后置）

**推进**: 2 步——Fork 按钮 + ContextDivider

## 2. 验收

1. 悬浮消息气泡 → Fork 图标出现 → 点击 → 截断后续消息重新发送 ✅
2. 消息间存在 Clear 标记 → ContextDivider 分割线 + "上下文已清空" 文字 ✅
