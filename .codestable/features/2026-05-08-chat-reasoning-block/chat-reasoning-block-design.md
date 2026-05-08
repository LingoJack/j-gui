---
doc_type: feature-design
feature: 2026-05-08-chat-reasoning-block
status: approved
summary: Thinking/推理块——Reasoning 可折叠组件，在 Chat/Agent 消息中展示 AI 思考过程
roadmap: j-gui-desktop-app
roadmap_item: frontend-chat-reasoning-block
tags: [chat, reasoning, thinking, ui]
---

# chat-reasoning-block design

## 1. 范围

**做**: 新建 ReasoningBlock 组件（ReasoningTrigger 可点击标题栏 + ReasoningContent 折叠内容区），在 MessageBubble 中渲染。检测消息中以 `<thinking>` 或 `【思考】` 标记开头的内容，折叠展示。

**不做**: Claude CLI 原生 reasoning 内容块解析（CLI headless 模式暂不输出 reasoning 块，先做标记文本检测）

**推进**: 1 步——ReasoningBlock 组件 + MessageBubble 集成

## 2. 验收

1. 消息含 `【思考】...` 前缀 → 折叠为 ReasoningBlock，默认展开 ✅
2. 点击标题栏 → 折叠/展开内容 ✅
3. 普通消息（无标记）→ 无 ReasoningBlock ✅
