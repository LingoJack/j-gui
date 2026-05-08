---
doc_type: requirement
slug: j-gui-ai-interaction
pitch: 在桌面端与 AI 对话，支持普通聊天和能执行工具的 Agent 两种模式
status: current
last_reviewed: 2026-05-08
implemented_by: [chat_engine, commands/chat]
tags: [ai, chat, agent, desktop]
---

# AI 对话与 Agent 能力

## 用户故事

- 作为一个经常用 j-cli 写代码的人，我希望在桌面窗口里跟 AI 聊天，看到流式打字效果，而不是盯着终端里一行行蹦出来的文字。
- 作为一个让 AI 帮忙改项目的人，我希望看到 AI 在读哪些文件、执行什么命令，它要动我的代码时让我确认一下。
- 作为一个同时在干多件事的人，我希望聊天和 Agent 能开在不同标签页里，切过去继续聊，不用每次都新开窗口。

## 为什么需要

j-cli 已经有完整的 AI Chat 和 Agent 能力，但只在终端里跑。终端里看多行代码块、Markdown 表格、工具调用结果都很费力——没有语法高亮、没有折叠、不能点按钮确认操作。搬到桌面端后，这些交互可以从"忍受"变成"舒服"。

## 怎么解决

提供 Chat 和 Agent 两种对话模式。Chat 模式是纯文本对话，消息以 Markdown 渲染。Agent 模式增加工具调用的可视化——看到 AI 在做什么、执行结果是什么、需要确认时弹出按钮。两种模式共用同一套会话和流式推送机制，可以在标签页里同时打开。

## 边界

- 不重新实现 AI 模型调用——推理和工具执行由 j-cli 完成，j-gui 只管呈现和交互。
- 不管理 j-cli 的安装和升级——用户需要先有可用的 j-cli 项目。
- Agent 模式的文件编辑能力受限于 j-cli 已有的工具集。
- 不支持语音输入和多模态（图片/文件直接拖入聊天）。
