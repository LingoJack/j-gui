---
doc_type: audit-finding
date: 2026-05-13
severity: P2
category: UX
confidence: high
file: src/components/app-shell/WindowControls.tsx
line: 60
---

# Finding-05: 右上角窗口按钮与顶部壳层仍是悬浮拼接关系

## 证据

`src/components/app-shell/WindowControls.tsx:60-99` 把按钮渲染成：

- `fixed top-0 right-0`
- 独立浮在最上层

同时：

- `src/components/tabs/TabBar.tsx:230` 仅用 `pr-[140px]` 给 Windows 预留空白
- `src/components/agent/SidePanel.tsx:341-365` 右侧文件面板自带自己的头部条带

这说明当前不是一个统一的顶部壳层结构，而是：

1. TabBar 让出空间
2. 右上角按钮另起一层悬浮
3. 右侧会话文件区再单独起一层

## 影响

- 视觉上会出现“按钮和 UI 割裂”的感觉。
- 右侧会话文件区的顶部余量没有被利用成一致的壳层背景。
- 后续如果再加关闭保活提示、平台状态入口，会继续堆在悬浮层上。

## 建议动作

走 `cs-refactor` 或合并进同一 desktop shell feature：把右上按钮并入统一顶部壳层，复用 TabBar/右侧文件区之间已经存在的横向带状空间，而不是继续悬浮补丁式摆放。
