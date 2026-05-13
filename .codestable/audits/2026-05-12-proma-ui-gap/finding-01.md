---
doc_type: audit-finding
slug: proma-ui-gap-01
severity: P1
category: bug
confidence: high
recommended_action: cs-issue
---

# Finding 01

## 标题

右侧面板显隐依赖会话原子而非真实 tab 状态，空态下会泄漏大面积空面板

## 证据

- 当前 `j-gui` 用 `currentAgentSessionIdAtom` / `currentConversationIdAtom` 决定是否渲染右侧面板，而不是看是否真的还有活跃 tab：`src/components/app-shell/AppShell.tsx:25-30`
- 右侧面板容器一旦命中条件就会直接占据布局：`src/components/app-shell/AppShell.tsx:49-54`
- 中间主区在 `tabs.length === 0` 时已经进入欢迎空态：`src/components/tabs/MainArea.tsx:32-39`
- Proma 右侧面板只在真实 Agent 会话工作台路径下出现，不会在空态中央页旁边保留一整块空白 shell：`E:\Coding\AI\Proma\apps\electron\src\renderer\components\app-shell\AppShell.tsx:31-36`

## 为什么是问题

这会制造一种很差的视觉状态：主区已经没有真实工作内容，但右侧仍保留一个大白块文件面板。你给的图 1 就是这种问题的典型表现。它不是“配色不好看”，而是布局判定本身错了。

## 建议

把右侧面板显隐从“会话原子是否残留”改成“当前是否存在活跃 tab，且该 tab 类型确实需要右侧面板”。这样空态回到欢迎页时，右侧 panel 会一起退出。
