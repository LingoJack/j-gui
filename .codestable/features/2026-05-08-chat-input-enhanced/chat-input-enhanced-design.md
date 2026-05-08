---
doc_type: feature-design
feature: 2026-05-08-chat-input-enhanced
status: approved
summary: Chat 输入框增强——草稿持久化(per-session) + Thinking 开关按钮
roadmap: j-gui-desktop-app
roadmap_item: frontend-chat-input-enhanced
tags: [chat, input, draft, thinking]
---

# chat-input-enhanced design

## 1. 范围

**做**: 每个会话独立保存草稿（未发送的输入内容），切换会话时恢复；输入框工具栏加 Thinking 开关按钮（视觉效果，无后端联动——thinking 模式由后续 feature 接入）

**不做**: TipTap 富文本编辑器（先定消息 payload 协议再换编辑器）、附件拖放上传

**推进**: 2 步——草稿持久化 atom + ChatInput/ChatView 集成 + Thinking toggle UI

## 2. 验收

1. 在 Chat 会话 A 输入 "hello" → 切换到会话 B → 切回会话 A → 输入框显示 "hello" ✅
2. 发送消息后草稿清除 ✅
3. Agent 模式同样支持草稿持久化 ✅
4. 输入框旁显示 Thinking 开关按钮（Brain 图标，绿色=开）✅
