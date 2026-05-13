---
doc_type: audit-finding
date: 2026-05-13
severity: P2
category: UX
confidence: high
file: src/components/app-shell/LeftSidebar.tsx
line: 97
---

# Finding-04: 左侧边栏没有被设计成明确、连续的拖拽表面

## 证据

`src/styles/globals.css:572-575` 定义了：

```css
.titlebar-no-drag {
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
```

而 `src/components/app-shell/LeftSidebar.tsx` 与其子列表中大量交互元素都明确标了 `titlebar-no-drag`。仅开头就能看到 `SidebarItem` 在 `97-114` 行把整块导航按钮声明为 `titlebar-no-drag`，会话列表相关按钮也普遍如此。

当前真正可拖动的主表面更偏向：

- `AppShell.tsx:55-57` 顶部固定拖拽条
- `TabBar.tsx:220-230` 标签栏背景拖拽区

## 影响

- 用户直觉上会认为左侧空白和部分边栏表面能拖窗，但当前实现并没有把它设计成稳定拖拽区。
- 这会进一步放大“桌面壳层像拼起来的”体感。

## 建议动作

走 `cs-refactor` 或跟随桌面壳层 feature 一并做：不要把交互块改成可拖，而是给左侧边栏补一块明确、连续、不会抢交互的 drag surface。
